import { auth } from '../firebase';

/**
 * Returns true if the assignment is expired/done and should NOT be shown to the employee.
 */
export function isAssignmentDatePassed(asg) {
  if (!asg) return true;
  const status = (asg.status || '').toString().trim().toLowerCase();
  
  // Explicitly terminated statuses
  if (status === 'completed' || status === 'cancelled' || status === 'archived' || status === 'expired' || status === 'inactive') {
    return true;
  }

  // Check scheduled assignment date: if date is strictly in the past (before today), it has expired!
  const rawDate = asg.assignDate || asg.scheduleDate || asg.date || asg.assignmentDate || asg.scheduledDate || asg.endDate;
  if (rawDate) {
    let dateObj = null;

    if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
      try { dateObj = rawDate.toDate(); } catch (_) {}
    } else if (typeof rawDate?.seconds === 'number') {
      dateObj = new Date(rawDate.seconds * 1000);
    } else if (typeof rawDate === 'number') {
      dateObj = new Date(rawDate);
    } else if (typeof rawDate === 'string') {
      const trimmed = rawDate.trim();
      const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10) - 1;
        const day = parseInt(ymdMatch[3], 10);
        dateObj = new Date(year, month, day, 23, 59, 59, 999);
      } else {
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          dateObj = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
        }
      }
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      const now = new Date();
      // If the scheduled date (end of that calendar day) has already elapsed, it has expired!
      if (dateObj.getTime() < now.getTime()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Format a single time string (e.g. "08:00", "17:00", "17:00:00", "8:00 AM") into 12-hour format "hh:mm AM/PM"
 */
export function formatSingleTimeToken(t) {
  if (!t || typeof t !== 'string') return '';
  const str = t.trim();
  if (!str) return '';

  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const min = ampmMatch[2];
    const ampm = ampmMatch[3].toUpperCase();
    if (h > 12) h = h % 12 || 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
  }

  const h24Match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24Match) {
    let h = parseInt(h24Match[1], 10);
    const min = h24Match[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
  }

  return str;
}

/**
 * Resolves a unified 12-hour shift string from an assignment or employee object.
 */
export function resolveShift(asg, emp) {
  if (!asg && (!emp?.shift || emp.shift === 'Unassigned')) return 'Unassigned';

  const raw =
    (asg?.shift && asg.shift.trim())                                     ? asg.shift.trim() :
    (asg?.shiftTime && asg.shiftTime.trim())                             ? asg.shiftTime.trim() :
    (asg?.shiftStart && asg?.shiftEnd)                                   ? `${asg.shiftStart} - ${asg.shiftEnd}` :
    (asg?.startTime && asg?.endTime)                                     ? `${asg.startTime} - ${asg.endTime}` :
    (asg?.shiftStart || asg?.shiftEnd || asg?.startTime || asg?.endTime) ? (asg?.shiftStart || asg?.shiftEnd || asg?.startTime || asg?.endTime) :
    (emp?.shift && emp.shift.trim() && emp.shift !== 'Unassigned')       ? emp.shift.trim() :
    'Unassigned';

  if (!raw || raw === 'Unassigned') return 'Unassigned';

  const parts = raw.split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
  if (parts.length === 2) {
    const startFormatted = formatSingleTimeToken(parts[0]);
    const endFormatted = formatSingleTimeToken(parts[1]);
    if (startFormatted && endFormatted) {
      return `${startFormatted} - ${endFormatted}`;
    }
  }

  if (parts.length === 1) {
    const single = formatSingleTimeToken(parts[0]);
    if (single) return single;
  }

  return raw;
}

/**
 * STRICT: Returns true ONLY if the assignment explicitly belongs to this employee
 * via email, employee ID, or name match.
 * 
 * Removed the "site fallback" that was incorrectly showing any assignment for a site
 * to ALL employees at that site, even if the assignment was for a different employee.
 */
