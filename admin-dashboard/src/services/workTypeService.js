/**
 * workTypeService.js
 * ─────────────────────────────────────────────────────────────
 * Firebase Firestore service for the Employee Work Type Module.
 *
 * Handles:
 *  - Fixed Site Employees : geofence entry/exit events, violations
 *  - Mobile Field Employees: route/destination tracking
 *
 * All write helpers accept plain JS objects and stamp a serverTimestamp.
 * All read helpers return plain arrays/objects for easy React state.
 *
 * Authentication is NOT modified here – existing auth flows are preserved.
 * ─────────────────────────────────────────────────────────────
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../firebase';   // existing firebase.js export

// ─── Collection names ────────────────────────────────────────
const COL_EMPLOYEES         = 'employees';
const COL_TRACKING_LOGS     = 'tracking_logs';
const COL_ROUTE_LOGS        = 'route_logs';
const COL_GEOFENCE_VIOLATIONS = 'geofence_violations';

// ═════════════════════════════════════════════════════════════
// EMPLOYEE WORK TYPE CRUD
// ═════════════════════════════════════════════════════════════

/**
 * Update an employee's work-type configuration.
 * Only the workType-related fields are patched; existing data is preserved.
 *
 * @param {string} employeeId  Firestore document ID of the employee
 * @param {'Fixed Site Employee'|'Mobile Field Employee'} workType
 * @param {object} config
 *   For Fixed Site   : { assignedSite: string, geofenceRadius: number }
 *   For Mobile Field : { assignedRoute: string, assignedDestinations: string[] }
 */
export async function updateEmployeeWorkType(employeeId, workType, config = {}) {
  const ref = doc(db, COL_EMPLOYEES, employeeId);
  const patch = { workType, updatedAt: serverTimestamp() };

  if (workType === 'Fixed Site Employee') {
    patch.assignedSite         = config.assignedSite    ?? null;
    patch.geofenceRadius       = config.geofenceRadius  ?? 20;
    patch.assignedRoute        = null;
    patch.assignedDestinations = [];
  } else {
    patch.assignedSite         = null;
    patch.geofenceRadius       = null;
    patch.assignedRoute        = config.assignedRoute         ?? null;
    patch.assignedDestinations = config.assignedDestinations  ?? [];
  }

  await updateDoc(ref, patch);
}

// ═════════════════════════════════════════════════════════════
// FIXED SITE – GEOFENCE EVENTS
// ═════════════════════════════════════════════════════════════

/**
 * Record a geofence entry or exit event for a Fixed Site employee.
 *
 * Writes to:
 *  - tracking_logs   (trackingType: 'fixed')
 *  - geofence_violations (only for 'Exit' events)
 *
 * Also updates the employee's geofenceStatus field.
 *
 * @param {object} p
 * @param {string} p.empId
 * @param {string} p.empName
 * @param {'Entry'|'Exit'} p.event
 * @param {string} p.siteId
 * @param {string} p.siteName
 * @param {number} p.lat
 * @param {number} p.lng
 */
export async function recordGeofenceEvent({ empId, empName, event, siteId, siteName, lat, lng }) {
  const now = serverTimestamp();

  // 1. Write tracking log
  await addDoc(collection(db, COL_TRACKING_LOGS), {
    empId,
    empName,
    trackingType : 'fixed',
    event,
    siteId,
    siteName,
    lat,
    lng,
    timestamp : now,
    entryExitEvents : {
      type      : event,
      timestamp : now,
      coords    : { lat, lng },
    },
    destinationArrival: null,
  });

  // 2. For exits, also write a geofence violation record
  if (event === 'Exit') {
    await addDoc(collection(db, COL_GEOFENCE_VIOLATIONS), {
      employeeId  : empId,
      employeeName: empName,
      site        : siteName,
      siteId,
      event       : 'Exit',
      lat,
      lng,
      timestamp   : now,
      status      : 'Unresolved',
      duration    : null,   // resolved later when employee re-enters
    });
  }

  // 3. Update employee's geofenceStatus
  const geofenceStatus = event === 'Entry' ? 'Inside Assigned Site' : 'Outside Assigned Site';
  await updateDoc(doc(db, COL_EMPLOYEES, empId), { geofenceStatus, updatedAt: now });
}

