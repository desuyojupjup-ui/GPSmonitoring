// Real-time Presence Evaluation (Account must be actively open with heartbeat <= 120s)
export function isEmployeeOnline(emp, customNow) {
  if (!emp) return false;
  if (emp.isOnline === false) return false;
  if ((emp.status || '').toString().trim().toLowerCase() === 'offline') return false;

  // Protect against Array.prototype.filter/map/forEach passing (item, index, array)
  const now = (typeof customNow === 'number' && customNow > 1000000000000) ? customNow : Date.now();

  const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen || emp.lastLocationUpdate || emp.updatedAt;
  if (rawTime) {
    const ts = typeof rawTime === 'number'
      ? rawTime
      : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
    if (ts && !isNaN(ts)) {
      const diff = now - ts;
      return diff >= 0 && diff <= 120000; // 2 minutes active heartbeat window
    }
  }

  // Fallback to recent login only if within 2 minutes
  if (emp.lastLogin) {
    const loginTs = typeof emp.lastLogin === 'number'
      ? emp.lastLogin
      : (emp.lastLogin?.toDate ? emp.lastLogin.toDate().getTime() : new Date(emp.lastLogin).getTime());
    if (loginTs && !isNaN(loginTs)) {
      const diff = now - loginTs;
      return diff >= 0 && diff <= 120000;
    }
  }

  return false;
}

/**
 * Determine if GPS coordinates are inside a circular geofence radius.
 */
export function isInsideGeofence(lat, lng, centerLat, centerLng, radiusMeters) {
  if (lat == null || lng == null || centerLat == null || centerLng == null) return false;
  const R = 6371000; // Earth radius in metres
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat - centerLat);
  const dLng = toRad(lng - centerLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(centerLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c) <= radiusMeters;
}

/**
 * Calculate distance in meters between two coordinates.
 */
