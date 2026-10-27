// ============================================================
// SubAi / GeoStride - Data Store Engine
// ============================================================
// Mock data removed. Live and user-created data only.
// ============================================================

const NOW = new Date();

export const MOCK_EMPLOYEES = [];
export const MOCK_LOCATIONS = {};

// Timestamps - generate relative timestamps
export function timeAgo(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60000);
}

export function mockTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return {
    toDate: () => d,
    toMillis: () => d.getTime(),
    seconds: Math.floor(d.getTime() / 1000),
    nanoseconds: (d.getTime() % 1000) * 1e6,
    toISOString: () => d.toISOString(),
    toString: () => d.toISOString()
  };
}

export const MOCK_SITES = [];
export const MOCK_ATTENDANCE = [];
export const MOCK_ASSIGNMENTS = [];
export const MOCK_NOTIFICATIONS = [];
export const MOCK_ACTIVITY_LOGS = [];
export const MOCK_DESTINATIONS = {};
export const MOCK_GEOFENCE_EVENTS = [];
export const MOCK_GEOFENCE_VIOLATIONS = [];
export const MOCK_ROUTE_LOGS = [];
export const MOCK_TRACKING_LOGS = [];
export const MOCK_GPS_HISTORY = {};

export const AI_RESPONSES = {
  'on site': (count) => `📍 **${count} employee(s)** currently On Site.`,
  'absent': (count) => `🔴 **${count} offline/absent employee(s).**`,
  'attendance': () => `📊 **Today's Attendance (0 records).**`,
  'late': () => `⏰ **0 late employee(s) today.**`,
  'assignment': () => `📋 **0 active assignment(s).**`,
  'site': () => `🗺️ **0 registered site(s).**`,
  'log': () => `📝 **No recent activity logs.**`,
  'default': () => "🤔 How can I help you with workforce monitoring today?",
};

export const MOCK_AI_HISTORY = [];

// Helper functions
export function getEmployees() {
  return [...MOCK_EMPLOYEES];
}

export function getSites() {
  return [...MOCK_SITES];
}

export function getAttendance() {
  return [...MOCK_ATTENDANCE];
}

export function getAssignments() {
  return [...MOCK_ASSIGNMENTS];
}

export function getActivityLogs() {
  return [...MOCK_ACTIVITY_LOGS];
}

export function getNotifications() {
  return [...MOCK_NOTIFICATIONS];
}

// Simulate server timestamp
export function serverTimestamp() {
  return mockTimestamp(new Date());
}

// Generate a new ID
let idCounter = 100;
export function generateId(prefix = 'id') {
  return `${prefix}${++idCounter}`;
}

export function getEmployeeById(id) {
  return MOCK_EMPLOYEES.find(e => e.id === id);
}

export function getEmployeeLocation(empId) {
  return MOCK_LOCATIONS[empId] || null;
}

export function getAllLocations() {
  return { ...MOCK_LOCATIONS };
}