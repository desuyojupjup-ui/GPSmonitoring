// ──────────────────────────────────────────────────────────────────────────
// locationLogService.js
//
// Automatically captures and saves employee GPS locations to the Location Log:
//  1. Immediate capture upon Check-In.
//  2. Periodic recording every 5 minutes while the employee remains checked in.
//  3. Updates employee real-time coordinates for live admin map tracking.
//  4. Cleanly stops logging upon Check-Out or session termination.
// ──────────────────────────────────────────────────────────────────────────
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, collection, addDoc, serverTimestamp, doc, updateDoc, ensureAuthenticatedSession, subscribeToLogout } from '../firebase';

const ASG_LOG_SESSION_KEY = '@geostride_active_location_log_session';
const FIVE_MINUTES_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)

class LocationLogService {
  constructor() {
    this.intervalId = null;
    this.activeSession = null;
    this.isRecording = false;
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
      : '5-Minute Periodic Location Recorded';

    const eventText = trigger === 'check_in'
      ? 'Check-In Location'
      : 'Periodic 5-Min GPS Track';

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
      trigger, // 'check_in' or 'periodic_5min'
      action: actionText,
      event: eventText,
      trackingType: 'location_log',
      recordedAt: new Date().toISOString(),
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    };

    try {
      // 1. Write to PascalCase LocationLogs (Flutter, Firestore rules, and admin exports)
      await addDoc(collection(db, 'LocationLogs'), logData).catch((err) => {
        console.warn('[locationLogService] LocationLogs write warning:', err?.message);
      });

      // 2. Write to lowercase location_logs (Admin DelayReportList GPS verification)
      await addDoc(collection(db, 'location_logs'), logData).catch((err) => {
        console.warn('[locationLogService] location_logs write warning:', err?.message);
      });

      // 3. Write to tracking_logs (Admin Dashboard Recent Location Logs widget)
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
      return await this.saveLocationLogEntry({
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
    }

    return null;
  }

  /**
   * Start periodic 5-minute location recording for the current checked-in shift.
   */
  async startPeriodicLogging({ employee, site, assignment, attendanceId }) {
    this.stopPeriodicLogging(); // ensure any previous interval is cleared

    this.activeSession = {
      employee,
      site,
      assignment,
      attendanceId,
      startedAt: Date.now(),
    };
    this.isRecording = true;

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

    console.log('[locationLogService] Started 5-minute periodic location recording interval.');

    // Execute every 5 minutes (300,000 ms)
    this.intervalId = setInterval(async () => {
      if (!this.isRecording || !this.activeSession) return;

      console.log('[locationLogService] 5-minute timer fired, capturing periodic location...');
      await this.captureAndSaveCurrentLocation({
        employee: this.activeSession.employee,
        site: this.activeSession.site,
        assignment: this.activeSession.assignment,
        attendanceId: this.activeSession.attendanceId,
        trigger: 'periodic_5min',
      });
    }, FIVE_MINUTES_MS);
  }

  /**
   * Stop periodic location recording when the employee checks out or logs out.
   */
  async stopPeriodicLogging() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.activeSession = null;
    this.isRecording = false;

    try {
      await AsyncStorage.removeItem(ASG_LOG_SESSION_KEY);
    } catch (e) {}

    console.log('[locationLogService] Stopped 5-minute periodic location recording.');
  }

  /**
   * Check whether the 5-minute location recording interval is currently active.
   */
  isPeriodicLoggingActive() {
    return this.isRecording && this.intervalId !== null;
  }
}

const locationLogService = new LocationLogService();

try {
  subscribeToLogout(() => {
    locationLogService.stopPeriodicLogging();
  });
} catch (e) {}

export default locationLogService;
