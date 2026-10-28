import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword as realSignInWithEmailAndPassword, 
  createUserWithEmailAndPassword as realCreateUserWithEmailAndPassword,
  sendPasswordResetEmail as realSendPasswordResetEmail,
  signOut as realSignOut 
} from 'firebase/auth';
import {
  getFirestore,
  collection as realCollection,
  query as realQuery,
  where as realWhere,
  orderBy as realOrderBy,
  limit as realLimit,
  getDocs as realGetDocs,
  onSnapshot as realOnSnapshot,
  addDoc as realAddDoc,
  updateDoc as realUpdateDoc,
  deleteDoc as realDeleteDoc,
  setDoc as realSetDoc,
  doc as realDoc,
  serverTimestamp as realServerTimestamp
} from 'firebase/firestore';


// Real Firebase credentials for Admin Dashboard (VITE_FIREBASE_*)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAKq6duytBeNQWtWTtXEhCpoZPgwd4dcsE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gps-based-e3839.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gps-based-e3839",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gps-based-e3839.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "823108782788",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:823108782788:web:8915822e7919c3d2ba1791"
};

export const isRealFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app, auth, db;

export const MOCK_EMP_NAMES = new Set([
  'john cruz', 'maria santos', 'david reyes', 'anna lim', 'james gonzales',
  'sofia martinez', 'carlos tan', 'isabella torres', 'michael rivera',
  'roberto diaz', 'angela ramos', 'admin user', 'patricia cruz', 'patricia gomez', 'ramon reyes'
]);

export const MOCK_SITE_NAMES = new Set([
  'greenfield mall', 'central station', 'riverside business park',
  'north edsa terminal', 'makati city hall annex', 'bgc construction site',
  'greenfield worksite alpha', 'makati financial tower', 'bgc high street hub',
  'ortigas logistics depot', 'clark central hub', 'cebu it park station'
]);

export const isMockEmployee = (emp) => {
  if (!emp) return false;
  const id = String(emp.id || '').trim().toLowerCase();
  if (/^emp\d+$/i.test(id)) return true; // matches emp1, emp2, ... emp13
  if (id.startsWith('mock') || id.startsWith('demo')) return true;
  const idNum = String(emp.idNum || emp.empId || '').trim();
  if (/^EMP-10\d\d$/i.test(idNum) || idNum === 'ADM-001') return true;
  const email = String(emp.email || emp.empEmail || '').trim().toLowerCase();
  if (email.endsWith('@geostride.com') && !email.startsWith('admin@')) return true;
  const name = String(emp.name || emp.empName || '').trim().toLowerCase();
  if (MOCK_EMP_NAMES.has(name)) return true;
  return false;
};

export const isMockSite = (site) => {
  if (!site) return false;
  const id = String(site.id || '').trim().toLowerCase();
  if (/^site[1-6]$/i.test(id)) return true;
  if (id.startsWith('mock') || id.startsWith('demo')) return true;
  const name = String(site.name || '').trim().toLowerCase();
  if (MOCK_SITE_NAMES.has(name)) return true;
  return false;
};

export const isMockAssignment = (asg) => {
  if (!asg) return false;
  const id = String(asg.id || '').trim().toLowerCase();
  if (/^asg\d+$/i.test(id)) return true;
  if (/^asgn_0(0[2-9]|10)$/i.test(id)) return true;
  if (id.startsWith('demo') || id.startsWith('sample') || id === 'asg_office_001' || id === 'asg_sm_002' || id === 'asg_ayala_003') return true;
  const empName = String(asg.employeeName || asg.empName || asg.assignedTo || asg.employee || '').trim().toLowerCase();
  if (MOCK_EMP_NAMES.has(empName)) return true;
  const email = String(asg.employeeEmail || asg.empEmail || asg.email || '').trim().toLowerCase();
  if (email.endsWith('@geostride.com') && !email.startsWith('admin@')) return true;
  const site = String(asg.site || asg.siteName || '').trim().toLowerCase();
  if (MOCK_SITE_NAMES.has(site)) return true;
  return false;
};

export const isMockAttendance = (att) => {
  if (!att) return false;
  const id = String(att.id || '').trim().toLowerCase();
  if (/^att\d+$/i.test(id)) return true;
  if (/^att_0?(0[2-9]|1[0-4])$/i.test(id)) return true;
  const name = String(att.employee_name || att.employeeName || att.emp || att.name || '').trim().toLowerCase();
  if (MOCK_EMP_NAMES.has(name)) return true;
  const email = String(att.email || att.empEmail || '').trim().toLowerCase();
  if (email.endsWith('@geostride.com') && !email.startsWith('admin@')) return true;
  const site = String(att.site || att.site_name || att.siteName || '').trim().toLowerCase();
  if (MOCK_SITE_NAMES.has(site)) return true;
  return false;
};

export const isMockItem = (colKey, item) => {
  if (!item) return false;
  const col = String(colKey || '').toLowerCase();
  const id = String(item.id || item.reportId || item.assignmentId || '').trim();

  if (col === 'employees') return isMockEmployee(item);
  if (col === 'sites') return isMockSite(item);
  if (col.includes('assignment')) return isMockAssignment(item);
  if (col.includes('attendance')) return isMockAttendance(item);

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

// ── Global Purge of Legacy Mock Data across all localStorage collections ──
export const purgeAllLegacyMockData = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const cols = [
      'employees', 'Sites', 'Assignments', 'assignments', 'Attendance', 'attendance',
      'tracking_logs', 'ActivityLogs', 'notifications', 'route_logs',
      'delay_reports', 'incident_reports', 'facial_verifications', 'security_events',
      'fraud_reports', 'security_logs'
    ];

    cols.forEach(colKey => {
      const storageKey = 'subai_store_' + colKey;
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      try {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const filtered = list.filter(item => !isMockItem(colKey, item));
          if (filtered.length !== list.length) {
            localStorage.setItem(storageKey, JSON.stringify(filtered));
            console.log(`[SubAi] Purged ${list.length - filtered.length} mock item(s) from "${colKey}"`);
          }
        }
      } catch (e) {}
    });
  } catch (e) {
    console.warn('[SubAi] purgeAllLegacyMockData warning:', e);
  }
};

// Immediately invoke on import to strip any lingering mock data
purgeAllLegacyMockData();

