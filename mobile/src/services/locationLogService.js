// ──────────────────────────────────────────────────────────────────────────
// locationLogService.js
//
// Continuous Shift Location Monitoring Service:
//  - Pure Firestore Sites resolution (no hardcoded fallback coordinates).
//  - Respects assignment.locationSyncInterval.
//  - Separates Attendance Completion from Location Monitoring Period (Req 10):
//    automatically stops GPS watching & location logging once the scheduled
//    shift monitoring window ends, while leaving Clock Out available.
//  - Location Disabled Detection (Req 11): detects disabled GPS / revoked
//    location permissions during active monitoring, surfaces factual UI state
//    ("Location tracking is currently unavailable. Please enable location
//    services to continue monitoring."), and logs a factual non-fraud
//    `LOCATION_TRACKING_DISABLED` event with last known location.
//  - Feeds Mobile Field Employee GPS ticks to `travelMonitorService` (Req 14).
//  - Stamps `companyId` on all LocationLogs / location_logs / tracking_logs.
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
import { resolveShift, isScheduledShiftEnded } from '../utils/assignmentUtils';
import { writeSecurityEvent } from './securityLogger';
import travelMonitorService from './travelMonitorService';

const ASG_LOG_SESSION_KEY = '@geostride_active_location_log_session';
const PERIODIC_TIMER_MS = 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 1000;

export const LOCATION_UNAVAILABLE_MESSAGE =
  'Location tracking is currently unavailable. Please enable location services to continue monitoring.';

class LocationLogService {
  constructor() {
    this.intervalId = null;
    this.locationWatcher = null;
    this.activeSession = null;
    this.isRecording = false;
    this.lastGeofenceAlertTime = 0;
    this.lastOutOfFenceState = false;
    this.hasConfirmedInsideOnce = false;
    this.cachedSiteGeofence = null;
    this.lastSavedLogTime = 0;
    this.lastKnownCoords = null;
    this.currentSpeedMs = 0;
    this.locationDisabledLoggedForEpisode = false;
    this.statusListeners = new Set();
    this.monitoringStatus = {
      monitoringActive: false,
      monitoringEnded: false,
      shiftEndStr: null,
      locationUnavailable: false,
      reason: null,
      message: null,
      speedMs: 0,
      lastUpdatedAt: null,
    };
  }

  subscribeStatus(callback) {
    if (typeof callback === 'function') {
      this.statusListeners.add(callback);
      try { callback({ ...this.monitoringStatus }); } catch (_) {}
    }
    return () => this.statusListeners.delete(callback);
  }

  emitStatus(patch = {}) {
    this.monitoringStatus = {
      ...this.monitoringStatus,
      ...patch,
      speedMs: this.currentSpeedMs,
      lastUpdatedAt: Date.now(),
    };
    this.statusListeners.forEach((cb) => {
      try { cb({ ...this.monitoringStatus }); } catch (_) {}
    });
  }

  getMonitoringStatus() {
    return { ...this.monitoringStatus };
  }

  getCurrentSpeedMs() {
    return this.currentSpeedMs;
  }

  updateActiveSite(site, assignment, assignedSitesList = null) {
    if (!this.activeSession) return;
    if (site) this.activeSession.site = site;
    if (assignment) this.activeSession.assignment = assignment;
    if (Array.isArray(assignedSitesList)) this.activeSession.assignedSitesList = assignedSitesList;
    this.cachedSiteGeofence = null;
  }

  /**
   * Check whether the active shift's monitoring period has ended.
   * When it ends, stop GPS tracking & geofence monitoring cleanly without
   * disabling Clock Out (Requirement 10).
   */
  async enforceMonitoringPeriodWindow() {
    if (!this.isRecording || !this.activeSession) return false;
    const { employee, assignment } = this.activeSession;
    const shiftStr = resolveShift(assignment, employee);
    const endCheck = isScheduledShiftEnded(shiftStr);
    if (endCheck.ended) {
      await this.stopPeriodicLogging({
        monitoringEnded: true,
        shiftEndStr: endCheck.shiftEndStr,
      });
      return true;
    }
    return false;
  }

