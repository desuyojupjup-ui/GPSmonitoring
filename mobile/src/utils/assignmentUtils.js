import { auth } from '../firebase';

function parseTimeToHoursMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim();
  if (!str) return null;

  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const s = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
    const ampm = ampmMatch[4].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return { hours: h, minutes: m, seconds: s };
  }

  const h24Match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (h24Match) {
    const h = parseInt(h24Match[1], 10);
    const m = parseInt(h24Match[2], 10);
    const s = h24Match[3] ? parseInt(h24Match[3], 10) : 0;
    return { hours: h, minutes: m, seconds: s };
  }

  return null;
}

export function extractAssignmentDateParts(rawDate) {
  if (!rawDate) return null;
  let y, m, d;
  if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
    try { const dt = rawDate.toDate(); y = dt.getFullYear(); m = dt.getMonth(); d = dt.getDate(); } catch (_) {}
  } else if (typeof rawDate?.seconds === 'number') {
    const dt = new Date(rawDate.seconds * 1000); y = dt.getFullYear(); m = dt.getMonth(); d = dt.getDate();
  } else if (typeof rawDate === 'number') {
    const dt = new Date(rawDate); y = dt.getFullYear(); m = dt.getMonth(); d = dt.getDate();
  } else if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      y = parseInt(ymdMatch[1], 10);
      m = parseInt(ymdMatch[2], 10) - 1;
      d = parseInt(ymdMatch[3], 10);
    } else {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        y = parsed.getFullYear();
        m = parsed.getMonth();
        d = parsed.getDate();
      }
    }
  }

  if (y === undefined || m === undefined || d === undefined) return null;
  return { year: y, month: m, day: d };
}

/**
 * Returns true if the assignment is expired/done and should NOT be shown to the employee.
 * Checks terminated statuses, past calendar dates, and shift end times.
 */
export function isAssignmentDatePassed(asg) {
  if (!asg) return true;
  const status = (asg.status || '').toString().trim().toLowerCase();
  
  // Explicitly terminated or completed/missed statuses
  if (
    status === 'completed' || 
    status === 'cancelled' || 
    status === 'archived' || 
    status === 'expired' || 
    status === 'inactive' || 
    status === 'missed shift' || 
    status === 'missing check-out' || 
    status === 'unattended' || 
    status === 'incomplete' ||
    status.includes('missed') ||
    status.includes('completed') ||
    status.includes('cancel') ||
    status.includes('expired')
  ) {
    return true;
  }

  // Check scheduled assignment date and shift end time
  const rawDate = asg.assignDate || asg.scheduleDate || asg.date || asg.assignmentDate || asg.scheduledDate || asg.endDate || asg.assignedOn || asg.assignedAt;
  if (!rawDate) return false;

  const dtParts = extractAssignmentDateParts(rawDate);
  if (!dtParts) return false;

  const { year: y, month: m, day: d } = dtParts;
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const nowD = now.getDate();

  // 1. If scheduled assignment date is strictly before today's calendar date, it has PASSED
  if (y < nowY) return true;
  if (y === nowY && m < nowM) return true;
  if (y === nowY && m === nowM && d < nowD) return true;

  // 2. If scheduled for today, check if shift end time has already elapsed
  if (y === nowY && m === nowM && d === nowD) {
    let startStr = asg.shiftStart || asg.startTime || '';
    let endStr = asg.shiftEnd || asg.endTime || '';

    if ((!startStr || !endStr) && (asg.shift || asg.shiftTime)) {
      const shiftStr = asg.shift || asg.shiftTime || '';
      const parts = shiftStr.split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
      if (parts.length >= 2) {
        if (!startStr) startStr = parts[0].trim();
        if (!endStr) endStr = parts[1].trim();
      } else if (parts.length === 1 && !endStr) {
        endStr = parts[0].trim();
      }
    }

    const startParsed = parseTimeToHoursMinutes(startStr);
    const endParsed = parseTimeToHoursMinutes(endStr);

    let endHour = 23;
    let endMin = 59;
    let endSec = 59;
    let isNextDay = false;

    if (endParsed) {
      endHour = endParsed.hours;
      endMin = endParsed.minutes;
      endSec = endParsed.seconds || 0;

      if (startParsed && endParsed.hours < startParsed.hours) {
        isNextDay = true;
      }
    }

    const endDateTime = new Date(y, m, isNextDay ? d + 1 : d, endHour, endMin, endSec, 999);
    return now.getTime() >= endDateTime.getTime();
  }

  // Future scheduled assignment
  return false;
}

