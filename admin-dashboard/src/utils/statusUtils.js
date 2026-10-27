// Real-time Presence Evaluation (Account must be actively open with heartbeat <= 120s)
export function isEmployeeOnline(emp, now = Date.now()) {
  if (!emp) return false;
  if (emp.isOnline === false) return false;
  if ((emp.status || '').toString().trim().toLowerCase() === 'offline') return false;

  const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen || emp.lastLocationUpdate || emp.updatedAt;
  if (rawTime) {
    const ts = typeof rawTime === 'number'
      ? rawTime
      : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
    if (ts && !isNaN(ts)) {
      return (now - ts) <= 120000; // 2 minutes active heartbeat window
    }
  }

  // Fallback to recent login only if within 2 minutes
  if (emp.lastLogin) {
    const loginTs = typeof emp.lastLogin === 'number'
      ? emp.lastLogin
      : (emp.lastLogin?.toDate ? emp.lastLogin.toDate().getTime() : new Date(emp.lastLogin).getTime());
    if (loginTs && !isNaN(loginTs)) {
      return (now - loginTs) <= 120000;
    }
  }

  return false;
}

// Real-time helper: resolve employee duty status
export function resolveEmployeeStatus(emp, now = Date.now()) {
  if (!emp) return 'Offline';

  // CRITICAL: If the employee is not actively online with a valid heartbeat, they are Offline!
  if (!isEmployeeOnline(emp, now)) {
    return 'Offline';
  }

  const rawStatus = (emp.status || '').trim();
  if (rawStatus === 'Offline') return 'Offline';
  if (rawStatus === 'On Site') return 'On Site';
  if (rawStatus === 'In Transit') return 'In Transit';
  if (rawStatus === 'On Duty') return 'On Duty';

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
