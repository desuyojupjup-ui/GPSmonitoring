// ─────────────────────────────────────────────────────────────
// AI Anomaly → Notifications bridge & Continuous Geofence Supervisor
// 1. Watches `ai_analysis` collection and creates matching docs
//    in `notifications` so anomaly alerts show in TopNav bell & page.
// 2. Continuously monitors Fixed Site Employees on duty to detect
//    out-of-bounds perimeter violations throughout their shift:
//    "Employee is outside the assigned geofence (9043m away)."
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

const NOTIFIED_KEY = 'subai_notified_anomalies';
const CLOSED_STATUSES = ['Resolved', 'Dismissed'];

const KNOWN_LOCATIONS = {
  office: { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Cebu Office' },
  'cebu office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Cebu Office' },
  'head office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Cebu Office' },
  'main office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Main Office' },
  'sm seaside': { lat: 10.2818, lng: 123.8808, radius: 200, name: 'SM Seaside City' },
  'ayala center cebu': { lat: 10.3173, lng: 123.9058, radius: 200, name: 'Ayala Center Cebu' },
  'cebu business park': { lat: 10.3173, lng: 123.9058, radius: 200, name: 'Cebu Business Park' },
};

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

// Round long floats like "38.74389848120117m" → "38.7m"
const cleanText = (text) => {
  if (!text) return '';
  return String(text).replace(/(\d+\.\d{2,})(\s*)(m\b|km\/h)/g, (_, num, sp, unit) => {
    const v = parseFloat(num);
    const r = unit === 'km/h' || v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    return `${r}${sp}${unit}`;
  });
};

export const buildAnomalyNotification = (anomaly) => {
  const type = anomaly.type || anomaly.title || anomaly.eventType || 'Security Anomaly';
  const severity = anomaly.severity === 'Critical' ? 'High' : anomaly.severity || 'Medium';
  const employee = anomaly.employeeName || 'Field Employee';
  const millis = toMillis(anomaly.timestamp || anomaly.createdAt);
  const d = new Date(millis);

  return {
    title: `AI Anomaly: ${type}`,
    message: `${employee} • ${cleanText(anomaly.description) || 'Outlier telemetry detected by the AI monitor.'}`,
    sender: 'AI Anomaly Monitor',
    sub: `${severity} Risk`,
    type: 'Alert',
    category: 'AI Anomaly',
    severity,
    anomalyId: anomaly.id,
    employeeId: anomaly.employeeId || null,
    employeeName: employee,
    link: '/anomalies',
    date: d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'Unread',
    read: false,
    timestamp: d.toISOString(),
  };
};

/**
 * Starts the sync and geofence supervisor. Returns an unsubscribe function.
 * @param {(notif: object) => void} [onNewAlert] called for anomalies that
 *        arrive after the initial load (useful for toasts).
 */
