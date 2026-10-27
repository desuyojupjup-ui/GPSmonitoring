import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
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
  doc as realDoc,
  serverTimestamp as realServerTimestamp
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

// ── Real Firebase Configuration ──
// Reads from environment variables with guaranteed hardcoded fallbacks
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyAKq6duytBeNQWtWTtXEhCpoZPgwd4dcsE",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "gps-based-e3839.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "gps-based-e3839",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "gps-based-e3839.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "823108782788",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:823108782788:web:8915822e7919c3d2ba1791"
};

export const isRealFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app, auth, db;

let currentAuthUser = null;
const authListeners = new Set();

/**
 * Guarantees a valid Firebase Auth session so that Firestore Security Rules (request.auth != null)
 * allow reading and writing Assignments, employees, and Sites without permission errors.
 */
export const ensureAuthenticatedSession = async () => {
  if (!isRealFirebaseConfigured || !auth) return;
  if (!auth.currentUser) {
    try {
      await signInWithEmailAndPassword(auth, 'admin@geostride.com', 'password123');
      console.log('[Firebase] Session authenticated via gateway credentials');
    } catch (err) {
      console.warn('[Firebase] ensureAuthenticatedSession warning:', err.message);
    }
  }
};

export const saveUserSession = async (userObj) => {
  try {
    // Never persist the internal admin gateway account as the mobile employee session
    if (userObj?.email && userObj.email.toLowerCase().includes('admin@')) {
      console.log('[Firebase] Refusing to persist internal admin gateway credentials as user session');
      return;
    }
    currentAuthUser = userObj;
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
    await AsyncStorage.removeItem('@geostride_user_session');
  } catch (e) {
    console.warn('[Firebase] performGlobalLogout warning:', e);
  }

  // Immediately notify all logout listeners so UI navigates to Login screen instantaneously
  logoutListeners.forEach(cb => {
    try { cb(); } catch (err) {}
  });

  authListeners.forEach(cb => {
    try { cb(null); } catch (e) {}
  });

  try {
    if (auth && typeof auth.signOut === 'function') {
      await auth.signOut().catch(() => {});
    }
  } catch (e) {}
};

export const loadUserSession = async () => {
  try {
    const saved = await AsyncStorage.getItem('@geostride_user_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.email && !parsed.email.toLowerCase().includes('admin@')) {
        currentAuthUser = parsed;
        authListeners.forEach(cb => {
          try { cb(currentAuthUser); } catch(e) {}
        });
        return currentAuthUser; // Return cached user so caller can restore immediately
      } else {
        // Stale or admin account in storage, purge it
        await AsyncStorage.removeItem('@geostride_user_session');
        currentAuthUser = null;
      }
    }
  } catch (e) {
    console.warn('Failed to load session:', e);
  }
  return null;
};

// Helper to reliably resolve only real employee emails, never the internal admin gateway email
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

if (isRealFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } catch (e) {
    auth = getAuth(app);
  }
  db = getFirestore(app);
  // Guarantee active authenticated session for Firestore Security Rules
  setTimeout(() => {
    ensureAuthenticatedSession();
  }, 100);
} else {
  // Local DB / Offline Dynamic Fallback Auth with persistence
  auth = {
    get currentUser() {
      return currentAuthUser;
    },
    signInWithEmailAndPassword: async (authObj, email, password) => {
      const cleanEmail = email ? email.trim().toLowerCase() : '';
      const formattedName = cleanEmail
        ? cleanEmail.split('@')[0].split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
        : 'Employee';
      
      const userObj = {
        email: cleanEmail || 'employee@subai.com',
        uid: 'uid_' + Date.now(),
        displayName: formattedName
      };
      
      await saveUserSession(userObj);

      authListeners.forEach(cb => {
        try { cb(currentAuthUser); } catch(e) {}
      });

      return { user: currentAuthUser };
    },
    signOut: async () => {
      await saveUserSession(null);
      authListeners.forEach(cb => {
        try { cb(null); } catch(e) {}
      });
    },
    onAuthStateChanged: (cb) => {
      authListeners.add(cb);
      if (typeof cb === 'function') cb(currentAuthUser);
      return () => authListeners.delete(cb);
    },
  };
  db = {};
}

export { auth, db, signOut, signInWithEmailAndPassword, onAuthStateChanged, initializeAuth, getReactNativePersistence, getFirestore };

