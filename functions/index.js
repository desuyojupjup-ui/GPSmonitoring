// ──────────────────────────────────────────────────────────────────────────
// GeoStride — AI-powered fraud analysis Cloud Function.
//
// `analyzeFraud` is a callable function that:
//   1. Pulls a slice of the employee's gps_history, attendance_logs and
//      security_logs (server-side, admin SDK — bypasses client rules).
//   2. Sends a compact summary to Claude (claude-opus-4-8) and asks for a
//      strict JSON risk assessment via output_config.format (json_schema).
//   3. Persists the result to ai_analysis and returns it to the caller.
//
// The Anthropic API key lives ONLY here (process.env.ANTHROPIC_API_KEY) and is
// never shipped in the mobile/web bundle. Requires the Blaze plan.
// ──────────────────────────────────────────────────────────────────────────
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

initializeApp();
const db = getFirestore();

const MODEL = 'claude-opus-4-8';

// Strict JSON schema Claude must conform to.
const RISK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    riskScore: { type: 'integer', description: '0 (clear) to 100 (critical fraud risk)' },
    riskLevel: { type: 'string', enum: ['Clear', 'Low', 'Medium', 'High'] },
    anomalies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['type', 'detail', 'severity'],
      },
    },
    explanation: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['riskScore', 'riskLevel', 'anomalies', 'explanation', 'recommendations'],
};

async function recentDocs(collection, employeeId, limit) {
  // Ordering by timestamp desc; falls back gracefully if the index is still building.
  try {
    const snap = await db
      .collection(collection)
      .where('employee_id', '==', employeeId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data());
  } catch {
    const snap = await db
      .collection(collection)
      .where('employee_id', '==', employeeId)
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data());
  }
}

function ts(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  return v;
}

function summarize(history, attendance, security) {
  return {
    gpsHistory: history.map((h) => ({
      at: ts(h.timestamp),
      lat: h.latitude,
      lng: h.longitude,
      accuracy: h.accuracy,
      mocked: !!h.mocked,
    })),
    attendance: attendance.map((a) => ({
      at: ts(a.timestamp),
      action: a.action,
      site: a.siteName,
      verified: a.verified,
      accuracy: a.accuracy,
    })),
    securityEvents: security.map((s) => ({
      at: ts(s.timestamp),
      status: s.attendanceStatus,
      vpn: s.vpnStatus,
      mock: s.mockGpsStatus,
      root: s.rootStatus,
      geofence: s.geofenceStatus,
      reason: s.reason,
    })),
  };
}

export const analyzeFraud = onCall(
  { secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }
    const employeeId = request.data?.employeeId;
    if (!employeeId) {
      throw new HttpsError('invalid-argument', 'employeeId is required.');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY is not configured.');
    }

    const [history, attendance, security] = await Promise.all([
      recentDocs('gps_history', employeeId, 60),
      recentDocs('attendance_logs', employeeId, 30),
      recentDocs('security_logs', employeeId, 40),
    ]);

    const payload = summarize(history, attendance, security);
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt =
      'You are a GPS attendance fraud analyst. Given an employee\'s recent location ' +
      'history, attendance records, and security events, assess the likelihood of ' +
      'attendance fraud or location spoofing. Consider: mock-GPS or VPN flags, ' +
      'rooted devices, impossible travel speeds, geofence violations, suspicious ' +
      'timing, and inconsistent accuracy. Be precise and avoid false alarms — a ' +
      'clean record should score low. Output ONLY the structured result.';

    let result;
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        output_config: { format: { type: 'json_schema', schema: RISK_SCHEMA } },
        messages: [
          {
            role: 'user',
            content:
              'Analyze this employee activity for attendance fraud and produce a risk ' +
              'assessment.\n\n' +
              JSON.stringify(payload),
          },
        ],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      result = JSON.parse(textBlock.text);
    } catch (e) {
      console.error('Claude analysis failed:', e);
      throw new HttpsError('internal', `AI analysis failed: ${e.message}`);
    }

    // Persist for the dashboard + employee status screen.
    await db.collection('ai_analysis').add({
      employee_id: employeeId,
      ...result,
      sampleSizes: {
        gps: history.length,
        attendance: attendance.length,
        security: security.length,
      },
      model: MODEL,
      timestamp: FieldValue.serverTimestamp(),
    });

    return result;
  }
);
