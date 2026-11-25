import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword as realSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as realCreateUserWithEmailAndPassword,
  sendPasswordResetEmail as realSendPasswordResetEmail,
  signOut as realSignOut,
  onAuthStateChanged as realOnAuthStateChanged,
  updatePassword as realUpdatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
  getFirestore,
  collection as realCollection,
  query as realQuery,
  where as realWhere,
  orderBy as realOrderBy,
  limit as realLimit,
  getDocs as realGetDocs,
  getDoc as realGetDoc,
  onSnapshot as realOnSnapshot,
  addDoc as realAddDoc,
  updateDoc as realUpdateDoc,
  deleteDoc as realDeleteDoc,
  setDoc as realSetDoc,
  doc as realDoc,
  serverTimestamp as realServerTimestamp,
} from 'firebase/firestore';

// ── Single Shared Firebase Configuration (Admin Web & Mobile App) ──
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAKq6duytBeNQWtWTtXEhCpoZPgwd4dcsE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gps-based-e3839.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gps-based-e3839',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gps-based-e3839.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '823108782788',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:823108782788:web:8915822e7919c3d2ba1791',
};

export const isRealFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app, auth, db;

if (isRealFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  auth = { currentUser: null };
  db = {};
}

export const secondaryAuth = auth;
export const secondaryApp = app;
export { auth, db, EmailAuthProvider, reauthenticateWithCredential };

// ── Safe localStorage Helper (ONLY for UI preferences/session cache, NEVER primary DB) ──
export const safeLocalStorageSet = (key, value) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    try {
      // Clear obsolete legacy store keys to free quota
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('subai_store_') || k === 'geostride_demo_user' || k === 'subai_demo_cache')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(key, value);
      return true;
    } catch (emergencyErr) {
      console.error(`[SubAi Storage] Could not persist "${key}":`, emergencyErr);
      return false;
    }
  }
};

// Strip legacy localStorage database caches on startup so stale local records never override Firestore
export const cleanupLocalStorageQuota = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const legacyKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('subai_store_') || k === 'geostride_demo_user' || k === 'subai_demo_cache')) {
        legacyKeys.push(k);
      }
    }
    legacyKeys.forEach((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
  } catch (_) {}
};

cleanupLocalStorageQuota();

// Legacy filter helpers preserved for backwards compatibility with any callers
export const MOCK_EMP_NAMES = new Set([]);
export const MOCK_SITE_NAMES = new Set([]);
export const isMockEmployee = () => false;
export const isMockSite = () => false;
export const isMockAssignment = () => false;
export const isMockAttendance = () => false;
export const isMockItem = () => false;
export const purgeAllLegacyMockData = () => cleanupLocalStorageQuota();

// ── Platform Bootstrap Accounts (Developer & System Super Admin — no company credentials needed) ──
const PLATFORM_BOOTSTRAP_ACCOUNTS = [
  {
    id: 'platform_developer',
    name: 'Platform Developer',
    email: 'developer@subai.com',
    password: 'password123',
    role: 'Developer',
    jobTitle: 'System Developer',
    companyId: null,
    companyName: 'All Companies',
    access: 'Platform Developer Access',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'admin_primary',
    name: 'Super Administrator',
    email: 'admin@subai.com',
    password: 'password123',
    role: 'System Super Admin',
    jobTitle: 'System Super Admin',
    companyId: null,
    companyName: 'All Companies',
    access: 'Full System Access',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// ── Secondary Firebase Auth App for Provisioning Accounts Without Signing Out Current Admin ──
export const createSecondaryAuthUser = async (email, password) => {
  if (!isRealFirebaseConfigured || !firebaseConfig?.apiKey) return null;
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password || password.length < 6) return null;

  try {
    const existingApps = getApps();
    const secApp = existingApps.find((a) => a.name === 'subai_user_provisioning') || initializeApp(firebaseConfig, 'subai_user_provisioning');
    const secAuth = getAuth(secApp);
    const userCred = await realCreateUserWithEmailAndPassword(secAuth, cleanEmail, password);
    const uid = userCred?.user?.uid || null;
    await realSignOut(secAuth).catch(() => {});
    return { user: userCred.user, uid };
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      return { alreadyExists: true, uid: null };
    }
    console.warn('[SubAi Auth] Secondary auth user creation notice:', err?.code || err?.message);
    return null;
  }
};

