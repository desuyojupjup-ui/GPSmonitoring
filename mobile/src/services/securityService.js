// ──────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR — runs the full anti-spoofing pipeline before attendance and
// exposes a live status snapshot for the Security Status screen.
//
// Pipeline order (fail fast):
//   1. Device integrity (root/jailbreak)
//   2. VPN / proxy
//   3. Mock GPS
//   4. GPS accuracy (≤20m)
//   5. Geofence (inside assigned site)
//   6. Consistency (last 5 readings) + speed
//
// Every blocked attempt is written to security_logs (+ a fraud/geofence record);
// every allowed attempt is written to attendance_logs + security_logs.
// ──────────────────────────────────────────────────────────────────────────
import * as Location from 'expo-location';
import { SECURITY } from './securityConfig';
import { detectRootOrJailbreak } from './rootDetector';
import { detectVpn } from './vpnDetector';
import { detectMockLocation } from './mockDetector';
import { validateAccuracy, validateConsistency } from './gpsValidator';
import { verifyGeofence } from './geofence';
import { getDeviceId, getPublicIp } from './deviceInfo';
import {
  writeSecurityLog, writeAttendanceLog, writeFraudReport, writeGeofenceEvent,
} from './securityLogger';

// Capture N quick fixes so consistency/speed checks have data to compare.
async function captureReadings(count = SECURITY.CONSISTENCY_SAMPLE) {
  const readings = [];
  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-await-in-loop
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    readings.push({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      mocked: loc.coords.mocked,
      timestamp: loc.timestamp || Date.now(),
    });
    if (i < count - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  return readings;
}

function buildReport({ employee, site, latest, deviceId, ip }) {
  return {
    employeeId: employee?.id,
    employeeName: employee?.name || 'Unknown',
    deviceId,
    ipAddress: ip,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    latitude: latest?.latitude ?? null,
    longitude: latest?.longitude ?? null,
    accuracy: latest?.accuracy ?? null,
    vpn: false,
    mock: false,
    root: false,
    geofenceOk: false,
    distanceToBoundary: null,
    passed: false,
    aiRiskScore: null,
  };
}

/**
 * Run all checks. Returns { passed, failedCheck, reason, report }.
 * Caller shows SecurityWarningModal({ failedCheck, reason }) when !passed.
 */
export async function runPreAttendanceChecks({ employee, site, action = 'time_in' }) {
  // Permission first.
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return {
      passed: false,
      failedCheck: 'permission',
      reason: 'Location permission is required to record attendance.',
      report: null,
    };
  }

  const deviceId = await getDeviceId();
  const ip = await getPublicIp();
  const readings = await captureReadings();
  const latest = readings[readings.length - 1];
  const report = buildReport({ employee, site, latest, deviceId, ip });

  const fail = (failedCheck, reason, logExtra) => {
    report.passed = false;
    writeSecurityLog(report, 'Blocked', reason);
    if (logExtra) logExtra();
    return { passed: false, failedCheck, reason, report };
  };

  // 1. Root / jailbreak
  const root = detectRootOrJailbreak();
  report.root = root.compromised;
  if (root.compromised) {
    return fail('root', root.reason, () => writeFraudReport(report, 'root', root.reason));
  }

  // 2. VPN
  const vpn = await detectVpn(ip);
  report.vpn = vpn.active;
  if (vpn.active) {
    return fail('vpn', vpn.reason, () => writeFraudReport(report, 'vpn', vpn.reason));
  }

  // 3. Mock GPS
  const mock = await detectMockLocation(latest);
  report.mock = mock.mocked;
  if (mock.mocked) {
    return fail('mock', mock.reason, () => writeFraudReport(report, 'mock', mock.reason));
  }

  // 4. Accuracy
  const acc = validateAccuracy(latest);
  if (!acc.ok) {
    return fail('accuracy', acc.reason);
  }

  // 5. Geofence
  const geo = verifyGeofence(latest.latitude, latest.longitude, site);
  report.geofenceOk = geo.ok;
  report.distanceToBoundary = geo.distanceToBoundary;
  if (!geo.ok) {
    return fail('geofence', geo.reason, () => writeGeofenceEvent(report, 'violation'));
  }

  // 6. Consistency + speed
  const consistency = validateConsistency(readings);
  if (!consistency.ok) {
    return fail('consistency', consistency.reason, () =>
      writeFraudReport(report, 'speed', consistency.reason)
    );
  }

  // PASSED
  report.passed = true;
  writeSecurityLog(report, 'Allowed', 'All anti-spoofing checks passed.');
  writeAttendanceLog(report, action);
  return { passed: true, failedCheck: null, reason: 'All checks passed.', report };
}

/**
 * Lightweight snapshot for the Security Status screen (no attendance writes).
 * @returns {object} a status object consumed by SecurityStatusScreen.
 */
export async function getLiveStatus({ employee, site } = {}) {
  const out = {
    gps: 'Unavailable', accuracy: null, vpn: null, mock: null,
    root: null, deviceVerified: null, geofence: null, error: null,
  };
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      out.error = 'Location permission not granted.';
      return out;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    const coords = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      mocked: loc.coords.mocked,
    };
    out.gps = 'Active';
    out.accuracy = coords.accuracy;

    const ip = await getPublicIp();
    out.vpn = (await detectVpn(ip)).active;
    out.mock = (await detectMockLocation(coords)).mocked;
    out.root = detectRootOrJailbreak().compromised;

    if (site) {
      const geo = verifyGeofence(coords.latitude, coords.longitude, site);
      out.geofence = { inside: geo.ok, distanceToBoundary: geo.distanceToBoundary };
    }
    out.coords = coords;
  } catch (e) {
    out.error = e?.message || 'Failed to read security status.';
  }
  return out;
}
