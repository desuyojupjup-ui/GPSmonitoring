// GeoStride / SubAi - Mobile Data Engine
// Mock data removed.

export const MOCK_USER = null;
export const MOCK_EMPLOYEES = [];
export const MOCK_ATTENDANCE = [];
export const MOCK_TASKS = [];
export const MOCK_NOTIFICATIONS = [];
export const MOCK_AI_RESPONSES = {
  'default': 'I can help with check-in, check-out, attendance, tasks, and site info. Try asking something!',
};
export const MOCK_LOCATIONS = {};
export const MOCK_SITES = [];

export const generateId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

export const mockGetDocs = async (col, filters) => {
  await delay(100);
  if (col === 'tasks') return { docs: MOCK_TASKS.map(t => ({ id: t.id, data: () => t })), empty: MOCK_TASKS.length === 0 };
  if (col === 'notifications') return { docs: MOCK_NOTIFICATIONS.map(n => ({ id: n.id, data: () => n })), empty: MOCK_NOTIFICATIONS.length === 0 };
  return { empty: true, docs: [] };
};

export const mockAddDoc = async (col, data) => {
  await delay(100);
  const newItem = { id: generateId(col.slice(0, 3)), ...data };
  MOCK_TASKS.push(newItem);
  return newItem;
};

export const mockUpdateDoc = async (id, data) => {
  await delay(100);
  const idx = MOCK_TASKS.findIndex(t => t.id === id);
  if (idx !== -1) MOCK_TASKS[idx] = { ...MOCK_TASKS[idx], ...data };
};

export const mockDeleteDoc = async (id) => {
  await delay(100);
  const idx = MOCK_TASKS.findIndex(t => t.id === id);
  if (idx !== -1) MOCK_TASKS.splice(idx, 1);
};