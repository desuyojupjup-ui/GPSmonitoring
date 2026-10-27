// ──────────────────────────────────────────────────────────────────────────
// Root (Android) / Jailbreak (iOS) detection via jail-monkey (native module,
// present in a dev build). Also surfaces "on external storage" and hook
// detection where available. Returns { compromised, jailBroken, reason }.
// ──────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';

// Static require — Metro bundler does NOT support dynamic require(variableName).
let JailMonkey = null;
try {
  const mod = require('jail-monkey');
  JailMonkey = mod?.default || mod;
} catch { /* not available outside dev build */ }

export function detectRootOrJailbreak() {
  if (!JailMonkey) {
    return {
      compromised: false,
      jailBroken: false,
      reason: 'Integrity module unavailable (running outside a dev build).',
      checked: false,
    };
  }
  try {
    const jailBroken = !!JailMonkey.isJailBroken?.();
    const onExternalStorage = !!JailMonkey.isOnExternalStorage?.();
    const hookDetected = !!JailMonkey.hookDetected?.();
    const compromised = jailBroken || hookDetected;
    return {
      compromised,
      jailBroken,
      onExternalStorage,
      hookDetected,
      checked: true,
      reason: compromised
        ? Platform.OS === 'ios'
          ? 'This device appears to be jailbroken.'
          : 'This device appears to be rooted or running a tampered system.'
        : 'Device integrity verified.',
    };
  } catch (e) {
    return {
      compromised: false,
      jailBroken: false,
      reason: 'Integrity check failed to run.',
      checked: false,
    };
  }
}
