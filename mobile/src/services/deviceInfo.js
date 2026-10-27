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
  const fetchWithTimeout = async (url, timeoutMs = 3500) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // 1. Try ipify
  const ipifyData = await fetchWithTimeout('https://api.ipify.org?format=json');
  if (ipifyData?.ip) return ipifyData.ip;

  // 2. Try ip-api
  const ipApiData = await fetchWithTimeout('http://ip-api.com/json/?fields=query');
  if (ipApiData?.query) return ipApiData.query;

  // 3. Try db-ip
  const dbIpData = await fetchWithTimeout('https://api.db-ip.com/v2/free/self');
  if (dbIpData?.ipAddress) return dbIpData.ipAddress;

  // 4. Try ipwhois
  const ipwhoData = await fetchWithTimeout('https://ipwho.is/');
  if (ipwhoData?.ip) return ipwhoData.ip;

  return null;
}

/** Get local device IP from expo-network (e.g. 192.168.x.x or 10.x.x.x) */
export async function getLocalIp() {
  try {
    if (Network?.getIpAddressAsync) return await Network.getIpAddressAsync();
  } catch {
    /* ignore */
  }
  return null;
}

