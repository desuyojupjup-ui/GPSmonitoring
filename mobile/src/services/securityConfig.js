// Central thresholds for the anti-spoofing module. Tune here, not inline.
export const SECURITY = {
  MAX_ACCURACY_M: 20,               // reject GPS fixes worse than this
  MAX_HUMAN_SPEED_KMH: 250,         // > this between fixes = impossible travel
  MAX_WALKING_JUMP_M: 500,          // sudden jump between consecutive fixes (flag)
  CONSISTENCY_SAMPLE: 5,            // number of recent readings to compare
  GPS_HISTORY_MIN_INTERVAL_MS: 60000,
  GPS_HISTORY_MIN_MOVE_M: 25,
  INACTIVITY_MINUTES: 45,           // prolonged stationary while "On Site"
  BACKGROUND_TASK: 'geostride-location-monitor',
  REPEATED_FACIAL_FAILURES_THRESHOLD: 3,  // trigger REPEATED_FACIAL_VERIFICATION_FAILURE

  COLLECTIONS: {
    SECURITY_LOGS: 'security_logs',
    SECURITY_EVENTS: 'security_events',   // canonical anti-spoofing collection
    GPS_HISTORY: 'gps_history',
    ATTENDANCE_LOGS: 'attendance_logs',
    AI_ANALYSIS: 'ai_analysis',
    DEVICE_REGISTRY: 'device_registry',
    FRAUD_REPORTS: 'fraud_reports',       // legacy — kept for backwards compat
    GEOFENCE_EVENTS: 'geofence_events',
    NOTIFICATIONS: 'notifications',
  },

  // Severity per event type
  EVENT_SEVERITY: {
    FAKE_GPS_DETECTED: 'High',
    VPN_DETECTED: 'Low',
    DEVICE_INTEGRITY_VIOLATION: 'Critical',
    GPS_SPEED_ANOMALY: 'Medium',
    GPS_JUMP: 'Medium',
    LOCATION_FROZEN: 'Medium',
    GPS_DISABLED: 'Medium',
    LOCATION_UPDATE_INTERRUPTED: 'Low',
    UNUSUAL_GPS_ACCURACY: 'Low',
    UNAUTHORIZED_LOCATION: 'High',
    OVERTIME_SHIFT_EXCEEDED: 'Medium',
    REPEATED_FACIAL_VERIFICATION_FAILURE: 'High',
    MULTIPLE_SECURITY_SIGNALS: 'Critical',
    SUSPICIOUS_MOVEMENT: 'Medium',
  },

  // Risk score contribution per event type (0–100 scale)
  RISK_WEIGHTS: {
    FAKE_GPS_DETECTED: 30,
    VPN_DETECTED: 10,
    DEVICE_INTEGRITY_VIOLATION: 40,
    GPS_SPEED_ANOMALY: 20,
    GPS_JUMP: 20,
    LOCATION_FROZEN: 15,
    GPS_DISABLED: 15,
    LOCATION_UPDATE_INTERRUPTED: 10,
    UNUSUAL_GPS_ACCURACY: 8,
    UNAUTHORIZED_LOCATION: 25,
    OVERTIME_SHIFT_EXCEEDED: 15,
    REPEATED_FACIAL_VERIFICATION_FAILURE: 30,
    MULTIPLE_SECURITY_SIGNALS: 40,
    SUSPICIOUS_MOVEMENT: 18,
  },
};

export const RISK = {
  level(score) {
    if (score >= 75) return { label: 'Critical', color: '#7C3AED', bg: '#F5F3FF' };
    if (score >= 50) return { label: 'High', color: '#EF4444', bg: '#FEF2F2' };
    if (score >= 25) return { label: 'Medium', color: '#F59E0B', bg: '#FEF3C7' };
    if (score >= 10) return { label: 'Low', color: '#3B82F6', bg: '#EFF6FF' };
    return { label: 'Clear', color: '#10B981', bg: '#ECFDF5' };
  },
};