  /**
   * Detect GPS disabled / location permission revoked during active monitoring (Req 11).
   * Never monitors or logs outside active monitoring period.
   */
  async checkLocationAvailability() {
    if (!this.isRecording || !this.activeSession) return { available: true };

    // Do NOT check or log outside the scheduled monitoring period
    const ended = await this.enforceMonitoringPeriodWindow();
    if (ended) return { available: false, monitoringEnded: true };

    let servicesEnabled = true;
    let permissionStatus = 'granted';
    try {
      servicesEnabled = await Location.hasServicesEnabledAsync();
    } catch (_) {
      servicesEnabled = false;
    }
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      permissionStatus = perm?.status || 'denied';
    } catch (_) {
      permissionStatus = 'denied';
    }

    const unavailable = !servicesEnabled || permissionStatus !== 'granted';
    const { employee, assignment, attendanceId } = this.activeSession;
    const companyId = employee?.companyId || assignment?.companyId || 'company_default';

    if (unavailable) {
      const reason = !servicesEnabled
        ? 'Location services unavailable'
        : 'Location permission disabled';

      this.emitStatus({
        monitoringActive: true,
        locationUnavailable: true,
        reason,
        message: LOCATION_UNAVAILABLE_MESSAGE,
      });

      // Log ONE factual event per outage episode (no fraud accusation)
      if (!this.locationDisabledLoggedForEpisode) {
        this.locationDisabledLoggedForEpisode = true;
        const lastLoc = this.lastKnownCoords || {
          latitude: employee?.lat ?? employee?.latitude ?? null,
          longitude: employee?.lng ?? employee?.longitude ?? null,
        };
        const lastLocText =
          lastLoc?.latitude != null && lastLoc?.longitude != null
            ? `${Number(lastLoc.latitude).toFixed(5)}, ${Number(lastLoc.longitude).toFixed(5)}`
            : 'No prior GPS fix recorded';

        try {
          await writeSecurityEvent({
            eventType: 'LOCATION_TRACKING_DISABLED',
            employee: { ...employee, companyId },
            assignment: { ...(assignment || {}), companyId },
            coords: {
              latitude: lastLoc?.latitude ?? null,
              longitude: lastLoc?.longitude ?? null,
              accuracy: lastLoc?.accuracy ?? null,
            },
            relatedAttendanceId: attendanceId || null,
            customDescription: `${reason} during active monitoring period. Last known location: ${lastLocText}.`,
            extra: {
              reason,
              lastKnownLocation: lastLocText,
              eventStatus: 'Active',
            },
          });
        } catch (err) {
          console.warn('[locationLogService] Failed to log LOCATION_TRACKING_DISABLED:', err?.message);
        }

        if (employee?.id) {
          updateDoc(doc(db, 'employees', employee.id), {
            locationTrackingStatus: 'Location Tracking Disabled',
            locationTrackingReason: reason,
            locationUnavailableSince: new Date().toISOString(),
            lastActive: Date.now(),
          }).catch(() => {});
        }
      }

      return { available: false, reason };
    }

    // Location services & permission are available
    if (this.locationDisabledLoggedForEpisode || this.monitoringStatus.locationUnavailable) {
      this.locationDisabledLoggedForEpisode = false;
      this.emitStatus({
        monitoringActive: true,
        locationUnavailable: false,
        reason: null,
        message: null,
      });

      if (employee?.id) {
        updateDoc(doc(db, 'employees', employee.id), {
          locationTrackingStatus: 'Active',
          locationTrackingReason: null,
          locationUnavailableSince: null,
          lastActive: Date.now(),
        }).catch(() => {});
      }

      // Restart watcher if it wasn't running during outage
      if (!this.locationWatcher && this.isRecording && this.activeSession) {
        this.startGpsWatcher().catch(() => {});
      }
    }

