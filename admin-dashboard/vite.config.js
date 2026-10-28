import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_ADMINS = [
  {
    id: 'admin_primary',
    name: 'Super Administrator',
    email: 'admin@subai.com',
    password: 'password123',
    role: 'Super Admin',
    access: 'Full System Access',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLogin: null
  },
  {
    id: 'admin_geostride',
    name: 'Administrator',
    email: 'admin@geostride.com',
    password: 'password123',
    role: 'Super Admin',
    access: 'Full System Access',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLogin: null
  }
];

// Universal memory store — Admin Portal is the authority, Mobile reads from here.
const sharedStore = {
  users: [...DEFAULT_ADMINS],
  admin_accounts: [...DEFAULT_ADMINS],
  delay_reports: [],
  incident_reports: [],
  tracking_logs: [],
  ActivityLogs: [],
  Assignments: [],
  assignments: [],
  employees: [],
  Sites: [],
  notifications: [],
  facial_verifications: [],
  security_events: [],
  fraud_reports: [],
  security_logs: [],
  Attendance: [],
  attendance: [],
};

// Admin-owned: full replace on every write (so deletes & edits propagate to mobile)
const ADMIN_OWNED = new Set([
  'users', 'admin_accounts',
  'Assignments', 'assignments', 'employees', 'Sites',
  'delay_reports', 'incident_reports', 'tracking_logs', 'ActivityLogs',
  'fraud_reports', 'security_events', 'facial_verifications', 'notifications'
]);

const MOCK_EMP_NAMES = new Set([
  'john cruz', 'maria santos', 'david reyes', 'anna lim', 'james gonzales',
  'sofia martinez', 'carlos tan', 'isabella torres', 'michael rivera',
  'roberto diaz', 'angela ramos', 'admin user', 'patricia cruz', 'patricia gomez', 'ramon reyes'
]);

const MOCK_SITE_NAMES = new Set([
  'greenfield mall', 'central station', 'riverside business park',
  'north edsa terminal', 'makati city hall annex', 'bgc construction site',
  'greenfield worksite alpha', 'makati financial tower', 'bgc high street hub',
  'ortigas logistics depot', 'clark central hub', 'cebu it park station'
]);

const isMockItem = (colKey, item) => {
  if (!item) return false;
  const col = String(colKey || '').toLowerCase();
  const id = String(item.id || item.reportId || item.assignmentId || '').trim();

  if (col === 'employees') {
    if (/^emp\d+$/i.test(id)) return true;
    if (id.startsWith('mock') || id.startsWith('demo')) return true;
    const idNum = String(item.idNum || item.empId || '').trim();
    if (/^EMP-10\d\d$/i.test(idNum) || idNum === 'ADM-001') return true;
    const email = String(item.email || item.empEmail || '').trim().toLowerCase();
    if (email.endsWith('@geostride.com') && !email.startsWith('admin@')) return true;
    const name = String(item.name || item.empName || '').trim().toLowerCase();
    if (MOCK_EMP_NAMES.has(name)) return true;
    return false;
  }

  if (col === 'sites') {
    if (/^site[1-6]$/i.test(id)) return true;
    if (id.startsWith('mock') || id.startsWith('demo')) return true;
    const name = String(item.name || '').trim().toLowerCase();
    if (MOCK_SITE_NAMES.has(name)) return true;
    return false;
  }

  if (col.includes('assignment')) {
    if (/^asg\d+$/i.test(id)) return true;
    if (/^asgn_0(0[2-9]|10)$/i.test(id)) return true;
    if (id.startsWith('demo') || id.startsWith('sample') || id.startsWith('asg_')) return true;
    const empName = String(item.employeeName || item.empName || item.assignedTo || item.employee || '').trim().toLowerCase();
    if (MOCK_EMP_NAMES.has(empName)) return true;
    const email = String(item.employeeEmail || item.empEmail || item.email || '').trim().toLowerCase();
    if (email.endsWith('@geostride.com') && !email.startsWith('admin@')) return true;
    const site = String(item.site || item.siteName || '').trim().toLowerCase();
    if (MOCK_SITE_NAMES.has(site)) return true;
    return false;
  }

  if (col.includes('attendance')) {
    if (/^att\d+$/i.test(id)) return true;
    if (/^att_0?(0[2-9]|1[0-4])$/i.test(id)) return true;
    const name = String(item.employee_name || item.employeeName || item.emp || item.name || '').trim().toLowerCase();
    if (MOCK_EMP_NAMES.has(name)) return true;
    const email = String(item.email || item.empEmail || '').trim().toLowerCase();
    if (email.endsWith('@geostride.com') && !email.startsWith('admin@')) return true;
    const site = String(item.site || item.site_name || item.siteName || '').trim().toLowerCase();
    if (MOCK_SITE_NAMES.has(site)) return true;
    return false;
  }

  if (id.startsWith('demo') || id.startsWith('mock')) return true;
  if (/^log_\d+$/.test(id) && parseInt(id.replace('log_', ''), 10) < 50) return true;
  const anyName = String(item.name || item.employeeName || item.empName || item.user || item.sender || '').trim().toLowerCase();
  if (anyName && MOCK_EMP_NAMES.has(anyName)) return true;
  const anySite = String(item.site || item.siteName || '').trim().toLowerCase();
  if (anySite && MOCK_SITE_NAMES.has(anySite)) return true;

  const content = String(item.action || item.message || item.title || item.description || '').toLowerCase();
  for (const name of MOCK_EMP_NAMES) {
    if (content.includes(name)) return true;
  }
  for (const site of MOCK_SITE_NAMES) {
    if (content.includes(site)) return true;
  }

  return false;
};