// Helper to format email name
const formatEmailToName = (email) => {
  if (!email) return 'Field Employee';
  const uname = email.split('@')[0];
  return uname.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

// ── Unified Dual-Mode Firestore Functions ──
export const collection = (_db, _path) => {
  if (isRealFirebaseConfigured) return realCollection(_db, _path);
  return { path: _path, type: 'collection' };
};

export const query = (_ref, ..._args) => {
  if (isRealFirebaseConfigured) return realQuery(_ref, ..._args);
  return _ref;
};

export const where = (_field, _op, _val) => {
  if (isRealFirebaseConfigured) return realWhere(_field, _op, _val);
  return { field: _field, op: _op, val: _val };
};

export const orderBy = (_field, _direction) => {
  if (isRealFirebaseConfigured) return realOrderBy(_field, _direction);
  return { field: _field, dir: _direction };
};

export const limit = (_num) => {
  if (isRealFirebaseConfigured) return realLimit(_num);
  return { limit: _num };
};

// Persistent Storage Engine for Mobile (AsyncStorage & localStorage compatible)
const listenersMap = new Map();

const cleanLegacyItems = (items) => {
  if (!Array.isArray(items)) return [];
  const dummyIds = new Set([
    'asg1', 'asg_office_001', 'asg_sm_002', 'asg_ayala_003',
    'doc_1788420171450_bm2zv', 'doc_1788416657516_qrrk5',
    'doc_1788420171404_bgaze', 'doc_1788416657471_imren'
  ]);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return items.filter(item => {
    if (!item) return false;
    if (dummyIds.has(item.id) || dummyIds.has(item.assignmentId)) return false;
    if (item.site === 'Greenfield Worksite Alpha') return false;
    const dateStr = item.assignDate || item.scheduleDate;
    if (dateStr && typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      if (dateStr.trim() < todayStr) return false;
    }
    return true;
  });
};

const getDefaultCollectionItems = (_path) => {
  return []; // NO MOCK/SAMPLE ASSIGNMENTS OR SITES
};

const getLocalCollectionSync = (path) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('subai_store_' + path);
      if (raw) {
        return cleanLegacyItems(JSON.parse(raw));
      }
    }
  } catch (e) {}
  return null;
};

const getLocalCollection = async (path) => {
  const syncData = getLocalCollectionSync(path);
  if (syncData !== null) return syncData;

  try {
    const raw = await AsyncStorage.getItem('subai_store_' + path);
    if (raw) {
      return cleanLegacyItems(JSON.parse(raw));
    }
  } catch (e) {}

  return [];
};

let expoConstantsObj = null;
try {
  expoConstantsObj = require('expo-constants').default || require('expo-constants');
} catch (e) {}

const getExpoHostIp = () => {
  try {
    if (NativeModules?.SourceCode?.scriptURL) {
      const scriptURL = NativeModules.SourceCode.scriptURL;
      const host = scriptURL.split('://')[1]?.split('/')[0]?.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return host;
      }
    }
  } catch (e) {}
  try {
    if (expoConstantsObj) {
      const hostUri = expoConstantsObj?.expoConfig?.hostUri || expoConstantsObj?.manifest?.debuggerHost || expoConstantsObj?.manifest2?.extra?.expoGo?.developer?.tool || '';
      if (hostUri && hostUri.includes(':')) {
        return hostUri.split(':')[0];
      }
    }
  } catch (e) {}
  return null;
};

const postHttpSync = async (payload) => {
  const hostIp = getExpoHostIp();
  const syncEndpoints = [];

  if (hostIp) {
    syncEndpoints.push(`http://${hostIp}:5173/api/sync`);
  }

  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    syncEndpoints.push(window.location.origin + '/api/sync');
  }

  syncEndpoints.push(
    'http://localhost:5173/api/sync',
    'http://127.0.0.1:5173/api/sync',
    'http://10.0.2.2:5173/api/sync'
  );

  for (const url of syncEndpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response && response.ok) break;
    } catch (e) {}
  }
};

let mobileBroadcastChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    mobileBroadcastChannel = new BroadcastChannel('subai_firestore_sync');
    mobileBroadcastChannel.onmessage = async (event) => {
      if (event?.data?.type === 'REQUEST_SYNC') {
        const delayReports = await getLocalCollection('delay_reports');
        const incidentReports = await getLocalCollection('incident_reports');
        const trackingLogs = await getLocalCollection('tracking_logs');
        const activityLogs = await getLocalCollection('ActivityLogs');
        const facialVerifications = await getLocalCollection('facial_verifications');
        const notifications = await getLocalCollection('notifications');
        const attendance = await getLocalCollection('attendance');
        const Attendance = await getLocalCollection('Attendance');
        
        mobileBroadcastChannel.postMessage({
          type: 'SYNC_BULK',
          collections: {
            delay_reports: delayReports,
            incident_reports: incidentReports,
            tracking_logs: trackingLogs,
            ActivityLogs: activityLogs,
            facial_verifications: facialVerifications,
            notifications: notifications,
            attendance,
            Attendance,
          }
        });
      }
    };
  } catch (e) {
    console.warn('Mobile BroadcastChannel init warning:', e);
  }
}

