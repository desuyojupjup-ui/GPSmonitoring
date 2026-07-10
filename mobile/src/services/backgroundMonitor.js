// ──────────────────────────────────────────────────────────────────────────
// Continuous background location monitoring during working hours.
//   - Streams fixes via expo-task-manager + expo-location (battery-tuned).
//   - Throttles gps_history writes (time + distance gate).
//   - Detects prolonged inactivity and unexpected exits from the work site.
//
// IMPORTANT: defineTask MUST run at module import time (top level), so this
// file is imported once from App.js. Per-shift context (employee, site) is
// persisted to AsyncStorage because the background task runs without React state.
// ──────────────────────────────────────────────────────────────────────────
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { collection, addDoc, serverTimestamp } from '../firebase';
import { db } from '../firebase';
import { SECURITY } from './securityConfig';
import { getDistanceMeters, evaluateGeofence } from '../utils/geo';
import { validateSpeed } from './gpsValidator';

const TASK = SECURITY.BACKGROUND_TASK;
const C = SECURITY.COLLECTIONS;

// Static require — Metro bundler does NOT support dynamic require(variableName).
let AsyncStorage = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch { /* not available */ }

const CTX_KEY = 'geostride.monitorCtx';
const LAST_KEY = 'geostride.lastFix';

async function loadCtx() {
  if (!AsyncStorage) return null;
  const raw = await AsyncStorage.getItem(CTX_KEY);
  return raw ? JSON.parse(raw) : null;
}
async function loadLastFix() {
  if (!AsyncStorage) return null;
  const raw = await AsyncStorage.getItem(LAST_KEY);
  return raw ? JSON.parse(raw) : null;
}
async function saveLastFix(fix) {
  if (AsyncStorage) await AsyncStorage.setItem(LAST_KEY, JSON.stringify(fix));
}

async function safeAdd(name, data) {
  try {
    await addDoc(collection(db, name), { ...data, timestamp: serverTimestamp() });
  } catch (e) {
    console.warn(`[backgroundMonitor] ${name} write failed:`, e?.message);
  }
}

// ── Background task definition (runs even when app is backgrounded) ──
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  if (!locations?.length) return;

  const ctx = await loadCtx();
  if (!ctx) return; // monitoring not active
  const last = await loadLastFix();

  for (const loc of locations) {
    const fix = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      mocked: loc.coords.mocked,
      timestamp: loc.timestamp || Date.now(),
    };

    // Throttle history writes (time + distance).
    const movedEnough =
      !last ||
      getDistanceMeters(last.latitude, last.longitude, fix.latitude, fix.longitude) >=
        SECURITY.GPS_HISTORY_MIN_MOVE_M;
    const timeEnough = !last || fix.timestamp - last.timestamp >= SECURITY.GPS_HISTORY_MIN_INTERVAL_MS;

    if (movedEnough || timeEnough) {
      await safeAdd(C.GPS_HISTORY, {
        employee_id: ctx.employeeId,
        employeeName: ctx.employeeName,
        deviceId: ctx.deviceId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        mocked: !!fix.mocked,
        siteId: ctx.site?.id ?? null,
      });

      // Impossible-travel speed flag.
      const sp = validateSpeed(last, fix);
      if (!sp.ok) {
        await safeAdd(C.FRAUD_REPORTS, {
          employee_id: ctx.employeeId,
          employeeName: ctx.employeeName,
          deviceId: ctx.deviceId,
          category: 'speed',
          detail: sp.reason,
          latitude: fix.latitude,
          longitude: fix.longitude,
          resolved: false,
        });
      }

      // Unexpected site exit.
      if (ctx.site && (ctx.site.lat != null || ctx.site.polygon)) {
        const geo = evaluateGeofence(fix.latitude, fix.longitude, ctx.site);
        if (!geo.inside) {
          await safeAdd(C.GEOFENCE_EVENTS, {
            employee_id: ctx.employeeId,
            employeeName: ctx.employeeName,
            siteId: ctx.site.id ?? null,
            siteName: ctx.site.name ?? null,
            type: 'exit',
            latitude: fix.latitude,
            longitude: fix.longitude,
            distanceToBoundary: geo.distanceToBoundary,
          });
        }
      }

      // Prolonged inactivity (stationary too long).
      if (last) {
        const stationary =
          getDistanceMeters(last.latitude, last.longitude, fix.latitude, fix.longitude) < 15;
        const idleMs = fix.timestamp - (ctx.lastMovedAt || fix.timestamp);
        if (stationary && idleMs > SECURITY.INACTIVITY_MINUTES * 60000) {
          await safeAdd(C.FRAUD_REPORTS, {
            employee_id: ctx.employeeId,
            employeeName: ctx.employeeName,
            deviceId: ctx.deviceId,
            category: 'inactivity',
            detail: `No significant movement for ${Math.round(idleMs / 60000)} minutes.`,
            latitude: fix.latitude,
            longitude: fix.longitude,
            resolved: false,
          });
          ctx.lastMovedAt = fix.timestamp; // reset so we don't spam
          if (AsyncStorage) await AsyncStorage.setItem(CTX_KEY, JSON.stringify(ctx));
        } else if (!stationary) {
          ctx.lastMovedAt = fix.timestamp;
          if (AsyncStorage) await AsyncStorage.setItem(CTX_KEY, JSON.stringify(ctx));
        }
      }

      await saveLastFix(fix);
    }
  }
});

/** Begin background monitoring for the active shift. */
export async function startMonitoring({ employee, site, deviceId }) {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[backgroundMonitor] background location not granted');
      return false;
    }
    if (AsyncStorage) {
      await AsyncStorage.setItem(
        CTX_KEY,
        JSON.stringify({
          employeeId: employee?.id,
          employeeName: employee?.name,
          deviceId,
          site: site
            ? { id: site.id, name: site.name, lat: site.lat, lng: site.lng, radius: site.radius, polygon: site.polygon }
            : null,
          lastMovedAt: Date.now(),
        })
      );
      await AsyncStorage.removeItem(LAST_KEY);
    }
    const already = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (already) return true;
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,           // battery-friendly
      distanceInterval: SECURITY.GPS_HISTORY_MIN_MOVE_M,
      deferredUpdatesInterval: SECURITY.GPS_HISTORY_MIN_INTERVAL_MS,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'GeoStride is tracking your shift',
        notificationBody: 'Location monitoring is active while you are on duty.',
        notificationColor: '#4F46E5',
      },
    });
    return true;
  } catch (e) {
    console.warn('[backgroundMonitor] start failed:', e?.message);
    return false;
  }
}

/** Stop background monitoring at time-out / sign-out. */
export async function stopMonitoring() {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(TASK);
    if (AsyncStorage) {
      await AsyncStorage.removeItem(CTX_KEY);
      await AsyncStorage.removeItem(LAST_KEY);
    }
  } catch (e) {
    console.warn('[backgroundMonitor] stop failed:', e?.message);
  }
}
