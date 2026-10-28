// ──────────────────────────────────────────────────────────────────────────
// locationLogService.js
//
// Automatically captures and saves employee GPS locations to the Location Log
// and performs continuous shift-long geofence perimeter monitoring:
//  1. Immediate capture upon Check-In.
//  2. Continuous active geofence monitoring throughout the shift (not just at check-in).
//  3. High-precision live location watcher (watchPositionAsync) + periodic backup timer.
//  4. Detects when a Fixed Site Employee steps or drives outside their assigned
//     site geofence perimeter and immediately triggers an AI anomaly alert:
//     "Employee is outside the assigned geofence (9043m away)."
//  5. Updates real-time employee geofenceStatus & Attendance inFence/status in Firestore.
//  6. Cleanly stops logging and GPS watching upon Check-Out or session termination.
// ──────────────────────────────────────────────────────────────────────────
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  getDocs,
  ensureAuthenticatedSession,
  subscribeToLogout,
} from '../firebase';
import { evaluateGeofence, parseRadius } from '../utils/geo';
import { writeSecurityEvent } from './securityLogger';

const ASG_LOG_SESSION_KEY = '@geostride_active_location_log_session';
const PERIODIC_TIMER_MS = 60 * 1000; // Backup periodic interval (60 seconds)
const ALERT_COOLDOWN_MS = 60 * 1000; // Cooldown between duplicate alerts (60 seconds)

const KNOWN_SITE_COORDINATES = {
  'office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Cebu Office' },
  'cebu office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Cebu Office' },
  'head office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Cebu Office' },
  'main office': { lat: 10.3273, lng: 123.9064, radius: 200, name: 'Main Office' },
  'sm seaside': { lat: 10.2818, lng: 123.8808, radius: 200, name: 'SM Seaside City' },
  'sm seaside city cebu': { lat: 10.2818, lng: 123.8808, radius: 200, name: 'SM Seaside City' },
  'ayala center cebu': { lat: 10.3173, lng: 123.9058, radius: 200, name: 'Ayala Center Cebu' },
  'cebu business park': { lat: 10.3173, lng: 123.9058, radius: 200, name: 'Cebu Business Park' },
};

class LocationLogService {
  constructor() {
    this.intervalId = null;
    this.locationWatcher = null;
    this.activeSession = null;
    this.isRecording = false;
    this.lastGeofenceAlertTime = 0;
    this.lastOutOfFenceState = false;
    this.cachedSiteGeofence = null;
    this.lastSavedLogTime = 0;
    this.lastShiftOvertimeAlertTime = 0;
  }