export function isAssignmentForEmployee(asg, empData, userEmail, userName) {
  if (!asg) return false;

  const currentAuthUid = auth?.currentUser?.uid || '';

  // ── Build employee identity sets ──────────────────────────────────────────
  const empIds = [
    empData?.idNum,
    empData?.empId,
    empData?.employeeId,
    empData?.uid,
    currentAuthUid,
    empData?.id,
  ].filter(x => x && x.toString().trim() !== '' && x.toString().trim() !== 'emp_fallback')
   .map(x => x.toString().trim().toLowerCase());

  const userMailClean  = (userEmail || '').trim().toLowerCase();
  const empMailClean   = (empData?.email || '').trim().toLowerCase();
  const rawAuthMail    = (auth?.currentUser?.email || '').trim().toLowerCase();
  const authMailClean  = rawAuthMail && !rawAuthMail.includes('admin@') ? rawAuthMail : '';
  const empEmails      = [...new Set([userMailClean, empMailClean, authMailClean].filter(Boolean))];
  const emailPrefixes  = empEmails.map(e => e.split('@')[0].trim().toLowerCase()).filter(Boolean);

  const empNameClean   = (empData?.name || '').trim().toLowerCase();
  const rawAuthName    = (auth?.currentUser?.displayName || '').trim().toLowerCase();
  const authNameClean  = (rawAuthMail && rawAuthMail.includes('admin@')) ? '' : rawAuthName;
  const passedNameClean = (userName || '').trim().toLowerCase();
  const empNames = [...new Set([empNameClean, authNameClean, passedNameClean].filter(Boolean))];

  // ── Assignment identity fields ─────────────────────────────────────────────
  const asgEmail = (asg.employeeEmail || asg.empEmail || asg.email || asg.userEmail || '').trim().toLowerCase();
  const asgName  = (asg.employeeName  || asg.empName  || asg.assignedTo || asg.assignedEmployee || asg.guard || asg.employee || '').trim().toLowerCase();
  const asgId    = (asg.employeeId    || asg.empId     || asg.employee_id || asg.guardId || '').toString().trim().toLowerCase();
  const asgUid   = (asg.employeeUid   || asg.firebaseUid || asg.uid || asg.userUid || '').toString().trim().toLowerCase();

  // ── 1. UID match ────────────────────────────────────────────────────────────
  if (asgUid && currentAuthUid && asgUid === currentAuthUid.toLowerCase()) return true;
  if (asgUid && empIds.includes(asgUid)) return true;

  // ── 2. Employee ID match ────────────────────────────────────────────────────
  if (asgId && empIds.some(id => id === asgId)) return true;

  // ── 3. Email exact match ────────────────────────────────────────────────────
  if (asgEmail && empEmails.includes(asgEmail)) return true;

  // ── 4. Email prefix match (e.g. "jupiter" matches "jupiter@gmail.com") ─────
  if (asgEmail) {
    const asgEmailPrefix = asgEmail.split('@')[0];
    if (asgEmailPrefix && emailPrefixes.includes(asgEmailPrefix)) return true;
    // Also check if any employee email starts with the assignment email prefix
    if (asgEmailPrefix && empEmails.some(e => e.startsWith(asgEmailPrefix + '@') || e === asgEmail)) return true;
  }

  // ── 5. Name exact match ─────────────────────────────────────────────────────
  if (asgName) {
    if (empNames.some(n => n && n === asgName)) return true;
  }

  // ── 6. Name token overlap (only meaningful tokens, min length 3) ────────────
  // Both sides must have a meaningful name assigned — skip if asgName is blank
  if (asgName && asgName.length > 2) {
    const stopWords = new Set(['employee', 'guard', 'staff', 'user', 'admin', 'security', 'officer', 'unassigned', 'worker']);
    const asgTokens = asgName.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));

    for (const n of empNames) {
      if (!n || n.length < 2) continue;
      const empTokens = n.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
      if (empTokens.length > 0 && asgTokens.length > 0) {
        // Require at least one token to match exactly (not just substring)
        if (empTokens.some(et => asgTokens.some(at => et === at))) return true;
      }
    }
  }

  // ── 7. Assigned site match ──────────────────────────────────────────────────
  if (empData?.assignedSite && empData.assignedSite !== 'Unassigned' && empData.assignedSite !== 'None') {
    const asgSite = (asg.site || asg.siteName || '').trim().toLowerCase();
    const empSite = empData.assignedSite.trim().toLowerCase();
    if (asgSite && empSite && (asgSite === empSite || asgSite.includes(empSite) || empSite.includes(asgSite))) {
      return true;
    }
  }

  return false;
}