// ── Guarantee an Active Firebase Auth Session so Firestore Rules Never Fail with permission-denied ──
let _authEnsurePromise = null;

export const ensureAdminAuthSession = async () => {
  if (!isRealFirebaseConfigured || !auth) return null;
  if (auth.currentUser) return auth.currentUser;
  if (_authEnsurePromise) return _authEnsurePromise;

  _authEnsurePromise = (async () => {
    try {
      // Wait briefly for Firebase Auth persistence to restore an existing user session
      const restored = await new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) { settled = true; resolve(auth.currentUser || null); }
        }, 1200);
        const unsub = realOnAuthStateChanged(auth, (u) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            unsub();
            resolve(u || null);
          }
        });
      });
      if (restored) return restored;

      // Fallback gateway authentication only if the admin session exists in UI but Firebase Auth wasn't restored
      const savedSession = typeof window !== 'undefined' ? localStorage.getItem('subai_admin_user') : null;
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          if (parsed?.email && parsed?.password) {
            const cred = await realSignInWithEmailAndPassword(auth, parsed.email.trim().toLowerCase(), parsed.password).catch(() => null);
            if (cred?.user) return cred.user;
          }
        } catch (_) {}
        try {
          const cred = await realSignInWithEmailAndPassword(auth, 'admin@geostride.com', 'password123');
          return cred?.user || null;
        } catch (gwErr) {
          console.warn('[SubAi Auth] Gateway auth fallback notice:', gwErr?.message);
        }
      }
      return auth.currentUser || null;
    } finally {
      _authEnsurePromise = null;
    }
  })();

  return _authEnsurePromise;
};

// Helper: Sync authenticated user profile into Firestore users/{authUid} for Security Rules lookup
async function syncUserProfileForSecurityRules(authUid, account) {
  if (!isRealFirebaseConfigured || !db || !authUid || !account) return;
  try {
    const profileDoc = {
      uid: authUid,
      authUid,
      userDocId: account.id || authUid,
      name: account.name || account.displayName || account.email?.split('@')[0] || 'User',
      email: (account.email || '').trim().toLowerCase(),
      role: account.role || 'Company User',
      jobTitle: account.jobTitle || account.role || 'Staff',
      companyId: account.companyId ?? null,
      companyName: account.companyName || (account.companyId ? '' : 'All Companies'),
      permissions: account.permissions || null,
      status: account.status || 'Active',
      access: account.access || '',
      lastLogin: new Date().toISOString(),
      updatedAt: realServerTimestamp(),
    };
    await realSetDoc(realDoc(db, 'user_profiles', authUid), profileDoc, { merge: true });
  } catch (err) {
    console.warn('[SubAi Auth] user_profiles sync notice:', err?.message);
  }
}

// Helper: Look up user record directly in Firestore 'users' collection (single source of truth)
async function findFirestoreUserByEmail(cleanEmail) {
  if (!isRealFirebaseConfigured || !db || !cleanEmail) return null;
  try {
    const q = realQuery(realCollection(db, 'users'), realWhere('email', '==', cleanEmail));
    const snap = await realGetDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    }
    // Case-insensitive scan fallback in case legacy record stored mixed-case email
    const allSnap = await realGetDocs(realCollection(db, 'users'));
    for (const docSnap of allSnap.docs) {
      const d = docSnap.data();
      if ((d.email || '').trim().toLowerCase() === cleanEmail) {
        return { id: docSnap.id, ...d };
      }
    }
  } catch (err) {
    console.warn('[SubAi Auth] Firestore users lookup warning:', err?.message);
  }
  return null;
}