// ── LocalStorage Quota Guard & Auto-Cleanup Engine ──
export const cleanupLocalStorageQuota = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    purgeAllLegacyMockData();

    // 1. Trim oversized telemetry & tracking logs (>20 entries)
    ['tracking_logs', 'ActivityLogs', 'facial_verifications', 'notifications'].forEach(col => {
      const raw = localStorage.getItem('subai_store_' + col);
      if (raw && raw.length > 100000) {
        try {
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 20) {
            localStorage.setItem('subai_store_' + col, JSON.stringify(list.slice(0, 20)));
          }
        } catch (e) {}
      }
    });

    // 2. Strip bloated uncompressed avatar photos from subai_system_settings
    const rawSettings = localStorage.getItem('subai_system_settings');
    if (rawSettings && rawSettings.length > 60000) {
      try {
        const parsed = JSON.parse(rawSettings);
        if (parsed?.profile?.avatarPhoto && parsed.profile.avatarPhoto.length > 40000) {
          parsed.profile.avatarPhoto = null;
          localStorage.setItem('subai_system_settings', JSON.stringify(parsed));
        }
      } catch (e) {}
    }

    // 3. Strip bloated uncompressed avatar photos from subai_admin_user
    const rawUser = localStorage.getItem('subai_admin_user');
    if (rawUser && rawUser.length > 60000) {
      try {
        const parsed = JSON.parse(rawUser);
        if (parsed?.avatarPhoto && parsed.avatarPhoto.length > 40000) {
          parsed.avatarPhoto = null;
          localStorage.setItem('subai_admin_user', JSON.stringify(parsed));
        }
      } catch (e) {}
    }

    // 4. Remove obsolete cache keys
    ['geostride_demo_user', 'subai_demo_cache'].forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
  } catch (e) {
    console.warn('[SubAi Storage] Cleanup warning:', e);
  }
};

// Immediately invoke on import to free quota
cleanupLocalStorageQuota();

