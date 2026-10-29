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
  writeSecurityLog, writeAttendanceLog, writeFraudReport, writeGeofenceEvent, writeSecurityEvent,
} from './securityLogger';
import { auth } from '../firebase';

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
    matchedSite: null,
    activeLocationAddress: null,
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
export async function runPreAttendanceChecks({ employee, site, allSites = [], action = 'time_in' }) {
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

  // Reverse geocode active physical address of where the employee is checking in
  if (latest?.latitude && latest?.longitude) {
    try {
      const geoArr = await Location.reverseGeocodeAsync({
        latitude: latest.latitude,
        longitude: latest.longitude,
      });
      if (geoArr && geoArr.length > 0) {
        const g = geoArr[0];
        const parts = [
          g.name && g.name !== g.street ? g.name : null,
          g.street,
          g.district || g.subregion,
          g.city || g.region,
        ].filter(Boolean);
        report.activeLocationAddress = parts.join(', ') || g.city || g.region || `${latest.latitude.toFixed(4)}, ${latest.longitude.toFixed(4)}`;
      }
    } catch (err) {
      console.warn('Reverse geocode error:', err);
    }
  }

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
    writeSecurityEvent({
      eventType: 'DEVICE_INTEGRITY_VIOLATION',
      employee: { id: employee?.id, name: employee?.name, email: employee?.email, employeeType: employee?.employeeType },
      assignment: { id: null, siteId: site?.id, siteName: site?.name },
      coords: { latitude: latest?.latitude, longitude: latest?.longitude, accuracy: latest?.accuracy },
      deviceInfo: { deviceId, ipAddress: ip },
      customDescription: root.reason,
    });
    return fail('root', root.reason);
  }

  // 2. VPN
  const vpn = await detectVpn(ip, latest);
  report.vpn = vpn.active;
  if (vpn.active) {
    writeSecurityEvent({
      eventType: 'VPN_DETECTED',
      employee: { id: employee?.id, name: employee?.name, email: employee?.email, employeeType: employee?.employeeType },
      assignment: { id: null, siteId: site?.id, siteName: site?.name },
      coords: { latitude: latest?.latitude, longitude: latest?.longitude, accuracy: latest?.accuracy },
      deviceInfo: { deviceId, ipAddress: ip },
      customDescription: vpn.reason,
    });
    return fail('vpn', vpn.reason);
  }

  // 3. Mock GPS
  const mock = await detectMockLocation(latest);
  report.mock = mock.mocked;
  if (mock.mocked) {
    writeSecurityEvent({
      eventType: 'FAKE_GPS_DETECTED',
      employee: { id: employee?.id, name: employee?.name, email: employee?.email, employeeType: employee?.employeeType },
      assignment: { id: null, siteId: site?.id, siteName: site?.name },
      coords: { latitude: latest?.latitude, longitude: latest?.longitude, accuracy: latest?.accuracy },
      deviceInfo: { deviceId, ipAddress: ip },
      customDescription: mock.reason,
    });
    return fail('mock', mock.reason);
  }

  // 4. Accuracy
  const acc = validateAccuracy(latest);
  if (!acc.ok) {
    writeSecurityEvent({
      eventType: 'UNUSUAL_GPS_ACCURACY',
      employee: { id: employee?.id, name: employee?.name, email: employee?.email },
      assignment: { siteId: site?.id, siteName: site?.name },
      coords: { latitude: latest?.latitude, longitude: latest?.longitude, accuracy: latest?.accuracy },
      deviceInfo: { deviceId, ipAddress: ip },
      extra: { accuracy: latest?.accuracy },
    });
    return fail('accuracy', acc.reason);
  }

  // 5. Geofence Check & Active Location Resolution
  const empWorkType = (employee?.workType || employee?.employeeType || employee?.type || '').toString().toLowerCase();
  const isFieldEmployee = empWorkType.includes('mobile') || empWorkType.includes('field');

  // Verify against assigned site(s)
  const geo = verifyGeofence(latest.latitude, latest.longitude, site);
  report.geofenceOk = geo.ok;
  report.distanceToBoundary = geo.distanceToBoundary;
  report.matchedSite = geo.matchedSite || null;

  // If not inside assigned site, check if physically located inside any registered site
  if (!report.matchedSite && Array.isArray(allSites) && allSites.length > 0) {
    const allSitesGeo = verifyGeofence(latest.latitude, latest.longitude, allSites);
    if (allSitesGeo.ok && allSitesGeo.matchedSite) {
      report.matchedSite = allSitesGeo.matchedSite;
      if (!isFieldEmployee) {
        // Employee is within a recognized worksite perimeter
        report.geofenceOk = true;
        report.distanceToBoundary = 0;
      }
    }
  }

  if (!isFieldEmployee) {
    if (!report.geofenceOk) {
      writeSecurityEvent({
        eventType: 'UNAUTHORIZED_LOCATION',
        employee: { id: employee?.id, name: employee?.name, email: employee?.email, workType: employee?.workType || 'Fixed Site Employee' },
        assignment: { siteId: site?.id, siteName: site?.name },
        coords: { latitude: latest?.latitude, longitude: latest?.longitude, accuracy: latest?.accuracy },
        deviceInfo: { deviceId, ipAddress: ip },
        extra: { distance: geo.distanceToBoundary },
      });
      return fail('geofence', geo.reason, () => writeGeofenceEvent(report, 'violation'));
    }
  } else {
    // For Field Employees, working across field locations is authorized
    report.geofenceOk = true;
    report.distanceToBoundary = 0;
  }

  // 6. Consistency + speed
  const consistency = validateConsistency(readings);
  if (!consistency.ok) {
    writeSecurityEvent({
      eventType: 'GPS_SPEED_ANOMALY',
      employee: { id: employee?.id, name: employee?.name, email: employee?.email },
      assignment: { siteId: site?.id, siteName: site?.name },
      coords: { latitude: latest?.latitude, longitude: latest?.longitude, accuracy: latest?.accuracy },
      deviceInfo: { deviceId, ipAddress: ip },
      extra: { speed: consistency.speedKmh, distanceM: consistency.distanceM },
    });
    return fail('consistency', consistency.reason);
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
    gps: 'Unavailable', accuracy: null, vpn: null, vpnReason: null, mock: null,
    mockReason: null, root: null, rootReason: null, deviceVerified: null, geofence: null, error: null,
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
    const deviceId = await getDeviceId();

    const vpnResult = await detectVpn(ip, coords, true);
    out.vpn = vpnResult.active;
    out.vpnReason = vpnResult.reason;

    const mockResult = await detectMockLocation(coords);
    out.mock = mockResult.mocked;
    out.mockReason = mockResult.reason;

    const rootResult = detectRootOrJailbreak();
    out.root = rootResult.compromised;
    out.rootReason = rootResult.reason;

    // Resolve active employee (or fallback from current session) so events are always attributed and stored
    const currentAuth = auth?.currentUser;
    const activeEmp = employee || {
      id: currentAuth?.uid || 'emp_fallback',
      name: currentAuth?.displayName || (currentAuth?.email ? currentAuth.email.split('@')[0] : 'Jupiter Desuyo'),
      email: currentAuth?.email || 'jupiter@gmail.com',
      employeeType: 'Field Employee',
    };

    // If active security violation is detected during live scanning, record it to Firestore security_events
    // (writeSecurityEvent automatically deduplicates within 60s per employee+eventType)
    if (activeEmp) {
      if (out.vpn) {
        writeSecurityEvent({
          eventType: 'VPN_DETECTED',
          employee: { id: activeEmp.id, name: activeEmp.name, email: activeEmp.email, employeeType: activeEmp.employeeType },
          assignment: { id: null, siteId: site?.id, siteName: site?.name },
          coords,
          deviceInfo: { deviceId, ipAddress: ip },
          customDescription: vpnResult.reason,
        });
      }
      if (out.mock) {
        writeSecurityEvent({
          eventType: 'FAKE_GPS_DETECTED',
          employee: { id: activeEmp.id, name: activeEmp.name, email: activeEmp.email, employeeType: activeEmp.employeeType },
          assignment: { id: null, siteId: site?.id, siteName: site?.name },
          coords,
          deviceInfo: { deviceId, ipAddress: ip },
          customDescription: mockResult.reason,
        });
      }
      if (out.root) {
        writeSecurityEvent({
          eventType: 'DEVICE_INTEGRITY_VIOLATION',
          employee: { id: activeEmp.id, name: activeEmp.name, email: activeEmp.email, employeeType: activeEmp.employeeType },
          assignment: { id: null, siteId: site?.id, siteName: site?.name },
          coords,
          deviceInfo: { deviceId, ipAddress: ip },
          customDescription: rootResult.reason,
        });
      }
    }

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
