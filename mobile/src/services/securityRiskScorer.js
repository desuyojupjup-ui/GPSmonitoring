// ──────────────────────────────────────────────────────────────────────────
// Security Risk Scorer — pure function, no Firestore dependency.
// Accepts an array of security_events and returns a composite risk score.
// ──────────────────────────────────────────────────────────────────────────
import { SECURITY, RISK } from './securityConfig';

const W = SECURITY.RISK_WEIGHTS;

/**
 * Calculate security risk score from an array of security_events documents.
 * @param {Array} events - array of security_events docs
 * @param {number} windowHours - only consider events within this window (default 24h)
 * @returns {{ score: number, level: object, breakdown: object }}
 */
export function calculateRiskScore(events = [], windowHours = 24) {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;

  const recent = events.filter((e) => {
    const ts = e.createdAt?.toDate
      ? e.createdAt.toDate().getTime()
      : new Date(e.createdAt || e.timestamp || 0).getTime();
    return ts >= cutoff;
  });

  const breakdown = {};
  let rawScore = 0;

  recent.forEach((e) => {
    const type = e.eventType || 'UNKNOWN';
    const weight = W[type] || 5;
    breakdown[type] = (breakdown[type] || 0) + 1;
    rawScore += weight;
  });

  // Multiple distinct signal types amplifier (+10 for each type > 2)
  const distinctTypes = Object.keys(breakdown).length;
  if (distinctTypes >= 3) rawScore += 20;

  // Repeated same-type amplifier
  Object.values(breakdown).forEach((count) => {
    if (count >= 3) rawScore += 10;
  });

  const score = Math.min(100, Math.round(rawScore));
  const level = RISK.level(score);

  return { score, level, breakdown, recentCount: recent.length };
}

/**
 * Get human-readable severity label for a single event type.
 */
export function getSeverityForEventType(eventType) {
  return SECURITY.EVENT_SEVERITY[eventType] || 'Low';
}

/**
 * Build a compact event description string.
 */
export function describeEvent(eventType, extra = {}) {
  const descriptions = {
    FAKE_GPS_DETECTED: 'Mock location activity detected on this device.',
    VPN_DETECTED: 'VPN or proxy usage detected during active attendance.',
    DEVICE_INTEGRITY_VIOLATION: 'Device integrity check failed (root/jailbreak detected).',
    GPS_SPEED_ANOMALY: `Unrealistic movement speed detected (${extra.speed ? Math.round(extra.speed) + ' km/h' : 'exceeds threshold'}).`,
    GPS_JUMP: `Sudden location change of ${extra.distanceM ? Math.round(extra.distanceM) + 'm' : '>500m'} in ${extra.elapsedSec ? extra.elapsedSec + 's' : 'short time'}.`,
    LOCATION_FROZEN: 'Location has not changed during an extended period of active duty.',
    GPS_DISABLED: 'GPS was disabled during an active attendance session.',
    LOCATION_UPDATE_INTERRUPTED: 'Location updates stopped unexpectedly during active shift.',
    UNUSUAL_GPS_ACCURACY: `GPS accuracy is unusually low (${extra.accuracy ? Math.round(extra.accuracy * 10) / 10 + 'm' : 'poor signal'}).`,
    UNAUTHORIZED_LOCATION: `Employee is outside the assigned geofence (${extra.distance ? Math.round(extra.distance) + 'm away' : 'location mismatch'}).`,
    OVERTIME_SHIFT_EXCEEDED: `Employee is still clocked in beyond scheduled shift hours (${extra.details || 'Shift end time elapsed'}).`,
    REPEATED_FACIAL_VERIFICATION_FAILURE: `Employee has failed facial verification ${extra.count || 3}+ consecutive times.`,
    MULTIPLE_SECURITY_SIGNALS: 'Multiple security signals detected simultaneously during active attendance.',
    SUSPICIOUS_MOVEMENT: 'Suspicious movement pattern detected.',
  };
  return descriptions[eventType] || `Security signal detected: ${eventType}`;
}
