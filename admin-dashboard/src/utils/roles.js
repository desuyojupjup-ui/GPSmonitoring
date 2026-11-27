/**
 * SubAi Multi-Company SaaS Role & Custom Permission System
 *
 * Exact Two-Portal Architecture:
 *   Developer (System Provider — Dedicated Developer Portal: /developer*)
 *     ↓ manages Companies, Subscriptions/Plans, Company Owners, Activation, Company Admin Approval & System Monitoring
 *   Company Owner / Company Admin (Dedicated Company Admin Portal: /login → /)
 *     ↓ strictly isolated to their own company; creates Company Users (Position label + Custom Module Permissions) & Employees
 *   Company Users (Position = label only, e.g. HR / Manager / Supervisor; Access = exact Custom Permissions)
 *     ↓
 *   Employees (Mobile App — strictly isolated to their own company & own records)
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
  { key: 'users',               label: 'Company Users',       path: '/users',          group: 'Administration' },
  { key: 'settings',            label: 'Company Settings',    path: '/settings',       group: 'Administration' },
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

export const DEVELOPER_PATHS = [
  '/developer',
  '/developer/monitoring',
  '/developer/logs',
  '/developer/settings',
];

export const SUGGESTED_POSITIONS = [
  'HR',
  'Manager',
  'Supervisor',
  'Operations Lead',
  'Dispatcher',
  'Payroll Officer',
  'Safety Officer',
];

const ALL_TRUE_PERMS = MODULE_PERMISSIONS.reduce((acc, m) => {
  acc[m.key] = true;
  return acc;
}, {});

const MINIMAL_USER_PERMS = MODULE_PERMISSIONS.reduce((acc, m) => {
  acc[m.key] = m.key === 'dashboard';
  return acc;
}, {});

export function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r.includes('developer') || r === 'dev' || r.includes('provider')) return 'Developer';
  // Legacy Super Admin / System Super Admin / Company Owner map cleanly to Company Admin (company-isolated owner/admin)
  if (
    r.includes('company admin') ||
    r === 'company_admin' ||
    r.includes('company owner') ||
    r.includes('super') ||
    r === 'admin'
  ) {
    return 'Company Admin';
  }
  return 'Company User';
}

export const normalizeRoleName = normalizeRole;

export const buildEmptyCustomPermissions = () => ({ ...MINIMAL_USER_PERMS });

export const buildAllPermissions = () => ({ ...ALL_TRUE_PERMS });

export const buildDefaultPermissionsForRole = (role) => {
  const norm = normalizeRole(role);
  if (norm === 'Developer' || norm === 'Company Admin') {
    return { ...ALL_TRUE_PERMS };
  }
  // Company Users start with a clean starter template that Company Admin explicitly customizes per user
  return {
    dashboard: true,
    employees: false,
    assignments: false,
    worksites: false,
    attendance: false,
    live_monitoring: false,
    facial_verification: false,
    anomaly_detection: false,
    fraud_reports: false,
    delay_reports: false,
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
    label: 'System Provider / Developer',
    access: 'Developer Portal — Companies, Plans & System Monitoring',
    color: '#0284C7',
    bg: '#E0F2FE',
    border: '#7DD3FC',
    description: 'System provider outside all client companies. Manages companies, plans, company owners, activation, Company Admin approvals, and system-wide monitoring.',
    permissions: buildDefaultPermissionsForRole('Developer'),
    paths: DEVELOPER_PATHS,
  },
  'Company Admin': {
    role: 'Company Admin',
    label: 'Company Owner / Admin',
    access: 'Full Company Admin Portal (Own Company Only)',
    color: '#1E5ADB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    description: 'Company Owner or assigned Company Admin. Manages employees, assignments, worksites, attendance, users, custom permissions, and reports strictly for their own company.',
    permissions: buildDefaultPermissionsForRole('Company Admin'),
    paths: Object.keys(PATH_TO_PERMISSION),
  },
  'Company User': {
    role: 'Company User',
    label: 'Company User',
    access: 'Custom Module Permissions',
    color: '#0D9488',
    bg: '#CCFBF1',
    border: '#99F6E4',
    description: 'Assigned a Position label (e.g., HR, Manager, Supervisor) and exact custom module permissions chosen by the Company Admin.',
    permissions: buildDefaultPermissionsForRole('Company User'),
    paths: Object.keys(PATH_TO_PERMISSION).filter((p) => buildDefaultPermissionsForRole('Company User')[PATH_TO_PERMISSION[p]]),
  },
};

export const ROLE_OPTIONS = [
  'Developer',
  'Company Admin',
  'Company User',
];

export const DEVELOPER_ASSIGNABLE_ROLES = [
  'Company Admin',
  'Developer',
];

export const COMPANY_ASSIGNABLE_ROLES = [
  'Company User',
];

export const isDeveloper = (userOrRole) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return normalizeRole(role) === 'Developer';
};

// Strictly ONLY Developer is platform/system-provider level
export const isPlatformAdmin = (userOrRole) => isDeveloper(userOrRole);

export const isCompanyAdmin = (userOrRole) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return normalizeRole(role) === 'Company Admin';
};

export const isCompanyUser = (userOrRole) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return normalizeRole(role) === 'Company User';
};

export const getRoleConfig = (role) => {
  const norm = normalizeRole(role);
  return ROLE_PERMISSIONS[norm] || ROLE_PERMISSIONS['Company User'];
};

export const getEffectivePermissions = (user) => {
  if (!user) return {};
  const role = typeof user === 'string' ? user : user.role;
  const norm = normalizeRole(role);

  if (norm === 'Developer' || norm === 'Company Admin') {
    return { ...ALL_TRUE_PERMS };
  }

  // For Company Users, custom permissions object is the SOLE source of truth (Position is a label only!)
  if (user && typeof user === 'object' && user.permissions && typeof user.permissions === 'object') {
    const base = { ...MINIMAL_USER_PERMS };
    for (const m of MODULE_PERMISSIONS) {
      if (Object.prototype.hasOwnProperty.call(user.permissions, m.key)) {
        base[m.key] = Boolean(user.permissions[m.key]);
      }
    }
    return base;
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

  // Developer is strictly isolated inside the Developer Portal (/developer*) — NEVER enters Company Admin Portal
  if (isDeveloper(user)) {
    return DEVELOPER_PATHS.includes(path);
  }

  // Company Owner / Company Admin / Company Users can NEVER enter the Developer Portal
  if (path && path.startsWith('/developer')) {
    return false;
  }

  if (isCompanyAdmin(user)) return true;

  const permKey = PATH_TO_PERMISSION[path];
  if (!permKey) return true;
  return hasPermission(user, permKey);
};

export const isPathAllowedForRole = (roleOrUser, path) => {
  if (roleOrUser && typeof roleOrUser === 'object') {
    return isPathAllowedForUser(roleOrUser, path);
  }
  if (normalizeRole(roleOrUser) === 'Developer') {
    return DEVELOPER_PATHS.includes(path);
  }
  if (path && path.startsWith('/developer')) return false;
  if (normalizeRole(roleOrUser) === 'Company Admin') return true;
  const perms = buildDefaultPermissionsForRole(roleOrUser);
  const permKey = PATH_TO_PERMISSION[path];
  if (!permKey) return true;
  return Boolean(perms[permKey]);
};
