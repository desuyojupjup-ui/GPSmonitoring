// ──────────────────────────────────────────────────────────────────────────
// Mock / fake-GPS detection.
//   Signal 1: expo-location coords.mocked (Android exposes this per-fix).
//   Signal 2: jail-monkey.isMockLocationEnabled() (developer "Allow mock
//             locations" toggle / a mock-location app is installed & selected).
// Returns { mocked: boolean, reason: string }.
// ──────────────────────────────────────────────────────────────────────────

// Static require — Metro bundler does NOT support dynamic require(variableName).
let JailMonkey = null;
try {
  const mod = require('jail-monkey');
  JailMonkey = mod?.default || mod;
} catch { /* not available outside dev build */ }

/**
 * @param {object} coords  the coords object from a Location fix (may include `mocked`)
 */
export async function detectMockLocation(coords = {}) {
  // Per-fix flag (most reliable, Android).
  if (coords.mocked === true) {
    return {
      mocked: true,
      reason: 'The GPS reading was produced by a mock-location app.',
    };
  }


  try {
    if (JailMonkey?.isMockLocationEnabled) {
      const enabled = await Promise.resolve(JailMonkey.isMockLocationEnabled());
      if (enabled) {
        return {
          mocked: true,
          reason: 'Mock-location mode is enabled in your device developer settings.',
        };
      }
    }
  } catch {
    /* ignore */
  }

  return { mocked: false, reason: 'No mock-location source detected.' };
}
