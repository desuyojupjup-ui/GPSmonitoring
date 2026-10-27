/**
 * SubAi Role-Based Access Control (RBAC) System
 * Roles: Super Admin, Manager, Supervisor, HR
 */

export const ROLE_PERMISSIONS = {
  'Super Admin': {
    role: 'Super Admin',
    label: 'Super Administrator',
    access: 'Full System Access',
    color: '#8B5CF6',
    bg: '#F3E8FF',
    border: '#DDD6FE',
    description: 'Full unrestricted access to all modules, admin account management, and security audit logs.',
    paths: [
      '/',
      '/tracking',
      '/employees',
      '/sites',
      '/assignments',
      '/attendance',
      '/verifications',
      '/anomalies',
      '/fraud-reports',
      '/delay-reports',
      '/reports',
      '/notifications',
      '/settings',
      '/users',
      '/logs',
      '/ai-assistant'
    ]
  },
  'Manager': {
    role: 'Manager',
    label: 'Operations Manager',
    access: 'Operations & Fleet Management',
    color: '#1E5ADB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    description: 'Workforce operations, real-time GPS tracking, dispatch schedules, and management reports.',
    paths: [
      '/',
      '/tracking',
      '/employees',
      '/sites',
      '/assignments',
      '/attendance',
      '/verifications',
      '/anomalies',
      '/fraud-reports',
      '/delay-reports',
      '/reports',
      '/notifications',
      '/settings',
      '/ai-assistant'
    ]
  },
  'Supervisor': {
    role: 'Supervisor',
    label: 'Field Supervisor',
    access: 'Field Operations & Duty Supervision',
    color: '#10B981',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    description: 'Day-to-day ground operations: Live telemetry, site geofences, duty assignments, and attendance checks.',
    paths: [
      '/',
      '/tracking',
      '/sites',
      '/assignments',
      '/attendance',
      '/verifications',
      '/delay-reports',
      '/notifications',
      '/ai-assistant'
    ]
  },
  'HR': {
    role: 'HR',
    label: 'Human Resources',
    access: 'Staff Directory & Attendance Records',
    color: '#F59E0B',
    bg: '#FEF3C7',
    border: '#FDE68A',
    description: 'Human resources: personnel directory, attendance timesheets, facial verification logs, and reports.',
    paths: [
      '/',
      '/employees',
      '/attendance',
      '/verifications',
      '/delay-reports',
      '/reports',
      '/notifications',
      '/ai-assistant'
    ]
  }
};

export const ROLE_OPTIONS = ['Super Admin', 'Manager', 'Supervisor', 'HR'];

export const normalizeRole = (role) => {
  const r = String(role || '').trim().toLowerCase();
  if (r.includes('super')) return 'Super Admin';
  if (r.includes('supervisor')) return 'Supervisor';
  if (r.includes('manager')) return 'Manager';
  if (r.includes('hr') || r.includes('human')) return 'HR';
  return 'Manager';
};

export const getRoleConfig = (role) => {
  const norm = normalizeRole(role);
  return ROLE_PERMISSIONS[norm] || ROLE_PERMISSIONS['Manager'];
};

export const isPathAllowedForRole = (role, path) => {
  const config = getRoleConfig(role);
  return config.paths.includes(path);
};
