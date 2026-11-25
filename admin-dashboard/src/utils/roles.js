/**
 * SubAi Multi-Company Role & Configurable Permission System
 *
 * Hierarchy:
 *   Developer
 *     ↓
 *   System Super Admin (alias: Super Admin)
 *     ↓
 *   Company Admin
 *     ↓
 *   Company Users (any custom job title: Manager, Supervisor, HR, Dispatcher, etc.)
 *     ↓
 *   Employee (Mobile App)
 */

export const MODULE_PERMISSIONS = [
  { key: 'dashboard',           label: 'Dashboard',           path: '/',               group: 'Core' },
  { key: 'employees',           label: 'Employees',           path: '/employees',      group: 'Workforce' },
  { key: 'assignments',         label: 'Assignments',         path: '/assignments',    group: 'Workforce' },
  { key: 'worksites',           label: 'Worksites',           path: '/sites',          group: 'Workforce' },
  { key: 'attendance',          label: 'Attendance',          path: '/attendance',     group: 'Monitoring' },
  { key: 'live_monitoring',     label: 'Live Monitoring',     path: '/tracking',       group: 'Monitoring' },
  { key: 'facial_verification', label: 'Facial Verification', path: '/verifications',  group: 'Security' },
  { key: 'anomaly_detection',   label: 'Anomaly Detection',   path: '/anomalies',      group: 'Security' },
  { key: 'fraud_reports',       label: 'Fraud Reports',       path: '/fraud-reports',  group: 'Security' },
  { key: 'delay_reports',       label: 'Delay Reports',       path: '/delay-reports',  group: 'Monitoring' },
  { key: 'analytics',           label: 'Analytics',           path: '/reports',        group: 'Insights' },
  { key: 'reports',             label: 'Reports',             path: '/reports',        group: 'Insights' },
  { key: 'notifications',       label: 'Notifications',       path: '/notifications',  group: 'Core' },
  { key: 'users',               label: 'Users',               path: '/users',          group: 'Administration' },
  { key: 'settings',            label: 'Settings',            path: '/settings',       group: 'Administration' },
  { key: 'activity_logs',       label: 'Activity Logs',       path: '/logs',           group: 'Administration' },
];

export const PATH_TO_PERMISSION = {
  '/':               'dashboard',
  '/employees':      'employees',
  '/assignments':    'assignments',
  '/sites':          'worksites',
  '/attendance':     'attendance',
  '/tracking':       'live_monitoring',
  '/verifications':  'facial_verification',
  '/anomalies':      'anomaly_detection',
  '/fraud-reports':  'fraud_reports',
  '/delay-reports':  'delay_reports',
  '/reports':        'reports',
  '/notifications':  'notifications',
  '/users':          'users',
  '/settings':       'settings',
  '/logs':           'activity_logs',
  '/ai-assistant':   'dashboard',
};

const ALL_TRUE_PERMS = MODULE_PERMISSIONS.reduce((acc, m) => {
  acc[m.key] = true;
  return acc;
}, {});

export function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r.includes('developer') || r === 'dev') return 'Developer';
  if (r.includes('super')) return 'System Super Admin';
  if (r.includes('company admin') || r === 'company_admin' || r === 'admin') return 'Company Admin';
  if (r.includes('supervisor')) return 'Supervisor';
  if (r.includes('manager')) return 'Manager';
  if (r.includes('hr') || r.includes('human')) return 'HR';
  if (r.includes('company user') || r.includes('staff')) return 'Company User';
  return 'Company User';
}

export const normalizeRoleName = normalizeRole;

export const buildDefaultPermissionsForRole = (role) => {
  const norm = normalizeRole(role);
  if (norm === 'Developer' || norm === 'System Super Admin' || norm === 'Company Admin') {
    return { ...ALL_TRUE_PERMS };
  }
  if (norm === 'Manager') {
    return {
      ...ALL_TRUE_PERMS,
      users: false,
      activity_logs: false,
    };
  }
  if (norm === 'Supervisor') {
    return {
      dashboard: true,
      employees: false,
      assignments: true,
      worksites: true,
      attendance: true,
      live_monitoring: true,
      facial_verification: true,
      anomaly_detection: true,
      fraud_reports: false,
      delay_reports: true,
      analytics: false,
      reports: false,
      notifications: true,
      users: false,
      settings: false,
      activity_logs: false,
    };
  }
  if (norm === 'HR') {
    return {
      dashboard: true,
      employees: true,
      assignments: false,
      worksites: false,
      attendance: true,
      live_monitoring: false,
      facial_verification: true,
      anomaly_detection: false,
      fraud_reports: false,
      delay_reports: true,
      analytics: true,
      reports: true,
      notifications: true,
      users: false,
      settings: false,
      activity_logs: false,
    };
  }
  // Default Company User preset (editable per user by Company Admin)
  return {
    dashboard: true,
    employees: true,
    assignments: true,
    worksites: true,
    attendance: true,
    live_monitoring: true,
    facial_verification: false,
    anomaly_detection: false,
    fraud_reports: false,
    delay_reports: true,
    analytics: false,
    reports: false,
    notifications: true,
    users: false,
    settings: false,
    activity_logs: false,
  };
};