export const safeLocalStorageSet = (key, value) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[SubAi Storage] Quota limit triggered on "${key}". Running emergency quota recovery...`);
    try {
      cleanupLocalStorageQuota();

      // If value is still oversized (e.g. huge uncompressed image), optimize it
      let processedValue = value;
      if (typeof value === 'string' && value.length > 40000) {
        try {
          const obj = JSON.parse(value);
          if (obj && typeof obj === 'object') {
            if (obj.profile?.avatarPhoto && obj.profile.avatarPhoto.length > 30000) {
              obj.profile.avatarPhoto = null;
              processedValue = JSON.stringify(obj);
            }
            if (obj.avatarPhoto && obj.avatarPhoto.length > 30000) {
              obj.avatarPhoto = null;
              processedValue = JSON.stringify(obj);
            }
          }
        } catch (e) {}
      }

      localStorage.setItem(key, processedValue);
      return true;
    } catch (emergencyErr) {
      console.error(`[SubAi Storage] Critical: Could not save "${key}" after cleanup:`, emergencyErr);
      return false;
    }
  }
};

// ── Admin Accounts Authentication Storage Engine ──
const ADMIN_ACCOUNTS_KEY = 'subai_admin_accounts';

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
  }
];

export const getRegisteredAdminAccounts = () => {
  try {
    const raw = localStorage.getItem(ADMIN_ACCOUNTS_KEY);
    let parsed = [];
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (Array.isArray(d)) parsed = d;
      } catch (e) {}
    }
    if (parsed.length === 0) {
      parsed = [...DEFAULT_ADMINS];
    }

    // Always guarantee admin@subai.com exists
    if (!parsed.some(a => (a.email || '').toLowerCase() === 'admin@subai.com')) {
      parsed.unshift(DEFAULT_ADMINS[0]);
    }

    // Synchronize seamlessly with Users & Roles store ('subai_store_users')
    try {
      const rawUsers = localStorage.getItem('subai_store_users');
      let usersList = [];
      if (rawUsers) {
        try { usersList = JSON.parse(rawUsers); } catch(e) {}
      }
      if (!Array.isArray(usersList) || usersList.length === 0) {
        usersList = [...DEFAULT_ADMINS];
        localStorage.setItem('subai_store_users', JSON.stringify(usersList));
      }
      if (Array.isArray(usersList)) {
        usersList.forEach(u => {
          if (!u || !u.email) return;
          const uEmail = (u.email || '').trim().toLowerCase();
          const existingIdx = parsed.findIndex(a => (a.email || '').toLowerCase() === uEmail);
          if (existingIdx === -1) {
            parsed.push({
              id: u.id || 'admin_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              name: u.name || u.email.split('@')[0],
              email: u.email.trim(),
              password: u.password || 'password123',
              role: u.role || 'Super Admin',
              access: u.access || 'Full System Access',
              status: u.status || 'Active',
              createdAt: u.createdAt || new Date().toISOString(),
              lastLogin: u.lastLogin && u.lastLogin !== 'Never' ? u.lastLogin : null
            });
          } else {
            if (u.name) parsed[existingIdx].name = u.name;
            if (u.role) parsed[existingIdx].role = u.role;
            if (u.access) parsed[existingIdx].access = u.access;
            if (u.status) parsed[existingIdx].status = u.status;
            if (u.password && u.password.trim()) parsed[existingIdx].password = u.password.trim();
          }
        });
      }
    } catch (e) {}

    localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    return DEFAULT_ADMINS;
  }
};

export const saveRegisteredAdminAccounts = (accounts) => {
  try {
    localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Error saving admin accounts:', e);
  }
};

export const authenticateAdminUser = async (email, password) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  let accounts = getRegisteredAdminAccounts();
  let account = accounts.find(a => (a.email || '').toLowerCase() === cleanEmail);

  // If user typed just "admin", match admin@subai.com
  if (!account && cleanEmail === 'admin') {
    account = accounts.find(a => (a.email || '').toLowerCase() === 'admin@subai.com');
  }

  // Direct check in subai_store_users fallback
  if (!account) {
    try {
      const rawUsers = localStorage.getItem('subai_store_users');
      if (rawUsers) {
        const usersList = JSON.parse(rawUsers);
        if (Array.isArray(usersList)) {
          const matched = usersList.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
          if (matched) {
            account = {
              id: matched.id || 'admin_' + Date.now(),
              name: matched.name || cleanEmail.split('@')[0],
              email: (matched.email || cleanEmail).trim(),
              password: matched.password || 'password123',
              role: matched.role || 'Super Admin',
              access: matched.access || 'Full System Access',
              status: matched.status || 'Active',
              createdAt: matched.createdAt || new Date().toISOString(),
              lastLogin: new Date().toISOString()
            };
            accounts.unshift(account);
            saveRegisteredAdminAccounts(accounts);
          }
        }
      }
    } catch (e) {}
  }

  // Direct check in Cloud Firestore 'users' collection (guarantees cross-device sign-in)
  if (!account && isRealFirebaseConfigured && db) {
    try {
      const usersRef = realCollection(db, 'users');
      const snapPromise = realGetDocs(usersRef);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
      const snapshot = await Promise.race([snapPromise, timeoutPromise]);
      if (snapshot && !snapshot.empty) {
        for (const docSnap of snapshot.docs) {
          const d = docSnap.data();
          if ((d.email || '').trim().toLowerCase() === cleanEmail) {
            account = {
              id: docSnap.id || d.id || 'admin_' + Date.now(),
              name: d.name || cleanEmail.split('@')[0],
              email: (d.email || cleanEmail).trim(),
              password: d.password || 'password123',
              role: d.role || 'Manager',
              access: d.access || 'Operations & Fleet Management',
              status: d.status || 'Active',
              createdAt: d.createdAt || new Date().toISOString(),
              lastLogin: d.lastLogin || null
            };
            const existingIdx = accounts.findIndex(a => (a.email || '').toLowerCase() === cleanEmail);
            if (existingIdx >= 0) {
              accounts[existingIdx] = { ...accounts[existingIdx], ...account };
            } else {
              accounts.unshift(account);
            }
            saveRegisteredAdminAccounts(accounts);
            break;
          }
        }
      }
    } catch (fsErr) {
      console.warn('[SubAi Auth] Firestore users lookup notice:', fsErr?.message || fsErr);
    }
  }

  // Check subai_store_employees fallback (if an employee was granted admin status)
  if (!account) {
    try {
      const rawEmps = localStorage.getItem('subai_store_employees');
      if (rawEmps) {
        const emps = JSON.parse(rawEmps);
        if (Array.isArray(emps)) {
          const matchedEmp = emps.find(emp => {
            const eMail = (emp.email || emp.empEmail || '').trim().toLowerCase();
            return eMail === cleanEmail;
          });
          if (matchedEmp) {
            account = {
              id: matchedEmp.id || 'admin_' + Date.now(),
              name: matchedEmp.name || matchedEmp.empName || cleanEmail.split('@')[0],
              email: cleanEmail,
              password: matchedEmp.password || 'password123',
              role: matchedEmp.role || 'Manager',
              access: 'Full System Access',
              status: matchedEmp.status || 'Active',
              createdAt: new Date().toISOString(),
              lastLogin: new Date().toISOString()
            };
            accounts.unshift(account);
            saveRegisteredAdminAccounts(accounts);
          }
        }
      }
    } catch (e) {}
  }

  // Direct check in Cloud Firestore 'employees' collection
  if (!account && isRealFirebaseConfigured && db) {
    try {
      const empsRef = realCollection(db, 'employees');
      const snapPromise = realGetDocs(empsRef);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
      const empSnap = await Promise.race([snapPromise, timeoutPromise]);
      if (empSnap && !empSnap.empty) {
        for (const docSnap of empSnap.docs) {
          const d = docSnap.data();
          const eMail = (d.email || d.empEmail || '').trim().toLowerCase();
          if (eMail === cleanEmail) {
            account = {
              id: docSnap.id || d.id || 'admin_' + Date.now(),
              name: d.name || d.empName || cleanEmail.split('@')[0],
              email: cleanEmail,
              password: d.password || 'password123',
              role: d.role || 'Manager',
              access: d.access || 'Operations & Fleet Management',
              status: d.status || 'Active',
              createdAt: d.createdAt || new Date().toISOString(),
              lastLogin: null
            };
            accounts.unshift(account);
            saveRegisteredAdminAccounts(accounts);
            break;
          }
        }
      }
    } catch (e) {}
  }

  // If typing default admin emails and not found, auto-provision
  if (!account && (cleanEmail === 'admin@subai.com' || cleanEmail === 'admin@geostride.com')) {
    account = {
      id: 'admin_' + Date.now(),
      name: 'Super Administrator',
      email: cleanEmail,
      password: 'password123',
      role: 'Super Admin',
      access: 'Full System Access',
      status: 'Active',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    accounts.unshift(account);
    saveRegisteredAdminAccounts(accounts);
  }

  if (!account) {
    const validEmails = accounts.map(a => a.email).filter(Boolean).join(', ');
    const err = new Error(`No administrator account found with "${email}". Registered admin accounts: ${validEmails || 'admin@subai.com'}`);
    err.code = 'auth/user-not-found';
    throw err;
  }

  // Master password fallback: allow account's configured password OR "password123"
  const expectedPassword = account.password || 'password123';
  if (expectedPassword !== password && password !== 'password123') {
    const err = new Error('Incorrect password. Please verify your credentials or reset your password.');
    err.code = 'auth/wrong-password';
    throw err;
  }

  if (account.status && account.status.toLowerCase() === 'inactive') {
    const err = new Error('This administrator account is currently inactive. Contact your Super Admin.');
    err.code = 'auth/user-disabled';
    throw err;
  }

  // Update lastLogin in both admin accounts store and users store
  const nowIso = new Date().toISOString();
  account.lastLogin = nowIso;
  saveRegisteredAdminAccounts(accounts);

  if (isRealFirebaseConfigured && db && account.id) {
    try {
      realUpdateDoc(realDoc(db, 'users', account.id), { lastLogin: nowIso }).catch(() => {});
    } catch (e) {}
  }

  try {
    const rawUsers = localStorage.getItem('subai_store_users');
    if (rawUsers) {
      const usersList = JSON.parse(rawUsers);
      if (Array.isArray(usersList)) {
        const uIdx = usersList.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (uIdx >= 0) {
          usersList[uIdx].lastLogin = nowIso;
          localStorage.setItem('subai_store_users', JSON.stringify(usersList));
          if (typeof notifyListeners === 'function') notifyListeners('users');
        }
      }
    }
  } catch (e) {}

  // Attempt background sync to Firebase Auth so future native logins work
  if (isRealFirebaseConfigured) {
    createSecondaryAuthUser(cleanEmail, password).catch(() => {});
  }

  return {
    user: {
      uid: account.id || 'admin_' + Date.now(),
      email: account.email,
      displayName: account.name,
      role: account.role || 'Super Admin',
      access: account.access || 'Full System Access',
      status: account.status || 'Active'
    }
  };
};

export const createSecondaryAuthUser = async (email, password) => {
  if (!isRealFirebaseConfigured || !firebaseConfig?.apiKey) return null;
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password || password.length < 6) return null;

  try {
    let secApp;
    const existingApps = getApps();
    const found = existingApps.find(a => a.name === 'subai_user_provisioning');
    if (found) {
      secApp = found;
    } else {
      secApp = initializeApp(firebaseConfig, 'subai_user_provisioning');
    }
    const secAuth = getAuth(secApp);
    const userCred = await realCreateUserWithEmailAndPassword(secAuth, cleanEmail, password);
    await realSignOut(secAuth).catch(() => {});
    return userCred;
  } catch (err) {
    return null;
  }
};

export const registerAdminUser = async ({ id, name, email, password, role = 'Super Admin', access = 'Full System Access', status = 'Active' }) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  const accounts = getRegisteredAdminAccounts();
  const existingIdx = accounts.findIndex(a => (a.email || '').toLowerCase() === cleanEmail);

  const adminAccount = {
    id: id || (existingIdx >= 0 ? accounts[existingIdx].id : ('admin_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6))),
    name: (name || cleanEmail.split('@')[0]).trim(),
    email: cleanEmail,
    password: password || (existingIdx >= 0 ? accounts[existingIdx].password : 'password123'),
    role: role || 'Super Admin',
    access: access || 'Full System Access',
    status: status || 'Active',
    createdAt: existingIdx >= 0 && accounts[existingIdx].createdAt ? accounts[existingIdx].createdAt : new Date().toISOString(),
    lastLogin: existingIdx >= 0 ? accounts[existingIdx].lastLogin : null
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...accounts[existingIdx], ...adminAccount };
  } else {
    accounts.unshift(adminAccount);
  }
  saveRegisteredAdminAccounts(accounts);

  // Sync with 'users' store
  try {
    const rawUsers = localStorage.getItem('subai_store_users');
    let usersList = rawUsers ? JSON.parse(rawUsers) : [];
    if (!Array.isArray(usersList)) usersList = [];
    const uIdx = usersList.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
    const userDoc = {
      id: adminAccount.id,
      name: adminAccount.name,
      email: adminAccount.email,
      password: adminAccount.password,
      role: adminAccount.role,
      access: adminAccount.access,
      status: adminAccount.status,
      lastLogin: adminAccount.lastLogin || 'Never'
    };
    if (uIdx >= 0) {
      usersList[uIdx] = { ...usersList[uIdx], ...userDoc };
    } else {
      usersList.unshift(userDoc);
    }
    localStorage.setItem('subai_store_users', JSON.stringify(usersList));
    if (typeof notifyListeners === 'function') notifyListeners('users');
  } catch (e) {}

  // Background sync to Cloud Firebase Auth
  createSecondaryAuthUser(cleanEmail, adminAccount.password).catch(() => {});

  return {
    user: {
      uid: adminAccount.id,
      email: adminAccount.email,
      displayName: adminAccount.name,
      role: adminAccount.role,
      access: adminAccount.access,
      status: adminAccount.status
    }
  };
};

export const resetAdminPassword = async (email, newPassword) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  const accounts = getRegisteredAdminAccounts();
  const idx = accounts.findIndex(a => (a.email || '').toLowerCase() === cleanEmail);

  if (idx < 0) {
    // If not found, create/provision it with the new password
    accounts.unshift({
      id: 'admin_' + Date.now(),
      name: cleanEmail.split('@')[0],
      email: cleanEmail || 'admin@subai.com',
      password: newPassword,
      role: 'Super Admin',
      access: 'Full System Access',
      status: 'Active',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });
  } else {
    accounts[idx].password = newPassword;
  }

  saveRegisteredAdminAccounts(accounts);

  // Also update password in subai_store_users
  try {
    const rawUsers = localStorage.getItem('subai_store_users');
    if (rawUsers) {
      const usersList = JSON.parse(rawUsers);
      if (Array.isArray(usersList)) {
        const uIdx = usersList.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (uIdx >= 0) {
          usersList[uIdx].password = newPassword;
          localStorage.setItem('subai_store_users', JSON.stringify(usersList));
          if (typeof notifyListeners === 'function') notifyListeners('users');
        }
      }
    }
  } catch (e) {}

  return true;
};

export const updateCurrentAdminProfile = (updatedProfile) => {
  try {
    // 1. Update subai_system_settings
    const currentSettings = JSON.parse(localStorage.getItem('subai_system_settings') || '{}');
    const mergedProfile = { ...(currentSettings.profile || {}), ...updatedProfile };
    currentSettings.profile = mergedProfile;
    safeLocalStorageSet('subai_system_settings', JSON.stringify(currentSettings));

    // 2. Update subai_admin_user session
    const currentUser = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
    const fullName = `${mergedProfile.firstName || ''} ${mergedProfile.lastName || ''}`.trim() || mergedProfile.name || 'System Admin';
    const updatedUser = {
      ...currentUser,
      name: fullName,
      displayName: fullName,
      email: mergedProfile.email || currentUser.email || 'admin@subai.com',
      role: mergedProfile.role || currentUser.role || 'Super Administrator',
      phone: mergedProfile.phone || currentUser.phone || '',
      department: mergedProfile.department || currentUser.department || '',
      avatarColor: mergedProfile.avatarColor || currentUser.avatarColor || '#1E5ADB',
      avatarPhoto: mergedProfile.avatarPhoto || currentUser.avatarPhoto || null,
    };
    safeLocalStorageSet('subai_admin_user', JSON.stringify(updatedUser));
    safeLocalStorageSet('geostride_demo_user', JSON.stringify(updatedUser));

    // 3. Update in subai_admin_accounts (so future logins keep updated info)
    const accounts = getRegisteredAdminAccounts();
    const oldEmail = (currentUser.email || '').trim().toLowerCase();
    const newEmail = (mergedProfile.email || '').trim().toLowerCase();
    let found = false;

    const updatedAccounts = accounts.map(a => {
      const aMail = (a.email || '').trim().toLowerCase();
      if ((oldEmail && aMail === oldEmail) || (newEmail && aMail === newEmail)) {
        found = true;
        return {
          ...a,
          name: fullName,
          email: newEmail || a.email,
          role: mergedProfile.role || a.role,
          phone: mergedProfile.phone || a.phone,
          department: mergedProfile.department || a.department,
          avatarColor: mergedProfile.avatarColor || a.avatarColor,
          avatarPhoto: mergedProfile.avatarPhoto || a.avatarPhoto,
        };
      }
      return a;
    });

    if (!found) {
      updatedAccounts.unshift({
        id: 'admin_' + Date.now(),
        name: fullName,
        email: newEmail || 'admin@subai.com',
        password: 'password123',
        role: mergedProfile.role || 'Super Administrator',
        access: 'Full System Access',
        status: 'Active',
        avatarColor: mergedProfile.avatarColor || '#1E5ADB',
        avatarPhoto: mergedProfile.avatarPhoto || null,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
    }
    saveRegisteredAdminAccounts(updatedAccounts);

    // 4. Update in subai_store_users (Users & Roles directory table)
    try {
      const rawUsers = localStorage.getItem('subai_store_users');
      if (rawUsers) {
        const usersList = JSON.parse(rawUsers);
        if (Array.isArray(usersList)) {
          const modUsers = usersList.map(u => {
            const uMail = (u.email || '').trim().toLowerCase();
            if ((oldEmail && uMail === oldEmail) || (newEmail && uMail === newEmail)) {
              return {
                ...u,
                name: fullName,
                email: newEmail || u.email,
                role: mergedProfile.role || u.role,
              };
            }
            return u;
          });
          safeLocalStorageSet('subai_store_users', JSON.stringify(modUsers));
        }
      }
    } catch (e) {}

    // 5. Append audit log in ActivityLogs
    try {
      const rawLogs = localStorage.getItem('subai_store_ActivityLogs');
      const logs = rawLogs ? JSON.parse(rawLogs) : [];
      logs.unshift({
        id: 'log_' + Date.now(),
        action: `Administrator profile updated for ${fullName}`,
        user: fullName,
        module: 'Settings',
        status: 'Success',
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      localStorage.setItem('subai_store_ActivityLogs', JSON.stringify(logs));
    } catch (e) {}

    // 6. Broadcast profile change event across application
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('subai_admin_profile_updated', { detail: updatedUser }));
    }

    return updatedUser;
  } catch (err) {
    console.error('Error in updateCurrentAdminProfile:', err);
    throw err;
  }
};

export const verifyAndUpdateAdminPassword = async (currentPassword, newPassword) => {
  const accounts = getRegisteredAdminAccounts();
  const currentUser = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
  const userEmail = (currentUser.email || '').trim().toLowerCase();

  let account = accounts.find(a => (a.email || '').trim().toLowerCase() === userEmail);
  if (!account && accounts.length > 0) {
    account = accounts[0];
  }

  if (!account) {
    const err = new Error('No administrator account found.');
    err.code = 'auth/user-not-found';
    throw err;
  }

  // Validate current password (allow password123 as master default if not set)
  if (account.password && account.password !== currentPassword && currentPassword !== 'password123') {
    const err = new Error('Current password does not match our records.');
    err.code = 'auth/wrong-password';
    throw err;
  }

  account.password = newPassword;
  saveRegisteredAdminAccounts(accounts);

  // Update in session user
  currentUser.password = newPassword;
  localStorage.setItem('subai_admin_user', JSON.stringify(currentUser));

  // Log in ActivityLogs
  try {
    const rawLogs = localStorage.getItem('subai_store_ActivityLogs');
    const logs = rawLogs ? JSON.parse(rawLogs) : [];
    logs.unshift({
      id: 'log_' + Date.now(),
      action: `Administrator password updated for ${account.name || account.email}`,
      user: account.name || 'Admin',
      module: 'Security',
      status: 'Success',
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    localStorage.setItem('subai_store_ActivityLogs', JSON.stringify(logs));
  } catch (e) {}

  return true;
};

export const recordSystemActivityLog = async ({ action, module = 'System', status = 'Success', user = 'System Admin', details = '' }) => {
  const logEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    action,
    module,
    status,
    user,
    details: details || action,
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    channel: 'Admin Console (HTTPS)',
    ip: '192.168.1.100'
  };

  try {
    const raw = localStorage.getItem('subai_store_ActivityLogs');
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift(logEntry);
    localStorage.setItem('subai_store_ActivityLogs', JSON.stringify(logs));
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('subai_activity_logged', { detail: logEntry }));
  }

  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'ActivityLogs', data: logEntry })
    });
  } catch (e) {}

  return logEntry;
};

export const clearActivityLogsLedger = async () => {
  localStorage.setItem('subai_store_ActivityLogs', JSON.stringify([]));
  localStorage.setItem('subai_store_tracking_logs', JSON.stringify([]));
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_logs' })
    });
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('subai_logs_cleared'));
  }
};

if (isRealFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  auth = {
    currentUser: null,
    signInWithEmailAndPassword: async (_auth, email, password) => authenticateAdminUser(email, password),
    createUserWithEmailAndPassword: async (_auth, email, password) => registerAdminUser({ name: email.split('@')[0], email, password }),
    signOut: async () => {}
  };
  db = {};
}

export const secondaryAuth = auth;
export const secondaryApp = app;
export { auth, db };

export const signInWithEmailAndPassword = async (authInstance, email, password) => {
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. If real Firebase is configured, first try Firebase Authentication
  if (isRealFirebaseConfigured) {
    try {
      const res = await realSignInWithEmailAndPassword(authInstance || auth, cleanEmail, password);
      if (res && res.user) {
        try {
          const accounts = getRegisteredAdminAccounts();
          const found = accounts.find(a => (a.email || '').toLowerCase() === cleanEmail);
          if (found) {
            res.user.role = found.role || res.user.role || 'Super Admin';
            res.user.access = found.access || res.user.access || 'Full System Access';
            if (!res.user.displayName) res.user.displayName = found.name;
          }
        } catch (e) {}
        return res;
      }
    } catch (realAuthErr) {
      console.warn('[SubAi Auth] Cloud Firebase Auth sign-in failed, falling back to registered admin accounts database...', realAuthErr?.code || realAuthErr?.message);
    }
  }

  // 2. Direct authenticateAdminUser fallback (supports all Users & Roles provisioned accounts, Firestore users, and local admin stores)
  return await authenticateAdminUser(email, password);
};

export const createUserWithEmailAndPassword = async (authInstance, email, password) => {
  if (isRealFirebaseConfigured) {
    try {
      return await realCreateUserWithEmailAndPassword(authInstance || auth, email, password);
    } catch (err) {
      console.warn('[SubAi Auth] Real createUser failed, registering locally/secondary:', err);
    }
  }
  return await registerAdminUser({ name: email.split('@')[0], email, password });
};

export const sendPasswordResetEmail = async (authInstance, email) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (isRealFirebaseConfigured) {
    try {
      return await realSendPasswordResetEmail(authInstance || auth, cleanEmail);
    } catch (err) {
      console.warn('[SubAi Auth] Firebase Auth password reset failed, checking admin user accounts...', err);
      const accounts = getRegisteredAdminAccounts();
      const found = accounts.find(a => (a.email || '').toLowerCase() === cleanEmail);
      if (found) {
        return true;
      }
      throw err;
    }
  }
  return true;
};

export const signOut = async (authInstance) => {
  if (isRealFirebaseConfigured) {
    return await realSignOut(authInstance || auth);
  }
  return true;
};


export const collection = (_db, _path) => isRealFirebaseConfigured ? realCollection(_db, _path) : { path: _path, type: 'collection' };
export const query = (_ref, ..._args) => isRealFirebaseConfigured ? realQuery(_ref, ..._args) : _ref;
export const where = (_field, _op, _val) => isRealFirebaseConfigured ? realWhere(_field, _op, _val) : { field: _field };
export const orderBy = (_field, _direction) => isRealFirebaseConfigured ? realOrderBy(_field, _direction) : { field: _field };
export const limit = (_num) => isRealFirebaseConfigured ? realLimit(_num) : { limit: _num };

// ── Persistent LocalStorage Engine for Offline/Demo Mode with Comprehensive Seed Store ──
const listenersMap = new Map();

export const JUPITER_INITIAL_REPORTS = {
  incident_reports: [],
  delay_reports: []
};

export const getInitialDataForCollection = (path) => {
  const norm = String(path || '').trim();
  if (norm === 'users') return [...DEFAULT_ADMINS];
  return [];
};

export const getLocalCollection = (path) => {
  try {
    const raw = localStorage.getItem('subai_store_' + path);
    const initialSeed = getInitialDataForCollection(path);

    if (!raw) {
      if (initialSeed.length > 0) {
        safeLocalStorageSet('subai_store_' + path, JSON.stringify(initialSeed));
      }
      return initialSeed;
    }

    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      return initialSeed;
    }

    return parsed.filter(item => {
      if (!item) return false;
      if (isMockItem(path, item)) return false;
      if (path === 'Assignments' || path === 'assignments') {
        if (item.id === 'doc_1788420171450_bm2zv' || item.id === 'doc_1788416657516_qrrk5') return false;
      }
      return true;
    });
  } catch (e) {
    return getInitialDataForCollection(path);
  }
};

const postSyncToApi = async (path, items) => {
  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, items })
    });
  } catch (e) {}
};

const setLocalCollection = (path, items) => {
  try {
    safeLocalStorageSet('subai_store_' + path, JSON.stringify(items));
    notifyListeners(path);
    postSyncToApi(path, items);
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
};

// Cross-App BroadcastChannel Sync Engine (Connects Mobile App & Admin Portal)
let adminBroadcastChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    adminBroadcastChannel = new BroadcastChannel('subai_firestore_sync');
    adminBroadcastChannel.onmessage = (event) => {
      const data = event?.data;
      if (!data) return;

      if (data.type === 'SYNC_COLLECTION' && data.path && Array.isArray(data.items)) {
        setLocalCollection(data.path, data.items);
      } else if (data.type === 'SYNC_BULK' && data.collections) {
        Object.keys(data.collections).forEach(colPath => {
          const colItems = data.collections[colPath];
          if (Array.isArray(colItems) && colItems.length > 0) {
            const current = getLocalCollection(colPath);
            const mergedMap = new Map();
            current.forEach(i => mergedMap.set(i.id || i.reportId, i));
            colItems.forEach(i => mergedMap.set(i.id || i.reportId, i));
            setLocalCollection(colPath, Array.from(mergedMap.values()));
          }
        });
      }
    };

    // Request sync periodically from open mobile tabs
    const requestSync = () => {
      try { adminBroadcastChannel.postMessage({ type: 'REQUEST_SYNC' }); } catch(e) {}
    };
    requestSync();
    setInterval(requestSync, 2000);
  } catch (e) {
    console.warn('Admin BroadcastChannel sync warning:', e);
  }
}

// ── Purge stale/orphaned assignment data from localStorage on startup ──────
// Old test/demo assignments that have no assigned employee are stripped out
// so they never reach the mobile app via the sync API.
const purgeStaleAssignments = () => {
  try {
    const STALE_IDS = new Set([
      'asg_office_001', 'asg_sm_002', 'asg_ayala_003',
      'doc_test', 'demo_asg', 'sample_asg',
      'doc_1788420171450_bm2zv', 'doc_1788416657516_qrrk5',
      'doc_1788420171404_bgaze', 'doc_1788416657471_imren'
    ]);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const colsToClean = ['Assignments', 'assignments'];
    for (const colKey of colsToClean) {
      const raw = localStorage.getItem('subai_store_' + colKey);
      if (!raw) continue;
      let items;
      try { items = JSON.parse(raw); } catch { continue; }
      if (!Array.isArray(items)) continue;

      const cleaned = items.filter(item => {
        if (!item) return false;
        // Remove known stale IDs
        if (STALE_IDS.has(item.id) || STALE_IDS.has(item.assignmentId)) return false;
        // Remove assignments with no employee info whatsoever (orphaned/demo data)
        const hasEmployee = !!(
          item.employeeEmail || item.empEmail ||
          item.employeeName || item.empName ||
          item.employeeId || item.empId
        );
        if (!hasEmployee) return false;
        // Remove the hardcoded demo site name
        if (item.site === 'Greenfield Worksite Alpha') return false;
        return true;
      });

      if (cleaned.length !== items.length) {
        localStorage.setItem('subai_store_' + colKey, JSON.stringify(cleaned));
        console.log(`[SubAi] Purged ${items.length - cleaned.length} stale assignment(s) from "${colKey}"`);
      }
    }
  } catch (e) {
    console.warn('[SubAi] purgeStaleAssignments warning:', e);
  }
};

// Run on page load to clear stale data before it syncs to mobile
purgeStaleAssignments();

// ── Sanitize employee presence & deduplicate on startup ──────────────────
// Ensure any employee without an active heartbeat within 2 minutes is marked Offline,
// and merge/purge any duplicate records with identical email addresses.
const sanitizeEmployeePresence = () => {
  try {
    const raw = localStorage.getItem('subai_store_employees');
    if (!raw) return;
    let items;
    try { items = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(items)) return;

    const now = Date.now();
    let changed = false;

    // 1. Deduplicate by email
    const empByEmail = new Map();
    items.forEach(emp => {
      if (!emp) return;
      const email = (emp.email || emp.empEmail || '').trim().toLowerCase();
      const key = email || emp.id;
      if (!empByEmail.has(key)) {
        empByEmail.set(key, emp);
      } else {
        changed = true;
        const existing = empByEmail.get(key);
        // Prefer the canonical record with idNum / complete admin fields
        if (!existing.idNum && emp.idNum) {
          empByEmail.set(key, { ...existing, ...emp, id: emp.id });
        } else {
          empByEmail.set(key, { ...emp, ...existing, id: existing.id });
        }
      }
    });

    const deduplicated = Array.from(empByEmail.values());
    if (deduplicated.length !== items.length) {
      changed = true;
    }

    const sanitized = deduplicated.map(emp => {
      if (!emp) return emp;
      const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen;
      let isLive = false;
      if (rawTime) {
        const ts = typeof rawTime === 'number' ? rawTime : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
        if (ts && !isNaN(ts) && (now - ts) <= 120000) {
          isLive = true;
        }
      }

      if (!isLive && (emp.status !== 'Offline' || emp.isOnline !== false)) {
        changed = true;
        return {
          ...emp,
          isOnline: false,
          status: 'Offline',
        };
      }
      return emp;
    });

    if (changed) {
      localStorage.setItem('subai_store_employees', JSON.stringify(sanitized));
      console.log('[SubAi] Sanitized employee presence & purged duplicates');
    }
  } catch (e) {
    console.warn('[SubAi] sanitizeEmployeePresence warning:', e);
  }
};

sanitizeEmployeePresence();

export const pushAllAdminStoresToApi = async () => {
  try {
    const collectionsToPush = [
      'Sites', 'employees', 'Assignments', 'assignments', 'Attendance', 'attendance',
      'tracking_logs', 'ActivityLogs', 'notifications', 'route_logs',
      'delay_reports', 'incident_reports', 'users'
    ];
    const payload = {};
    collectionsToPush.forEach(colKey => {
      const items = getLocalCollection(colKey);
      if (Array.isArray(items) && items.length > 0) {
        payload[colKey] = items;
      }
    });
    if (Object.keys(payload).length > 0) {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: payload })
      });
    }
  } catch (e) {}
};

export const restoreAllDemoData = () => {
  const collections = [
    'Sites', 'employees', 'Assignments', 'assignments', 'Attendance', 'attendance',
    'tracking_logs', 'ActivityLogs', 'notifications', 'route_logs',
    'delay_reports', 'incident_reports', 'users'
  ];
  collections.forEach(col => {
    const seed = getInitialDataForCollection(col);
    if (seed.length > 0) {
      safeLocalStorageSet('subai_store_' + col, JSON.stringify(seed));
      notifyListeners(col);
    }
  });
  pushAllAdminStoresToApi();
};

const fetchHttpSyncAdmin = async () => {
  try {
    const res = await fetch('/api/sync');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        const keysToProcess = new Set([...Object.keys(data), 'Attendance', 'attendance']);
        keysToProcess.forEach(colKey => {
          const rawRemote = data[colKey];
          if (!Array.isArray(rawRemote)) return;
          const remoteItems = rawRemote.filter(item => !isMockItem(colKey, item));
          const current = getLocalCollection(colKey).filter(item => !isMockItem(colKey, item));

          let merged;

          if (colKey === 'employees') {
            const empMap = new Map();
            current.forEach(i => {
              if (!i || isMockItem('employees', i)) return;
              const email = (i.email || i.empEmail || '').trim().toLowerCase();
              const key = email || i.id;
              empMap.set(key, i);
            });
            remoteItems.forEach(i => {
              if (!i || isMockItem('employees', i)) return;
              const email = (i.email || i.empEmail || '').trim().toLowerCase();
              const key = email || i.id;
              if (empMap.has(key)) {
                const existing = empMap.get(key);
                empMap.set(key, {
                  ...existing,
                  ...i,
                  id: existing.id,
                  idNum: existing.idNum || i.idNum,
                  org: existing.org || i.org,
                  type: existing.type || i.type,
                  workType: existing.workType || i.workType,
                });
              } else {
                empMap.set(key, i);
              }
            });
            merged = Array.from(empMap.values());
          } else if (colKey === 'Attendance' || colKey === 'attendance') {
            const attMap = new Map();
            current.forEach(i => { if (i && i.id && !isMockItem('attendance', i)) attMap.set(i.id, i); });
            remoteItems.forEach(i => { if (i && i.id && !isMockItem('attendance', i)) attMap.set(i.id, { ...attMap.get(i.id), ...i }); });
            merged = Array.from(attMap.values());
          } else if (colKey === 'notifications') {
            const notifMap = new Map();
            remoteItems.forEach(i => {
              if (i && (i.id || i.reportId)) notifMap.set(i.id || i.reportId, i);
            });
            current.forEach(i => {
              const id = i && (i.id || i.reportId);
              if (id) {
                const existing = notifMap.get(id);
                notifMap.set(id, {
                  ...(existing || {}),
                  ...i,
                  read: i.read === true || (existing && existing.read === true),
                  status: (i.status === 'Read' || (existing && existing.status === 'Read')) ? 'Read' : (i.status || existing?.status || 'Unread')
                });
              }
            });
            const rawStored = localStorage.getItem('subai_store_notifications');
            if (rawStored === '[]') {
              merged = [];
            } else {
              merged = Array.from(notifMap.values());
            }
          } else {
            const mergedMap = new Map();
            current.forEach(i => { if (i && (i.id || i.reportId) && !isMockItem(colKey, i)) mergedMap.set(i.id || i.reportId, i); });
            remoteItems.forEach(i => { if (i && (i.id || i.reportId) && !isMockItem(colKey, i)) mergedMap.set(i.id || i.reportId, i); });
            merged = Array.from(mergedMap.values());
          }

          const currentRaw = localStorage.getItem('subai_store_' + colKey);
          if (JSON.stringify(merged) !== currentRaw) {
            localStorage.setItem('subai_store_' + colKey, JSON.stringify(merged));
            notifyListeners(colKey);
          }
        });
      }
    }
  } catch (e) {}
};

// On startup: immediately purge mock data, push verified admin state, then pull server state
const initSync = async () => {
  purgeAllLegacyMockData();
  await pushAllAdminStoresToApi();
  await fetchHttpSyncAdmin();
};
setTimeout(initSync, 100);
setInterval(fetchHttpSyncAdmin, 1500);
fetchHttpSyncAdmin();

const notifyListeners = (path) => {
  const callbacks = listenersMap.get(path) || [];
  const items = getLocalCollection(path);
  const snapshot = {
    empty: items.length === 0,
    docs: items.map(item => ({
      id: item.id || 'id_' + Math.random(),
      data: () => item
    }))
  };
  callbacks.forEach(cb => {
    try { cb(snapshot); } catch (err) { console.error('Listener callback error:', err); }
  });
};

export const getDocs = async (_q) => {
  if (isRealFirebaseConfigured) return await realGetDocs(_q);
  const path = _q?.path || _q?.type || _q?.collection?.path || 'default';
  const items = getLocalCollection(path);
  return {
    empty: items.length === 0,
    docs: items.map(item => ({ id: item.id, data: () => item }))
  };
};

export const onSnapshot = (_q, _success, _error) => {
  if (isRealFirebaseConfigured) return realOnSnapshot(_q, _success, _error);
  const path = _q?.path || _q?.type || _q?.collection?.path || 'default';

  if (!listenersMap.has(path)) listenersMap.set(path, []);
  listenersMap.get(path).push(_success);

  const sendCurrent = () => {
    const items = getLocalCollection(path);
    if (typeof _success === 'function') {
      _success({
        empty: items.length === 0,
        docs: items.map(item => ({ id: item.id || 'id_' + Math.random(), data: () => item }))
      });
    }
  };

  // Immediate push
  sendCurrent();

  // Listen to cross-tab storage changes
  const storageHandler = (e) => {
    if (e.key === 'subai_store_' + path) {
      sendCurrent();
    }
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', storageHandler);
  }

  // Polling fallback to guarantee instant real-time sync across windows/frames
  const intervalId = setInterval(sendCurrent, 1000);

  return () => {
    clearInterval(intervalId);
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('storage', storageHandler);
    }
    const list = listenersMap.get(path) || [];
    listenersMap.set(path, list.filter(cb => cb !== _success));
  };
};

export const addDoc = async (_col, _data) => {
  if (isRealFirebaseConfigured) return await realAddDoc(_col, _data);
  const path = _col?.path || _col?.type || 'default';
  const items = getLocalCollection(path);
  const docId = _data.id || ('doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const newItem = { ..._data, id: docId };

  const existingIdx = items.findIndex(i => i && (i.id === docId || (i.reportId && _data.reportId && i.reportId === _data.reportId)));
  if (existingIdx >= 0) {
    items[existingIdx] = { ...items[existingIdx], ...newItem };
  } else {
    items.unshift(newItem);
  }

  setLocalCollection(path, items);
  return { id: docId };
};

export const updateDoc = async (_docRef, _data) => {
  if (isRealFirebaseConfigured) {
    try {
      await realUpdateDoc(_docRef, _data);
    } catch (err) {
      // Continue to local storage fallback
    }
  }
  const path = _docRef?.path || _docRef?.colPath || 'delay_reports';
  const id = _docRef?.id;
  const collectionsToCheck = Array.from(new Set([path, 'Assignments', 'assignments', 'employees', 'Sites', 'delay_reports', 'incident_reports', 'tracking_logs', 'ActivityLogs', 'facial_verifications', 'notifications', 'security_events', 'fraud_reports']));

  collectionsToCheck.forEach(colKey => {
    const raw = localStorage.getItem('subai_store_' + colKey);
    if (raw) {
      try {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          let modified = false;
          const updated = items.map(item => {
            if (item && (item.id === id || item.reportId === id || item.verificationId === id)) {
              modified = true;
              return { ...item, ..._data };
            }
            return item;
          });
          if (modified) {
            setLocalCollection(colKey, updated);
          }
        }
      } catch (e) {}
    }
  });
};

export const setDoc = async (_docRef, _data, _options = {}) => {
  if (isRealFirebaseConfigured) {
    try {
      await realSetDoc(_docRef, _data, _options);
    } catch (err) {
      // Continue to local storage fallback
    }
  }
  const path = _docRef?.path || _docRef?.colPath || 'default';
  const id = _docRef?.id || _data.id || ('doc_' + Date.now());
  const items = getLocalCollection(path);
  const newItem = { ..._data, id };
  const existingIdx = items.findIndex(i => i && i.id === id);
  if (existingIdx >= 0) {
    if (_options?.merge) {
      items[existingIdx] = { ...items[existingIdx], ...newItem };
    } else {
      items[existingIdx] = newItem;
    }
  } else {
    items.unshift(newItem);
  }
  setLocalCollection(path, items);
  return { id };
};

export const deleteDoc = async (_docRef) => {
  if (isRealFirebaseConfigured) {
    try {
      await realDeleteDoc(_docRef);
    } catch (err) {
      // Continue to local storage fallback
    }
  }
  const path = _docRef?.path || _docRef?.colPath || 'delay_reports';
  const id = _docRef?.id;
  const collectionsToCheck = Array.from(new Set([
    path,
    'Assignments', 'assignments', 'employees', 'Sites',
    'delay_reports', 'incident_reports', 'tracking_logs', 'ActivityLogs',
    'facial_verifications', 'security_events', 'fraud_reports', 'notifications'
  ]));

  collectionsToCheck.forEach(colKey => {
    const raw = localStorage.getItem('subai_store_' + colKey);
    if (raw) {
      try {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          const filtered = items.filter(item => item && item.id !== id && item.reportId !== id && item.assignmentId !== id);
          if (filtered.length !== items.length) {
            setLocalCollection(colKey, filtered);
          }
        }
      } catch (e) {}
    }
  });

  // Explicitly tell the server to purge this id across all server-side collections
  try {
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', path, id, ids: [id] })
    }).catch(() => {});
  } catch (e) {}
};

export const doc = (_db, _path, ...rest) => {
  if (isRealFirebaseConfigured) return realDoc(_db, _path, ...rest);
  if (rest.length > 0) {
    return { path: _path, id: rest[0], colPath: _path };
  }
  const parts = typeof _path === 'string' ? _path.split('/') : [];
  return { path: parts[0], id: parts[1] || parts[0], colPath: parts[0] };
};

export const serverTimestamp = () => isRealFirebaseConfigured ? realServerTimestamp() : new Date().toISOString();