/**
 * Deduplicates assignments by both document ID and content key.
 */
export function deduplicateAssignments(assignments) {
  if (!Array.isArray(assignments)) return [];
  const map = new Map();
  for (const item of assignments) {
    if (!item) continue;

    const primaryKey = item.assignmentId || item.id;
    const contentKey = [
      (item.employeeId || item.empId || item.employeeEmail || item.empEmail || item.employeeName || item.empName || '').toString().trim().toLowerCase(),
      (item.site || item.siteName || '').toString().trim().toLowerCase(),
      (item.assignDate || item.scheduleDate || '').toString().trim().toLowerCase(),
      (item.shift || item.shiftTime || '').toString().trim().toLowerCase(),
    ].filter(Boolean).join('__');

    const key = primaryKey || contentKey || Math.random().toString();
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key);
      map.set(key, { ...existing, ...item });
    }
  }
  return Array.from(map.values());
}

/**
 * Checks if an employee is a Mobile Field Employee who does not have an assigned site.
 * Mobile Field Employees cannot check in or check out if they do not have at least one assigned site.
 *
 * @param {object} emp Employee profile object
 * @param {object} [asg] Active assignment object (optional)
 * @param {object} [site] Active site object (optional)
 * @returns {boolean} true if employee is Mobile Field Employee and has NO assigned sites
 */
export function isMobileFieldWithoutSite(emp, asg, site) {
  if (!emp) return false;
  
  const wt = (emp.workType || emp.employeeType || emp.role || '').toString().trim().toLowerCase();
  const isMobile = wt === 'mobile field employee' || wt.includes('mobile');
  if (!isMobile) return false;

  // 1. Check assignedSites array on employee
  if (Array.isArray(emp.assignedSites) && emp.assignedSites.length > 0) {
    const valid = emp.assignedSites.filter(s => s && typeof s === 'string' && s.trim() && s.trim().toLowerCase() !== 'unassigned' && s.trim().toLowerCase() !== 'none');
    if (valid.length > 0) return false;
  }

  // 2. Check assignedDestinations array on employee
  if (Array.isArray(emp.assignedDestinations) && emp.assignedDestinations.length > 0) {
    const valid = emp.assignedDestinations.filter(s => s && typeof s === 'string' && s.trim() && s.trim().toLowerCase() !== 'unassigned' && s.trim().toLowerCase() !== 'none');
    if (valid.length > 0) return false;
  }

  // 3. Check assignedSite string on employee
  const rawSite = (emp.assignedSite || emp.site || emp.assignedSiteName || '').toString().trim();
  if (rawSite && rawSite.toLowerCase() !== 'unassigned' && rawSite.toLowerCase() !== 'none') {
    return false;
  }

  // 4. Check assignedSites array on active assignment
  if (Array.isArray(asg?.assignedSites) && asg.assignedSites.length > 0) {
    const valid = asg.assignedSites.filter(s => s && typeof s === 'string' && s.trim() && s.trim().toLowerCase() !== 'unassigned' && s.trim().toLowerCase() !== 'none');
    if (valid.length > 0) return false;
  }

  // 5. Check active assignment site string or site object
  const asgSite = (asg?.site || asg?.siteName || site?.name || '').toString().trim();
  if (asgSite && asgSite.toLowerCase() !== 'unassigned' && asgSite.toLowerCase() !== 'none') {
    return false;
  }

  // 6. Check site array
  if (Array.isArray(site) && site.length > 0) {
    return false;
  }

  return true;
}