function syncApiPlugin() {
  return {
    name: 'sync-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/sync')) return next();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const { path, data, items, collections, action } = payload;

              // Explicit Clear All Logs Action
              if (action === 'clear_logs') {
                sharedStore.ActivityLogs = [];
                sharedStore.tracking_logs = [];
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: 'Activity logs purged', store: sharedStore }));
                return;
              }

              // Explicit Clear All Notifications Action
              if (action === 'clear_notifications') {
                sharedStore.notifications = [];
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: 'Notifications purged', store: sharedStore }));
                return;
              }

              // Explicit Delete Action
              if (action === 'delete' || payload.deleteIds) {
                const targetIds = new Set([...(payload.ids || []), ...(payload.deleteIds || []), payload.id].filter(Boolean));
                Object.keys(sharedStore).forEach(colKey => {
                  if (Array.isArray(sharedStore[colKey])) {
                    sharedStore[colKey] = sharedStore[colKey].filter(item => {
                      if (!item) return false;
                      const id = item.id || item.reportId || item.assignmentId;
                      if (targetIds.has(id)) return false;
                      if (item.reportId && targetIds.has(item.reportId)) return false;
                      if (item.id && targetIds.has(item.id)) return false;
                      return true;
                    });
                  }
                });
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, deleted: Array.from(targetIds), store: sharedStore }));
                return;
              }

              const processCol = (colPath, list, fullReplace) => {
                if (!Array.isArray(list)) return;
                list = list.filter(item => !isMockItem(colPath, item));
                if (!sharedStore[colPath]) sharedStore[colPath] = [];

                if (colPath === 'employees') {
                  if (fullReplace) {
                    // Admin full replace — deduplicate by email/id, keeping the complete admin record
                    // and preserving live presence if an employee is currently active online
                    const empMap = new Map();
                    list.filter(Boolean).forEach(emp => {
                      const email = (emp.email || emp.empEmail || '').trim().toLowerCase();
                      const key = email || emp.id;
                      const prevActive = sharedStore.employees.find(e => {
                        if (emp.id && e.id === emp.id) return true;
                        const eMail = (e.email || e.empEmail || '').trim().toLowerCase();
                        return email && eMail && email === eMail;
                      });

                      const isLive = prevActive && prevActive.isOnline && (Date.now() - (prevActive.lastActive || 0) <= 120000);

                      const mergedEmp = {
                        ...emp,
                        ...(isLive ? {
                          isOnline: true,
                          status: prevActive.status || 'On Duty',
                          lastActive: prevActive.lastActive,
                          lat: prevActive.lat || emp.lat,
                          lng: prevActive.lng || emp.lng,
                          locationAccuracy: prevActive.locationAccuracy || emp.locationAccuracy,
                        } : {})
                      };

                      if (!empMap.has(key)) {
                        empMap.set(key, mergedEmp);
                      } else {
                        const existing = empMap.get(key);
                        if (!existing.idNum && emp.idNum) {
                          empMap.set(key, { ...existing, ...mergedEmp });
                        } else {
                          empMap.set(key, { ...mergedEmp, ...existing });
                        }
                      }
                    });
                    sharedStore.employees = Array.from(empMap.values());
                    return;
                  }

                  // Mobile update — match by ID OR by email to update existing record, NEVER duplicate
                  list.forEach(item => {
                    if (!item) return;
                    const id = item.id || item.reportId;
                    const itemEmail = (item.email || item.empEmail || '').trim().toLowerCase();
                    const idx = sharedStore.employees.findIndex(i => {
                      if (id && i.id === id) return true;
                      const iEmail = (i.email || i.empEmail || '').trim().toLowerCase();
                      if (itemEmail && iEmail && itemEmail === iEmail) return true;
                      return false;
                    });

                    if (idx >= 0) {
                      // Merge presence and location into existing canonical employee doc
                      sharedStore.employees[idx] = {
                        ...sharedStore.employees[idx],
                        ...item,
                        id: sharedStore.employees[idx].id, // retain canonical admin id
                        idNum: sharedStore.employees[idx].idNum || item.idNum,
                        org: sharedStore.employees[idx].org || item.org,
                        type: sharedStore.employees[idx].type || item.type,
                        workType: sharedStore.employees[idx].workType || item.workType,
                      };
                    }
                    // If not found in admin-managed employees list, mobile CANNOT create a new employee!
                  });
                  return;
                }

                if (fullReplace) {
                  // Full replace — admin deletions & edits are respected
                  sharedStore[colPath] = list.filter(Boolean);
                } else {
                  // Merge — mobile appends reports, never deletes
                  list.forEach(item => {
                    if (!item) return;
                    const id = item.id || item.reportId;
                    const idx = sharedStore[colPath].findIndex(i =>
                      (i.id && i.id === id) || (i.reportId && i.reportId === id)
                    );
                    if (idx >= 0) {
                      sharedStore[colPath][idx] = { ...sharedStore[colPath][idx], ...item };
                    } else {
                      sharedStore[colPath].unshift(item);
                      // Mirror reports into tracking_logs
                      if ((colPath === 'delay_reports' || colPath === 'incident_reports') && sharedStore.tracking_logs) {
                        if (!sharedStore.tracking_logs.some(i => (i.id && i.id === id) || (i.reportId && i.reportId === id))) {
                          sharedStore.tracking_logs.unshift(item);
                        }
                      }
                    }
                  });
                }
              };

              if (collections) {
                Object.keys(collections).forEach(k => processCol(k, collections[k], ADMIN_OWNED.has(k)));
              }
              if (path) {
                if (items && Array.isArray(items)) processCol(path, items, ADMIN_OWNED.has(path));
                if (data) processCol(path, [data], false);
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, store: sharedStore }));
            } catch (e) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        if (req.method === 'DELETE') {
          sharedStore.Assignments = [];
          sharedStore.assignments = [];
          sharedStore.employees = [];
          sharedStore.Sites = [];
          sharedStore.attendance = [];
          sharedStore.Attendance = [];
          sharedStore.ActivityLogs = [];
          sharedStore.tracking_logs = [];
          sharedStore.notifications = [];
          sharedStore.users = [...DEFAULT_ADMINS];
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, message: 'All collections reset' }));
          return;
        }

        if (req.method === 'GET') {
          const url = new URL(req.url, 'http://localhost');
          const empEmail = (url.searchParams.get('email') || '').toLowerCase().trim();

          const isStale = (a) => {
            if (!a) return true;
            if (a.id === 'doc_1788420171450_bm2zv' || a.id === 'doc_1788416657516_qrrk5') return true;
            return false;
          };

          const filteredStore = {};
          Object.keys(sharedStore).forEach(colKey => {
            if (Array.isArray(sharedStore[colKey])) {
              filteredStore[colKey] = sharedStore[colKey].filter(item => !isMockItem(colKey, item));
            } else {
              filteredStore[colKey] = sharedStore[colKey];
            }
          });

          // Always filter out known stale / past assignments from both lists
          filteredStore.Assignments = (filteredStore.Assignments || []).filter(a => !isStale(a));
          filteredStore.assignments = (filteredStore.assignments || []).filter(a => !isStale(a));

          if (empEmail) {
            const matchesEmp = (a) => {
              if (!a) return false;
              const aEmail = (a.employeeEmail || a.empEmail || a.email || '').toLowerCase().trim();
              return aEmail === empEmail;
            };
            filteredStore.Assignments = filteredStore.Assignments.filter(matchesEmp);
            filteredStore.assignments = filteredStore.assignments.filter(matchesEmp);
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(filteredStore));
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), syncApiPlugin()],
  server: {
    host: true, // 0.0.0.0 — allows physical mobile devices on same Wi-Fi to reach /api/sync
    port: 5173
  }
})