export function startAnomalyNotificationSync(onNewAlert) {
  const notified = loadNotified();
  let anomalies = null; // null until first snapshot
  let notifAnomalyIds = null; // null until first snapshot
  let initialPassDone = false;
  const inFlight = new Set();
  const sitesMap = new Map();
  const lastAdminGeofenceAlertTime = new Map();

  const reconcile = () => {
    if (anomalies === null || notifAnomalyIds === null) return;

    anomalies.forEach((a) => {
      if (!a?.id) return;
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
          onNewAlert(payload);
        } catch (_) {}
      }
    });

    saveNotified(notified);
    initialPassDone = true;
    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
  };

  let unsubAi = () => {};
  let unsubNotif = () => {};
  let unsubSites = () => {};
  let unsubEmployees = () => {};

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
        notifAnomalyIds = new Set(snap.docs.map((d) => d.data()?.anomalyId).filter(Boolean));
        reconcile();
      },
      (err) => {
        console.warn('Anomaly sync (notifications) error:', err);
        notifAnomalyIds = new Set();
        reconcile();
      }
    );

    // 3. Cache Worksites for continuous geofence supervision
    unsubSites = onSnapshot(
      collection(db, 'sites'),
      (snap) => {
        sitesMap.clear();
        snap.docs.forEach((d) => {
          const data = d.data();
          const sObj = { id: d.id, ...data };
          sitesMap.set(d.id, sObj);
          if (data.name) sitesMap.set(data.name.trim().toLowerCase(), sObj);
        });
      },
      () => {}
    );

    // 4. Continuous Live Geofence Monitoring for Fixed Site Employees on duty
    unsubEmployees = onSnapshot(
      collection(db, 'employees'),
      (snap) => {
        snap.docs.forEach((d) => {
          const emp = { id: d.id, ...d.data() };
          const empWorkType = (emp.workType || emp.employeeType || emp.type || '').toString().toLowerCase();
          const isFieldEmp = empWorkType.includes('mobile') || empWorkType.includes('field');

          // Continuous geofence boundaries apply to Fixed Site Employees who are On Duty / Checked In
          if (isFieldEmp) return;
          const isOnDuty = emp.status === 'On Duty' || emp.isOnline === true;
          if (!isOnDuty) return;

          const lat = emp.lat ?? emp.latitude;
          const lng = emp.lng ?? emp.longitude;
          if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return;

          // Resolve site
          const siteKey = (emp.assignedSite || emp.site || '').trim().toLowerCase();
          let site = sitesMap.get(emp.assignedSite) || sitesMap.get(siteKey) || null;

          if (!site || site.lat == null) {
            const matchedKey = Object.keys(KNOWN_LOCATIONS).find((k) => siteKey === k || siteKey.includes(k));
            if (matchedKey) site = KNOWN_LOCATIONS[matchedKey];
          }

          if (!site || site.lat == null) return;

          const radius = Number(site.radius || emp.geofenceRadius || 200);
          const distToCenter = getDistanceMeters(Number(lat), Number(lng), Number(site.lat), Number(site.lng));

          if (distToCenter > radius) {
            const distOutside = Math.max(1, Math.round(distToCenter - radius));
            const now = Date.now();
            const lastAlert = lastAdminGeofenceAlertTime.get(emp.id) || 0;

            if (now - lastAlert > 120000) {
              lastAdminGeofenceAlertTime.set(emp.id, now);

              // Check if a recent anomaly already exists in the last 2 minutes
              const hasRecent = (anomalies || []).some(
                (a) =>
                  (a.employeeId === emp.id || (a.employeeName && a.employeeName === emp.name)) &&
                  (a.eventType === 'UNAUTHORIZED_LOCATION' || (a.type || '').includes('Geofence')) &&
                  now - toMillis(a.timestamp || a.createdAt) < 120000
              );

              if (!hasRecent) {
                const desc = `Employee is outside the assigned geofence (${distOutside}m away).`;
                const anomalyPayload = {
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

                addDoc(collection(db, 'ai_analysis'), anomalyPayload)
                  .then((ref) => {
                    console.log(
                      `[adminGeofenceSync] Auto-flagged geofence breach for ${emp.name}: "${desc}" (Doc ID: ${ref.id})`
                    );
                  })
                  .catch((err) => console.warn('Admin anomaly write error:', err));

                updateDoc(doc(db, 'employees', emp.id), {
                  geofenceStatus: 'Outside Assigned Site',
                  inFence: false,
                  lastOutOfFenceDistance: distOutside,
                  lastOutOfFenceAt: serverTimestamp(),
                }).catch(() => {});
              }
            }
          } else {
            // Inside geofence
            if (emp.geofenceStatus === 'Outside Assigned Site') {
              updateDoc(doc(db, 'employees', emp.id), {
                geofenceStatus: 'Inside Assigned Site',
                inFence: true,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          }
        });
      },
      () => {}
    );
  } catch (e) {
    console.warn('Anomaly notification sync init error:', e);
  }

  return () => {
    unsubAi();
    unsubNotif();
    unsubSites();
    unsubEmployees();
  };
}
