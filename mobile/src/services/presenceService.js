// ──────────────────────────────────────────────────────────────────────────
// Real-time Employee Presence & Heartbeat Service
//
// Maintains the active online status of the currently logged-in employee:
//  - Starts on login / session restoration.
//  - Sends heartbeats every 20 seconds with timestamp and fresh GPS coordinates.
//  - Responds immediately to AppState transitions (active / background).
//  - Marks employee as Offline immediately on logout.
//  - Syncs via Firestore updateDoc, /api/sync HTTP endpoint, and BroadcastChannel.
// ──────────────────────────────────────────────────────────────────────────
import { AppState, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { db, doc, updateDoc, collection, getDocs, serverTimestamp, ensureAuthenticatedSession } from '../firebase';

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

const getSyncEndpoints = () => {
  const endpoints = [];
  const hostIp = getExpoHostIp();
  if (hostIp) {
    endpoints.push(`http://${hostIp}:5173/api/sync`);
  }
  // Local network host IP fallback for Expo Go / Wi-Fi
  endpoints.push('http://192.168.0.183:5173/api/sync');

  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    endpoints.push(window.location.origin + '/api/sync');
  }

  endpoints.push(
    'http://localhost:5173/api/sync',
    'http://127.0.0.1:5173/api/sync',
    'http://10.0.2.2:5173/api/sync'
  );

  return Array.from(new Set(endpoints));
};

class PresenceService {
  constructor() {
    this.timer = null;
    this.appStateSubscription = null;
    this.currentEmployeeId = null;
    this.currentUser = null;
    this.currentStatus = 'Online';
    this.isRunning = false;
    this.lastFix = null;
  }

  setCurrentStatus(status) {
    if (status) {
      this.currentStatus = status;
    }
  }

  setEmployeeId(empId) {
    if (empId && empId !== 'emp_fallback' && !empId.startsWith('emp_current')) {
      this.currentEmployeeId = empId;
    }
  }

  async resolveEmployeeId(user) {
    if (this.currentEmployeeId && this.currentEmployeeId !== 'emp_fallback' && !this.currentEmployeeId.startsWith('emp_current')) {
      return this.currentEmployeeId;
    }

    const targetUser = user || this.currentUser;
    const email = (targetUser?.email || '').trim().toLowerCase();

    // Ensure session is authenticated for Firestore rules
    try {
      await ensureAuthenticatedSession();
    } catch (e) {}

    try {
      const snap = await getDocs(collection(db, 'employees'));
      if (snap && !snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 1. Direct ID match if user has an id that matches an employee doc id
        if (targetUser?.id && docs.some(d => d.id === targetUser.id)) {
          this.currentEmployeeId = targetUser.id;
          return this.currentEmployeeId;
        }

        // 2. Direct ID match if user has a uid that matches an employee doc id or uid
        if (targetUser?.uid) {
          const matchUid = docs.find(d => d.id === targetUser.uid || d.uid === targetUser.uid);
          if (matchUid) {
            this.currentEmployeeId = matchUid.id;
            return this.currentEmployeeId;
          }
        }

        // 3. Match by email (ignoring admin gateway)
        if (email && !email.includes('admin@')) {
          const match = docs.find(data => {
            const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
            return empMail === email && data.idNum;
          }) || docs.find(data => {
            const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
            return empMail === email;
          }) || docs.find(data => {
            const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
            const prefix = email.split('@')[0];
            return prefix && empMail.startsWith(prefix + '@');
          });

          if (match) {
            this.currentEmployeeId = match.id;
            return match.id;
          }
        }

        // 4. Match by name
        const targetName = (targetUser?.name || targetUser?.displayName || '').trim().toLowerCase();
        if (targetName && targetName.length >= 2) {
          const matchByName = docs.find(d => (d.name || '').trim().toLowerCase() === targetName);
          if (matchByName) {
            this.currentEmployeeId = matchByName.id;
            return matchByName.id;
          }
        }

        // 5. If only 1 employee document exists in Firestore, adopt it
        if (docs.length === 1) {
          this.currentEmployeeId = docs[0].id;
          return docs[0].id;
        }
      }
    } catch (e) {
      console.warn('[PresenceService] Error resolving employee ID:', e);
    }
    return null;
  }

