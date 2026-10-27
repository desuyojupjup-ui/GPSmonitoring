// ──────────────────────────────────────────────────────────────────────────
// GPS quality + consistency validation.
//   - accuracy gate (> MAX_ACCURACY_M → reject)
//   - consistency over the last N readings (impossible jumps)
//   - speed validation between consecutive fixes (impossible travel)
// ──────────────────────────────────────────────────────────────────────────
import { SECURITY } from './securityConfig';
import { getDistanceMeters, speedKmh } from '../utils/geo';

/** @returns {{ ok:boolean, accuracy:number, reason:string }} */
export function validateAccuracy(coords) {
  const accuracy = coords?.accuracy ?? Infinity;
  if (accuracy > SECURITY.MAX_ACCURACY_M) {
    return {
      ok: false,
      accuracy,
      reason: `GPS accuracy is ±${Math.round(accuracy)}m. High-accuracy mode (≤${SECURITY.MAX_ACCURACY_M}m) is required.`,
    };
  }
  return { ok: true, accuracy, reason: 'GPS accuracy is within range.' };
}

/**
 * Compare the last few readings for unrealistic jumps / speeds.
 * @param {Array<{latitude,longitude,timestamp}>} readings  oldest → newest
 * @returns {{ ok:boolean, maxSpeedKmh:number, maxJumpM:number, reason:string }}
 */
export function validateConsistency(readings = []) {
  const recent = readings.slice(-SECURITY.CONSISTENCY_SAMPLE);
  if (recent.length < 2) {
    return { ok: true, maxSpeedKmh: 0, maxJumpM: 0, reason: 'Not enough samples to compare.' };
  }
  let maxSpeed = 0;
  let maxJump = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const cur = recent[i];
    const jump = getDistanceMeters(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
    const v = speedKmh(prev, cur);
    maxJump = Math.max(maxJump, jump);
    maxSpeed = Math.max(maxSpeed, v);
  }
  if (maxSpeed > SECURITY.MAX_HUMAN_SPEED_KMH) {
    return {
      ok: false,
      maxSpeedKmh: maxSpeed,
      maxJumpM: maxJump,
      reason: `Impossible travel speed detected (${Math.round(maxSpeed)} km/h).`,
    };
  }
  if (maxJump > SECURITY.MAX_WALKING_JUMP_M) {
    return {
      ok: false,
      maxSpeedKmh: maxSpeed,
      maxJumpM: maxJump,
      reason: `Your location jumped ${Math.round(maxJump)}m unrealistically between readings.`,
    };
  }
  return { ok: true, maxSpeedKmh: maxSpeed, maxJumpM: maxJump, reason: 'Location readings are consistent.' };
}

/** Single-pair speed check used by the background monitor. */
export function validateSpeed(prev, cur) {
  if (!prev || !cur) return { ok: true, speedKmh: 0 };
  const v = speedKmh(prev, cur);
  return {
    ok: v <= SECURITY.MAX_HUMAN_SPEED_KMH,
    speedKmh: v,
    reason:
      v > SECURITY.MAX_HUMAN_SPEED_KMH
        ? `Suspicious travel speed: ${Math.round(v)} km/h`
        : 'Speed within normal range.',
  };
}