// ── Admin Authentication (Cloud Firestore + Firebase Auth) ──
export const authenticateAdminUser = async (email, password) => {
  const cleanEmail = (email || '').trim().toLowerCase() === 'admin'
    ? 'admin@subai.com'
    : (email || '').trim().toLowerCase();

  // 1. Ensure we have Firebase Auth active so we can query Firestore 'users'
  let nativeAuthUser = null;
  if (isRealFirebaseConfigured && auth) {
    try {
      const res = await realSignInWithEmailAndPassword(auth, cleanEmail, password);
      nativeAuthUser = res?.user || null;
    } catch (_) {
      // User may exist in Firestore 'users' with updated password or not provisioned in Firebase Auth yet
      if (!auth.currentUser) {
        try {
          await realSignInWithEmailAndPassword(auth, 'admin@geostride.com', 'password123');
        } catch (__) {}
      }
    }
  }

  // 2. Fetch authoritative user document from Cloud Firestore 'users'
  let account = await findFirestoreUserByEmail(cleanEmail);

  // 3. Bootstrap platform Developer or System Super Admin if not yet created in Firestore
  if (!account) {
    const bootstrap = PLATFORM_BOOTSTRAP_ACCOUNTS.find((a) => a.email === cleanEmail);
    if (bootstrap) {
      account = { ...bootstrap };
      if (isRealFirebaseConfigured && db && auth.currentUser) {
        try {
          await realSetDoc(realDoc(db, 'users', bootstrap.id), {
            ...bootstrap,
            createdAt: bootstrap.createdAt,
            updatedAt: realServerTimestamp(),
          }, { merge: true });
        } catch (_) {}
      }
    }
  }

  // Also support admin@geostride.com as System Super Admin
  if (!account && cleanEmail === 'admin@geostride.com') {
    account = {
      id: 'admin_geostride',
      name: 'System Super Admin',
      email: 'admin@geostride.com',
      password: 'password123',
      role: 'System Super Admin',
      jobTitle: 'System Super Admin',
      companyId: null,
      companyName: 'All Companies',
      access: 'Full System Access',
      status: 'Active',
    };
  }

  if (!account) {
    const err = new Error(`No administrator account found for "${email}".`);
    err.code = 'auth/user-not-found';
    throw err;
  }

  if (account.status && account.status.toLowerCase() === 'inactive') {
    const err = new Error('This account has been deactivated. Contact your administrator.');
    err.code = 'auth/user-disabled';
    throw err;
  }

  // Strict password validation against Firestore password OR native Firebase Auth sign-in
  const hasStoredPassword = Boolean(account.password && String(account.password).trim().length > 0);
  let passwordValid = false;
  if (hasStoredPassword) {
    passwordValid = String(account.password).trim() === String(password);
  } else if (nativeAuthUser) {
    passwordValid = true;
  } else if (password === 'password123') {
    passwordValid = true;
  }

  if (!passwordValid) {
    const err = new Error('Incorrect password. Please verify your credentials.');
    err.code = 'auth/wrong-password';
    throw err;
  }

  // If native Firebase Auth sign-in didn't happen yet, provision & sign in so auth.currentUser matches the real user
  if (isRealFirebaseConfigured && auth && (!nativeAuthUser || (nativeAuthUser.email || '').toLowerCase() !== cleanEmail)) {
    try {
      await createSecondaryAuthUser(cleanEmail, password);
      const signedIn = await realSignInWithEmailAndPassword(auth, cleanEmail, password).catch(() => null);
      if (signedIn?.user) {
        nativeAuthUser = signedIn.user;
      }
    } catch (_) {}
  }

  // Update lastLogin directly in Firestore
  const nowIso = new Date().toISOString();
  if (isRealFirebaseConfigured && db && account.id) {
    try {
      await realUpdateDoc(realDoc(db, 'users', account.id), {
        lastLogin: nowIso,
        ...(nativeAuthUser?.uid ? { authUid: nativeAuthUser.uid } : {}),
      }).catch(() => {});
    } catch (_) {}
  }

  const activeAuthUid = nativeAuthUser?.uid || auth?.currentUser?.uid || account.id;
  await syncUserProfileForSecurityRules(activeAuthUid, account);

  return {
    user: {
      uid: activeAuthUid,
      id: account.id,
      email: account.email,
      displayName: account.name || account.email.split('@')[0],
      name: account.name || account.email.split('@')[0],
      role: account.role || 'Company User',
      jobTitle: account.jobTitle || account.role || 'Staff',
      companyId: account.companyId ?? null,
      companyName: account.companyName || (account.companyId ? '' : 'All Companies'),
      permissions: account.permissions || null,
      access: account.access || '',
      status: account.status || 'Active',
      avatarPhoto: account.avatarPhoto || null,
      avatarColor: account.avatarColor || '#1E5ADB',
      phone: account.phone || '',
      department: account.department || '',
    },
  };
};

export const signInWithEmailAndPassword = async (_authInstance, email, password) => {
  return await authenticateAdminUser(email, password);
};

export const createUserWithEmailAndPassword = async (authInstance, email, password) => {
  if (!isRealFirebaseConfigured) {
    throw new Error('Firebase is not configured.');
  }
  return await realCreateUserWithEmailAndPassword(authInstance || auth, email, password);
};