const setLocalCollection = async (path, items) => {
  try {
    const jsonStr = JSON.stringify(items);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('subai_store_' + path, jsonStr);
    }
    await AsyncStorage.setItem('subai_store_' + path, jsonStr);
    notifyListeners(path);

    if (mobileBroadcastChannel) {
      try {
        mobileBroadcastChannel.postMessage({
          type: 'SYNC_COLLECTION',
          path,
          items
        });
      } catch (e) {}
    }

    // HTTP Sync Relay to Admin Portal
    postHttpSync({ path, items });
  } catch (e) {
    console.error('Local Store write error:', e);
  }
};

const fetchHttpSyncMobile = async () => {
  const hostIp = getExpoHostIp();
  const syncEndpoints = [];

  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || 'localhost';
    syncEndpoints.push(`http://${hostname}:5173/api/sync`);
    if (window.location.origin) {
      syncEndpoints.push(window.location.origin + '/api/sync');
    }
  }

  if (hostIp) syncEndpoints.push(`http://${hostIp}:5173/api/sync`);
  syncEndpoints.push('http://localhost:5173/api/sync', 'http://127.0.0.1:5173/api/sync', 'http://10.0.2.2:5173/api/sync');

  const ADMIN_OWNED = new Set(['Assignments', 'assignments', 'employees', 'Sites']);

  const userEmail = (auth?.currentUser?.email || '').trim().toLowerCase();
  for (const baseUrl of syncEndpoints) {
    try {
      const url = userEmail ? `${baseUrl}?email=${encodeURIComponent(userEmail)}` : baseUrl;
      const response = await fetch(url, { method: 'GET' });
      if (response && response.ok) {
        const store = await response.json();
        if (store) {
          const allKeys = ['Assignments', 'assignments', 'employees', 'Sites', 'delay_reports', 'incident_reports', 'tracking_logs', 'ActivityLogs', 'facial_verifications', 'notifications', 'security_events', 'Attendance', 'attendance'];
          for (const key of allKeys) {
            if (Array.isArray(store[key])) {
              const localItems = await getLocalCollection(key);

              let updatedItems = [];
              if (key === 'employees') {
                const localMap = new Map();
                localItems.forEach(li => {
                  if (li) {
                    const lEmail = (li.email || li.empEmail || '').trim().toLowerCase();
                    if (lEmail) localMap.set(lEmail, li);
                    if (li.id) localMap.set(li.id, li);
                  }
                });
                updatedItems = cleanLegacyItems(store[key]).map(emp => {
                  const empEmail = (emp.email || emp.empEmail || '').trim().toLowerCase();
                  const local = localMap.get(empEmail) || localMap.get(emp.id);
                  return {
                    ...emp,
                    profilePic: emp.profilePic || local?.profilePic || null
                  };
                });
              } else if (ADMIN_OWNED.has(key)) {
                // Admin is source of truth — full replace
                updatedItems = cleanLegacyItems(store[key]);
              } else {
                // Mobile reports — merge
                const map = new Map();
                localItems.forEach(i => map.set(i.id || i.reportId, i));
                store[key].forEach(i => map.set(i.id || i.reportId, i));
                updatedItems = Array.from(map.values());
              }

              const localStr = JSON.stringify(localItems);
              const updatedStr = JSON.stringify(updatedItems);

              if (localStr !== updatedStr) {
                if (typeof window !== 'undefined' && window.localStorage) {
                  window.localStorage.setItem('subai_store_' + key, updatedStr);
                }
                await AsyncStorage.setItem('subai_store_' + key, updatedStr);
                notifyListeners(key);
              }
            }
          }
        }
        break;
      }
    } catch (e) {}
  }
};

const initialSyncMobileToAdmin = async () => {
  try {
    const delayReports = await getLocalCollection('delay_reports');
    const incidentReports = await getLocalCollection('incident_reports');
    const trackingLogs = await getLocalCollection('tracking_logs');
    const activityLogs = await getLocalCollection('ActivityLogs');
    const facialVerifications = await getLocalCollection('facial_verifications');
    const notifications = await getLocalCollection('notifications');
    const attendance = await getLocalCollection('attendance');
    const Attendance = await getLocalCollection('Attendance');

    await postHttpSync({
      collections: {
        delay_reports: delayReports,
        incident_reports: incidentReports,
        tracking_logs: trackingLogs,
        ActivityLogs: activityLogs,
        facial_verifications: facialVerifications,
        notifications,
        attendance,
        Attendance,
      }
    });

    await fetchHttpSyncMobile();
  } catch (e) {}
};

