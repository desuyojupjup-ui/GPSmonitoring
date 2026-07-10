// GeoStride DEMO - Mobile Mock Data
// Replace all Firebase reads/writes with local data.

export const MOCK_USER = {
  id: 'u1',
  email: 'user@demo.com',
  name: 'Demo User',
  role: 'employee',
  department: 'Field Operations',
};

export const MOCK_EMPLOYEES = [
  { id: 'e1', name: 'Roberto Diaz', email: 'roberto@demo.com', status: 'On Site', department: 'Construction', profilePic: null },
  { id: 'e2', name: 'Carlos Tan', email: 'carlos@demo.com', status: 'Late', department: 'Maintenance', profilePic: null },
  { id: 'e3', name: 'Maria Santos', email: 'maria@demo.com', status: 'On Site', department: 'Field Operations', profilePic: null },
  { id: 'e4', name: 'John Reyes', email: 'john@demo.com', status: 'Off Duty', department: 'Logistics', profilePic: null },
];

export const MOCK_ATTENDANCE = [
  { id: 'a1', employee_name: 'Roberto Diaz', site_name: 'Main Site', check_in: '08:00', check_out: '17:00', duration: '9h', status: 'Completed', verification: 'Verified' },
  { id: 'a2', employee_name: 'Carlos Tan', site_name: 'Main Site', check_in: '09:15', check_out: '—', duration: '—', status: 'Late', verification: 'Pending' },
  { id: 'a3', employee_name: 'Maria Santos', site_name: 'North Site', check_in: '08:30', check_out: '17:30', duration: '9h', status: 'Completed', verification: 'Verified' },
];

export const MOCK_TASKS = [
  { id: 't1', title: 'Daily site inspection', status: 'In Progress', priority: 'High', due: 'Today' },
  { id: 't2', title: 'Submit attendance report', status: 'Pending', priority: 'Medium', due: 'Today' },
  { id: 't3', title: 'Equipment check', status: 'Completed', priority: 'Low', due: 'Yesterday' },
];

export const MOCK_NOTIFICATIONS = [
  { id: 'n1', title: 'Geofence Alert', message: 'Roberto Diaz entered Main Site', time: '2 min ago', read: false },
  { id: 'n2', title: 'Task Reminder', message: 'Daily inspection due in 1 hour', time: '15 min ago', read: false },
  { id: 'n3', title: 'System Update', message: 'App updated to v1.2.0', time: '1 hour ago', read: true },
];

export const MOCK_AI_RESPONSES = {
  'check in': 'You have checked in at Main Site at 08:00 AM.',
  'check out': 'You have checked out at 05:00 PM.',
  'attendance': 'Your attendance this week: 4/5 days present.',
  'task': 'You have 2 pending tasks: Daily site inspection, Submit attendance report.',
  'default': 'I can help with check-in, check-out, attendance, tasks, and site info. Try asking something!',
};

export const MOCK_LOCATIONS = {
  'e1': { lat: 14.6091, lng: 121.0223 },
  'e2': { lat: 14.6105, lng: 121.0240 },
  'e3': { lat: 14.6080, lng: 121.0200 },
  'e4': { lat: 14.6110, lng: 121.0250 },
};

export const MOCK_SITES = [
  { id: 's1', name: 'Main Site', lat: 14.6091, lng: 121.0223, radius: 300 },
  { id: 's2', name: 'North Site', lat: 14.6120, lng: 121.0180, radius: 250 },
];

export const generateId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Simulated async replacements for Firestore functions
export const mockGetDocs = async (col, filters) => {
  await delay(300);
  if (col === 'tasks') return { docs: MOCK_TASKS.map(t => ({ id: t.id, data: () => t })), empty: false };
  if (col === 'notifications') return { docs: MOCK_NOTIFICATIONS.map(n => ({ id: n.id, data: () => n })), empty: false };
  return { empty: true, docs: [] };
};

export const mockAddDoc = async (col, data) => {
  await delay(400);
  const newItem = { id: generateId(col.slice(0, 3)), ...data };
  MOCK_TASKS.push(newItem);
  return newItem;
};

export const mockUpdateDoc = async (id, data) => {
  await delay(300);
  const idx = MOCK_TASKS.findIndex(t => t.id === id);
  if (idx !== -1) MOCK_TASKS[idx] = { ...MOCK_TASKS[idx], ...data };
};

export const mockDeleteDoc = async (id) => {
  await delay(300);
  const idx = MOCK_TASKS.findIndex(t => t.id === id);
  if (idx !== -1) MOCK_TASKS.splice(idx, 1);
};