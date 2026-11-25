// ─────────────────────────────────────────────────────────────────────────────
// verificationScheduler.js
//
// Redesigned Facial Verification Coordinator (Requirements 7, 8 & 9):
//  - Removed mandatory 25–35 minute automatic random timer dependency so
//    admins can request verification on demand and employees are NEVER forced
//    to interact with the phone while actively driving.
//  - Exports driving-safety checks (`isEmployeeDriving`, `isSafeForVerification`)
//    used by HomeScreen when an Admin-initiated verification request arrives.
//  - Preserves exported session API signatures for backwards compatibility.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'geostride.verificationScheduler';

// > 4.2 m/s (~15 km/h) indicates vehicle movement / driving
export const DRIVING_SPEED_THRESHOLD_MS = 4.2;

let _promptCallback = null;
let _context = null;

/**
 * Returns true if the employee's current GPS speed indicates driving (> 15 km/h).
 */
export function isEmployeeDriving(speedMs = 0) {
  const s = Number(speedMs);
  return Number.isFinite(s) && s > DRIVING_SPEED_THRESHOLD_MS;
}

/**
 * Returns true only when it is safe to display a facial verification prompt
 * (employee is stationary / not actively driving).
 */
export function isSafeForVerification({ speedMs = 0, isMovingFast = false } = {}) {
  if (isMovingFast) return false;
  return !isEmployeeDriving(speedMs);
}

async function saveCtx(ctx) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch (_) {}
}

async function loadCtx() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function clearCtx() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

/**
 * Start session metadata tracking on check-in.
 * NOTE: Does NOT schedule automatic 30-minute random prompts — verification is
 * now driven by real-time Firestore Admin verification requests & safe-state checks.
 */
export async function startSession({ employee, assignment, attendanceId }) {
  const ctx = {
    sessionActive: true,
    companyId: employee?.companyId || assignment?.companyId || 'company_default',
    employeeId: employee?.id || null,
    employeeName: employee?.name || 'Employee',
    employeeEmail: employee?.email || '',
    employeeType: employee?.workType || employee?.employeeType || employee?.type || 'Employee',
    assignmentId: assignment?.id || null,
    siteId: assignment?.siteId || assignment?.site_id || null,
    attendanceId: attendanceId || null,
    startedAt: Date.now(),
    lastKnownLatitude: null,
    lastKnownLongitude: null,
    lastSpeedMs: 0,
  };
  _context = ctx;
  await saveCtx(ctx);
}

/**
 * Stop session metadata tracking on check-out or sign-out.
 */
export async function stopSession() {
  if (_context) {
    _context.sessionActive = false;
  }
  await clearCtx();
  _context = null;
}

export function isSchedulerActive() {
  return Boolean(_context && _context.sessionActive);
}

/**
 * Trigger verification prompt when explicitly requested by Admin (only if safe).
 */
export function triggerPromptNow(requestDoc = null, speedMs = 0) {
  if (!isSafeForVerification({ speedMs })) {
    return { deferred: true, reason: 'driving' };
  }
  if (_promptCallback) {
    _promptCallback({
      triggerType: requestDoc ? 'admin_request' : 'manual',
      verificationRequest: requestDoc,
    });
  }
  return { deferred: false };
}

export async function markPromptAnswered() {
  const ctx = _context || (await loadCtx());
  if (!ctx) return;
  ctx.lastAnsweredAt = Date.now();
  _context = ctx;
  await saveCtx(ctx);
}

export async function updateLastKnownLocation(lat, lng, speedMs = 0) {
  const ctx = _context || (await loadCtx());
  if (!ctx) return;
  ctx.lastKnownLatitude = lat;
  ctx.lastKnownLongitude = lng;
  ctx.lastSpeedMs = Number(speedMs) || 0;
  _context = ctx;
  await saveCtx(ctx);
}

export function onPromptReady(callback) {
  _promptCallback = callback;
}

export async function restoreSession(onPromptReadyCb) {
  const ctx = await loadCtx();
  if (ctx && ctx.sessionActive) {
    _context = ctx;
    if (onPromptReadyCb) _promptCallback = onPromptReadyCb;
  }
}
