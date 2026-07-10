// ──────────────────────────────────────────────────────────────────────────
// Stable per-device identity + network info used for binding and logging.
// Uses static require() calls (required by Metro bundler — no dynamic require).
// ──────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';

let _cachedId = null;

// Static requires wrapped in try-catch so missing native modules don't crash.
let Application = null;
try { Application = require('expo-application'); } catch { /* not available */ }

let AsyncStorage = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch { /* not available */ }

let Device = null;
try { Device = require('expo-device'); } catch { /* not available */ }

let Network = null;
try { Network = require('expo-network'); } catch { /* not available */ }

/**
 * Returns a stable identifier for this physical device.
 * Android: ANDROID_ID (survives app reinstalls on most OEMs).
 * iOS: identifierForVendor.
 * Falls back to a generated, persisted id when native modules are unavailable.
 */
export async function getDeviceId() {
  if (_cachedId) return _cachedId;
  try {
    if (Platform.OS === 'android' && Application?.getAndroidId) {
      _cachedId = Application.getAndroidId();
    } else if (Platform.OS === 'ios' && Application?.getIosIdForVendorAsync) {
      _cachedId = await Application.getIosIdForVendorAsync();
    }
  } catch {
    /* ignore */
  }
  if (!_cachedId) {
    if (AsyncStorage) {
      _cachedId = await AsyncStorage.getItem('geostride.deviceId');
      if (!_cachedId) {
        _cachedId = `dev-${Platform.OS}-${Date.now().toString(36)}-${Math.floor(
          Math.random() * 1e8
        ).toString(36)}`;
        await AsyncStorage.setItem('geostride.deviceId', _cachedId);
      }
    } else {
      _cachedId = `unknown-${Platform.OS}`;
    }
  }
  return _cachedId;
}

/** Human-readable device descriptor for audit logs. */
export function getDeviceDescriptor() {
  return {
    brand: Device?.brand ?? null,
    model: Device?.modelName ?? null,
    os: Platform.OS,
    osVersion: Device?.osVersion ?? null,
    isPhysical: Device?.isDevice ?? null,
  };
}

/** Best-effort public IP. Used for VPN heuristics and audit logging. */
export async function getPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const json = await res.json();
      if (json?.ip) return json.ip;
    }
  } catch {
    /* offline or blocked */
  }
  try {
    if (Network?.getIpAddressAsync) return await Network.getIpAddressAsync();
  } catch {
    /* ignore */
  }
  return null;
}