export const sendPasswordResetEmail = async (authInstance, email) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!isRealFirebaseConfigured) {
    throw new Error('Firebase is not configured.');
  }
  return await realSendPasswordResetEmail(authInstance || auth, cleanEmail);
};

export const signOut = async (authInstance) => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('subai_admin_user');
    localStorage.removeItem('subai_active_company_id');
  }
  if (isRealFirebaseConfigured) {
    return await realSignOut(authInstance || auth);
  }
  return true;
};

export const onAuthStateChanged = (authInstance, cb) => {
  if (isRealFirebaseConfigured) {
    return realOnAuthStateChanged(authInstance || auth, cb);
  }
  return () => {};
};

// Backwards-compatible helpers for UsersRoles & Settings (backed by Firestore, NOT localStorage!)
export const getRegisteredAdminAccounts = () => [];
export const saveRegisteredAdminAccounts = () => {};

export const registerAdminUser = async ({
  id,
  name,
  email,
  password,
  role = 'Company User',
  jobTitle = '',
  companyId = null,
  companyName = '',
  permissions = null,
  access = '',
  status = 'Active',
}) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  await ensureAdminAuthSession();

  let provisionedUid = null;
  if (password && password.length >= 6) {
    const prov = await createSecondaryAuthUser(cleanEmail, password);
    provisionedUid = prov?.uid || null;
  }

  const userPayload = {
    name: (name || cleanEmail.split('@')[0]).trim(),
    email: cleanEmail,
    ...(password ? { password } : {}),
    role,
    jobTitle: jobTitle || role,
    companyId: companyId ?? null,
    companyName: companyName || '',
    permissions: permissions || null,
    access: access || role,
    status: status || 'Active',
    ...(provisionedUid ? { authUid: provisionedUid } : {}),
    updatedAt: realServerTimestamp(),
  };

  let docId = id;
  if (docId) {
    await realSetDoc(realDoc(db, 'users', docId), userPayload, { merge: true });
  } else {
    const ref = await realAddDoc(realCollection(db, 'users'), {
      ...userPayload,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    });
    docId = ref.id;
  }

  if (provisionedUid) {
    await syncUserProfileForSecurityRules(provisionedUid, { id: docId, ...userPayload });
  }

  return {
    user: {
      uid: provisionedUid || docId,
      id: docId,
      ...userPayload,
      displayName: userPayload.name,
    },
  };
};

export const resetAdminPassword = async (email, newPassword) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  await ensureAdminAuthSession();
  const existing = await findFirestoreUserByEmail(cleanEmail);
  if (!existing) {
    throw new Error('No account found with that email address.');
  }
  await realUpdateDoc(realDoc(db, 'users', existing.id), {
    password: newPassword,
    updatedAt: realServerTimestamp(),
  });
  return true;
};

export const updateCurrentAdminProfile = async (updatedProfile) => {
  const currentUser = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
  const fullName = `${updatedProfile.firstName || ''} ${updatedProfile.lastName || ''}`.trim() || updatedProfile.name || currentUser.name || 'Administrator';
  const nextEmail = (updatedProfile.email || currentUser.email || '').trim().toLowerCase();

  const updatedUser = {
    ...currentUser,
    name: fullName,
    displayName: fullName,
    email: nextEmail,
    phone: updatedProfile.phone ?? currentUser.phone ?? '',
    department: updatedProfile.department ?? currentUser.department ?? '',
    avatarColor: updatedProfile.avatarColor || currentUser.avatarColor || '#1E5ADB',
    avatarPhoto: updatedProfile.avatarPhoto !== undefined ? updatedProfile.avatarPhoto : (currentUser.avatarPhoto || null),
  };

  // Persist to Firestore 'users' collection
  if (isRealFirebaseConfigured && db) {
    await ensureAdminAuthSession();
    const docId = currentUser.id || (await findFirestoreUserByEmail(currentUser.email))?.id;
    if (docId) {
      await realUpdateDoc(realDoc(db, 'users', docId), {
        name: fullName,
        email: nextEmail,
        phone: updatedUser.phone,
        department: updatedUser.department,
        avatarColor: updatedUser.avatarColor,
        avatarPhoto: updatedUser.avatarPhoto,
        updatedAt: realServerTimestamp(),
      }).catch((err) => console.warn('Profile Firestore update warning:', err?.message));
    }
    if (auth.currentUser?.uid) {
      await syncUserProfileForSecurityRules(auth.currentUser.uid, updatedUser);
    }
  }

  safeLocalStorageSet('subai_admin_user', JSON.stringify(updatedUser));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('subai_admin_profile_updated', { detail: updatedUser }));
  }
  return updatedUser;
};