export function getDistanceToSite(lat, lng, centerLat, centerLng) {
  if (lat == null || lng == null || centerLat == null || centerLng == null) return null;
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat - centerLat);
  const dLng = toRad(lng - centerLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(centerLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Helper: determine if an employee has completed check out.
 * Checked out personnel should NEVER be placed on duty or on site.
 */
export function hasEmployeeCheckedOut(emp, attendance = []) {
  if (!emp) return false;

  const rawStatus = (emp.status || '').toString().trim().toLowerCase();
  const attStatus = (emp.attendanceStatus || '').toString().trim().toLowerCase();

  // 1. Direct explicit status flags on employee document
  if (
    rawStatus === 'completed' ||
    rawStatus === 'checked out' ||
    rawStatus === 'checkedout' ||
    rawStatus === 'done' ||
    rawStatus === 'shift completed' ||
    attStatus === 'completed' ||
    attStatus === 'checked out'
  ) {
    return true;
  }

  // 2. Check lastCheckOut vs lastCheckIn timestamp on employee
  if (emp.lastCheckOut) {
    const outTs = typeof emp.lastCheckOut === 'number'
      ? emp.lastCheckOut
      : (emp.lastCheckOut?.toDate ? emp.lastCheckOut.toDate().getTime() : new Date(emp.lastCheckOut).getTime());
    const inTs = emp.lastCheckIn
      ? (typeof emp.lastCheckIn === 'number'
          ? emp.lastCheckIn
          : (emp.lastCheckIn?.toDate ? emp.lastCheckIn.toDate().getTime() : new Date(emp.lastCheckIn).getTime()))
      : 0;
    if (outTs && !isNaN(outTs) && outTs >= inTs) {
      const outDate = new Date(outTs).toDateString();
      const todayDate = new Date().toDateString();
      if (outDate === todayDate) {
        return true;
      }
    }
  }

  // 3. Check attendance collection records if available
  if (Array.isArray(attendance) && attendance.length > 0) {
    const empIds = [
      emp.id,
      emp.uid,
      emp.employeeId,
      emp.empId,
    ].filter(Boolean).map(x => String(x).trim().toLowerCase());

    const empEmails = [
      emp.email,
      emp.empEmail,
      emp.workEmail,
    ].filter(Boolean).map(x => String(x).trim().toLowerCase());

    const empName = (emp.name || emp.displayName || '').trim().toLowerCase();

    const matchingAtt = attendance.filter(a => {
      const aId = (a.employeeId || a.empId || a.userId || a.employee_id || '').toString().trim().toLowerCase();
      const aEmail = (a.employeeEmail || a.email || a.empEmail || a.userEmail || '').toString().trim().toLowerCase();
      const aName = (a.employeeName || a.empName || a.name || a.employee_name || '').toString().trim().toLowerCase();

      if (aId && empIds.includes(aId)) return true;
      if (aEmail && empEmails.includes(aEmail)) return true;
      if (empName && aName && aName === empName) return true;
      return false;
    });

    if (matchingAtt.length > 0) {
      const sorted = matchingAtt.slice().sort((x, y) => {
        const getTs = item => {
          const raw = item.timeOut || item.timeIn || item.timestamp || item.createdAt;
          if (!raw) return 0;
          if (typeof raw === 'number') return raw;
          if (raw?.toDate) return raw.toDate().getTime();
          return new Date(raw).getTime() || 0;
        };
        return getTs(y) - getTs(x);
      });

      const latest = sorted[0];
      const hasTimeOut = Boolean(latest.timeOut || latest.checkOut || latest.check_out || latest.out);
      const isCompletedStatus = (latest.status || '').toString().trim().toLowerCase() === 'completed';

      if (hasTimeOut || isCompletedStatus) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Helper: determine if an employee is currently active on shift.
 * Evaluates whether the employee clocked in today without checking out,
 * has an active attendance session, or is actively online on duty.
 */
export function isEmployeeActiveOnShift(emp, attendance = []) {
  if (!emp) return false;

  // 1. If checked out or completed, strictly NOT active on shift
  if (hasEmployeeCheckedOut(emp, attendance)) {
    return false;
  }

  const rawStatus = (emp.status || '').toString().trim().toLowerCase();
  const attStatus = (emp.attendanceStatus || '').toString().trim().toLowerCase();

  if (rawStatus === 'completed' || rawStatus === 'checked out' || attStatus === 'completed' || attStatus === 'checked out') {
    return false;
  }

  const todayStr = new Date().toDateString();

  // 2. Check lastCheckIn timestamp on employee document
  if (emp.lastCheckIn) {
    const inTs = typeof emp.lastCheckIn === 'number'
      ? emp.lastCheckIn
      : (emp.lastCheckIn?.toDate ? emp.lastCheckIn.toDate().getTime() : new Date(emp.lastCheckIn).getTime());
    if (inTs && !isNaN(inTs) && new Date(inTs).toDateString() === todayStr) {
      return true;
    }
  }

  // 3. Check today's attendance records in attendance collection
  if (Array.isArray(attendance) && attendance.length > 0) {
    const empIds = [
      emp.id,
      emp.uid,
      emp.employeeId,
      emp.empId,
    ].filter(Boolean).map(x => String(x).trim().toLowerCase());

    const empEmails = [
      emp.email,
      emp.empEmail,
      emp.workEmail,
    ].filter(Boolean).map(x => String(x).trim().toLowerCase());

    const empName = (emp.name || emp.displayName || '').trim().toLowerCase();

    const matchingAtt = attendance.filter(a => {
      const aId = (a.employeeId || a.empId || a.userId || a.employee_id || '').toString().trim().toLowerCase();
      const aEmail = (a.employeeEmail || a.email || a.empEmail || a.userEmail || '').toString().trim().toLowerCase();
      const aName = (a.employeeName || a.empName || a.name || a.employee_name || '').toString().trim().toLowerCase();

      if (aId && empIds.includes(aId)) return true;
      if (aEmail && empEmails.includes(aEmail)) return true;
      if (empName && aName && aName === empName) return true;
      return false;
    });

    for (const a of matchingAtt) {
      const hasTimeOut = Boolean(a.timeOut || a.checkOut || a.check_out || a.out);
      const isCompleted = (a.status || '').toString().trim().toLowerCase() === 'completed';
      if (!hasTimeOut && !isCompleted) {
        const rawTime = a.timeIn || a.checkIn || a.timestamp || a.createdAt;
        if (rawTime) {
          const ts = typeof rawTime === 'number' ? rawTime : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
          if (ts && !isNaN(ts) && new Date(ts).toDateString() === todayStr) {
            return true;
          }
        }
        if (a.date) {
          const dStr = typeof a.date === 'string' ? a.date : new Date(a.date).toDateString();
          if (dStr === todayStr || dStr.includes(new Date().getFullYear().toString())) {
            return true;
          }
        }
      }
    }
  }

  // 4. Check active duty statuses
  if (
    rawStatus === 'on duty' ||
    rawStatus === 'on site' ||
    rawStatus === 'in transit' ||
    rawStatus === 'present' ||
    attStatus === 'on duty' ||
    attStatus === 'on site' ||
    attStatus === 'present'
  ) {
    return true;
  }

  // 5. Check if actively online right now
  if (isEmployeeOnline(emp)) {
    return true;
  }

  return false;
}

/**
 * Strict evaluation of whether an employee is currently verified "On Site".
 * 
 * For Fixed Site Employees:
 *   - Must be actively on shift or online
 *   - Must NOT have checked out
 *   - Must be active on shift at assigned site
 *   - Must be CONFIRMED INSIDE the assigned site's geofence radius border
 *   - If outside the geofence radius border (by GPS coords or breach status), they are strictly NOT counted!
 */
export function isEmployeeOnSite(emp, sites = [], assignments = [], attendanceOrNow = [], customNow) {
  if (!emp) return false;

  let now = Date.now();
  let attendance = [];
  if (typeof attendanceOrNow === 'number' && attendanceOrNow > 1000000000000) {
    now = attendanceOrNow;
  } else if (Array.isArray(attendanceOrNow)) {
    attendance = attendanceOrNow;
    if (typeof customNow === 'number' && customNow > 1000000000000) {
      now = customNow;
    }
  }

  // If employee has done check out, they are NOT on site!
  if (hasEmployeeCheckedOut(emp, attendance)) {
    return false;
  }

  const rawStatus = (emp.status || '').trim();
  if (rawStatus === 'Completed' || rawStatus === 'Checked Out') {
    return false;
  }

  // Must be active on shift or actively online with valid session
  const isActive = isEmployeeActiveOnShift(emp, attendance) || isEmployeeOnline(emp, now);
  if (!isActive) {
    return false;
  }

  // Immediate rejection if explicit geofence status indicates a breach / outside
  if (
    emp.geofenceStatus === 'Outside Assigned Site' ||
    emp.geofenceStatus === 'Outside Site' ||
    emp.geofenceStatus === 'Outside' ||
    emp.isInsideGeofence === false
  ) {
    return false;
  }

  const workType = resolveEmployeeWorkType(emp, assignments);
  const isFixed = workType === 'Fixed Site Employee';

  // Mobile field employees moving along routes or in transit are not On Site
  if (!isFixed) {
    if (rawStatus === 'In Transit') return false;
    return rawStatus === 'On Site' || (emp.attendanceStatus || '').trim().toLowerCase() === 'on site';
  }

  // ── FIXED SITE EMPLOYEE RULES ──
  // 1. Find assigned site(s)
  const siteKeys = [
    emp.assignedSiteId,
    emp.assignedSite,
    emp.siteId,
    emp.site,
    ...(Array.isArray(emp.assignedSites) ? emp.assignedSites : [])
  ].filter(Boolean).map(x => String(x).trim().toLowerCase());

  let matchedSites = Array.isArray(sites)
    ? sites.filter(s => {
        const sId = (s.id || '').toString().trim().toLowerCase();
        const sName = (s.name || '').toString().trim().toLowerCase();
        return siteKeys.includes(sId) || siteKeys.includes(sName);
      })
    : [];

  // Fallback to active assignment's site if not matched on employee doc
  if (matchedSites.length === 0 && Array.isArray(assignments)) {
    const activeAsg = assignments.find(a =>
      (a.employeeId === emp.id || a.employeeEmail === emp.email) &&
      (a.status === 'Active' || a.status === 'In Progress')
    );
    if (activeAsg && Array.isArray(sites)) {
      const asgSiteKeys = [
        activeAsg.siteId,
        activeAsg.site,
        activeAsg.siteName,
        ...(Array.isArray(activeAsg.assignedSites) ? activeAsg.assignedSites : [])
      ].filter(Boolean).map(x => String(x).trim().toLowerCase());

      matchedSites = sites.filter(s => {
        const sId = (s.id || '').toString().trim().toLowerCase();
        const sName = (s.name || '').toString().trim().toLowerCase();
        return asgSiteKeys.includes(sId) || asgSiteKeys.includes(sName);
      });
    }
  }

  // 2. Check live GPS coordinates against assigned site(s) radius border
  const empLat = typeof emp.lat === 'number' ? emp.lat : (typeof emp.latitude === 'number' ? emp.latitude : null);
  const empLng = typeof emp.lng === 'number' ? emp.lng : (typeof emp.longitude === 'number' ? emp.longitude : null);

  if (empLat !== null && empLng !== null && matchedSites.length > 0) {
    const sitesWithCoords = matchedSites.filter(s => {
      const sLat = typeof s.lat === 'number' ? s.lat : (typeof s.latitude === 'number' ? s.latitude : null);
      const sLng = typeof s.lng === 'number' ? s.lng : (typeof s.longitude === 'number' ? s.longitude : null);
      return sLat !== null && sLng !== null;
    });

    if (sitesWithCoords.length > 0) {
      // Check if employee is within radius border of ANY of their assigned sites
      const isInsideAnySite = sitesWithCoords.some(s => {
        const sLat = typeof s.lat === 'number' ? s.lat : s.latitude;
        const sLng = typeof s.lng === 'number' ? s.lng : s.longitude;
        const radius = typeof emp.geofenceRadius === 'number'
          ? emp.geofenceRadius
          : (typeof s.radius === 'number' ? s.radius : (parseInt(s.radius) || 20));

        return isInsideGeofence(empLat, empLng, sLat, sLng, radius);
      });

      if (!isInsideAnySite) {
        // Confirmed outside the geofence radius border -> NOT COUNTED!
        return false;
      }
      return true;
    }
  }

  // 3. If no GPS fix available yet, check confirmed geofence status
  if (
    emp.geofenceStatus === 'Inside Assigned Site' ||
    emp.geofenceStatus === 'Inside' ||
    emp.geofenceStatus === 'Inside Site' ||
    emp.isInsideGeofence === true
  ) {
    return true;
  }

  // If status is explicitly On Site, has assigned site, and no breach reported, count as On Site
  if (rawStatus === 'On Site' || (emp.attendanceStatus || '').trim().toLowerCase() === 'on site') {
    return true;
  }

  // If checked in today without breach, and assigned site exists
  if (matchedSites.length > 0 && isEmployeeActiveOnShift(emp, attendance)) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether an employee has an active site assignment for today.
 */
export function hasActiveSiteAssignment(emp, assignments = [], sites = []) {
  if (!emp) return false;

  // 1. Check matching active assignments from database
  if (Array.isArray(assignments) && assignments.length > 0) {
    const empIds = [emp.id, emp.uid, emp.employeeId, emp.empId].filter(Boolean).map(x => String(x).trim().toLowerCase());
    const empEmails = [emp.email, emp.empEmail, emp.workEmail].filter(Boolean).map(x => String(x).trim().toLowerCase());
    const empName = (emp.name || emp.displayName || '').trim().toLowerCase();

    const activeAsg = assignments.find(a => {
      const aId = (a.employeeId || a.empId || a.userId || a.employee_id || '').toString().trim().toLowerCase();
      const aEmail = (a.employeeEmail || a.email || a.empEmail || a.userEmail || '').toString().trim().toLowerCase();
      const aName = (a.employeeName || a.empName || a.name || a.assignedTo || '').toString().trim().toLowerCase();

      const isMatch = (aId && empIds.includes(aId)) ||
                      (aEmail && empEmails.includes(aEmail)) ||
                      (empName && aName && (aName === empName || aName.includes(empName) || empName.includes(aName)));
      if (!isMatch) return false;

      const st = (a.status || 'Active').toString().trim().toLowerCase();
      if (st === 'completed' || st === 'cancelled' || st === 'archived' || st === 'expired' || st === 'inactive') {
        return false;
      }

      const hasSite = Boolean(a.site || a.siteName || a.siteId || (Array.isArray(a.assignedSites) && a.assignedSites.length > 0));
      if (!hasSite) return false;

      // Check recurring workDays if present
      if (Array.isArray(a.workDays) && a.workDays.length > 0) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayIdx = new Date().getDay();
        const full = dayNames[dayIdx].toLowerCase();
        const abbr = dayAbbrs[dayIdx].toLowerCase();
        const isToday = a.workDays.some(w => {
          if (!w || typeof w !== 'string') return false;
          const cl = w.trim().toLowerCase();
          return cl === full || cl === abbr || full.startsWith(cl) || cl.startsWith(abbr);
        });
        if (!isToday) return false;
      }

      return true;
    });

    if (activeAsg) return true;
  }

  // 2. Check employee profile assignedSite / site
  const profileSite = (emp.assignedSite || emp.site || emp.assignedSiteName || '').toString().trim();
  if (profileSite && profileSite.toLowerCase() !== 'unassigned' && profileSite.toLowerCase() !== 'none' && profileSite.toLowerCase() !== 'no site assigned') {
    if (Array.isArray(emp.workDays) && emp.workDays.length > 0) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayIdx = new Date().getDay();
      const full = dayNames[dayIdx].toLowerCase();
      const abbr = dayAbbrs[dayIdx].toLowerCase();
      const isToday = emp.workDays.some(w => {
        if (!w || typeof w !== 'string') return false;
        const cl = w.trim().toLowerCase();
        return cl === full || cl === abbr || full.startsWith(cl) || cl.startsWith(abbr);
      });
      if (!isToday) return false;
    }
    return true;
  }

  return false;
}

/**
 * Evaluates whether an employee has an active scheduled shift for today.
 * Returns false if:
 * - Shift is 'Flexible', 'Unassigned', 'None', or 'No Shift Scheduled'
 * - Today is not one of the scheduled workDays
 */
export function hasActiveShiftSchedule(emp, assignments = []) {
  if (!emp) return false;

  let shiftStr = '';
  let workDays = Array.isArray(emp.workDays) ? emp.workDays : null;

  if (Array.isArray(assignments) && assignments.length > 0) {
    const empIds = [emp.id, emp.uid, emp.employeeId, emp.empId].filter(Boolean).map(x => String(x).trim().toLowerCase());
    const empEmails = [emp.email, emp.empEmail, emp.workEmail].filter(Boolean).map(x => String(x).trim().toLowerCase());
    const empName = (emp.name || emp.displayName || '').trim().toLowerCase();

    const matching = assignments.find(a => {
      const aId = (a.employeeId || a.empId || a.userId || a.employee_id || '').toString().trim().toLowerCase();
      const aEmail = (a.employeeEmail || a.email || a.empEmail || a.userEmail || '').toString().trim().toLowerCase();
      const aName = (a.employeeName || a.empName || a.name || a.assignedTo || '').toString().trim().toLowerCase();

      return (aId && empIds.includes(aId)) ||
             (aEmail && empEmails.includes(aEmail)) ||
             (empName && aName && (aName === empName || aName.includes(empName) || empName.includes(aName)));
    });

    if (matching) {
      shiftStr = matching.shift || matching.shiftTime || matching.scheduledShift || matching.schedule || '';
      if (Array.isArray(matching.workDays) && matching.workDays.length > 0) {
        workDays = matching.workDays;
      }
    }
  }

  if (!shiftStr) {
    shiftStr = emp.shift || emp.scheduledShift || emp.shiftTime || '';
  }

  const sLower = shiftStr.toString().trim().toLowerCase();
  if (!sLower || sLower === 'flexible' || sLower === 'unassigned' || sLower === 'none' || sLower === 'no shift scheduled') {
    return false;
  }

  if (Array.isArray(workDays) && workDays.length > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayIdx = new Date().getDay();
    const full = dayNames[dayIdx].toLowerCase();
    const abbr = dayAbbrs[dayIdx].toLowerCase();
    const isToday = workDays.some(w => {
      if (!w || typeof w !== 'string') return false;
      const cl = w.trim().toLowerCase();
      return cl === full || cl === abbr || full.startsWith(cl) || cl.startsWith(abbr);
    });
    if (!isToday) return false;
  }

  return true;
}

// Real-time helper: resolve employee duty status
export function resolveEmployeeStatus(emp, sitesOrNow, assignments = [], attendanceOrNow = [], customNow) {
  if (!emp) return 'Offline';

  let now = Date.now();
  let sites = [];
  let attendance = [];

  if (typeof sitesOrNow === 'number' && sitesOrNow > 1000000000000) {
    now = sitesOrNow;
  } else if (Array.isArray(sitesOrNow)) {
    sites = sitesOrNow;
  }

  if (typeof attendanceOrNow === 'number' && attendanceOrNow > 1000000000000) {
    now = attendanceOrNow;
  } else if (Array.isArray(attendanceOrNow)) {
    attendance = attendanceOrNow;
    if (typeof customNow === 'number' && customNow > 1000000000000) {
      now = customNow;
    }
  }

  // 1. CRITICAL: If employee has completed check out, they are NEVER On Duty or On Site!
  if (hasEmployeeCheckedOut(emp, attendance)) {
    return 'Completed';
  }

  const rawStatus = (emp.status || '').trim();
  if (rawStatus === 'Completed' || rawStatus === 'Checked Out') return 'Completed';

  // 2. Strict Requirement: If no active site assignment or no shift scheduled, do NOT status On Duty or On Site
  const hasSiteAsg = hasActiveSiteAssignment(emp, assignments, sites);
  const hasSchedule = hasActiveShiftSchedule(emp, assignments);

  if (!hasSiteAsg || !hasSchedule) {
    if (isEmployeeOnline(emp, now)) {
      return 'Online';
    }
    return 'Offline';
  }

  // 3. Check if verified On Site within geofence radius border
  if (isEmployeeOnSite(emp, sites, assignments, attendance, now)) {
    return 'On Site';
  }

  if (rawStatus === 'In Transit') return 'In Transit';

  // 4. Check if active on shift today (clocked in without checkout)
  if (isEmployeeActiveOnShift(emp, attendance)) {
    return 'On Duty';
  }

  // 5. Actively online with app session
  if (isEmployeeOnline(emp, now)) {
    if (rawStatus === 'On Site' || rawStatus === 'On Duty') {
      return 'On Duty';
    }
    return 'Online';
  }

  return 'Offline';
}

// Real-time helper: resolve employee work type
export function resolveEmployeeWorkType(emp, assignments = []) {
  if (!emp) return 'Fixed Site Employee';
  const wt = (emp.workType || '').trim();

  if (wt.toLowerCase().includes('mobile') || wt.toLowerCase().includes('field') || wt.toLowerCase().includes('transit') || wt.toLowerCase().includes('driver') || wt.toLowerCase().includes('roving')) {
    return 'Mobile Field Employee';
  }
  if (wt.toLowerCase().includes('fixed') || wt.toLowerCase().includes('site') || wt.toLowerCase().includes('office') || wt.toLowerCase().includes('building')) {
    return 'Fixed Site Employee';
  }

  // Check assigned route / destinations
  if (emp.assignedRoute || (emp.assignedDestinations && emp.assignedDestinations.length > 0)) {
    return 'Mobile Field Employee';
  }

  // Check assigned site
  if (emp.assignedSite || emp.assignedSiteId) {
    return 'Fixed Site Employee';
  }

  // Check role or type
  const roleType = (emp.type || emp.role || '').toLowerCase();
  if (roleType.includes('mobile') || roleType.includes('field') || roleType.includes('driver') || roleType.includes('patrol')) {
    return 'Mobile Field Employee';
  }

  // Check active assignment
  const activeAsg = assignments.find(a => (a.employeeId === emp.id || a.employeeEmail === emp.email) && a.status === 'Active');
  if (activeAsg) {
    if (activeAsg.route || activeAsg.destinations?.length > 0 || (activeAsg.workType && activeAsg.workType.toLowerCase().includes('mobile'))) {
      return 'Mobile Field Employee';
    }
    if (activeAsg.site || activeAsg.siteName || activeAsg.siteId) {
      return 'Fixed Site Employee';
    }
  }

  // Default in this GPS site monitoring portal is Fixed Site Employee
  return 'Fixed Site Employee';
}
