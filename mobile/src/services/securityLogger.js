// ──────────────────────────────────────────────────────────────────────────
// Firestore write helpers for every security collection. All writes are
// best-effort and never throw to the caller (offline writes queue & sync
// automatically via the Firestore SDK / offline AsyncStorage fallback).
// ──────────────────────────────────────────────────────────────────────────
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, ensureAuthenticatedSession } from '../firebase';
import { db } from '../firebase';
import { SECURITY } from './securityConfig';
import { getSeverityForEventType, describeEvent } from './securityRiskScorer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queueOfflineRecord } from './offlineSyncService';
import { hasActiveShiftSchedule } from '../utils/assignmentUtils';

const C = SECURITY.COLLECTIONS;

// ── Deduplication key — prevents identical events within a 60-second window ──
const _recentEventKeys = new Map();
function isDuplicate(key) {
  const last = _recentEventKeys.get(key);
  if (last && Date.now() - last < 60000) return true;
  _recentEventKeys.set(key, Date.now());
  return false;
}

// ── Map event type to AI Anomaly Detection Center category ──────────────────
export function getAnomalyHumanType(eventType) {
  const map = {
    GPS_SPEED_ANOMALY: 'Velocity Speed Discrepancy',
    GPS_JUMP: 'Velocity Jump Discrepancy',
    SUSPICIOUS_MOVEMENT: 'Velocity Inconsistency',
    UNAUTHORIZED_LOCATION: 'Geofence Boundary Violation',
    OVERTIME_SHIFT_EXCEEDED: 'Unscheduled Overtime / Shift Exceeded',
    EARLY_CHECKOUT: 'Early Shift Departure / Early Check-Out',
    LOCATION_FROZEN: 'Idle Inactivity Anomaly',
    REPEATED_FACIAL_VERIFICATION_FAILURE: 'Biometric Face Verification Failure',
    FAKE_GPS_DETECTED: 'Mock GPS Fake Location',
    VPN_DETECTED: 'VPN Proxy Tunnel',
    DEVICE_INTEGRITY_VIOLATION: 'Device Integrity Breach',
    GPS_DISABLED: 'Location Tracking Disabled',
    LOCATION_TRACKING_DISABLED: 'Location Tracking Disabled',
    TRAVEL_TIME_EXCEEDED: 'Travel Time Exceeded',
    LOCATION_UPDATE_INTERRUPTED: 'Telemetry Interrupted',
    UNUSUAL_GPS_ACCURACY: 'GPS Accuracy Degradation',
    MULTIPLE_SECURITY_SIGNALS: 'Multiple Anomaly Signals',
  };
  return map[eventType] || (eventType ? eventType.replace(/_/g, ' ') : 'Security Anomaly');
}

export function getAnomalyConfidence(eventType) {
  const map = {
    FAKE_GPS_DETECTED: '99%',
    DEVICE_INTEGRITY_VIOLATION: '98%',
    REPEATED_FACIAL_VERIFICATION_FAILURE: '96%',
    OVERTIME_SHIFT_EXCEEDED: '96%',
    EARLY_CHECKOUT: '95%',
    UNAUTHORIZED_LOCATION: '95%',
    GPS_SPEED_ANOMALY: '94%',
    GPS_JUMP: '93%',
    VPN_DETECTED: '92%',
    LOCATION_FROZEN: '91%',
    GPS_DISABLED: '95%',
    LOCATION_TRACKING_DISABLED: '100%',
    TRAVEL_TIME_EXCEEDED: '95%',
  };
  return map[eventType] || '90%';
}

async function safeAdd(name, data) {
  try {
    const ref = await addDoc(collection(db, name), { ...data, timestamp: serverTimestamp() });
    return ref?.id || null;
  } catch (e) {
    console.warn(`[securityLogger] write to ${name} failed — queuing offline:`, e?.message);
    try {
      await queueOfflineRecord(name, data);
    } catch (_) {}
    return null;
  }
}

