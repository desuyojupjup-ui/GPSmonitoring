// ──────────────────────────────────────────────────────────────────────────
// travelMonitorService.js
//
// Off-Site / Mobile Field Employee Multi-Destination Travel Time Monitor:
//  - Tracks origin -> next destination travel legs using assignment's
//    estimatedTravelTimeMinutes + travelGracePeriodMinutes.
//  - Suppresses false geofence / travel anomalies while employee is within
//    allowed travel window (estimatedTravelTime + gracePeriod).
//  - Detects destination arrival using site geofence radius and records
//    actualArrivalTime.
//  - Generates a factual `TRAVEL_TIME_EXCEEDED` anomaly + notification when
//    travel exceeds allowedTravelWindowMinutes without reaching destination.
// ──────────────────────────────────────────────────────────────────────────
import {
  db,
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  ensureAuthenticatedSession,
} from '../firebase';
import { evaluateGeofence, parseRadius } from '../utils/geo';
import { writeSecurityEvent } from './securityLogger';

/**
 * Pure travel window evaluator (exported for deterministic unit testing).
 */
export function evaluateTravelWindow({
  departureTimeMs,
  nowMs = Date.now(),
  estimatedTravelMinutes = 30,
  gracePeriodMinutes = 10,
  arrived = false,
}) {
  const estMins = Math.max(1, Number(estimatedTravelMinutes) || 30);
  const graceMins = Math.max(0, Number(gracePeriodMinutes) || 0);
  const allowedWindowMinutes = estMins + graceMins;

  if (!departureTimeMs || !Number.isFinite(departureTimeMs)) {
    return {
      travelStatus: arrived ? 'Arrived' : 'Idle',
      elapsedMinutes: 0,
      allowedWindowMinutes,
      expectedArrivalMs: null,
      deadlineArrivalMs: null,
      inGracePeriod: false,
      exceeded: false,
      exceededMinutes: 0,
      suppressAnomaly: false,
    };
  }

  const expectedArrivalMs = departureTimeMs + estMins * 60 * 1000;
  const deadlineArrivalMs = departureTimeMs + allowedWindowMinutes * 60 * 1000;
  const elapsedMinutes = Math.max(0, Math.round((nowMs - departureTimeMs) / 60000));

  if (arrived) {
    return {
      travelStatus: 'Arrived',
      elapsedMinutes,
      allowedWindowMinutes,
      expectedArrivalMs,
      deadlineArrivalMs,
      inGracePeriod: false,
      exceeded: false,
      exceededMinutes: 0,
      suppressAnomaly: false,
    };
  }

  if (nowMs <= expectedArrivalMs) {
    return {
      travelStatus: 'In Transit',
      elapsedMinutes,
      allowedWindowMinutes,
      expectedArrivalMs,
      deadlineArrivalMs,
      inGracePeriod: false,
      exceeded: false,
      exceededMinutes: 0,
      suppressAnomaly: true,
    };
  }

  if (nowMs <= deadlineArrivalMs) {
    return {
      travelStatus: 'In Transit',
      elapsedMinutes,
      allowedWindowMinutes,
      expectedArrivalMs,
      deadlineArrivalMs,
      inGracePeriod: true,
      exceeded: false,
      exceededMinutes: 0,
      suppressAnomaly: true,
    };
  }

  const exceededMinutes = Math.max(1, Math.round((nowMs - deadlineArrivalMs) / 60000));
  return {
    travelStatus: 'Exceeded',
    elapsedMinutes,
    allowedWindowMinutes,
    expectedArrivalMs,
    deadlineArrivalMs,
    inGracePeriod: false,
    exceeded: true,
    exceededMinutes,
    suppressAnomaly: false,
  };
}