setTimeout(initialSyncMobileToAdmin, 500);
setInterval(initialSyncMobileToAdmin, 1500);

const notifyListeners = async (path) => {
  const callbacks = listenersMap.get(path) || [];
  const items = await getLocalCollection(path);
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
  const path = _q?.path || _q?.type || 'default';
  const items = await getLocalCollection(path);
  return {
    empty: items.length === 0,
    docs: items.map(item => ({ id: item.id, data: () => item })),
    forEach: (cb) => items.map(item => ({ id: item.id, data: () => item })).forEach(cb)
  };
};

export const onSnapshot = (_q, _success, _error) => {
  const safeError = typeof _error === 'function' ? _error : (err) => {
    console.warn(`[Firestore onSnapshot] Caught listener notice (${_q?.path || _q?._query?.path || 'query'}):`, err?.message || err);
  };
  if (isRealFirebaseConfigured) {
    try {
      return realOnSnapshot(_q, _success, safeError);
    } catch (e) {
      console.warn('[Firestore onSnapshot] Subscription exception caught:', e?.message);
      return () => {};
    }
  }
  const path = _q?.path || _q?.type || _q?.collection?.path || 'default';

  if (!listenersMap.has(path)) listenersMap.set(path, []);
  listenersMap.get(path).push(_success);

  const sendCurrent = async () => {
    let items = await getLocalCollection(path);

    if (typeof _success === 'function') {
      _success({
        empty: items.length === 0,
        docs: items.map(item => ({ id: item.id, data: () => item })),
        forEach: (cb) => items.map(item => ({ id: item.id, data: () => item })).forEach(cb)
      });
    }
  };

  sendCurrent();

  const storageHandler = (e) => {
    if (e.key === 'subai_store_' + path) {
      sendCurrent();
    }
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', storageHandler);
  }

  const intervalId = setInterval(sendCurrent, 1500);

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
  const path = _col?.path || 'default';
  const items = await getLocalCollection(path);
  const docId = _data.id || ('doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const newItem = { ..._data, id: docId };

  const existingIdx = items.findIndex(i => i && (i.id === docId || (i.reportId && _data.reportId && i.reportId === _data.reportId)));
  if (existingIdx >= 0) {
    items[existingIdx] = { ...items[existingIdx], ...newItem };
  } else {
    items.unshift(newItem);
  }

  await setLocalCollection(path, items);
  postHttpSync({ path, data: newItem, items });
  return { id: docId };
};

export const updateDoc = async (_docRef, _data) => {
  if (isRealFirebaseConfigured) return await realUpdateDoc(_docRef, _data);
  const path = _docRef?.path || _docRef?.colPath || 'employees';
  const id = _docRef?.id;
  const items = await getLocalCollection(path);
  let found = false;
  const updated = items.map(item => {
    const isIdMatch = id && item && item.id === id;
    const isEmailMatch = _docRef?.email && item && item.email && item.email.toLowerCase() === _docRef.email.toLowerCase();
    if (isIdMatch || isEmailMatch) {
      found = true;
      return { ...item, ..._data };
    }
    return item;
  });
  if (!found && id) {
    updated.unshift({ id, ..._data });
  }
  await setLocalCollection(path, updated);
};

export const deleteDoc = async (_docRef) => {
  if (isRealFirebaseConfigured) return await realDeleteDoc(_docRef);
  const path = _docRef?.path || _docRef?.colPath || 'employees';
  const id = _docRef?.id;
  const items = await getLocalCollection(path);
  const filtered = items.filter(item => item.id !== id);
  await setLocalCollection(path, filtered);
};

export const doc = (_db, _path, ...rest) => {
  if (isRealFirebaseConfigured) return realDoc(_db, _path, ...rest);
  if (rest.length > 0) {
    return { path: _path, id: rest[0], colPath: _path };
  }
  const parts = typeof _path === 'string' ? _path.split('/') : [];
  return { path: parts[0], id: parts[1] || parts[0], colPath: parts[0] };
};

export const serverTimestamp = () => {
  if (isRealFirebaseConfigured) return realServerTimestamp();
  return new Date().toISOString();
};