// ── CANONICAL: Write a full security & AI anomaly document ─────────────────
/**
 * @param {object} params
 * @param {string} params.eventType      - e.g. 'FAKE_GPS_DETECTED'
 * @param {object} params.employee       - { id, name, email, employeeType }
 * @param {object} params.assignment     - { id, name, siteId, siteName, destinationId }
 * @param {object} params.coords         - { latitude, longitude, accuracy }
 * @param {object} [params.prevCoords]   - { latitude, longitude, timestamp }
 * @param {object} [params.deviceInfo]   - { deviceId, os, model, ipAddress }
 * @param {string} [params.relatedVerificationId]
 * @param {string} [params.relatedAttendanceId]
 * @param {string} [params.customDescription]
 * @param {object} [params.extra]        - extra fields for describeEvent
 * @returns {Promise<string|null>} Firestore doc ID or null
 */
export async function writeSecurityEvent(params) {
  const {
    eventType,
    employee = {},
    assignment = {},
    coords = {},
    prevCoords = null,
    deviceInfo = {},
    relatedVerificationId = null,
    relatedAttendanceId = null,
    customDescription = null,
    extra = {},
  } = params;

  // 1. Shift Schedule Enforcement: Only alert anomaly if the employee has an active scheduled shift
  // (Prevents unnecessary data storage & false alerts when employee has no scheduled shift)
  let hasSchedule = hasActiveShiftSchedule(assignment, employee);
  let resolvedCompanyId = employee?.companyId || assignment?.companyId || null;
  if ((!hasSchedule || !resolvedCompanyId) && employee?.id) {
    try {
      const snap = await getDoc(doc(db, 'employees', employee.id)).catch(() => null);
      if (snap && snap.exists()) {
        const d = snap.data();
        if (!resolvedCompanyId && d.companyId) resolvedCompanyId = d.companyId;
        if (!hasSchedule) hasSchedule = hasActiveShiftSchedule(assignment, { ...employee, ...d });
      }
    } catch (_) {}
  }
  const companyId = resolvedCompanyId || 'company_default';

  if (!hasSchedule && eventType !== 'OVERTIME_SHIFT_EXCEEDED' && eventType !== 'EARLY_CHECKOUT') {
    console.log(`[securityLogger] Suppressed ${eventType} anomaly: Employee ${employee.name || employee.id || ''} has no active shift schedule today.`);
    return null;
  }

  // Dedup: same employee + same event within 60s
  const dedupKey = `${employee.id || 'emp'}_${eventType}`;
  if (isDuplicate(dedupKey)) {
    console.log(`[securityLogger] Duplicate event skipped: ${dedupKey}`);
    return null;
  }

  // Outside assigned geofence anomalies apply ONLY to Fixed Site Employees, NOT Field Employees
  const empWorkType = (employee.workType || employee.employeeType || employee.type || '').toString().toLowerCase();
  const isFieldEmp = empWorkType.includes('mobile') || empWorkType.includes('field');
  if (isFieldEmp && (eventType === 'UNAUTHORIZED_LOCATION' || (eventType && eventType.includes('GEOFENCE')))) {
    console.log(`[securityLogger] Suppressed geofence anomaly for field employee: ${employee.name || employee.id}`);
    return null;
  }

  // Ensure authenticated Firebase session before performing Firestore writes
  try {
    await ensureAuthenticatedSession();
  } catch (authErr) {
    console.warn('[securityLogger] ensureAuthenticatedSession warning:', authErr?.message);
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const dateStr = now.split('T')[0];
  const timeStr = nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const rawSeverity = getSeverityForEventType(eventType);
  const severity = rawSeverity === 'Critical' ? 'High' : (rawSeverity || 'Medium');
  const description = customDescription || describeEvent(eventType, extra);
  const humanType = getAnomalyHumanType(eventType);
  const confidence = getAnomalyConfidence(eventType);
  const locationStr = assignment.siteName || assignment.name || (coords.latitude ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Unavailable');

  // Factual operational events (e.g. Location Tracking Disabled, Travel Time Exceeded)
  // are NOT fraud accusations and must NOT be written to fraud_reports.
  const isOperationalNonFraud = (
    eventType === 'LOCATION_TRACKING_DISABLED' ||
    eventType === 'GPS_DISABLED' ||
    eventType === 'TRAVEL_TIME_EXCEEDED' ||
    eventType === 'OVERTIME_SHIFT_EXCEEDED' ||
    eventType === 'EARLY_CHECKOUT'
  );

  const anomalyDoc = {
    companyId,
    employeeId: employee.id || null,
    employeeName: employee.name || 'Employee',
    employeeEmail: employee.email || null,
    employeeType: employee.workType || employee.employeeType || employee.type || 'Employee',

    type: humanType,
    eventType: eventType,
    severity: severity,
    confidence: confidence,
    status: 'Active',
    isFraudAccusation: !isOperationalNonFraud,
    description: description,
    location: locationStr,

    assignmentId: assignment.id || null,
    assignmentName: assignment.name || null,
    siteId: assignment.siteId || null,
    siteName: assignment.siteName || null,
    destinationId: assignment.destinationId || null,

    latitude: coords.latitude ?? null,
    longitude: coords.longitude ?? null,
    locationAccuracy: coords.accuracy ?? null,

    ...(extra && typeof extra === 'object' ? {
      reason: extra.reason || null,
      lastKnownLocation: extra.lastKnownLocation || null,
      origin: extra.origin || null,
      destination: extra.destination || null,
      expectedArrival: extra.expectedArrival || null,
      actualCurrentTime: extra.actualCurrentTime || null,
      elapsedMinutes: extra.elapsedMinutes ?? null,
      allowedWindowMinutes: extra.allowedWindowMinutes ?? null,
    } : {}),

    previousLatitude: prevCoords?.latitude ?? null,
    previousLongitude: prevCoords?.longitude ?? null,
    previousTimestamp: prevCoords?.timestamp ?? null,
    currentTimestamp: now,

    relatedVerificationId: relatedVerificationId || null,
    relatedAttendanceId: relatedAttendanceId || null,

    deviceId: deviceInfo.deviceId || null,
    deviceModel: deviceInfo.model || null,
    deviceInformation: {
      deviceId: deviceInfo.deviceId || null,
      os: deviceInfo.os || null,
      model: deviceInfo.model || null,
      ipAddress: deviceInfo.ipAddress || null,
    },

    source: 'mobile_apk',
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
    adminNotes: '',
  };

  // 1. PRIMARY: Write directly to ai_analysis (Direct connection to Admin AI Anomaly Center)
  const anomalyId = await safeAdd(C.AI_ANALYSIS || 'ai_analysis', anomalyDoc);

  // 2. AUDIT: Write to ActivityLogs (Displayed in Admin Activity Logs)
  await safeAdd('ActivityLogs', {
    companyId,
    type: isOperationalNonFraud ? 'Location Monitoring' : 'Security Anomaly',
    action: humanType,
    title: isOperationalNonFraud ? humanType : `AI Anomaly: ${humanType}`,
    description: `${humanType} recorded for ${employee.name || 'Employee'}. ${description}`,
    employeeId: employee.id || null,
    employee_id: employee.id || null,
    employeeName: employee.name || 'Employee',
    employeeEmail: employee.email || null,
    severity: severity,
    anomalyId: anomalyId || null,
    latitude: coords.latitude ?? null,
    longitude: coords.longitude ?? null,
    location: locationStr,
    source: 'mobile_apk',
    status: severity === 'High' ? 'Warning' : 'Info',
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // 3. Fraud Reports ONLY for genuine anti-spoofing / security violations (NEVER for GPS disabled or operational events)
  if (!isOperationalNonFraud) {
    await safeAdd(C.FRAUD_REPORTS, {
      companyId,
      employeeId: employee.id || null,
      employeeName: employee.name || 'Employee',
      employeeEmail: employee.email || null,
      violationType: humanType,
      eventType: eventType,
      severity: severity,
      status: 'pending_review',
      description: description,
      latitude: coords.latitude ?? null,
      longitude: coords.longitude ?? null,
      deviceId: deviceInfo.deviceId || null,
      deviceModel: deviceInfo.model || null,
      ipAddress: deviceInfo.ipAddress || null,
      assignmentId: assignment.id || null,
      siteId: assignment.siteId || null,
      relatedAnomalyId: anomalyId,
      resolved: false,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    try {
      await safeAdd(C.SECURITY_EVENTS, { ...anomalyDoc, relatedAnomalyId: anomalyId });
    } catch (_) {}
  }

  // 4. Persistent Admin Notification (with full metadata + companyId)
  try {
    await writeAdminNotification({
      eventType,
      eventId: anomalyId,
      employee,
      companyId,
      severity,
      description,
      dateStr,
      timeStr,
    });
  } catch (_) {}

  return anomalyId;
}

// ── Admin notification ─────────────────────────────────────────────────────
async function writeAdminNotification({ eventType, eventId, employee, companyId, severity, description, dateStr, timeStr }) {
  const typeLabels = {
    FAKE_GPS_DETECTED: 'Fake GPS Detected',
    VPN_DETECTED: 'VPN Usage Detected',
    DEVICE_INTEGRITY_VIOLATION: 'Device Integrity Violation',
    GPS_SPEED_ANOMALY: 'GPS Speed Anomaly',
    GPS_JUMP: 'Suspicious Location Jump',
    LOCATION_FROZEN: 'Location Frozen',
    GPS_DISABLED: 'Location Tracking Disabled',
    LOCATION_TRACKING_DISABLED: 'Location Tracking Disabled',
    TRAVEL_TIME_EXCEEDED: 'Travel Time Exceeded',
    UNAUTHORIZED_LOCATION: 'Unauthorized Location',
    OVERTIME_SHIFT_EXCEEDED: 'Late Checkout / Shift Exceeded',
    EARLY_CHECKOUT: 'Early Checkout Detected',
    REPEATED_FACIAL_VERIFICATION_FAILURE: 'Repeated Facial Verification Failure',
    MULTIPLE_SECURITY_SIGNALS: 'Multiple Security Signals Detected',
    SUSPICIOUS_MOVEMENT: 'Suspicious Movement',
  };
  const label = typeLabels[eventType] || eventType.replace(/_/g, ' ');
  const nowDate = new Date();

  return safeAdd(C.NOTIFICATIONS, {
    companyId: companyId || employee?.companyId || 'company_default',
    type: 'admin_security_alert',
    notificationType: eventType,
    targetRole: 'admin',
    title: label,
    message: `${label} — ${employee.name || 'Employee'}: ${description}`,
    employeeId: employee.id || null,
    employeeName: employee.name || null,
    severity: severity || 'Medium',
    relatedRecordId: eventId || null,
    relatedSecurityEventId: eventId || null,
    anomalyId: eventId || null,
    eventType,
    date: dateStr || nowDate.toISOString().split('T')[0],
    time: timeStr || nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
    status: 'Unread',
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ── Employee notification ──────────────────────────────────────────────────
export function writeEmployeeNotification({ employee, companyId, title, message, relatedRecordId = null, severity = 'Info' }) {
  const nowDate = new Date();
  return safeAdd(C.NOTIFICATIONS, {
    companyId: companyId || employee?.companyId || 'company_default',
    type: 'employee',
    notificationType: 'employee_alert',
    targetRole: 'employee',
    employeeId: employee?.id || null,
    employeeName: employee?.name || null,
    title,
    message,
    severity,
    relatedRecordId,
    date: nowDate.toISOString().split('T')[0],
    time: nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
    status: 'Unread',
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ── Legacy: keep existing callers working ─────────────────────────────────
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
    action,
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
    type,
    latitude: report.latitude,
    longitude: report.longitude,
    distanceToBoundary: report.distanceToBoundary ?? null,
  });
}

export function writeFraudReport(report, category, detail) {
  // Legacy wrapper — now also writes a security_events record
  const eventTypeMap = {
    vpn: 'VPN_DETECTED',
    mock: 'FAKE_GPS_DETECTED',
    root: 'DEVICE_INTEGRITY_VIOLATION',
    speed: 'GPS_SPEED_ANOMALY',
    inactivity: 'LOCATION_FROZEN',
    site_exit: 'UNAUTHORIZED_LOCATION',
  };
  writeSecurityEvent({
    eventType: eventTypeMap[category] || 'SUSPICIOUS_MOVEMENT',
    employee: { id: report.employeeId, name: report.employeeName },
    coords: { latitude: report.latitude, longitude: report.longitude, accuracy: report.accuracy },
    deviceInfo: { deviceId: report.deviceId, ipAddress: report.ipAddress },
    customDescription: detail,
  });
  return safeAdd(C.FRAUD_REPORTS, {
    employee_id: report.employeeId,
    employeeName: report.employeeName,
    deviceId: report.deviceId,
    category,
    detail,
    latitude: report.latitude,
    longitude: report.longitude,
    resolved: false,
  });
}

export function writeGpsHistory(point) {
  return safeAdd(C.GPS_HISTORY, point);
}
