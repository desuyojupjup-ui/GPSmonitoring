// ─────────────────────────────────────────────────────────────
// AI Anomaly -> Persistent Notifications bridge & Active-Shift Geofence Supervisor
// 1. Watches `ai_analysis` collection and creates persistent docs
//    in `notifications` so anomaly alerts show in TopNav bell,
//    critical popup panel, and Notification Center across all sessions.
// 2. Monitors Fixed Site Employees ONLY during their active scheduled
//    monitoring window (never raises geofence violations after shift end).
// 3. Preserves `companyId` for multi-company isolation.
// ─────────────────────────────────────────────────────────────
import {
  db,
  collection,
  onSnapshot,
  query,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from '../firebase';
import { DEFAULT_COMPANY_ID, recordMatchesCompany } from '../utils/companyContext';

const NOTIFIED_KEY = 'subai_notified_anomalies';
const CLOSED_STATUSES = ['Resolved', 'Dismissed'];

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const loadNotified = () => {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
};

const saveNotified = (set) => {
  try {
    const arr = Array.from(set).slice(-1000);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr));
  } catch (_) {}
};

const toMillis = (ts) => {
  if (!ts) return Date.now();
  if (typeof ts?.toDate === 'function') {
    try {
      return ts.toDate().getTime();
    } catch (_) {}
  }
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
};

const cleanText = (text) => {
  if (!text) return '';
  return String(text).replace(/(\d+\.\d{2,})(\s*)(m\b|km\/h)/g, (_, num, sp, unit) => {
    const v = parseFloat(num);
    const r = unit === 'km/h' || v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    return `${r}${sp}${unit}`;
  });
};

const parseShiftEndMillisToday = (shiftStr, now = new Date()) => {
  if (!shiftStr) return null;
  const parts = String(shiftStr).split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
  if (parts.length < 2) return null;
  const parseToken = (tok) => {
    const m = tok.trim().match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3] ? m[3].toUpperCase() : null;
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return { h, min };
  };
  const start = parseToken(parts[0]);
  const end = parseToken(parts[1]);
  if (!end) return null;
  const isOvernight = start && (end.h < start.h || (end.h === start.h && end.min <= start.min));
  const endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (isOvernight ? 1 : 0), end.h, end.min, 0, 0);
  return endDt.getTime();
};

export const buildAnomalyNotification = (anomaly) => {
  const type = anomaly.type || anomaly.title || anomaly.eventType || 'Security Anomaly';
  const severity = anomaly.severity === 'Critical' ? 'Critical' : (anomaly.severity || 'Medium');
  const employee = anomaly.employeeName || 'Field Employee';
  const millis = toMillis(anomaly.timestamp || anomaly.createdAt);
  const d = new Date(millis);

  return {
    title: `AI Anomaly: ${type}`,
    message: `${employee} • ${cleanText(anomaly.description) || 'Outlier telemetry detected by the AI monitor.'}`,
    sender: 'AI Anomaly Monitor',
    sub: `${severity} Risk`,
    type: anomaly.eventType === 'LOCATION_TRACKING_DISABLED' ? 'Location Event' : 'Anomaly Alert',
    category: 'AI Anomaly',
    severity,
    anomalyId: anomaly.id,
    relatedRecordId: anomaly.id,
    employeeId: anomaly.employeeId || null,
    employeeName: employee,
    companyId: anomaly.companyId || DEFAULT_COMPANY_ID,
    link: '/anomalies',
    date: d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'Unread',
    read: false,
    timestamp: d.toISOString(),
    createdAt: millis,
  };
};

/**
 * Starts the persistent anomaly-to-notification bridge and active-shift geofence supervisor.
 * @param {(notif: object) => void} [onNewAlert] called for new alerts arriving after initial load
 * @param {string} [activeCompanyId='ALL'] active company scope filter
 */
