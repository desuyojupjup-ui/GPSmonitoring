// ─────────────────────────────────────────────────────────────────────────────
// verificationScheduler.js
// Randomized facial verification prompt scheduler for active shift sessions.
//
// - Starts when employee checks in, stops when employee checks out.
// - Prompts at a random interval between 25–35 minutes.
// - On missed prompt (ignored for > PROMPT_EXPIRE_MS): writes a 'missed'
//   record to Firestore and creates an admin notification.
// - Persists state to AsyncStorage so it survives app backgrounding.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, collection, addDoc, serverTimestamp } from '../firebase';

const SESSION_KEY = 'geostride.verificationScheduler';
const MIN_INTERVAL_MS = 25 * 60 * 1000;   // 25 minutes
const MAX_INTERVAL_MS = 35 * 60 * 1000;   // 35 minutes
const PROMPT_EXPIRE_MS = 30 * 60 * 1000;  // 30 minutes before treating as missed

let _interval = null;
let _promptCallback = null;
let _context = null;

function randomInterval() {
  return Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1)) + MIN_INTERVAL_MS;
}

async function saveCtx(ctx) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch (e) {}
}

async function loadCtx() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function clearCtx() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

async function writeMissedRecord(ctx) {
  try {
    const verificationId = `VID-MISSED-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      verificationId,
      employeeId: ctx.employeeId || 'emp_fallback',
      employeeName: ctx.employeeName || 'Employee',
      employeeEmail: ctx.employeeEmail || '',
      assignmentId: ctx.assignmentId || 'asgn-001',
      siteId: ctx.siteId || 'site-main',
      employeeType: ctx.employeeType || 'Field Employee',
      capturedImageUrl: null,
      verificationResult: 'missed',
      confidenceScore: 0,
      verificationStatus: 'missed',
      latitude: ctx.lastKnownLatitude || 0,
      longitude: ctx.lastKnownLongitude || 0,
      locationAccuracy: 0,
      triggerType: 'scheduled_random',
      attendanceId: ctx.attendanceId || null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      adminNotes: 'Employee did not respond to verification prompt.',
    };

    await addDoc(collection(db, 'facial_verifications'), {
      ...record,
      timestamp: serverTimestamp(),
    });

    // Admin notification
    await addDoc(collection(db, 'notifications'), {
      type: 'admin',
      title: 'Missed Verification',
      message: `${ctx.employeeName || 'An employee'} missed a scheduled facial verification prompt.`,
      employeeId: ctx.employeeId,
      employeeName: ctx.employeeName,
      verificationId,
      timestamp: serverTimestamp(),
      read: false,
    });
  } catch (e) {
    console.warn('[verificationScheduler] writeMissedRecord error:', e?.message);
  }
}

async function tick() {
  const ctx = _context || (await loadCtx());
  if (!ctx || !ctx.sessionActive) return;

  const now = Date.now();

  // Check if a prompt is pending and has been ignored for too long
  if (ctx.pendingPromptAt && !ctx.pendingAnswered) {
    const elapsed = now - ctx.pendingPromptAt;
    if (elapsed > PROMPT_EXPIRE_MS) {
      // Mark as missed
      await writeMissedRecord(ctx);
      ctx.pendingPromptAt = null;
      ctx.pendingAnswered = false;
      ctx.nextPromptAt = now + randomInterval();
      await saveCtx(ctx);
      _context = ctx;
      return;
    }
    // Still waiting for employee to respond
    return;
  }

  // Check if it's time for the next prompt
  if (ctx.nextPromptAt && now >= ctx.nextPromptAt) {
    ctx.pendingPromptAt = now;
    ctx.pendingAnswered = false;
    await saveCtx(ctx);
    _context = ctx;

    if (_promptCallback) {
      _promptCallback({ triggerType: 'scheduled_random' });
    }
  }
}

/**
 * Start a new verification session when the employee checks in.
 */
export async function startSession({ employee, assignment, attendanceId }) {
  stopSession(); // clear any existing interval

  const now = Date.now();
  const ctx = {
    sessionActive: true,
    employeeId: employee?.id || 'emp_fallback',
    employeeName: employee?.name || 'Employee',
    employeeEmail: employee?.email || '',
    employeeType: employee?.employeeType || employee?.type || 'Field Employee',
    assignmentId: assignment?.id || 'asgn-001',
    siteId: assignment?.siteId || assignment?.site_id || 'site-main',
    attendanceId: attendanceId || null,
    startedAt: now,
    nextPromptAt: now + randomInterval(),
    pendingPromptAt: null,
    pendingAnswered: false,
    lastKnownLatitude: 0,
    lastKnownLongitude: 0,
  };

  _context = ctx;
  await saveCtx(ctx);

  // Poll every 30 seconds
  if (_interval) clearInterval(_interval);
  _interval = setInterval(tick, 30 * 1000);
}

/**
 * Stop the session (employee checked out or signed out).
 */
export async function stopSession() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  if (_context) {
    _context.sessionActive = false;
  }
  await clearCtx();
  _context = null;
}

/**
 * Check if a random verification scheduler session is currently active.
 */
export function isSchedulerActive() {
  return Boolean(_context && _context.sessionActive);
}

/**
 * Manually trigger the random selfie prompt immediately (for testing or supervisor prompt).
 */
export function triggerPromptNow() {
  if (_promptCallback) {
    _promptCallback({ triggerType: 'scheduled_random' });
  }
}

/**
 * Call this when the employee completes OR dismisses a prompt.
 */
export async function markPromptAnswered() {
  const ctx = _context || (await loadCtx());
  if (!ctx) return;

  ctx.pendingPromptAt = null;
  ctx.pendingAnswered = true;
  ctx.nextPromptAt = Date.now() + randomInterval();
  _context = ctx;
  await saveCtx(ctx);
}

/**
 * Update the employee's last known GPS coordinates (used for missed record).
 */
export async function updateLastKnownLocation(lat, lng) {
  const ctx = _context || (await loadCtx());
  if (!ctx) return;
  ctx.lastKnownLatitude = lat;
  ctx.lastKnownLongitude = lng;
  _context = ctx;
  await saveCtx(ctx);
}

/**
 * Register a callback to be invoked when a verification prompt is due.
 * callback({ triggerType: 'scheduled_random' })
 */
export function onPromptReady(callback) {
  _promptCallback = callback;
}

/**
 * Restore scheduler state from AsyncStorage when the app re-opens.
 * Call this in App.js or HomeScreen on mount.
 */
export async function restoreSession(onPromptReadyCb) {
  const ctx = await loadCtx();
  if (ctx && ctx.sessionActive) {
    _context = ctx;
    if (onPromptReadyCb) _promptCallback = onPromptReadyCb;
    if (!_interval) {
      _interval = setInterval(tick, 30 * 1000);
    }
    // Immediately check if prompt is due
    tick();
  }
}
