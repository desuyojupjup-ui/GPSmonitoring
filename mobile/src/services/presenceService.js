// ──────────────────────────────────────────────────────────────────────────
// Real-time Employee Presence & Heartbeat Service
//
// Maintains the active online status of the currently logged-in employee
// using Cloud Firestore as the single source of truth (no /api/sync relays
// or BroadcastChannel local DB overrides).
// ──────────────────────────────────────────────────────────────────────────
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { db, doc, updateDoc, collection, getDocs, ensureAuthenticatedSession } from '../firebase';
import locationLogService from './locationLogService';

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
    if (empId && !String(empId).startsWith('emp_current')) {
      this.currentEmployeeId = empId;
    }
  }

  async resolveEmployeeId(user) {
    if (this.currentEmployeeId && !String(this.currentEmployeeId).startsWith('emp_current')) {
      return this.currentEmployeeId;
    }

    const targetUser = user || this.currentUser;
    const email = (targetUser?.email || '').trim().toLowerCase();

    try {
      await ensureAuthenticatedSession();
    } catch (_) {}

    try {
      const snap = await getDocs(collection(db, 'employees'));
      if (snap && !snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (targetUser?.id && docs.some(d => d.id === targetUser.id)) {
          this.currentEmployeeId = targetUser.id;
          return this.currentEmployeeId;
        }

        if (targetUser?.uid) {
          const matchUid = docs.find(d => d.id === targetUser.uid || d.uid === targetUser.uid);
          if (matchUid) {
            this.currentEmployeeId = matchUid.id;
            return this.currentEmployeeId;
          }
        }

        if (email && !email.includes('admin@')) {
          const match =
            docs.find(data => (data.email || data.empEmail || '').trim().toLowerCase() === email) ||
            docs.find(data => {
              const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
              const prefix = email.split('@')[0];
              return prefix && empMail.startsWith(prefix + '@');
            });

          if (match) {
            this.currentEmployeeId = match.id;
            return match.id;
          }
        }
      }
    } catch (e) {
      console.warn('[PresenceService] Error resolving employee ID:', e?.message);
    }
    return null;
  }

  async getQuickLocation() {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!servicesEnabled || status !== 'granted') {
        if (!this.lastFix) {
          try {
            const cached = await AsyncStorage.getItem('@last_known_location');
            if (cached) this.lastFix = JSON.parse(cached);
          } catch (_) {}
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
          speed: loc.coords.speed || 0,
        };
        AsyncStorage.setItem('@last_known_location', JSON.stringify(this.lastFix)).catch(() => {});
        return this.lastFix;
      }
    } catch (_) {
      if (!this.lastFix) {
        try {
          const cached = await AsyncStorage.getItem('@last_known_location');
          if (cached) this.lastFix = JSON.parse(cached);
        } catch (__) {}
      }
    }
    return this.lastFix;
  }

  async sendHeartbeat(isOnline = true, explicitStatus = null) {
    if (!this.currentUser && !this.currentEmployeeId) return;

    try {
      await ensureAuthenticatedSession();
    } catch (_) {}

    const empId = await this.resolveEmployeeId(this.currentUser);
    // Only actively fetch GPS coordinates when shift monitoring is active (Requirement 10 & 11)
    const isActivelyMonitored = locationLogService.isPeriodicLoggingActive();
    const loc = (isOnline && isActivelyMonitored) ? await this.getQuickLocation() : null;

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

      try {
        if (isActivelyMonitored) {
          locationLogService.onLocationUpdate(loc);
        }
      } catch (_) {}
    }

    if (empId && !String(empId).startsWith('emp_current')) {
      try {
        await updateDoc(doc(db, 'employees', empId), payload);
      } catch (e) {
        console.warn('[PresenceService] updateDoc error:', e?.message);
      }
    }
  }

  async startPresence(user, employeeId = null, initialStatus = null) {
    if (!user && !employeeId) return;

    this.currentUser = user || this.currentUser;
    if (employeeId && !String(employeeId).startsWith('emp_current')) {
      this.currentEmployeeId = employeeId;
    }
    if (initialStatus && initialStatus !== 'Offline') {
      this.currentStatus = initialStatus;
    } else {
      this.currentStatus = 'Online';
    }
    this.isRunning = true;

    if (!this.currentEmployeeId) {
      await this.resolveEmployeeId(this.currentUser);
    }

    await this.sendHeartbeat(true, this.currentStatus || 'Online');

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.isRunning) {
        this.sendHeartbeat(true);
      }
    }, 45000);

    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active' && this.isRunning) {
          this.sendHeartbeat(true);
        } else if (nextAppState.match(/inactive|background/) && this.isRunning) {
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
      try { this.appStateSubscription.remove(); } catch (_) {}
      this.appStateSubscription = null;
    }

    if (user) this.currentUser = user;

    this.sendHeartbeat(false, 'Offline').catch(() => {});

    this.currentUser = null;
    this.currentEmployeeId = null;
  }
}

export const presenceService = new PresenceService();
export default presenceService;
