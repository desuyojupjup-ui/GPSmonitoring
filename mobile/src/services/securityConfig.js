// Central thresholds for the anti-spoofing module. Tune here, not inline.
export const SECURITY = {
  MAX_ACCURACY_M: 20,          // reject GPS fixes worse than this
  MAX_HUMAN_SPEED_KMH: 250,    // > this between fixes = impossible travel (flag)
  MAX_WALKING_JUMP_M: 500,     // sudden jump between consecutive fixes (flag)
  CONSISTENCY_SAMPLE: 5,       // number of recent readings to compare
  GPS_HISTORY_MIN_INTERVAL_MS: 60000,  // throttle background writes
  GPS_HISTORY_MIN_MOVE_M: 25,
  INACTIVITY_MINUTES: 45,      // prolonged stationary while "On Site"
  BACKGROUND_TASK: 'geostride-location-monitor',
  COLLECTIONS: {
    SECURITY_LOGS: 'security_logs',
    GPS_HISTORY: 'gps_history',
    ATTENDANCE_LOGS: 'attendance_logs',
    AI_ANALYSIS: 'ai_analysis',
    DEVICE_REGISTRY: 'device_registry',
    FRAUD_REPORTS: 'fraud_reports',
    GEOFENCE_EVENTS: 'geofence_events',
  },
};

export const RISK = {
  level(score) {
    if (score >= 75) return { label: 'High', color: '#EF4444' };
    if (score >= 40) return { label: 'Medium', color: '#F59E0B' };
    if (score >= 15) return { label: 'Low', color: '#3B82F6' };
    return { label: 'Clear', color: '#10B981' };
  },
};