  async getQuickLocation() {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') {
        if (!this.lastFix) {
          try {
            const cached = await AsyncStorage.getItem('@last_known_location');
            if (cached) this.lastFix = JSON.parse(cached);
          } catch (err) {}
        }
        return this.lastFix;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 3000,
        maximumAge: 15000,
      });

      if (loc && loc.coords) {
        this.lastFix = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
        };
        AsyncStorage.setItem('@last_known_location', JSON.stringify(this.lastFix)).catch(() => {});
        return this.lastFix;
      }
    } catch (e) {
      // Location unavailable or permission error, use last known fix
      if (!this.lastFix) {
        try {
          const cached = await AsyncStorage.getItem('@last_known_location');
          if (cached) this.lastFix = JSON.parse(cached);
        } catch (err) {}
      }
    }
    return this.lastFix;
  }

  async sendHeartbeat(isOnline = true, explicitStatus = null) {
    if (!this.currentUser && !this.currentEmployeeId) return;

    try {
      await ensureAuthenticatedSession();
    } catch (e) {}

    const empId = await this.resolveEmployeeId(this.currentUser);
    const loc = await this.getQuickLocation();

    const now = Date.now();
    const isoString = new Date().toISOString();

    const payload = {
      isOnline: Boolean(isOnline),
      lastActive: now,
      lastHeartbeat: now,
      lastSeen: isoString,
      updatedAt: isoString,
    };

    if (explicitStatus) {
      this.currentStatus = explicitStatus;
      payload.status = explicitStatus;
    } else if (isOnline) {
      payload.status = (this.currentStatus && this.currentStatus !== 'Offline') ? this.currentStatus : 'Online';
    } else {
      payload.status = 'Offline';
    }

    if (loc && loc.lat && loc.lng) {
      payload.lat = loc.lat;
      payload.lng = loc.lng;
      payload.latitude = loc.lat;
      payload.longitude = loc.lng;
      payload.locationAccuracy = loc.accuracy || 10;
    }

    // 1. Update Firestore employee doc if canonical ID is known
    if (empId && empId !== 'emp_fallback' && !empId.startsWith('emp_current')) {
      try {
        await updateDoc(doc(db, 'employees', empId), payload);
        console.log(`[PresenceService] Heartbeat synced for employee ${empId}: isOnline=${isOnline}, status=${payload.status}, lat=${payload.lat}`);
      } catch (e) {
        console.warn('[PresenceService] updateDoc error:', e);
      }
    }

    // 2. HTTP sync to Admin Portal backend
    try {
      if (typeof fetch !== 'undefined') {
        const email = (this.currentUser?.email || '').trim().toLowerCase();
        const safeId = (empId && empId !== 'emp_fallback' && !empId.startsWith('emp_current')) ? empId : undefined;

        const syncItem = {
          ...(safeId ? { id: safeId } : {}),
          email: email || undefined,
          name: this.currentUser?.name,
          ...payload,
        };

        // BroadcastChannel sync for web/hybrid
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const bc = new BroadcastChannel('subai_firestore_sync');
            bc.postMessage({
              type: 'SYNC_COLLECTION',
              path: 'employees',
              items: [syncItem]
            });
          } catch (e) {}
        }

        const endpoints = getSyncEndpoints();
        for (const url of endpoints) {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: 'employees',
                data: syncItem,
              }),
            });
            if (response && response.ok) break;
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  async startPresence(user, employeeId = null, initialStatus = null) {
    if (!user && !employeeId) return;

    this.currentUser = user || this.currentUser;
    if (employeeId && employeeId !== 'emp_fallback' && !employeeId.startsWith('emp_current')) {
      this.currentEmployeeId = employeeId;
    }
    if (initialStatus && initialStatus !== 'Offline') {
      this.currentStatus = initialStatus;
    } else {
      this.currentStatus = 'Online';
    }
    this.isRunning = true;

    // Resolve canonical employee ID before sending heartbeat
    if (!this.currentEmployeeId || this.currentEmployeeId === 'emp_fallback') {
      await this.resolveEmployeeId(this.currentUser);
    }

    // Send immediate initial heartbeat
    await this.sendHeartbeat(true, this.currentStatus || 'Online');

    // Stop existing timer if any
    if (this.timer) clearInterval(this.timer);

    // Heartbeat every 20 seconds
    this.timer = setInterval(() => {
      if (this.isRunning) {
        this.sendHeartbeat(true);
      }
    }, 20000);

    // Listen to AppState (foreground / background)
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active' && this.isRunning) {
          // Came back to foreground — immediate heartbeat
          this.sendHeartbeat(true);
        } else if (nextAppState.match(/inactive|background/)) {
          // App backgrounded — record lastActive timestamp
          this.sendHeartbeat(true);
        }
      });
    }
  }

  async stopPresence(user = null) {
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (user) this.currentUser = user;

    // Immediately notify that employee is offline
    await this.sendHeartbeat(false, 'Offline');

    this.currentUser = null;
    this.currentEmployeeId = null;
  }
}

export const presenceService = new PresenceService();
export default presenceService;