class TravelMonitorService {
  constructor() {
    this.active = false;
    this.employee = null;
    this.assignment = null;
    this.attendanceId = null;
    this.destinations = [];
    this.currentDestIndex = 0;
    this.previousDestination = null;
    this.departureTimeMs = null;
    this.actualArrivalTimeMs = null;
    this.travelStatus = 'Idle';
    this.exceededLoggedForLeg = new Set();
    this.visitedDestinations = [];
    this.listeners = new Set();
    this.lastState = this.getSnapshot();
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      try { callback(this.getSnapshot()); } catch (_) {}
    }
    return () => this.listeners.delete(callback);
  }

  emit() {
    this.lastState = this.getSnapshot();
    this.listeners.forEach((cb) => {
      try { cb(this.lastState); } catch (_) {}
    });
  }

  getCurrentTargetDestination() {
    return this.destinations[this.currentDestIndex] || null;
  }

  getEstimatedMinutesForCurrentLeg() {
    const dest = this.getCurrentTargetDestination();
    return Number(
      dest?.estimatedTravelMinutes ??
      this.assignment?.estimatedTravelTimeMinutes ??
      this.assignment?.travelTimeMinutes ??
      30
    ) || 30;
  }

  getGraceMinutesForCurrentLeg() {
    const dest = this.getCurrentTargetDestination();
    return Number(
      dest?.gracePeriodMinutes ??
      this.assignment?.travelGracePeriodMinutes ??
      this.assignment?.allowedGracePeriod ??
      10
    ) || 10;
  }

  getSnapshot() {
    const nextDest = this.getCurrentTargetDestination();
    const estMins = this.getEstimatedMinutesForCurrentLeg();
    const graceMins = this.getGraceMinutesForCurrentLeg();
    const evalRes = evaluateTravelWindow({
      departureTimeMs: this.departureTimeMs,
      nowMs: Date.now(),
      estimatedTravelMinutes: estMins,
      gracePeriodMinutes: graceMins,
      arrived: this.travelStatus === 'Arrived',
    });

    return {
      active: this.active,
      previousDestination: this.previousDestination?.name || null,
      nextDestination: nextDest?.name || null,
      destinationIndex: this.currentDestIndex,
      totalDestinations: this.destinations.length,
      visitedDestinations: [...this.visitedDestinations],
      departureTime: this.departureTimeMs ? new Date(this.departureTimeMs).toISOString() : null,
      expectedArrivalTime: evalRes.expectedArrivalMs ? new Date(evalRes.expectedArrivalMs).toISOString() : null,
      deadlineArrivalTime: evalRes.deadlineArrivalMs ? new Date(evalRes.deadlineArrivalMs).toISOString() : null,
      actualArrivalTime: this.actualArrivalTimeMs ? new Date(this.actualArrivalTimeMs).toISOString() : null,
      estimatedTravelMinutes: estMins,
      allowedGracePeriod: graceMins,
      allowedWindowMinutes: evalRes.allowedWindowMinutes,
      elapsedMinutes: evalRes.elapsedMinutes,
      exceededMinutes: evalRes.exceededMinutes,
      inGracePeriod: evalRes.inGracePeriod,
      travelStatus: this.active ? (this.travelStatus === 'At Destination' ? 'At Destination' : evalRes.travelStatus) : 'Idle',
    };
  }

  /**
   * Returns true if the employee is currently within their authorized travel window
   * between destinations (used to prevent false geofence/travel anomalies during transit).
   */
  isWithinAllowedTravelWindow(nowMs = Date.now()) {
    if (!this.active || !this.departureTimeMs) return false;
    if (this.travelStatus === 'At Destination' || this.travelStatus === 'Arrived') return false;
    const evalRes = evaluateTravelWindow({
      departureTimeMs: this.departureTimeMs,
      nowMs,
      estimatedTravelMinutes: this.getEstimatedMinutesForCurrentLeg(),
      gracePeriodMinutes: this.getGraceMinutesForCurrentLeg(),
      arrived: false,
    });
    return evalRes.suppressAnomaly;
  }

  /**
   * Initialize travel monitoring for an active Mobile Field Employee shift.
   */
  start({ employee, assignment, assignedSitesList = [], attendanceId = null }) {
    const wt = (employee?.workType || employee?.employeeType || assignment?.employeeType || '').toLowerCase();
    const isMobileField = wt.includes('mobile') || wt.includes('field');
    if (!isMobileField) {
      this.stop();
      return;
    }

    // Build ordered destinations from assignment.destinationSchedule + assignedSitesList
    const schedArr = Array.isArray(assignment?.destinationSchedule) ? assignment.destinationSchedule : [];
    const built = [];

    if (assignedSitesList.length > 0) {
      assignedSitesList.forEach((item, idx) => {
        const sObj = item.site || {};
        const schedMatch = schedArr[idx] || schedArr.find(
          (sc) => String(sc.siteName || '').trim().toLowerCase() === String(item.siteName || '').trim().toLowerCase()
        );
        built.push({
          order: idx + 1,
          id: sObj.id || item.id || `dest_${idx + 1}`,
          name: item.siteName || sObj.name || `Destination ${idx + 1}`,
          lat: sObj.lat ?? sObj.latitude ?? item.latitude ?? null,
          lng: sObj.lng ?? sObj.longitude ?? item.longitude ?? null,
          radius: parseRadius(sObj.radius ?? item.radius ?? assignment?.geofenceRadius ?? 150),
          polygon: sObj.polygon || null,
          estimatedTravelMinutes: Number(schedMatch?.estimatedTravelMinutes ?? assignment?.estimatedTravelTimeMinutes ?? 30) || 30,
          gracePeriodMinutes: Number(schedMatch?.gracePeriodMinutes ?? assignment?.travelGracePeriodMinutes ?? 10) || 10,
        });
      });
    } else if (schedArr.length > 0) {
      schedArr.forEach((sc, idx) => {
        built.push({
          order: sc.order || idx + 1,
          id: sc.siteId || `dest_${idx + 1}`,
          name: sc.siteName || `Destination ${idx + 1}`,
          lat: sc.lat ?? sc.latitude ?? null,
          lng: sc.lng ?? sc.longitude ?? null,
          radius: parseRadius(sc.radius ?? assignment?.geofenceRadius ?? 150),
          polygon: null,
          estimatedTravelMinutes: Number(sc.estimatedTravelMinutes ?? assignment?.estimatedTravelTimeMinutes ?? 30) || 30,
          gracePeriodMinutes: Number(sc.gracePeriodMinutes ?? assignment?.travelGracePeriodMinutes ?? 10) || 10,
        });
      });
    }

    if (built.length === 0) {
      this.stop();
      return;
    }

    this.active = true;
    this.employee = employee;
    this.assignment = assignment;
    this.attendanceId = attendanceId;
    this.destinations = built;
    this.currentDestIndex = 0;
    this.previousDestination = { name: 'Shift Start / Origin' };
    this.departureTimeMs = Date.now();
    this.actualArrivalTimeMs = null;
    this.travelStatus = 'In Transit';
    this.exceededLoggedForLeg = new Set();
    this.visitedDestinations = [];
    this.emit();
  }

  /**
   * Process live GPS coordinates during an active field shift.
   */
  async processLocation({ latitude, longitude, accuracy = 0, nowMs = Date.now() }) {
    if (!this.active || !this.destinations.length) return this.getSnapshot();
    if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
      return this.getSnapshot();
    }

    const accuracyBuffer = Math.min(Math.max(Number(accuracy) || 0, 0), 40);
    const currentTarget = this.getCurrentTargetDestination();

    // 1. If currently At Destination, check if employee has departed to head to the next destination
    if (this.travelStatus === 'At Destination' && this.previousDestination) {
      const prev = this.previousDestination;
      if (prev.lat != null && prev.lng != null) {
        const prevEval = evaluateGeofence(Number(latitude), Number(longitude), {
          ...prev,
          radius: (prev.radius || 150) + accuracyBuffer + 30,
        });
        if (!prevEval.inside && currentTarget) {
          // Departed previous destination -> begin travel leg to nextDestination
          this.departureTimeMs = nowMs;
          this.actualArrivalTimeMs = null;
          this.travelStatus = 'In Transit';
          this.syncTravelStateToEmployee({ latitude, longitude }).catch(() => {});
          this.emit();
        }
      }
    }

    // 2. If In Transit or Exceeded toward a target destination, check arrival or timeout
    if ((this.travelStatus === 'In Transit' || this.travelStatus === 'Exceeded') && currentTarget) {
      let arrived = false;
      if (currentTarget.lat != null && currentTarget.lng != null) {
        const targetEval = evaluateGeofence(Number(latitude), Number(longitude), {
          ...currentTarget,
          radius: (currentTarget.radius || 150) + accuracyBuffer,
        });
        arrived = targetEval.inside;
      }

      if (arrived) {
        this.actualArrivalTimeMs = nowMs;
        this.visitedDestinations.push(currentTarget.name);
        const arrivedDest = currentTarget;
        this.previousDestination = arrivedDest;

        // Log arrival to Firestore tracking_logs
        this.logDestinationArrival(arrivedDest, { latitude, longitude, accuracy }, nowMs).catch(() => {});

        // Advance to next destination if another stop exists
        if (this.currentDestIndex < this.destinations.length - 1) {
          this.currentDestIndex += 1;
          this.travelStatus = 'At Destination';
          this.departureTimeMs = null;
        } else {
          this.travelStatus = 'Arrived';
        }
        this.syncTravelStateToEmployee({ latitude, longitude }).catch(() => {});
        this.emit();
        return this.getSnapshot();
      }

      // Not arrived yet: evaluate travel time + grace window
      const estMins = this.getEstimatedMinutesForCurrentLeg();
      const graceMins = this.getGraceMinutesForCurrentLeg();
      const evalRes = evaluateTravelWindow({
        departureTimeMs: this.departureTimeMs,
        nowMs,
        estimatedTravelMinutes: estMins,
        gracePeriodMinutes: graceMins,
        arrived: false,
      });

      if (evalRes.exceeded) {
        this.travelStatus = 'Exceeded';
        const legKey = `${this.previousDestination?.name || 'Origin'}__${currentTarget.name}`;
        if (!this.exceededLoggedForLeg.has(legKey)) {
          this.exceededLoggedForLeg.add(legKey);
          const expectedArrivalStr = new Date(evalRes.expectedArrivalMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          const actualNowStr = new Date(nowMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          const originName = this.previousDestination?.name || 'Previous Destination';
          const desc = `Travel time exceeded from ${originName} to ${currentTarget.name}. Expected arrival: ${expectedArrivalStr} (allowed ${evalRes.allowedWindowMinutes}m incl. ${graceMins}m grace); still not arrived at ${actualNowStr} (${evalRes.elapsedMinutes}m elapsed).`;

          try {
            await writeSecurityEvent({
              eventType: 'TRAVEL_TIME_EXCEEDED',
              employee: this.employee || {},
              assignment: {
                ...(this.assignment || {}),
                siteId: currentTarget.id,
                siteName: currentTarget.name,
                destinationId: currentTarget.id,
              },
              coords: { latitude: Number(latitude), longitude: Number(longitude), accuracy },
              relatedAttendanceId: this.attendanceId,
              customDescription: desc,
              extra: {
                origin: originName,
                destination: currentTarget.name,
                expectedArrival: new Date(evalRes.expectedArrivalMs).toISOString(),
                actualCurrentTime: new Date(nowMs).toISOString(),
                elapsedMinutes: evalRes.elapsedMinutes,
                allowedWindowMinutes: evalRes.allowedWindowMinutes,
                estimatedTravelMinutes: estMins,
                gracePeriodMinutes: graceMins,
              },
            });
          } catch (err) {
            console.warn('[travelMonitorService] Failed to log TRAVEL_TIME_EXCEEDED:', err?.message);
          }
        }
        this.syncTravelStateToEmployee({ latitude, longitude }).catch(() => {});
        this.emit();
      }
    }

    return this.getSnapshot();
  }

  async logDestinationArrival(dest, coords, arrivalMs) {
    try {
      await ensureAuthenticatedSession();
      const companyId = this.employee?.companyId || this.assignment?.companyId || 'company_default';
      await addDoc(collection(db, 'tracking_logs'), {
        trackingType: 'mobile',
        event: 'Destination Arrival',
        action: `Arrived at ${dest.name}`,
        companyId,
        employeeId: this.employee?.id || null,
        employeeName: this.employee?.name || 'Employee',
        assignmentId: this.assignment?.id || null,
        siteId: dest.id,
        siteName: dest.name,
        previousDestination: this.previousDestination?.name || null,
        actualArrivalTime: new Date(arrivalMs).toISOString(),
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
        accuracy: coords.accuracy ?? null,
        attendanceId: this.attendanceId || null,
        timestamp: serverTimestamp(),
      });
    } catch (_) {}
  }

  async syncTravelStateToEmployee(coords = {}) {
    const empId = this.employee?.id;
    if (!empId) return;
    const snap = this.getSnapshot();
    try {
      await updateDoc(doc(db, 'employees', empId), {
        travelStatus: snap.travelStatus,
        previousDestination: snap.previousDestination,
        nextDestination: snap.nextDestination,
        expectedArrivalTime: snap.expectedArrivalTime,
        actualArrivalTime: snap.actualArrivalTime,
        ...(coords.latitude != null ? { lat: Number(coords.latitude), latitude: Number(coords.latitude) } : {}),
        ...(coords.longitude != null ? { lng: Number(coords.longitude), longitude: Number(coords.longitude) } : {}),
        lastActive: Date.now(),
      });
    } catch (_) {}
  }

  stop() {
    this.active = false;
    this.employee = null;
    this.assignment = null;
    this.attendanceId = null;
    this.destinations = [];
    this.currentDestIndex = 0;
    this.previousDestination = null;
    this.departureTimeMs = null;
    this.actualArrivalTimeMs = null;
    this.travelStatus = 'Idle';
    this.exceededLoggedForLeg.clear();
    this.visitedDestinations = [];
    this.emit();
  }
}

const travelMonitorService = new TravelMonitorService();
export default travelMonitorService;

