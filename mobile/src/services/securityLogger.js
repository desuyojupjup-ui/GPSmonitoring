// ──────────────────────────────────────────────────────────────────────────
// Firestore write helpers for every security collection. All writes are
// best-effort and never throw to the caller (offline writes queue & sync
// automatically via the Firestore SDK).
// ──────────────────────────────────────────────────────────────────────────
import { collection, addDoc, serverTimestamp } from '../firebase';
import { db } from '../firebase';
import { SECURITY } from './securityConfig';

const C = SECURITY.COLLECTIONS;

async function safeAdd(name, data) {
  try {
    await addDoc(collection(db, name), { ...data, timestamp: serverTimestamp() });
  } catch (e) {
    // Never break attendance flow because logging failed.
    console.warn(`[securityLogger] write to ${name} failed:`, e?.message);
  }
}

/**
 * The canonical audit record. `report` is the object produced by
 * securityService.buildReport(). attendanceStatus is "Allowed" | "Blocked".
 */
export function writeSecurityLog(report, attendanceStatus, reason) {
  return safeAdd(C.SECURITY_LOGS, {
    employee_id: report.employeeId,
    employeeName: report.employeeName,
    deviceId: report.deviceId,
    latitude: report.latitude,
    longitude: report.longitude,
    accuracy: report.accuracy,
    ipAddress: report.ipAddress,
    vpnStatus: report.vpn,
    mockGpsStatus: report.mock,
    rootStatus: report.root,
    geofenceStatus: report.geofenceOk ? 'Inside' : 'Outside',
    attendanceStatus,
    aiRiskScore: report.aiRiskScore ?? null,
    reason: reason || null,
  });
}

export function writeAttendanceLog(report, action) {
  return safeAdd(C.ATTENDANCE_LOGS, {
    employee_id: report.employeeId,
    employeeName: report.employeeName,
    deviceId: report.deviceId,
    action, // 'time_in' | 'time_out'
    siteId: report.siteId ?? null,
    siteName: report.siteName ?? null,
    latitude: report.latitude,
    longitude: report.longitude,
    accuracy: report.accuracy,
    verified: report.passed === true,
  });
}

export function writeGeofenceEvent(report, type) {
  return safeAdd(C.GEOFENCE_EVENTS, {
    employee_id: report.employeeId,
    employeeName: report.employeeName,
    siteId: report.siteId ?? null,
    siteName: report.siteName ?? null,
    type, // 'violation' | 'exit' | 'enter'
    latitude: report.latitude,
    longitude: report.longitude,
    distanceToBoundary: report.distanceToBoundary ?? null,
  });
}

export function writeFraudReport(report, category, detail) {
  return safeAdd(C.FRAUD_REPORTS, {
    employee_id: report.employeeId,
    employeeName: report.employeeName,
    deviceId: report.deviceId,
    category, // 'vpn' | 'mock' | 'root' | 'speed' | 'inactivity' | 'site_exit'
    detail,
    latitude: report.latitude,
    longitude: report.longitude,
    resolved: false,
  });
}

export function writeGpsHistory(point) {
  return safeAdd(C.GPS_HISTORY, point);
}