    return { available: true };
  }

  /**
   * Resolve complete site coordinates and perimeter radius strictly from Firestore Sites
   * or assignment data (no hardcoded fallback coordinates).
   */
  async getResolvedSiteGeofence() {
    if (
      this.cachedSiteGeofence &&
      this.cachedSiteGeofence.fromFirestore &&
      (this.cachedSiteGeofence.lat != null || this.cachedSiteGeofence.polygon)
    ) {
      return this.cachedSiteGeofence;
    }

    const session = this.activeSession;
    if (!session) return null;

    const { site, assignment, employee } = session;
    const companyId = employee?.companyId || assignment?.companyId || 'company_default';

    let name = (
      assignment?.siteName ||
      assignment?.site ||
      site?.name ||
      site?.siteName ||
      employee?.assignedSite ||
      'Assigned Worksite'
    ).toString().trim();
    if (name.includes(',')) {
      name = name.split(',')[0].trim();
    }

    let siteId = site?.id ?? assignment?.siteId ?? employee?.assignedSiteId ?? null;
    let lat = null;
    let lng = null;
    let polygon = site?.polygon ?? null;
    let fromFirestore = false;

    const siteRadiusVal = site?.radius ? parseRadius(site.radius) : (site?.geofenceRadius ? parseRadius(site.geofenceRadius) : 0);
    const empRadiusVal = employee?.geofenceRadius ? parseRadius(employee.geofenceRadius) : 0;
    const asgRadiusVal = (assignment?.geofenceRadius || assignment?.radius) ? parseRadius(assignment.geofenceRadius ?? assignment.radius) : 0;
    let radius = Math.max(asgRadiusVal, siteRadiusVal, empRadiusVal) || 100;

    // 1. Authoritative source: Firestore 'Sites' (and 'sites') filtered by companyId
    try {
      let docs = [];
      const upperSnap = await getDocs(collection(db, 'Sites')).catch(() => null);
      if (upperSnap && !upperSnap.empty) {
        docs = upperSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      const lowerSnap = await getDocs(collection(db, 'sites')).catch(() => null);
      if (lowerSnap && !lowerSnap.empty) {
        docs = [...docs, ...lowerSnap.docs.map(d => ({ id: d.id, ...d.data() }))];
      }

      // Filter to employee's company (including legacy un-tagged docs for company_default)
      docs = docs.filter(d => (d.companyId || 'company_default') === companyId);

      if (docs.length > 0) {
        const targetName = (name || '').trim().toLowerCase();
        const targetId = (siteId || '').toString().trim().toLowerCase();

        const matched =
          docs.find(d => targetId && (d.id || '').toLowerCase() === targetId) ||
          docs.find(d => targetName && (d.name || '').trim().toLowerCase() === targetName) ||
          docs.find(d => {
            const sName = (d.name || '').trim().toLowerCase();
            return targetName && sName && (sName.includes(targetName) || targetName.includes(sName));
          });

        if (matched) {
          lat = matched.lat ?? matched.latitude ?? null;
          lng = matched.lng ?? matched.longitude ?? null;
          const dbRadius = (matched.radius || matched.geofenceRadius) ? parseRadius(matched.radius ?? matched.geofenceRadius) : 0;
          radius = Math.max(asgRadiusVal, dbRadius, empRadiusVal, siteRadiusVal) || 100;
          if (matched.polygon) polygon = matched.polygon;
          siteId = matched.id || siteId;
          name = matched.name || name;
          fromFirestore = true;
        }
      }
    } catch (err) {
      console.warn('[locationLogService] Site lookup warning:', err?.message);
    }

    // 2. Direct coordinates on site or assignment object from Firestore
    if (lat == null || lng == null) {
      const candidateLat = site?.lat ?? site?.latitude ?? assignment?.latitude ?? assignment?.lat ?? null;
      const candidateLng = site?.lng ?? site?.longitude ?? assignment?.longitude ?? assignment?.lng ?? null;
      if (candidateLat != null && candidateLng != null && !isNaN(Number(candidateLat)) && !isNaN(Number(candidateLng))) {
        lat = Number(candidateLat);
        lng = Number(candidateLng);
      }
    }

    if (lat == null && lng == null && !polygon) {
      return null;
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
      fromFirestore,
    };

    return this.cachedSiteGeofence;
  }

  /**
   * Continuous shift monitoring: evaluates geofence breach for Fixed Site Employees,
   * and feeds GPS ticks into travelMonitorService for Mobile Field Employees.
   */
  async checkGeofenceBreach({ latitude, longitude, accuracy = null, speed = 0 }) {
    if (!this.isRecording || !this.activeSession) return null;
    if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) return null;

    // Stop if scheduled shift monitoring period has ended (Requirement 10)
    if (await this.enforceMonitoringPeriodWindow()) {
      return null;
    }

    this.lastKnownCoords = { latitude: Number(latitude), longitude: Number(longitude), accuracy };
    this.currentSpeedMs = Number(speed) || 0;

    const { employee, assignment, attendanceId } = this.activeSession;
    const companyId = employee?.companyId || assignment?.companyId || 'company_default';

    const empWorkType = (employee?.workType || employee?.employeeType || assignment?.employeeType || employee?.type || '').toString().toLowerCase();
    const isFieldEmp = empWorkType.includes('mobile') || empWorkType.includes('field');

    // For Mobile Field Employees: delegate to travelMonitorService (Req 14)
    if (isFieldEmp) {
      await travelMonitorService.processLocation({ latitude, longitude, accuracy });
      return null;
    }

    const siteGeofence = await this.getResolvedSiteGeofence();
    if (!siteGeofence || (siteGeofence.lat == null && !siteGeofence.polygon)) {
      return null;
    }

    const accuracyMargin = Math.min(Math.max(Number(accuracy) || 0, 0), 40);
    const effectiveSiteGeofence = {
      ...siteGeofence,
      radius: (siteGeofence.radius || 100) + accuracyMargin,
    };

    const geoResult = evaluateGeofence(Number(latitude), Number(longitude), effectiveSiteGeofence);

    if (!geoResult.inside) {
      const rawDistance = geoResult.distanceToBoundary > 0
        ? geoResult.distanceToBoundary
        : (geoResult.distanceToCenter || 0);
      const distMeters = Math.max(1, Math.round(rawDistance));

      const now = Date.now();
      const wasAlreadyOut = this.lastOutOfFenceState;
      const shouldTriggerAnomaly = (now - this.lastGeofenceAlertTime) > ALERT_COOLDOWN_MS;

      if (shouldTriggerAnomaly) {
        this.lastGeofenceAlertTime = now;
        this.lastOutOfFenceState = true;

        try {
          await writeSecurityEvent({
            eventType: 'UNAUTHORIZED_LOCATION',
            employee: {
              ...employee,
              companyId,
              workType: employee?.workType || 'Fixed Site Employee',
              employeeType: employee?.employeeType || 'Fixed Site Employee',
            },
            assignment: {
              ...(assignment || {}),
              companyId,
              siteId: siteGeofence.id,
              siteName: siteGeofence.name,
            },
            coords: {
              latitude: Number(latitude),
              longitude: Number(longitude),
              accuracy: accuracy !== null ? Number(accuracy) : null,
            },
            relatedAttendanceId: attendanceId || null,
            extra: { distance: distMeters },
          });
        } catch (err) {
          console.warn('[locationLogService] Error triggering anomaly alert:', err?.message);
        }
      }

      if (!wasAlreadyOut) {
        this.lastOutOfFenceState = true;
        const empId = employee?.id || employee?.uid;
        if (empId && !String(empId).startsWith('emp_current')) {
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
      }

      return { breached: true, distance: distMeters, site: siteGeofence };
    } else {
      if (this.lastOutOfFenceState || !this.hasConfirmedInsideOnce) {
        this.lastOutOfFenceState = false;
        this.hasConfirmedInsideOnce = true;

        const empId = employee?.id || employee?.uid;
        if (empId && !String(empId).startsWith('emp_current')) {
          await updateDoc(doc(db, 'employees', empId), {
            geofenceStatus: 'Inside Assigned Site',
            inFence: true,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        if (attendanceId) {
          const attPatch = { inFence: true, status: 'On Site' };
          await updateDoc(doc(db, 'Attendance', attendanceId), attPatch).catch(() => {});
          await updateDoc(doc(db, 'attendance', attendanceId), attPatch).catch(() => {});
        }
      }

      return { breached: false, distance: 0, site: siteGeofence };
    }
  }

  async onLocationUpdate(coords) {
    if (!this.isRecording || !this.activeSession || !coords) return;
    const lat = coords.latitude ?? coords.lat;
    const lng = coords.longitude ?? coords.lng;
    const accuracy = coords.accuracy ?? null;
    const speed = coords.speed ?? 0;

    if (lat != null && lng != null) {
      await this.checkGeofenceBreach({ latitude: lat, longitude: lng, accuracy, speed });
    }
  }

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
    if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
      return null;
    }

    try {
      await ensureAuthenticatedSession();
    } catch (_) {}

    const companyId = employee?.companyId || assignment?.companyId || 'company_default';
    const empId = employee?.id || employee?.uid || employee?.employeeId || null;
    const empName = employee?.name || employee?.employeeName || 'Employee';
    const empEmail = employee?.email || employee?.employeeEmail || '';
    const siteId = site?.id || assignment?.siteId || null;
    const siteName = site?.name || site?.siteName || assignment?.siteName || assignment?.site || 'Assigned Worksite';

    this.lastKnownCoords = { latitude: Number(latitude), longitude: Number(longitude), accuracy };
    this.currentSpeedMs = Number(speed) || 0;

    const actionText = trigger === 'check_in'
      ? 'Check-In Location Captured'
      : 'Continuous Shift GPS Telemetry Logged';

    const eventText = trigger === 'check_in'
      ? 'Check-In Location'
      : 'Shift GPS Telemetry';

    const logData = {
      companyId,
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
      await addDoc(collection(db, 'LocationLogs'), logData).catch(() => {});
      await addDoc(collection(db, 'location_logs'), logData).catch(() => {});
      await addDoc(collection(db, 'tracking_logs'), {
        ...logData,
        empId,
        empName,
      }).catch(() => {});

      if (empId && !String(empId).startsWith('emp_current')) {
        await updateDoc(doc(db, 'employees', empId), {
          lat: Number(latitude),
          lng: Number(longitude),
          latitude: Number(latitude),
          longitude: Number(longitude),
          speed: Number(speed) || 0,
          locationTrackingStatus: 'Active',
          lastActive: Date.now(),
          lastLocationUpdate: serverTimestamp(),
        }).catch(() => {});
      }

      this.lastSavedLogTime = Date.now();
      return logData;
    } catch (err) {
      console.warn('[locationLogService] Error saving location log entry:', err?.message);
      return null;
    }
  }

  async captureAndSaveCurrentLocation({
    employee,
    site,
    assignment,
    attendanceId,
    trigger = 'check_in',
    coords = null,
  }) {
    if (trigger !== 'check_in') {
      const avail = await this.checkLocationAvailability();
      if (!avail.available) return null;
    }

    let lat = coords?.latitude ?? coords?.lat;
    let lng = coords?.longitude ?? coords?.lng;
    let accuracy = coords?.accuracy ?? null;
    let speed = coords?.speed ?? 0;

    if (lat == null || lng == null) {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!servicesEnabled || status !== 'granted') {
          await this.checkLocationAvailability();
          return null;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (loc?.coords) {
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          accuracy = loc.coords.accuracy;
          speed = loc.coords.speed || 0;
        }
      } catch (e) {
        console.warn('[locationLogService] Failed to acquire GPS location:', e?.message);
        await this.checkLocationAvailability();
        return null;
      }
    }

    if (lat != null && lng != null) {
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

  async startGpsWatcher() {
    if (!this.isRecording || !this.activeSession) return;
    if (this.locationWatcher) {
      try { this.locationWatcher.remove(); } catch (_) {}
      this.locationWatcher = null;
    }

    const syncIntervalSec = Math.min(
      300,
      Math.max(10, Number(this.activeSession.assignment?.locationSyncInterval) || 30)
    );

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!servicesEnabled || status !== 'granted') {
        await this.checkLocationAvailability();
        return;
      }

      this.locationWatcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: syncIntervalSec * 1000,
          distanceInterval: 15,
        },
        async (loc) => {
          if (!this.isRecording || !this.activeSession || !loc?.coords) return;
          if (await this.enforceMonitoringPeriodWindow()) return;

          const { latitude, longitude, accuracy, speed } = loc.coords;
          this.currentSpeedMs = Number(speed) || 0;
          this.lastKnownCoords = { latitude, longitude, accuracy };

          if (this.monitoringStatus.locationUnavailable) {
            this.locationDisabledLoggedForEpisode = false;
            this.emitStatus({
              monitoringActive: true,
              locationUnavailable: false,
              reason: null,
              message: null,
            });
          } else {
            this.emitStatus({ monitoringActive: true });
          }

          await this.checkGeofenceBreach({ latitude, longitude, accuracy, speed });

          if (Date.now() - this.lastSavedLogTime > Math.max(syncIntervalSec * 1000, 120 * 1000)) {
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
    } catch (err) {
      console.warn('[locationLogService] Failed to start Location.watchPositionAsync:', err?.message);
      await this.checkLocationAvailability();
    }
  }

  async startPeriodicLogging({ employee, site, assignment, assignedSitesList = [], attendanceId }) {
    await this.stopPeriodicLogging();

    // Requirement 10: Do not start active location monitoring if scheduled shift has already ended
    const shiftStr = resolveShift(assignment, employee);
    const endCheck = isScheduledShiftEnded(shiftStr);
    if (endCheck.ended) {
      this.emitStatus({
        monitoringActive: false,
        monitoringEnded: true,
        shiftEndStr: endCheck.shiftEndStr,
        locationUnavailable: false,
        reason: null,
        message: null,
      });
      return;
    }

    this.activeSession = {
      employee,
      site,
      assignment,
      assignedSitesList,
      attendanceId,
      startedAt: Date.now(),
    };
    this.isRecording = true;
    this.cachedSiteGeofence = null;
    this.lastGeofenceAlertTime = 0;
    this.lastOutOfFenceState = false;
    this.hasConfirmedInsideOnce = false;
    this.locationDisabledLoggedForEpisode = false;

    this.emitStatus({
      monitoringActive: true,
      monitoringEnded: false,
      shiftEndStr: endCheck.shiftEndStr,
      locationUnavailable: false,
      reason: null,
      message: null,
    });

    await this.getResolvedSiteGeofence();

    // Start Travel Time monitor for Mobile Field Employees (Req 14)
    travelMonitorService.start({
      employee,
      assignment,
      assignedSitesList,
      attendanceId,
    });

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
    } catch (_) {}

    await this.checkLocationAvailability();
    await this.startGpsWatcher();

    this.intervalId = setInterval(async () => {
      if (!this.isRecording || !this.activeSession) return;

      // Requirement 10: Stop automatically once monitoring window ends
      if (await this.enforceMonitoringPeriodWindow()) return;

      // Requirement 11: Check GPS / location permission health
      const avail = await this.checkLocationAvailability();
      if (!avail.available) return;

      await this.captureAndSaveCurrentLocation({
        employee: this.activeSession.employee,
        site: this.activeSession.site,
        assignment: this.activeSession.assignment,
        attendanceId: this.activeSession.attendanceId,
        trigger: 'periodic_shift_check',
      });
    }, PERIODIC_TIMER_MS);
  }

  async stopPeriodicLogging({ monitoringEnded = false, shiftEndStr = null } = {}) {
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
    this.locationDisabledLoggedForEpisode = false;
    this.currentSpeedMs = 0;

    travelMonitorService.stop();

    this.emitStatus({
      monitoringActive: false,
      monitoringEnded: Boolean(monitoringEnded),
      shiftEndStr: shiftEndStr || this.monitoringStatus.shiftEndStr,
      locationUnavailable: false,
      reason: null,
      message: null,
    });

    try {
      await AsyncStorage.removeItem(ASG_LOG_SESSION_KEY);
    } catch (_) {}
  }

  isPeriodicLoggingActive() {
    return this.isRecording && (this.intervalId !== null || this.locationWatcher !== null);
  }
}

const locationLogService = new LocationLogService();

try {
  subscribeToLogout(() => {
    locationLogService.stopPeriodicLogging();
  });
} catch (_) {}

export default locationLogService;