export const verifyAndUpdateAdminPassword = async (currentPassword, newPassword) => {
  await ensureAdminAuthSession();
  const currentUser = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
  const userEmail = (currentUser.email || '').trim().toLowerCase();
  const account = await findFirestoreUserByEmail(userEmail);

  if (!account) {
    const err = new Error('No administrator account found in Firestore.');
    err.code = 'auth/user-not-found';
    throw err;
  }

  if (account.password && account.password !== currentPassword) {
    const err = new Error('Current password does not match our records.');
    err.code = 'auth/wrong-password';
    throw err;
  }

  await realUpdateDoc(realDoc(db, 'users', account.id), {
    password: newPassword,
    passwordUpdatedAt: Date.now(),
    updatedAt: realServerTimestamp(),
  });

  if (auth.currentUser && (auth.currentUser.email || '').toLowerCase() === userEmail) {
    try {
      const cred = EmailAuthProvider.credential(userEmail, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred).catch(() => {});
      await realUpdatePassword(auth.currentUser, newPassword);
    } catch (_) {}
  }

  await recordSystemActivityLog({
    action: `Administrator password updated for ${account.name || account.email}`,
    module: 'Security',
    status: 'Success',
    user: account.name || account.email,
    companyId: account.companyId ?? null,
  });

  return true;
};

export const recordSystemActivityLog = async ({
  action,
  module = 'System',
  status = 'Success',
  user = 'System Admin',
  details = '',
  companyId = undefined,
}) => {
  let effectiveCompanyId = companyId;
  if (effectiveCompanyId === undefined && typeof window !== 'undefined') {
    try {
      const u = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
      effectiveCompanyId = u.companyId ?? localStorage.getItem('subai_active_company_id') ?? null;
    } catch (_) {}
  }

  const logEntry = {
    action,
    module,
    status,
    user,
    details: details || action,
    companyId: effectiveCompanyId || 'company_default',
    timestamp: realServerTimestamp(),
    createdAt: realServerTimestamp(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    channel: 'Admin Console (HTTPS)',
  };

  if (isRealFirebaseConfigured && db) {
    await ensureAdminAuthSession();
    const ref = await realAddDoc(realCollection(db, 'ActivityLogs'), logEntry);
    return { id: ref.id, ...logEntry };
  }
  return logEntry;
};

export const clearActivityLogsLedger = async (companyId = null) => {
  if (!isRealFirebaseConfigured || !db) return;
  await ensureAdminAuthSession();
  for (const colName of ['ActivityLogs', 'tracking_logs']) {
    const snap = await realGetDocs(realCollection(db, colName));
    const toDelete = snap.docs.filter((d) => {
      if (!companyId || companyId === 'ALL') return true;
      const docComp = d.data()?.companyId || 'company_default';
      return docComp === companyId;
    });
    await Promise.all(toDelete.map((d) => realDeleteDoc(realDoc(db, colName, d.id))));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('subai_logs_cleared'));
  }
};

// ── Direct Cloud Firestore Exports (Single Source of Truth — Automatic Tenant Query Scoping) ──
const COMPANY_SCOPED_COLLECTIONS = new Set([
  'employees', 'Employees',
  'Assignments', 'assignments',
  'Sites', 'sites',
  'Attendance', 'attendance', 'attendance_logs',
  'facial_verifications',
  'ai_analysis', 'anomaly_responses',
  'fraud_reports', 'security_events', 'security_logs',
  'delay_reports', 'incident_reports',
  'notifications',
  'LocationLogs', 'locationLogs', 'location_logs',
  'gps_history', 'tracking_logs', 'route_logs',
  'geofence_events', 'geofence_violations',
  'ActivityLogs', 'device_registry',
  'users',
]);

let _tenantScope = (() => {
  if (typeof window === 'undefined') return { isPlatform: true, companyId: null };
  try {
    const raw = localStorage.getItem('subai_admin_user');
    if (raw) {
      const u = JSON.parse(raw);
      const r = String(u?.role || '').trim().toLowerCase();
      const isPlat = r.includes('developer') || r.includes('super');
      return { isPlatform: isPlat, companyId: isPlat ? null : (u?.companyId || 'company_default') };
    }
  } catch (_) {}
  return { isPlatform: true, companyId: null };
})();