/**
 * Returns true if the assignment is scheduled and currently active for TODAY.
 * If the date is passed, or shift ended, or status is completed/missed, returns false.
 */
export function isAssignmentActiveToday(asg) {
  if (!asg) return false;
  if (isAssignmentDatePassed(asg)) return false;

  const rawDate = asg.assignDate || asg.scheduleDate || asg.date || asg.assignmentDate || asg.scheduledDate || asg.endDate || asg.assignedOn || asg.assignedAt;
  if (!rawDate) return true;

  const dtParts = extractAssignmentDateParts(rawDate);
  if (!dtParts) return true;

  const now = new Date();
  return dtParts.year === now.getFullYear() && dtParts.month === now.getMonth() && dtParts.day === now.getDate();
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

  // If the assignment is passed, completed, or missed, it does NOT count as an active worksite
  if (asg && isAssignmentDatePassed(asg)) {
    return true;
  }

  // 1. Check assignedSites array on active assignment
  if (Array.isArray(asg?.assignedSites) && asg.assignedSites.length > 0) {
    const valid = asg.assignedSites.filter(s => s && typeof s === 'string' && s.trim() && s.trim().toLowerCase() !== 'unassigned' && s.trim().toLowerCase() !== 'none');
    if (valid.length > 0) return false;
  }

  // 2. Check active assignment site string or site object
  const asgSite = (asg?.site || asg?.siteName || site?.name || '').toString().trim();
  if (asgSite && asgSite.toLowerCase() !== 'unassigned' && asgSite.toLowerCase() !== 'none') {
    return false;
  }

  // 3. Check site array
  if (Array.isArray(site) && site.length > 0) {
    return false;
  }

  // If no active valid assignment or site is currently scheduled, mobile field employee is blocked
  return true;
}

/**
 * Resolves the scheduled shift end time details.
 */
export function getShiftEndInfo(asgOrShiftStr) {
  let shiftStr = typeof asgOrShiftStr === 'string'
    ? asgOrShiftStr
    : (asgOrShiftStr?.shift || asgOrShiftStr?.shiftTime || asgOrShiftStr?.scheduledShift || '');
  let startStr = typeof asgOrShiftStr === 'object'
    ? (asgOrShiftStr?.shiftStart || asgOrShiftStr?.startTime || '')
    : '';
  let endStr = typeof asgOrShiftStr === 'object'
    ? (asgOrShiftStr?.shiftEnd || asgOrShiftStr?.endTime || '')
    : '';

  if ((!startStr || !endStr) && shiftStr) {
    const parts = shiftStr.split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
    if (parts.length >= 2) {
      if (!startStr) startStr = parts[0].trim();
      if (!endStr) endStr = parts[1].trim();
    } else if (parts.length === 1 && !endStr) {
      endStr = parts[0].trim();
    }
  }

  if (!endStr) endStr = '05:00 PM'; // fallback standard shift end
  const parsed = parseTimeToHoursMinutes(endStr);
  return {
    raw: endStr,
    startRaw: startStr,
    hour: parsed?.hours ?? 17,
    minute: parsed?.minutes ?? 0,
    seconds: parsed?.seconds ?? 0,
  };
}

/**
 * Checks if current check-out time is earlier than the scheduled shift end.
 * @param {object|string} asgOrShift
 * @param {Date|number} [checkTime=new Date()]
 * @param {number} [graceMinutes=5]
 * @returns {{ isEarly: boolean, minutesEarly: number, shiftEndStr: string, shiftEndDt: Date }}
 */
export function checkEarlyCheckout(asgOrShift, checkTime = new Date(), graceMinutes = 5) {
  const endInfo = getShiftEndInfo(asgOrShift);
  const now = checkTime instanceof Date ? checkTime : new Date(checkTime);
  const shiftEndDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endInfo.hour, endInfo.minute, endInfo.seconds);
  const diffMs = shiftEndDt.getTime() - now.getTime();
  const minutesEarly = Math.round(diffMs / 60000);

  return {
    isEarly: minutesEarly >= graceMinutes,
    minutesEarly: Math.max(0, minutesEarly),
    shiftEndStr: endInfo.raw,
    shiftEndDt,
  };
}


