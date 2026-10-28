// ─────────────────────────────────────────────────────────────
// AI Anomaly → Notifications bridge
// Watches the `ai_analysis` collection and creates a matching
// document in `notifications` for every new active anomaly, so
// anomaly alerts show up in the TopNav bell and Notifications page.
// ─────────────────────────────────────────────────────────────
import { db, collection, onSnapshot, query, doc, setDoc } from '../firebase';

const NOTIFIED_KEY = 'subai_notified_anomalies';
const CLOSED_STATUSES = ['Resolved', 'Dismissed'];

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
    // Keep the list bounded
    const arr = Array.from(set).slice(-1000);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr));
  } catch (_) {}
};

const toMillis = (ts) => {
  if (!ts) return Date.now();
  if (typeof ts?.toDate === 'function') {
    try { return ts.toDate().getTime(); } catch (_) {}
  }
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
};

// Round long floats like "38.74389848120117m" → "38.7m"
const cleanText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/(\d+\.\d{2,})(\s*)(m\b|km\/h)/g, (_, num, sp, unit) => {
      const v = parseFloat(num);
      const r = unit === 'km/h' || v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
      return `${r}${sp}${unit}`;
    });
};

export const buildAnomalyNotification = (anomaly) => {
  const type = anomaly.type || anomaly.title || anomaly.eventType || 'Security Anomaly';
  const severity = anomaly.severity === 'Critical' ? 'High' : (anomaly.severity || 'Medium');
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
 * Starts the sync. Returns an unsubscribe function.
 * @param {(notif: object) => void} [onNewAlert] called for anomalies that
 *        arrive after the initial load (useful for toasts).
 */
export function startAnomalyNotificationSync(onNewAlert) {
  const notified = loadNotified();
  let anomalies = null;          // null until first snapshot
  let notifAnomalyIds = null;    // null until first snapshot
  let initialPassDone = false;
  const inFlight = new Set();

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
        try { onNewAlert(payload); } catch (_) {}
      }
    });

    saveNotified(notified);
    initialPassDone = true;
    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
  };

  let unsubAi = () => {};
  let unsubNotif = () => {};

  try {
    unsubAi = onSnapshot(query(collection(db, 'ai_analysis')), (snap) => {
      anomalies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      reconcile();
    }, (err) => console.warn('Anomaly sync (ai_analysis) error:', err));

    unsubNotif = onSnapshot(query(collection(db, 'notifications')), (snap) => {
      notifAnomalyIds = new Set(
        snap.docs.map((d) => d.data()?.anomalyId).filter(Boolean)
      );
      reconcile();
    }, (err) => {
      console.warn('Anomaly sync (notifications) error:', err);
      notifAnomalyIds = new Set();
      reconcile();
    });
  } catch (e) {
    console.warn('Anomaly notification sync init error:', e);
  }

  return () => {
    unsubAi();
    unsubNotif();
  };
}