export const ROLE_PERMISSIONS = {
  'Developer': {
    role: 'Developer',
    label: 'Platform Developer',
    access: 'Platform Developer & Multi-Company Administration',
    color: '#0EA5E9',
    bg: '#E0F2FE',
    border: '#BAE6FD',
    description: 'Platform-level developer access across all companies without requiring company credentials.',
    permissions: buildDefaultPermissionsForRole('Developer'),
    paths: Object.keys(PATH_TO_PERMISSION),
  },
  'System Super Admin': {
    role: 'System Super Admin',
    label: 'System Super Admin',
    access: 'System-Wide Multi-Company Administration',
    color: '#8B5CF6',
    bg: '#F3E8FF',
    border: '#DDD6FE',
    description: 'Manages companies, Company Admins, global settings, and system-wide audit logs.',
    permissions: buildDefaultPermissionsForRole('System Super Admin'),
    paths: Object.keys(PATH_TO_PERMISSION),
  },
  'Super Admin': {
    role: 'System Super Admin',
    label: 'System Super Admin',
    access: 'System-Wide Multi-Company Administration',
    color: '#8B5CF6',
    bg: '#F3E8FF',
    border: '#DDD6FE',
    description: 'Manages companies, Company Admins, global settings, and system-wide audit logs.',
    permissions: buildDefaultPermissionsForRole('System Super Admin'),
    paths: Object.keys(PATH_TO_PERMISSION),
  },
  'Company Admin': {
    role: 'Company Admin',
    label: 'Company Administrator',
    access: 'Full Company Administration',
    color: '#1E5ADB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    description: 'Manages all users, custom permissions, worksites, employees, and operations within their company.',
    permissions: buildDefaultPermissionsForRole('Company Admin'),
    paths: Object.keys(PATH_TO_PERMISSION),
  },
  'Company User': {
    role: 'Company User',
    label: 'Company Staff User',
    access: 'Configurable Module Permissions',
    color: '#0D9488',
    bg: '#CCFBF1',
    border: '#99F6E4',
    description: 'Company staff member (Manager, Supervisor, HR, or custom title) with configurable module permissions.',
    permissions: buildDefaultPermissionsForRole('Company User'),
    paths: Object.keys(PATH_TO_PERMISSION).filter((p) => buildDefaultPermissionsForRole('Company User')[PATH_TO_PERMISSION[p]]),
  },
  'Manager': {
    role: 'Manager',
    label: 'Operations Manager',
    access: 'Operations & Fleet Management',
    color: '#2563EB',
    bg: '#DBEAFE',
    border: '#BFDBFE',
    description: 'Workforce operations, GPS tracking, dispatch schedules, and management reports.',
    permissions: buildDefaultPermissionsForRole('Manager'),
    paths: Object.keys(PATH_TO_PERMISSION).filter((p) => buildDefaultPermissionsForRole('Manager')[PATH_TO_PERMISSION[p]]),
  },
  'Supervisor': {
    role: 'Supervisor',
    label: 'Field Supervisor',
    access: 'Field Operations & Duty Supervision',
    color: '#10B981',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    description: 'Ground operations: live telemetry, site geofences, duty assignments, and attendance.',
    permissions: buildDefaultPermissionsForRole('Supervisor'),
    paths: Object.keys(PATH_TO_PERMISSION).filter((p) => buildDefaultPermissionsForRole('Supervisor')[PATH_TO_PERMISSION[p]]),
  },
  'HR': {
    role: 'HR',
    label: 'Human Resources',
    access: 'Staff Directory & Attendance Records',
    color: '#F59E0B',
    bg: '#FEF3C7',
    border: '#FDE68A',
    description: 'Personnel directory, attendance timesheets, facial verification logs, and reports.',
    permissions: buildDefaultPermissionsForRole('HR'),
    paths: Object.keys(PATH_TO_PERMISSION).filter((p) => buildDefaultPermissionsForRole('HR')[PATH_TO_PERMISSION[p]]),
  },
};

export const ROLE_OPTIONS = [
  'Developer',
  'System Super Admin',
  'Company Admin',
  'Company User',
  'Manager',
  'Supervisor',
  'HR',
];

export const COMPANY_ASSIGNABLE_ROLES = [
  'Company Admin',
  'Company User',
  'Manager',
  'Supervisor',
  'HR',
];

export const isPlatformAdmin = (userOrRole) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const norm = normalizeRole(role);
  return norm === 'Developer' || norm === 'System Super Admin';
};

export const isCompanyAdmin = (userOrRole) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  const norm = normalizeRole(role);
  return norm === 'Company Admin';
};

export const getRoleConfig = (role) => {
  const norm = normalizeRole(role);
  return ROLE_PERMISSIONS[norm] || ROLE_PERMISSIONS['Company User'];
};

export const getEffectivePermissions = (user) => {
  if (!user) return {};
  const role = typeof user === 'string' ? user : user.role;
  const norm = normalizeRole(role);

  // Platform admins and Company Admins always have full module access within their scope
  if (norm === 'Developer' || norm === 'System Super Admin' || norm === 'Company Admin') {
    return { ...ALL_TRUE_PERMS };
  }

  // Configurable per-user permissions take priority when defined
  if (user && typeof user === 'object' && user.permissions && typeof user.permissions === 'object') {
    return {
      ...buildDefaultPermissionsForRole(norm),
      ...user.permissions,
    };
  }

  return buildDefaultPermissionsForRole(norm);
};

export const hasPermission = (user, permKey) => {
  if (!permKey) return true;
  const perms = getEffectivePermissions(user);
  return Boolean(perms[permKey]);
};

export const isPathAllowedForUser = (user, path) => {
  if (!user) return false;
  if (isPlatformAdmin(user) || isCompanyAdmin(user)) return true;
  const permKey = PATH_TO_PERMISSION[path];
  if (!permKey) return true;
  return hasPermission(user, permKey);
};

// Backwards-compatible wrapper accepting either a role string or full user object
export const isPathAllowedForRole = (roleOrUser, path) => {
  if (roleOrUser && typeof roleOrUser === 'object') {
    return isPathAllowedForUser(roleOrUser, path);
  }
  const perms = buildDefaultPermissionsForRole(roleOrUser);
  const permKey = PATH_TO_PERMISSION[path];
  if (!permKey) return true;
  return Boolean(perms[permKey]);
};