  /**
   * Resolve complete site coordinates and perimeter radius from session data,
   * assignments, Firestore sites collection, or known locations.
   */
  async getResolvedSiteGeofence() {
    if (this.cachedSiteGeofence && (this.cachedSiteGeofence.lat != null || this.cachedSiteGeofence.polygon)) {
      return this.cachedSiteGeofence;
    }

    const session = this.activeSession;
    if (!session) return null;

    const { site, assignment, employee } = session;

    // 1. Direct coordinates on site object
    let lat = site?.lat ?? site?.latitude ?? null;
    let lng = site?.lng ?? site?.longitude ?? null;
    let radius = parseRadius(site?.radius ?? site?.geofenceRadius ?? assignment?.geofenceRadius ?? assignment?.radius ?? 200);
    let polygon = site?.polygon ?? null;
    let name = site?.name ?? site?.siteName ?? assignment?.siteName ?? assignment?.site ?? employee?.assignedSite ?? 'Assigned Worksite';
    let siteId = site?.id ?? assignment?.siteId ?? 'site-active';

    // 2. Direct coordinates on assignment object
    if ((lat == null || lng == null) && assignment) {
      lat = assignment?.latitude ?? assignment?.lat ?? null;
      lng = assignment?.longitude ?? assignment?.lng ?? null;
      if (assignment?.geofenceRadius) radius = parseRadius(assignment.geofenceRadius);
    }

    // 3. Fallback: Query Firestore 'sites' / 'Sites' collection if coordinates are missing
    if ((lat == null || lng == null) && !polygon) {
      try {
        const sitesSnap = await getDocs(collection(db, 'sites')).catch(() => null);
        if (sitesSnap && !sitesSnap.empty) {
          const targetName = (name || '').trim().toLowerCase();
          const targetId = (siteId || '').trim().toLowerCase();

          for (const d of sitesSnap.docs) {
            const data = d.data();
            const sName = (data.name || '').trim().toLowerCase();
            const sId = (d.id || '').trim().toLowerCase();

            if (sId === targetId || (targetName && (sName === targetName || sName.includes(targetName) || targetName.includes(sName)))) {
              lat = data.lat ?? data.latitude ?? null;
              lng = data.lng ?? data.longitude ?? null;
              if (data.radius) radius = parseRadius(data.radius);
              if (data.polygon) polygon = data.polygon;
              siteId = d.id;
              name = data.name || name;
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[locationLogService] Site lookup warning:', err?.message);
      }
    }

    // 4. Fallback: Check known locations dictionary
    if ((lat == null || lng == null) && !polygon) {
      const nameKey = (name || '').toLowerCase();
      const matchedKey = Object.keys(KNOWN_SITE_COORDINATES).find(
        (k) => nameKey === k || nameKey.includes(k) || k.includes(nameKey)
      );
      if (matchedKey) {
        const known = KNOWN_SITE_COORDINATES[matchedKey];
        lat = known.lat;
        lng = known.lng;
        radius = radius || known.radius;
        name = known.name;
      } else {
        // Safe default: Cebu IT Park office coordinates
        lat = 10.3273;
        lng = 123.9064;
      }
    }

    this.cachedSiteGeofence = {
      id: siteId,
      name,
      lat: lat != null ? Number(lat) : null,
      lng: lng != null ? Number(lng) : null,
      latitude: lat != null ? Number(lat) : null,
      longitude: lng != null ? Number(lng) : null,
      radius,
      polygon,
    };

    return this.cachedSiteGeofence;
  }

  /**
   * Continuous shift monitoring: evaluates whether employee GPS coordinates are inside
   * or outside the assigned geofence perimeter. If outside, generates an anomaly alert
   * and flags attendance.
   */
  async checkGeofenceBreach({ latitude, longitude, accuracy = null, speed = 0 }) {
    if (!this.isRecording || !this.activeSession) return null;
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) return null;

    const { employee, assignment, attendanceId } = this.activeSession;

    // Enforced ONLY for Fixed Site Employees (Mobile Field Employees move freely across routes)
    const empWorkType = (employee?.workType || employee?.employeeType || employee?.type || '').toString().toLowerCase();
    const isFieldEmp = empWorkType.includes('mobile') || empWorkType.includes('field');
    if (isFieldEmp) {
      return null;
    }

    const siteGeofence = await this.getResolvedSiteGeofence();
    if (!siteGeofence || (siteGeofence.lat == null && !siteGeofence.polygon)) {
      return null;
    }

    const geoResult = evaluateGeofence(Number(latitude), Number(longitude), siteGeofence);

    if (!geoResult.inside) {
      // ⚠️ EMPLOYEE IS OUTSIDE THE GEOFENCE PERIMETER!
      const rawDistance = geoResult.distanceToBoundary > 0
        ? geoResult.distanceToBoundary
        : (geoResult.distanceToCenter || 0);
      const distMeters = Math.max(1, Math.round(rawDistance));

      console.warn(
        `[locationLogService] GEOFENCE BREACH: Employee ${employee?.name || employee?.id} is ${distMeters}m outside assigned site "${siteGeofence.name}"!`
      );

      const now = Date.now();
      const shouldTriggerAnomaly = (now - this.lastGeofenceAlertTime) > ALERT_COOLDOWN_MS;

      if (shouldTriggerAnomaly) {
        this.lastGeofenceAlertTime = now;
        this.lastOutOfFenceState = true;

        // Write canonical AI anomaly event (writes to ai_analysis, ActivityLogs, fraud_reports, notifications)
        try {
          const anomalyId = await writeSecurityEvent({
            eventType: 'UNAUTHORIZED_LOCATION',
            employee: {
              id: employee?.id,
              name: employee?.name,
              email: employee?.email,
              workType: employee?.workType || 'Fixed Site Employee',
              employeeType: employee?.employeeType || 'Fixed Site Employee',
            },
            assignment: {
              id: assignment?.id,
              name: assignment?.name || siteGeofence.name,
              siteId: siteGeofence.id,
              siteName: siteGeofence.name,
            },
            coords: {
              latitude: Number(latitude),
              longitude: Number(longitude),
              accuracy: accuracy !== null ? Number(accuracy) : null,
            },
            relatedAttendanceId: attendanceId || null,
            extra: {
              distance: distMeters,
            },
          });

          console.log(
            `[locationLogService] Triggered UNAUTHORIZED_LOCATION anomaly alert: "Employee is outside the assigned geofence (${distMeters}m away)." (ID: ${anomalyId})`
          );
        } catch (err) {
          console.warn('[locationLogService] Error triggering anomaly alert:', err?.message);
        }
      }

      // Update employee document in Firestore with out-of-bounds telemetry
      const empId = employee?.id || employee?.uid;
      if (empId && empId !== 'emp_fallback' && !empId.startsWith('emp_current')) {
        await updateDoc(doc(db, 'employees', empId), {
          geofenceStatus: 'Outside Assigned Site',
          inFence: false,
          lastOutOfFenceDistance: distMeters,
          lastOutOfFenceAt: serverTimestamp(),
          lat: Number(latitude),
          lng: Number(longitude),
          latitude: Number(latitude),
          longitude: Number(longitude),
          lastActive: Date.now(),
        }).catch(() => {});
      }

      // Update active attendance doc in Firestore to Flagged & inFence: false
      if (attendanceId) {
        const attPatch = {
          inFence: false,
          status: 'Flagged',
          lastOutOfFenceDistance: distMeters,
          lastOutOfFenceAt: serverTimestamp(),
        };
        await updateDoc(doc(db, 'Attendance', attendanceId), attPatch).catch(() => {});
        await updateDoc(doc(db, 'attendance', attendanceId), attPatch).catch(() => {});
      }

      return { breached: true, distance: distMeters, site: siteGeofence };
    } else {
      // ✅ EMPLOYEE IS INSIDE THE ASSIGNED GEOFENCE
      if (this.lastOutOfFenceState) {
        console.log(
          `[locationLogService] Employee ${employee?.name || employee?.id} re-entered assigned geofence perimeter for "${siteGeofence.name}".`
        );
        this.lastOutOfFenceState = false;

        const empId = employee?.id || employee?.uid;
        if (empId && empId !== 'emp_fallback' && !empId.startsWith('emp_current')) {
          await updateDoc(doc(db, 'employees', empId), {
            geofenceStatus: 'Inside Assigned Site',
            inFence: true,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        if (attendanceId) {
          const attPatch = {
            inFence: true,
            status: 'On Site',
          };
          await updateDoc(doc(db, 'Attendance', attendanceId), attPatch).catch(() => {});
          await updateDoc(doc(db, 'attendance', attendanceId), attPatch).catch(() => {});
        }
      }

      return { breached: false, distance: 0, site: siteGeofence };
    }
  }

  /**
   * Continuous shift monitoring: detects if the employee is still clocked in or
   * performing activities beyond their scheduled shift hours.
   */
  async checkShiftOvertimeBreach() {
    if (!this.isRecording || !this.activeSession) return null;
    const { employee, assignment, attendanceId } = this.activeSession;

    // Resolve shift time window
    let shiftStr = assignment?.shift || assignment?.shiftTime || assignment?.shiftEnd || '';
    if (!shiftStr) {
      shiftStr = '08:00 AM - 05:00 PM';
    }

    const parts = shiftStr.split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
    const endStr = parts.length >= 2 ? parts[1].trim() : (parts.length === 1 ? parts[0].trim() : '05:00 PM');

    const now = new Date();
    const endMatch = endStr.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    if (!endMatch) return null;

    let endHour = parseInt(endMatch[1], 10);
    const endMin = parseInt(endMatch[2], 10);
    const ampm = endMatch[3] ? endMatch[3].toUpperCase() : null;
    if (ampm === 'PM' && endHour < 12) endHour += 12;
    if (ampm === 'AM' && endHour === 12) endHour = 0;

    const shiftEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0);

    // If shift end time has elapsed (e.g., current time is past shift end time)
    if (now.getTime() > shiftEndDate.getTime()) {
      const elapsedMinutes = Math.max(1, Math.round((now.getTime() - shiftEndDate.getTime()) / 60000));
      const shouldTrigger = (!this.lastShiftOvertimeAlertTime || (now.getTime() - this.lastShiftOvertimeAlertTime) > 30 * 60 * 1000);

      if (shouldTrigger && elapsedMinutes >= 1) {
        this.lastShiftOvertimeAlertTime = now.getTime();
        const detailMsg = `Shift ended at ${endStr}; still active ${elapsedMinutes}m past shift end`;

        try {
          await writeSecurityEvent({
            eventType: 'OVERTIME_SHIFT_EXCEEDED',
            employee: {
              id: employee?.id,
              name: employee?.name,
              email: employee?.email,
              workType: employee?.workType || 'Employee',
            },
            assignment: {
              id: assignment?.id,
              name: assignment?.name || 'Scheduled Shift',
              siteName: assignment?.siteName || assignment?.site || 'Assigned Site',
            },
            coords: {},
            relatedAttendanceId: attendanceId || null,
            extra: { details: detailMsg },
          });

          console.log(`[locationLogService] OVERTIME_SHIFT_EXCEEDED alert triggered: ${detailMsg}`);
        } catch (err) {
          console.warn('[locationLogService] Error triggering shift overtime alert:', err?.message);
        }
      }

      return { exceeded: true, elapsedMinutes, endStr };
    }

    return { exceeded: false };
  }

  /**
   * External coordinate feeder (e.g. called from presenceService 20-second heartbeat)
   * to immediately verify geofence perimeter.
   */
  async onLocationUpdate(coords) {
    if (!this.isRecording || !this.activeSession || !coords) return;
    const lat = coords.latitude ?? coords.lat;
    const lng = coords.longitude ?? coords.lng;
    const accuracy = coords.accuracy ?? null;
    const speed = coords.speed ?? 0;

    if (lat && lng) {
      await this.checkGeofenceBreach({ latitude: lat, longitude: lng, accuracy, speed });
    }
  }

  /**
   * Save a single location log entry to Firestore collections (LocationLogs, location_logs, tracking_logs)
   * and update the employee's current real-time coordinates.
   */
  async saveLocationLogEntry({
    employee,
    site,
    assignment,
    attendanceId,
    latitude,
    longitude,
    accuracy = null,
    speed = 0,
    trigger = 'check_in',
  }) {
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      console.warn('[locationLogService] Invalid coordinates provided, skipping write.');
      return null;
    }

    try {
      await ensureAuthenticatedSession();
    } catch (e) {}

    const empId = employee?.id || employee?.uid || employee?.employeeId || 'unknown_emp';
    const empName = employee?.name || employee?.employeeName || 'Employee';
    const empEmail = employee?.email || employee?.employeeEmail || '';
    const siteId = site?.id || assignment?.siteId || 'site-active';
    const siteName = site?.name || site?.siteName || assignment?.siteName || assignment?.site || 'Assigned Worksite';

    const actionText = trigger === 'check_in'
      ? 'Check-In Location Captured'
      : 'Continuous Shift GPS Telemetry Logged';

    const eventText = trigger === 'check_in'
      ? 'Check-In Location'
      : 'Shift GPS Telemetry';

    const logData = {
      employee_id: empId,
      employeeId: empId,
      employeeName: empName,
      employeeEmail: empEmail,
      site_id: siteId,
      siteId: siteId,
      siteName: siteName,
      site: siteName,
      attendanceId: attendanceId || null,
      latitude: Number(latitude),
      longitude: Number(longitude),
      lat: Number(latitude),
      lng: Number(longitude),
      accuracy: accuracy !== null && !isNaN(accuracy) ? Number(accuracy) : null,
      speed: speed !== null && !isNaN(speed) ? Number(speed) : 0,
      trigger,
      action: actionText,
      event: eventText,
      trackingType: 'location_log',
      recordedAt: new Date().toISOString(),
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    try {
      // 1. Write to PascalCase LocationLogs
      await addDoc(collection(db, 'LocationLogs'), logData).catch((err) => {
        console.warn('[locationLogService] LocationLogs write warning:', err?.message);
      });

      // 2. Write to lowercase location_logs
      await addDoc(collection(db, 'location_logs'), logData).catch((err) => {
        console.warn('[locationLogService] location_logs write warning:', err?.message);
      });

      // 3. Write to tracking_logs
      await addDoc(collection(db, 'tracking_logs'), {
        ...logData,
        empId,
        empName,
        lat: Number(latitude),
        lng: Number(longitude),
      }).catch((err) => {
        console.warn('[locationLogService] tracking_logs write warning:', err?.message);
      });

      // 4. Update the employee doc with latest coordinates for live tracking
      if (empId && empId !== 'emp_fallback' && !empId.startsWith('emp_current')) {
        await updateDoc(doc(db, 'employees', empId), {
          lat: Number(latitude),
          lng: Number(longitude),
          latitude: Number(latitude),
          longitude: Number(longitude),
          lastActive: Date.now(),
          lastLocationUpdate: serverTimestamp(),
        }).catch(() => {});
      }

      this.lastSavedLogTime = Date.now();
      console.log(`[locationLogService] Location logged (${trigger}): lat=${latitude}, lng=${longitude}`);
      return logData;
    } catch (err) {
      console.warn('[locationLogService] Error saving location log entry:', err?.message);
      return null;
    }
  }

  /**
   * Immediately capture fresh device GPS coordinates and write to Location Log.
   */
  async captureAndSaveCurrentLocation({
    employee,
    site,
    assignment,
    attendanceId,
    trigger = 'check_in',
    coords = null,
  }) {
    let lat = coords?.latitude ?? coords?.lat;
    let lng = coords?.longitude ?? coords?.lng;
    let accuracy = coords?.accuracy ?? null;
    let speed = coords?.speed ?? 0;

    // If coordinates were not passed in, actively request them from device GPS
    if (!lat || !lng) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (loc?.coords) {
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
            accuracy = loc.coords.accuracy;
            speed = loc.coords.speed;
          }
        }
      } catch (e) {
        console.warn('[locationLogService] Failed to acquire current GPS location:', e?.message);
      }
    }

    if (lat && lng) {
      // 1. Save entry to Location Log
      const saved = await this.saveLocationLogEntry({
        employee,
        site,
        assignment,
        attendanceId,
        latitude: lat,
        longitude: lng,
        accuracy,
        speed,
        trigger,
      });

      // 2. Continuous Geofence Perimeter Evaluation
      await this.checkGeofenceBreach({
        latitude: lat,
        longitude: lng,
        accuracy,
        speed,
      });

      return saved;
    }

    return null;
  }

  /**
   * Start continuous shift geofence monitoring & periodic location recording
   * for the current checked-in shift.
   */
  async startPeriodicLogging({ employee, site, assignment, attendanceId }) {
    await this.stopPeriodicLogging(); // ensure any previous interval or watcher is cleared

    this.activeSession = {
      employee,
      site,
      assignment,
      attendanceId,
      startedAt: Date.now(),
    };
    this.isRecording = true;
    this.cachedSiteGeofence = null;
    this.lastGeofenceAlertTime = 0;
    this.lastOutOfFenceState = false;

    // Warm up site geofence resolution
    await this.getResolvedSiteGeofence();

    try {
      await AsyncStorage.setItem(
        ASG_LOG_SESSION_KEY,
        JSON.stringify({
          employeeId: employee?.id,
          siteId: site?.id,
          attendanceId,
          startedAt: Date.now(),
        })
      );
    } catch (e) {}

    console.log('[locationLogService] Started continuous shift geofence monitoring & location tracking.');

    // 1. High-precision live location watcher (fires as employee moves)
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        this.locationWatcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 20000,    // 20-second interval
            distanceInterval: 15,   // or 15 meters moved
          },
          async (loc) => {
            if (!this.isRecording || !this.activeSession || !loc?.coords) return;
            const { latitude, longitude, accuracy, speed } = loc.coords;

            // Continually evaluate geofence boundary violation
            await this.checkGeofenceBreach({ latitude, longitude, accuracy, speed });

            // Periodic write to location logs every ~3-5 minutes
            if (Date.now() - this.lastSavedLogTime > 3 * 60 * 1000) {
              await this.saveLocationLogEntry({
                employee: this.activeSession.employee,
                site: this.activeSession.site,
                assignment: this.activeSession.assignment,
                attendanceId: this.activeSession.attendanceId,
                latitude,
                longitude,
                accuracy,
                speed,
                trigger: 'live_tracking_shift',
              });
            }
          }
        );
      }
    } catch (err) {
      console.warn('[locationLogService] Failed to start Location.watchPositionAsync:', err?.message);
    }

    // 2. Periodic backup timer (fires every 60 seconds to guarantee continuous monitoring)
    this.intervalId = setInterval(async () => {
      if (!this.isRecording || !this.activeSession) return;

      console.log('[locationLogService] 60s shift monitor tick, verifying geofence boundary & shift overtime...');
      await this.captureAndSaveCurrentLocation({
        employee: this.activeSession.employee,
        site: this.activeSession.site,
        assignment: this.activeSession.assignment,
        attendanceId: this.activeSession.attendanceId,
        trigger: 'periodic_shift_check',
      });

      // Check for unscheduled overtime / beyond shift hours
      await this.checkShiftOvertimeBreach();
    }, PERIODIC_TIMER_MS);
  }

  /**
   * Stop continuous location recording and geofence watcher when the employee checks out or logs out.
   */
  async stopPeriodicLogging() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.locationWatcher) {
      try {
        if (typeof this.locationWatcher.remove === 'function') {
          this.locationWatcher.remove();
        }
      } catch (_) {}
      this.locationWatcher = null;
    }

    this.activeSession = null;
    this.isRecording = false;
    this.cachedSiteGeofence = null;
    this.lastOutOfFenceState = false;

    try {
      await AsyncStorage.removeItem(ASG_LOG_SESSION_KEY);
    } catch (e) {}

    console.log('[locationLogService] Stopped continuous shift geofence monitoring & location recording.');
  }

  /**
   * Check whether the location recording and geofence monitoring is currently active.
   */
  isPeriodicLoggingActive() {
    return this.isRecording && (this.intervalId !== null || this.locationWatcher !== null);
  }
}

const locationLogService = new LocationLogService();

try {
  subscribeToLogout(() => {
    locationLogService.stopPeriodicLogging();
  });
} catch (e) {}

export default locationLogService;