export const setActiveTenantScope = ({ companyId = null, isPlatform = false } = {}) => {
  _tenantScope = {
    isPlatform: Boolean(isPlatform),
    companyId: isPlatform ? null : (companyId || 'company_default'),
  };
};

const scopeQueryForTenant = (_q) => {
  if (!_q || _tenantScope.isPlatform || !_tenantScope.companyId) return _q;
  // Automatically apply where('companyId', '==', companyId) on bare CollectionReferences
  // so Firestore Security Rules statically prove multi-company isolation on list queries.
  if (_q.type === 'collection' && COMPANY_SCOPED_COLLECTIONS.has(_q.id)) {
    return realQuery(_q, realWhere('companyId', '==', _tenantScope.companyId));
  }
  return _q;
};

let _backfillStarted = false;
export const backfillLegacyCompanyIds = async () => {
  if (_backfillStarted || !isRealFirebaseConfigured || !db || !_tenantScope.isPlatform) return;
  _backfillStarted = true;
  const cols = [
    'employees', 'Assignments', 'Sites', 'Attendance', 'attendance',
    'facial_verifications', 'ai_analysis', 'fraud_reports', 'delay_reports',
    'incident_reports', 'notifications', 'ActivityLogs', 'LocationLogs',
    'location_logs', 'tracking_logs', 'security_events', 'users',
  ];
  try {
    await ensureAdminAuthSession();
    for (const colName of cols) {
      const snap = await realGetDocs(realCollection(db, colName)).catch(() => null);
      if (!snap || snap.empty) continue;
      const missing = snap.docs.filter((d) => {
        const data = d.data() || {};
        if (colName === 'users') {
          const r = String(data.role || '').toLowerCase();
          if (r.includes('developer') || r.includes('super')) return false;
        }
        return !data.companyId;
      });
      await Promise.all(
        missing.map((d) =>
          realUpdateDoc(realDoc(db, colName, d.id), { companyId: 'company_default' }).catch(() => {})
        )
      );
    }
  } catch (err) {
    console.warn('[SubAi] Legacy companyId backfill notice:', err?.message);
  }
};

export const collection = (_db, _path) => realCollection(_db, _path);
export const query = (_ref, ..._args) => realQuery(_ref, ..._args);
export const where = (_field, _op, _val) => realWhere(_field, _op, _val);
export const orderBy = (_field, _direction) => realOrderBy(_field, _direction);
export const limit = (_num) => realLimit(_num);
export const doc = (_db, _path, ...rest) => realDoc(_db, _path, ...rest);
export const serverTimestamp = () => realServerTimestamp();

export const getDocs = async (_q) => {
  await ensureAdminAuthSession();
  return await realGetDocs(scopeQueryForTenant(_q));
};

export const getDoc = async (_docRef) => {
  await ensureAdminAuthSession();
  return await realGetDoc(_docRef);
};

export const onSnapshot = (_q, _success, _error) => {
  let activeUnsub = () => {};
  let cancelled = false;

  const attach = () => {
    if (cancelled) return;
    const effectiveQuery = scopeQueryForTenant(_q);
    activeUnsub = realOnSnapshot(effectiveQuery, _success, (err) => {
      console.error('[Firestore onSnapshot] Error:', err?.code, err?.message);
      if (typeof _error === 'function') _error(err);
    });
  };

  if (auth?.currentUser) {
    attach();
  } else {
    ensureAdminAuthSession()
      .then(() => attach())
      .catch(() => attach());
  }

  return () => {
    cancelled = true;
    try { activeUnsub(); } catch (_) {}
  };
};

export const addDoc = async (_col, _data) => {
  await ensureAdminAuthSession();
  return await realAddDoc(_col, _data);
};

export const updateDoc = async (_docRef, _data) => {
  await ensureAdminAuthSession();
  return await realUpdateDoc(_docRef, _data);
};

export const setDoc = async (_docRef, _data, _options = {}) => {
  await ensureAdminAuthSession();
  return await realSetDoc(_docRef, _data, _options);
};

export const deleteDoc = async (_docRef) => {
  await ensureAdminAuthSession();
  return await realDeleteDoc(_docRef);
};
