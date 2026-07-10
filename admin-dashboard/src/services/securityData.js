// Firestore + Functions helpers for the admin Security Dashboard.
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection, onSnapshot, doc, updateDoc, query, where,
} from 'firebase/firestore';
import { db } from '../firebase';

export const COLLECTIONS = {
  SECURITY_LOGS: 'security_logs',
  GPS_HISTORY: 'gps_history',
  AI_ANALYSIS: 'ai_analysis',
  DEVICE_REGISTRY: 'device_registry',
  FRAUD_REPORTS: 'fraud_reports',
  GEOFENCE_EVENTS: 'geofence_events',
};

/** Subscribe to a whole collection; returns the unsubscribe fn. */
export function subscribe(name, cb) {
  return onSnapshot(collection(db, name), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Approve or deny a pending device-change request. */
export async function setDeviceStatus(deviceDocId, status) {
  await updateDoc(doc(db, COLLECTIONS.DEVICE_REGISTRY, deviceDocId), { status });
}

/** Mark a fraud report resolved. */
export async function resolveFraudReport(id) {
  await updateDoc(doc(db, COLLECTIONS.FRAUD_REPORTS, id), { resolved: true });
}

/** Call the Claude-powered Cloud Function for one employee. */
export async function runFraudAnalysis(employeeId) {
  const fns = getFunctions(getApp());
  const callable = httpsCallable(fns, 'analyzeFraud');
  const res = await callable({ employeeId });
  return res.data;
}

/** Normalize a Firestore timestamp to a JS Date. */
export function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date(ts);
}

/** Bucket a list of {timestamp} docs into the last N days. */
export function dailyCounts(items, days = 7) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const count = items.filter((it) => {
      const t = toDate(it.timestamp);
      return t && t >= d && t < next;
    }).length;
    out.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), date: d, count });
  }
  return out;
}