export function startAnomalyNotificationSync(onNewAlert, activeCompanyId = 'ALL') {
  const notified = loadNotified();
  let anomalies = null;
  let notifAnomalyIds = null;
  let initialPassDone = false;
  const inFlight = new Set();
  const sitesMap = new Map();
  const lastAdminGeofenceAlertTime = new Map();

  const reconcile = () => {
    if (anomalies === null || notifAnomalyIds === null) return;

    anomalies.forEach((a) => {
      if (!a?.id) return;
      if (!recordMatchesCompany(a, activeCompanyId)) return;
      if (CLOSED_STATUSES.includes(a.status)) return;
      if (notified.has(a.id) || notifAnomalyIds.has(a.id) || inFlight.has(a.id)) {
        notified.add(a.id);
        return;
      }

      const payload = buildAnomalyNotification(a);
      inFlight.add(a.id);
      notified.add(a.id);

      setDoc(doc(db, 'notifications', `anomaly_${a.id}`), payload, { merge: true })
        .catch((e) => console.warn('Anomaly notification write failed:', e))
        .finally(() => inFlight.delete(a.id));

      if (initialPassDone && typeof onNewAlert === 'function') {
        try {
          onNewAlert({ id: `anomaly_${a.id}`, ...payload });
        } catch (_) {}
      }
    });

    saveNotified(notified);
    initialPassDone = true;
    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
  };

  let unsubAi = () => {};
  let unsubNotif = () => {};
  let unsubSitesUpper = () => {};
  let unsubSitesLower = () => {};
  let unsubEmployees = () => {};
  let unsubAtt1 = () => {};
  let unsubAtt2 = () => {};

  const parseRadiusValue = (val) => {
    if (val == null) return 0;
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  try {
    // 1. Listen for AI anomalies
    unsubAi = onSnapshot(
      query(collection(db, 'ai_analysis')),
      (snap) => {
        anomalies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        reconcile();
      },
      (err) => console.warn('Anomaly sync (ai_analysis) error:', err)
    );

    // 2. Listen for notifications
    unsubNotif = onSnapshot(
      query(collection(db, 'notifications')),
      (snap) => {
        notifAnomalyIds = new Set(snap.docs.map((d) => d.data()?.anomalyId || d.data()?.relatedRecordId).filter(Boolean));
        reconcile();
      },
      (err) => {
        console.warn('Anomaly sync (notifications) error:', err);
        notifAnomalyIds = new Set();
        reconcile();
      }
    );

    // 3. Cache Worksites from Firestore ('Sites' and 'sites') — NO hardcoded fallback locations
    let upperSitesDocs = [];
    let lowerSitesDocs = [];
    const rebuildSitesMap = () => {
      sitesMap.clear();
      [...lowerSitesDocs, ...upperSitesDocs].forEach((sObj) => {
        if (!sObj) return;
        if (sObj.id) {
          sitesMap.set(sObj.id, sObj);
          sitesMap.set(String(sObj.id).trim().toLowerCase(), sObj);
        }
        if (sObj.name) {
          sitesMap.set(sObj.name.trim(), sObj);
          sitesMap.set(sObj.name.trim().toLowerCase(), sObj);
        }
      });
    };

    unsubSitesUpper = onSnapshot(
      collection(db, 'Sites'),
      (snap) => {
        upperSitesDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rebuildSitesMap();
      },
      () => {}
    );

    unsubSitesLower = onSnapshot(
      collection(db, 'sites'),
      (snap) => {
        lowerSitesDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rebuildSitesMap();
      },
      () => {}
    );

    // 4. Live Geofence Monitoring ONLY during active scheduled shift window
    unsubEmployees = onSnapshot(
      collection(db, 'employees'),
      (snap) => {
        snap.docs.forEach((d) => {
          const emp = { id: d.id, ...d.data() };
          if (!recordMatchesCompany(emp, activeCompanyId)) return;

          const empCompanyId = emp.companyId || DEFAULT_COMPANY_ID;
          const empWorkType = (emp.workType || emp.employeeType || emp.type || '').toString().toLowerCase();
          const isFieldEmp = empWorkType.includes('mobile') || empWorkType.includes('field');
          if (isFieldEmp) return;

          const rawStatus = (emp.status || '').toString().trim();
          const isActivelyOnDuty = (rawStatus === 'On Duty' || rawStatus === 'On Site') && emp.isOnline !== false;
          if (!isActivelyOnDuty) return;

          // Ensure GPS heartbeat is fresh (within last 2 minutes)
          const lastActiveMs = toMillis(emp.lastActive || emp.lastHeartbeat || emp.lastLocationUpdate);
          if (Date.now() - lastActiveMs > 120000) return;

          const shiftStrRaw = (emp.shift || emp.scheduledShift || emp.shiftTime || '').toString().trim();
          const shiftStr = shiftStrRaw.toLowerCase();
          if (!shiftStr || shiftStr === 'flexible' || shiftStr === 'unassigned' || shiftStr === 'none' || shiftStr === 'no shift scheduled') {
            return;
          }

          // Ensure today is a scheduled workday if workDays specified
          if (Array.isArray(emp.workDays) && emp.workDays.length > 0) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayIdx = new Date().getDay();
            const full = dayNames[dayIdx].toLowerCase();
            const abbr = dayAbbrs[dayIdx].toLowerCase();
            const isWorkDay = emp.workDays.some((w) => {
              if (!w || typeof w !== 'string') return false;
              const cl = w.trim().toLowerCase();
              return cl === full || cl === abbr || full.startsWith(cl) || cl.startsWith(abbr);
            });
            if (!isWorkDay) return;
          }

          // Requirement 10: Stop geofence monitoring once the scheduled shift monitoring window has ended.
          // (Employee remains allowed to perform Late Checkout without triggering geofence violations.)
          const shiftEndMs = parseShiftEndMillisToday(shiftStrRaw, new Date());
          if (shiftEndMs && Date.now() > shiftEndMs) {
            return;
          }

          const lat = emp.lat ?? emp.latitude;
          const lng = emp.lng ?? emp.longitude;
          if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return;

          const rawAssignedSite = (emp.assignedSite || emp.site || '').toString().trim();
          const siteKey = rawAssignedSite.toLowerCase();
          if (!siteKey || siteKey === 'unassigned' || siteKey === 'none') return;

          const site =
            sitesMap.get(emp.assignedSiteId) ||
            sitesMap.get(rawAssignedSite) ||
            sitesMap.get(siteKey) ||
            Array.from(sitesMap.values()).find((s) => {
              const sName = (s?.name || '').trim().toLowerCase();
              return sName && (sName === siteKey || sName.includes(siteKey) || siteKey.includes(sName));
            }) ||
            null;

          const siteLat = site?.lat ?? site?.latitude ?? null;
          const siteLng = site?.lng ?? site?.longitude ?? null;
          if (!site || siteLat == null || siteLng == null || isNaN(Number(siteLat)) || isNaN(Number(siteLng))) return;

          const siteRadius = parseRadiusValue(site.radius ?? site.geofenceRadius);
          const empRadius = parseRadiusValue(emp.geofenceRadius);
          const baseRadius = Math.max(siteRadius, empRadius) || 100;
          const accuracyMargin = Math.min(Math.max(Number(emp.locationAccuracy) || 0, 0), 40);
          const effectiveRadius = baseRadius + accuracyMargin;

          const distToCenter = getDistanceMeters(Number(lat), Number(lng), Number(siteLat), Number(siteLng));

          if (distToCenter > effectiveRadius) {
            const distOutside = Math.max(1, Math.round(distToCenter - baseRadius));
            const now = Date.now();
            const lastAlert = lastAdminGeofenceAlertTime.get(emp.id) || 0;

            if (now - lastAlert > 120000) {
              lastAdminGeofenceAlertTime.set(emp.id, now);

              const hasRecent = (anomalies || []).some(
                (a) =>
                  (a.employeeId === emp.id || (a.employeeName && a.employeeName === emp.name)) &&
                  (a.eventType === 'UNAUTHORIZED_LOCATION' || (a.type || '').includes('Geofence')) &&
                  now - toMillis(a.timestamp || a.createdAt) < 120000
              );

              if (!hasRecent) {
                const desc = `Employee is outside the assigned geofence (${distOutside}m away).`;
                const anomalyPayload = {
                  companyId: empCompanyId,
                  employeeId: emp.id,
                  employeeName: emp.name || 'Fixed Site Employee',
                  employeeEmail: emp.email || null,
                  employeeType: emp.workType || 'Fixed Site Employee',
                  type: 'Geofence Boundary Violation',
                  eventType: 'UNAUTHORIZED_LOCATION',
                  severity: 'High',
                  confidence: '95%',
                  status: 'Active',
                  description: desc,
                  location: site.name || 'Assigned Worksite',
                  siteId: site.id || null,
                  siteName: site.name || 'Assigned Worksite',
                  latitude: Number(lat),
                  longitude: Number(lng),
                  source: 'admin_live_monitor',
                  createdAt: serverTimestamp(),
                  timestamp: serverTimestamp(),
                };

                addDoc(collection(db, 'ai_analysis'), anomalyPayload).catch((err) =>
                  console.warn('Admin anomaly write error:', err)
                );

                if (emp.geofenceStatus !== 'Outside Assigned Site') {
                  updateDoc(doc(db, 'employees', emp.id), {
                    geofenceStatus: 'Outside Assigned Site',
                    inFence: false,
                    lastOutOfFenceDistance: distOutside,
                    lastOutOfFenceAt: serverTimestamp(),
                  }).catch(() => {});
                }
              }
            }
          } else if (emp.geofenceStatus === 'Outside Assigned Site' || emp.inFence === false) {
            updateDoc(doc(db, 'employees', emp.id), {
              geofenceStatus: 'Inside Assigned Site',
              inFence: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        });
      },
      () => {}
    );

    // 5. Monitor Attendance for Early Check-Out & Late Check-Out records
    const handleAttAnomalyCheck = (docs) => {
      if (!docs) return;
      docs.forEach((d) => {
        const raw = { id: d.id, ...d.data() };
        if (!recordMatchesCompany(raw, activeCompanyId)) return;

        const rawShift = (raw.shift || '').toString().trim().toLowerCase();
        if (!rawShift || rawShift === 'flexible' || rawShift === 'unassigned' || rawShift === 'none' || rawShift === 'no shift scheduled') {
          return;
        }

        if (raw.earlyCheckOut || raw.anomalyFlag === 'Early Check-Out' || raw.earlyDeparture || (raw.minutesEarly && raw.minutesEarly >= 5)) {
          const attId = raw.id;
          const alertKey = `early_co_${attId}`;
          if (lastAdminGeofenceAlertTime.has(alertKey)) return;

          const hasExisting = (anomalies || []).some(
            (a) => a.relatedAttendanceId === attId || a.attendanceId === attId
          );
          if (hasExisting) return;

          lastAdminGeofenceAlertTime.set(alertKey, Date.now());
          const minutes = raw.minutesEarly || 10;
          const desc = raw.departureNote || `Employee checked out early before scheduled shift end (${minutes}m early departure).`;
          const payload = {
            companyId: raw.companyId || DEFAULT_COMPANY_ID,
            employeeId: raw.employeeId || raw.employee_id || null,
            employeeName: raw.employeeName || raw.employee_name || 'Employee',
            employeeEmail: raw.email || null,
            employeeType: raw.employeeType || 'Employee',
            type: 'Early Shift Departure / Early Check-Out',
            eventType: 'EARLY_CHECKOUT',
            severity: minutes >= 60 ? 'High' : 'Medium',
            confidence: '95%',
            status: 'Active',
            description: desc,
            location: raw.siteName || raw.site || 'Scheduled Post',
            siteId: raw.site_id || null,
            siteName: raw.siteName || raw.site || 'Scheduled Post',
            relatedAttendanceId: attId,
            attendanceId: attId,
            source: 'attendance_early_monitor',
            createdAt: serverTimestamp(),
            timestamp: serverTimestamp(),
          };

          addDoc(collection(db, 'ai_analysis'), payload).catch((err) =>
            console.warn('[anomalySync] Early checkout write error:', err)
          );
        }
      });
    };

    unsubAtt1 = onSnapshot(collection(db, 'Attendance'), (snap) => handleAttAnomalyCheck(snap.docs), () => {});
    unsubAtt2 = onSnapshot(collection(db, 'attendance'), (snap) => handleAttAnomalyCheck(snap.docs), () => {});
  } catch (e) {
    console.warn('Anomaly notification sync init error:', e);
  }

  return () => {
    unsubAi();
    unsubNotif();
    unsubSitesUpper();
    unsubSitesLower();
    unsubEmployees();
    unsubAtt1();
    unsubAtt2();
  };
}
