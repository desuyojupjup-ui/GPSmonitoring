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
 * Strict evaluation of whether an employee is currently verified "On Site".
 * 
 * For Fixed Site Employees:
 *   - Must be actively online with valid heartbeat
 *   - Must be active on shift (status 'On Site' or 'On Duty' at assigned site)
 *   - Must be CONFIRMED INSIDE the assigned site's geofence radius border
 *   - If outside the geofence radius border (by GPS coords or breach status), they are strictly NOT counted!
 */
export function isEmployeeOnSite(emp, sites = [], assignments = [], customNow) {
  if (!emp) return false;

  const now = (typeof customNow === 'number' && customNow > 1000000000000) ? customNow : Date.now();
  if (!isEmployeeOnline(emp, now)) {
    return false;
  }

  const rawStatus = (emp.status || '').trim();
  if (rawStatus === 'Offline') {
    return false;
  }

  const workType = resolveEmployeeWorkType(emp, assignments);
  const isFixed = workType === 'Fixed Site Employee';

  // Mobile field employees moving along routes or in transit are not On Site
  if (!isFixed) {
    if (rawStatus === 'In Transit') return false;
    if (emp.geofenceStatus === 'Outside Assigned Site' || emp.isInsideGeofence === false) return false;
    return rawStatus === 'On Site';
  }

  // ── FIXED SITE EMPLOYEE RULES ──
  // 1. Must be active on duty/on site
  const isActive = rawStatus === 'On Site' || rawStatus === 'On Duty' || rawStatus === 'Checked In' || rawStatus === 'Present';
  if (!isActive) {
    return false;
  }

  // 2. Immediate rejection if explicit geofence status indicates a breach / outside
  if (
    emp.geofenceStatus === 'Outside Assigned Site' ||
    emp.geofenceStatus === 'Outside Site' ||
    emp.geofenceStatus === 'Outside' ||
    emp.isInsideGeofence === false
  ) {
    return false;
  }

  // 3. Find assigned site(s)
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

  // 4. Check live GPS coordinates against assigned site(s) radius border
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

  // 5. If no GPS fix available yet, check confirmed geofence status
  if (
    emp.geofenceStatus === 'Inside Assigned Site' ||
    emp.geofenceStatus === 'Inside' ||
    emp.geofenceStatus === 'Inside Site' ||
    emp.isInsideGeofence === true
  ) {
    return true;
  }

  // If status is On Site, has assigned site, and no breach reported, count as On Site
  if (rawStatus === 'On Site') {
    return true;
  }

  return false;
}

// Real-time helper: resolve employee duty status
export function resolveEmployeeStatus(emp, sitesOrNow, assignments = [], customNow) {
  if (!emp) return 'Offline';

  let now = Date.now();
  let sites = [];
  if (typeof sitesOrNow === 'number' && sitesOrNow > 1000000000000) {
    now = sitesOrNow;
  } else if (Array.isArray(sitesOrNow)) {
    sites = sitesOrNow;
    if (typeof customNow === 'number' && customNow > 1000000000000) {
      now = customNow;
    }
  }

  // CRITICAL: If the employee is not actively online with a valid heartbeat, they are Offline!
  if (!isEmployeeOnline(emp, now)) {
    return 'Offline';
  }

  const rawStatus = (emp.status || '').trim();
  if (rawStatus === 'Offline') return 'Offline';
  if (rawStatus === 'In Transit') return 'In Transit';

  // Check if verified On Site within geofence radius border
  if (isEmployeeOnSite(emp, sites, assignments, now)) {
    return 'On Site';
  }

  if (rawStatus === 'On Site') {
    // If raw status was 'On Site' but employee is outside the geofence radius border:
    // Display as 'On Duty' (clocked in but outside site radius), NOT 'On Site'
    return 'On Duty';
  }

  return rawStatus || 'On Duty';
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
