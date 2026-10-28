// ──────────────────────────────────────────────────────────────────────────
// Mock / fake-GPS detection.
//   Signal 1: expo-location coords.mocked (Android exposes this per-fix).
//   Signal 2: jail-monkey.isMockLocationEnabled() (developer "Allow mock
//             locations" toggle / a mock-location app is installed & selected).
// Returns { mocked: boolean, reason: string }.
// ──────────────────────────────────────────────────────────────────────────

/**
 * @param {object} coords  the coords object from a Location fix (may include `mocked`)
 */
export async function detectMockLocation(coords = {}) {
  // Per-fix flag (most reliable, provided natively by Android OS via expo-location).
  if (coords.mocked === true) {
    return {
      mocked: true,
      reason: 'The GPS reading was produced by a mock-location app.',
    };
  }

  return { mocked: false, reason: 'No mock-location source detected.' };
}