/**
 * Resolve an open geofence violation when the employee re-enters.
 * Finds the latest Unresolved violation and marks it Resolved.
 */
export async function resolveGeofenceViolation(empId, durationStr) {
  const q = query(
    collection(db, COL_GEOFENCE_VIOLATIONS),
    where('employeeId', '==', empId),
    where('status', '==', 'Unresolved'),
    orderBy('timestamp', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      status  : 'Resolved',
      duration: durationStr,
      resolvedAt: serverTimestamp(),
    });
  }
}

/**
 * Get all geofence violations for a given employee (latest first).
 */
export async function getGeofenceViolations(empId, limitN = 20) {
  const q = query(
    collection(db, COL_GEOFENCE_VIOLATIONS),
    where('employeeId', '==', empId),
    orderBy('timestamp', 'desc'),
    limit(limitN),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get all unresolved violations across all employees (admin dashboard).
 */
export async function getAllUnresolvedViolations() {
  const q = query(
    collection(db, COL_GEOFENCE_VIOLATIONS),
    where('status', '==', 'Unresolved'),
    orderBy('timestamp', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ═════════════════════════════════════════════════════════════
// MOBILE FIELD – ROUTE & DESTINATION TRACKING
// ═════════════════════════════════════════════════════════════

/**
 * Record a destination arrival for a Mobile Field employee.
 * Updates the destination status to 'In Progress'.
 *
 * @param {object} p
 * @param {string} p.empId
 * @param {string} p.empName
 * @param {string} p.destinationId
 * @param {string} p.destinationName
 * @param {string} p.routeLogId   Firestore ID of the active route_logs doc
 * @param {number} p.lat
 * @param {number} p.lng
 */
export async function recordDestinationArrival({ empId, empName, destinationId, destinationName, routeLogId, lat, lng }) {
  const now = serverTimestamp();

  // Write tracking log
  await addDoc(collection(db, COL_TRACKING_LOGS), {
    empId,
    empName,
    trackingType : 'mobile',
    event        : 'Destination Arrived',
    destinationId,
    destinationName,
    lat,
    lng,
    timestamp    : now,
    entryExitEvents : null,
    destinationArrival: {
      destinationId,
      destinationName,
      arrivedAt : now,
      coords    : { lat, lng },
    },
  });

  // Update destination status inside the route_log document
  if (routeLogId) {
    const routeRef = doc(db, COL_ROUTE_LOGS, routeLogId);
    // Destination statuses are stored as a map: destinationStatuses[destId] = 'In Progress'
    await updateDoc(routeRef, {
      [`destinationStatuses.${destinationId}`]: 'In Progress',
      updatedAt: now,
    });
  }
}

/**
 * Mark a destination as Completed.
 *
 * @param {object} p
 * @param {string} p.empId
 * @param {string} p.empName
 * @param {string} p.destinationId
 * @param {string} p.destinationName
 * @param {string} p.routeLogId
 * @param {number} p.lat
 * @param {number} p.lng
 * @param {number} p.totalDestinations  total stops on this route
 */
export async function recordDestinationCompleted({ empId, empName, destinationId, destinationName, routeLogId, lat, lng, totalDestinations }) {
  const now = serverTimestamp();

  await addDoc(collection(db, COL_TRACKING_LOGS), {
    empId,
    empName,
    trackingType : 'mobile',
    event        : 'Destination Completed',
    destinationId,
    destinationName,
    lat,
    lng,
    timestamp    : now,
    entryExitEvents   : null,
    destinationArrival: null,
  });

  const routeRef = doc(db, COL_ROUTE_LOGS, routeLogId);
  const snap = await getDocs(
    query(collection(db, COL_TRACKING_LOGS), where('empId','==',empId), where('event','==','Destination Completed'))
  );
  const completedCount = snap.size + 1;   // include this new one

  await updateDoc(routeRef, {
    [`destinationStatuses.${destinationId}`]: 'Completed',
    completed : completedCount,
    status    : completedCount >= totalDestinations ? 'Completed' : 'In Progress',
    updatedAt : now,
  });
}

/**
 * Start a new route for a Mobile Field employee.
 * Creates a route_logs document and returns its Firestore ID.
 *
 * @param {object} p
 * @param {string} p.empId
 * @param {string} p.empName
 * @param {string} p.route          Route label / name
 * @param {string[]} p.destinations Array of destination IDs
 */
export async function startRoute({ empId, empName, route, destinations }) {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, COL_ROUTE_LOGS), {
    empId,
    empName,
    route,
    destinations,
    destinationStatuses: Object.fromEntries(destinations.map(id => [id, 'Pending'])),
    completed   : 0,
    total       : destinations.length,
    distanceKm  : 0,
    travelTime  : null,
    status      : 'In Progress',
    startedAt   : now,
    updatedAt   : now,
    date        : new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
  });

  // Record the route-started tracking event
  await addDoc(collection(db, COL_TRACKING_LOGS), {
    empId,
    empName,
    trackingType      : 'mobile',
    event             : 'Route Started',
    destinationId     : destinations[0] ?? null,
    lat               : null,
    lng               : null,
    timestamp         : now,
    entryExitEvents   : null,
    destinationArrival: null,
  });

  return ref.id;
}

/**
 * Get route logs for a given employee (latest first).
 */
export async function getRouteLogs(empId, limitN = 10) {
  const q = query(
    collection(db, COL_ROUTE_LOGS),
    where('empId', '==', empId),
    orderBy('date', 'desc'),
    limit(limitN),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get all active route logs across all mobile employees (admin dashboard).
 */
export async function getAllActiveRoutes() {
  const q = query(
    collection(db, COL_ROUTE_LOGS),
    where('status', '==', 'In Progress'),
    orderBy('startedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ═════════════════════════════════════════════════════════════
// SMART GEOFENCE HELPER
// ═════════════════════════════════════════════════════════════

/**
 * Determine if GPS coordinates are inside a circular geofence.
 *
 * @param {number} lat         Employee latitude
 * @param {number} lng         Employee longitude
 * @param {number} centerLat   Site center latitude
 * @param {number} centerLng   Site center longitude
 * @param {number} radiusMeters Geofence radius in meters
 * @returns {boolean}
 */
export function isInsideGeofence(lat, lng, centerLat, centerLng, radiusMeters) {
  const R = 6371000; // Earth radius in metres
  const dLat = toRad(lat - centerLat);
  const dLng = toRad(lng - centerLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(centerLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= radiusMeters;
}

function toRad(deg) { return (deg * Math.PI) / 180; }

/**
 * Apply the Smart Geofence rules based on employee work type.
 *
 * Fixed Site   → checks entry/exit against the assigned geofence
 * Mobile Field → returns { monitoring: 'route', noExitAlerts: true }
 *
 * @param {object} employee  Full employee record from Firestore
 * @param {object} site      Assigned site { lat, lng, radius }
 * @param {number} currentLat
 * @param {number} currentLng
 * @returns {object} monitoring metadata
 */
export function applySmartGeofence(employee, site, currentLat, currentLng) {
  if (employee.workType === 'Mobile Field Employee') {
    return {
      monitoring      : 'route',
      noExitAlerts    : true,
      destinationCheck: true,
      liveGPS         : true,
    };
  }

  // Fixed Site
  if (!site) return { monitoring: 'none' };
  const radius = employee.geofenceRadius ?? (typeof site.radius === 'number' ? site.radius : (parseInt(site.radius) || 20));
  const inside = isInsideGeofence(currentLat, currentLng, site.lat, site.lng, radius);

  return {
    monitoring       : 'fixed',
    isInsideGeofence : inside,
    geofenceStatus   : inside ? 'Inside Assigned Site' : 'Outside Assigned Site',
    exitAlerts       : true,
    entryAlerts      : true,
    radiusValidation : true,
  };
}
