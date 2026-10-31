import { auth, db, collection, getDocs } from '../firebase';

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

  // If no shift was scheduled or if schedule is Flexible/Unassigned, there is NO shift end
  if (!endStr && !shiftStr) {
    return null;
  }

  const sLower = (shiftStr || '').toLowerCase();
  const eLower = (endStr || '').toLowerCase();
  if (sLower === 'flexible' || sLower === 'unassigned' || sLower === 'no shift scheduled' ||
      eLower === 'flexible' || eLower === 'unassigned' || eLower === 'no shift scheduled') {
    return null;
  }

  const parsed = parseTimeToHoursMinutes(endStr);
  if (!parsed) return null;

  return {
    raw: endStr,
    startRaw: startStr,
    hour: parsed.hours,
    minute: parsed.minutes,
    seconds: parsed.seconds,
  };
}

/**
 * Checks if current check-out time is earlier than the scheduled shift end.
 * If employee has no shift schedule or flexible hours, they cannot be early.
 * @param {object|string} asgOrShift
 * @param {Date|number} [checkTime=new Date()]
 * @param {number} [graceMinutes=15]
 * @returns {{ isEarly: boolean, minutesEarly: number, shiftEndStr: string, shiftEndDt: Date|null }}
 */
export function checkEarlyCheckout(asgOrShift, checkTime = new Date(), graceMinutes = 15) {
  const endInfo = getShiftEndInfo(asgOrShift);
  if (!endInfo || !endInfo.raw) {
    return {
      isEarly: false,
      minutesEarly: 0,
      shiftEndStr: 'Flexible',
      shiftEndDt: null,
    };
  }

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

export function parseAttendanceTimestamp(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts?.toDate === 'function') {
    try { const d = ts.toDate(); if (d instanceof Date && !isNaN(d.getTime())) return d; } catch (_) {}
  }
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === 'object' && ts !== null) {
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0));
    }
    if (typeof ts._seconds === 'number') {
      return new Date(ts._seconds * 1000 + (ts._nanoseconds ? Math.floor(ts._nanoseconds / 1e6) : 0));
    }
  }
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function checkLateCheckIn(asgOrShift, checkTime = new Date(), graceMinutes = 15) {
  let shiftStr = typeof asgOrShift === 'string' ? asgOrShift : (asgOrShift?.shift || asgOrShift?.shiftTime || asgOrShift?.scheduledShift || '');
  let startStr = typeof asgOrShift === 'object' ? (asgOrShift?.shiftStart || asgOrShift?.startTime || '') : '';
  if (!startStr && shiftStr) {
    const parts = shiftStr.split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
    if (parts.length >= 1) {
      startStr = parts[0].trim();
    }
  }

  // If no shift was ever assigned or scheduled, the employee is on a flexible schedule and cannot be late!
  if (!startStr && !shiftStr) {
    return {
      isLate: false,
      minutesLate: 0,
      shiftStartStr: 'Flexible',
      shiftStartDt: null,
    };
  }

  if (startStr.toLowerCase() === 'flexible' || startStr.toLowerCase() === 'unassigned' || startStr.toLowerCase() === 'no shift scheduled') {
    return {
      isLate: false,
      minutesLate: 0,
      shiftStartStr: 'Flexible',
      shiftStartDt: null,
    };
  }

  const parsed = parseTimeToHoursMinutes(startStr);
  if (!parsed) {
    return {
      isLate: false,
      minutesLate: 0,
      shiftStartStr: startStr,
      shiftStartDt: null,
    };
  }

  const now = checkTime instanceof Date ? checkTime : (parseAttendanceTimestamp(checkTime) || new Date(checkTime));
  const shiftStartDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsed.hours, parsed.minutes, parsed.seconds);
  const diffMs = now.getTime() - shiftStartDt.getTime();
  const minutesLate = Math.round(diffMs / 60000);

  return {
    isLate: minutesLate >= graceMinutes,
    minutesLate: Math.max(0, minutesLate),
    shiftStartStr: startStr,
    shiftStartDt,
  };
}

export function isAttendanceRecordFlagged(r, employeeOrAssignmentShift = null) {
  if (!r) return false;

  // Explicit status indicating absence or missed shift
  const st = (r.status || '').toString().trim().toLowerCase();
  if (st === 'missed shift' || st === 'missed' || st === 'absent') {
    return true;
  }

  // Anomaly flags specific to unexcused unauthorized absence
  const aFlag = (r.anomalyFlag || '').toString().toLowerCase();
  if (aFlag.includes('unauthorized absence')) {
    return true;
  }

  // Resolve effective shift for this record
  const effectiveShift = (
    (r.shift && r.shift !== 'Unassigned' && r.shift !== 'Flexible' && r.shift !== 'No Shift Scheduled' && r.shift !== '08:00 AM - 05:00 PM')
      ? r.shift
      : (employeeOrAssignmentShift && employeeOrAssignmentShift !== 'Unassigned' && employeeOrAssignmentShift !== 'Flexible' && employeeOrAssignmentShift !== 'No Shift Scheduled' && employeeOrAssignmentShift !== '08:00 AM - 05:00 PM')
        ? employeeOrAssignmentShift
        : (r.shift && r.shift !== 'Unassigned' && r.shift !== 'Flexible' && r.shift !== 'No Shift Scheduled' && r.shift !== '08:00 AM - 05:00 PM')
          ? r.shift
          : null
  );

  // If no explicit shift was scheduled for this employee or record, they are on a flexible schedule and cannot be late or early!
  if (!effectiveShift) {
    return false;
  }

  // Explicit early check-out flags (only if an explicit shift was scheduled and departure was >= 15m early)
  if (r.earlyCheckOut === true || r.earlyDeparture === true) return true;
  if (typeof r.minutesEarly === 'number' && r.minutesEarly >= 15) return true;

  // Time-based late check-in detection from raw timeIn
  if (r.timeIn) {
    const timeInDate = parseAttendanceTimestamp(r.timeIn);
    if (timeInDate) {
      const lateCheck = checkLateCheckIn(effectiveShift, timeInDate, 15);
      if (lateCheck.isLate) return true;
    }
  }

  // Explicit late status ONLY if minutesLate >= 15
  if ((st === 'late' || r.isLate === true || r.late === true) && typeof r.minutesLate === 'number' && r.minutesLate >= 15) {
    return true;
  }

  return false;
}

/**
 * Resolves current assignment, site, shift, and today's attendance for Chatbot queries.
 * Handles cases where employee has checked in, has an active assignment, or has site from profile.
 */
export async function getChatbotAssignmentContext(emp, userEmail, propUser) {
  const currentUserName = (
    emp?.name ||
    propUser?.name ||
    propUser?.displayName ||
    auth.currentUser?.displayName ||
    ''
  ).trim();

  // 1. Fetch Today's Attendance record
  let todayRecord = null;
  try {
    const qAtt1 = await getDocs(collection(db, 'Attendance')).catch(() => null);
    const qAtt2 = await getDocs(collection(db, 'attendance')).catch(() => null);
    const allAtt = [...(qAtt1?.docs || []), ...(qAtt2?.docs || [])].map(d => ({ id: d.id, ...d.data() }));

    const myEmail = (userEmail || emp?.email || '').toLowerCase();
    const myName = currentUserName.toLowerCase();
    const myId = (emp?.id || emp?.idNum || emp?.empId || '').toLowerCase();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    todayRecord = allAtt.find(att => {
      const aMail = (att.email || '').toLowerCase();
      const aName = (att.employeeName || '').toLowerCase();
      const aId = (att.employee_id || att.employeeId || '').toLowerCase();

      const isMatch = (myEmail && aMail === myEmail) ||
                      (myName && (aName === myName || aName.includes(myName) || myName.includes(aName))) ||
                      (myId && aId === myId);
      if (!isMatch) return false;

      const raw = att.date || att.timeIn || att.checkIn || att.createdAt;
      if (!raw) return false;
      const d = raw?.toDate ? raw.toDate() : new Date(raw);
      return !isNaN(d.getTime()) && d >= today;
    });
  } catch (e) {}

  // 2. Fetch Assignments from database
  let cleanDocs = [];
  try {
    const q1 = await getDocs(collection(db, 'Assignments')).catch(() => null);
    const q2 = await getDocs(collection(db, 'assignments')).catch(() => null);
    const all = [...(q1?.docs || []), ...(q2?.docs || [])].map(d => ({ id: d.id, ...d.data() }));
    cleanDocs = all.filter(a => isAssignmentForEmployee(a, emp, userEmail, currentUserName));
  } catch (e) {}

  // Find active assignment strictly for TODAY or active non-passed shifts
  let activeAsg = cleanDocs.find(a => isAssignmentActiveToday(a));
  if (!activeAsg && cleanDocs.length > 0) {
    activeAsg = cleanDocs.find(a => {
      const st = (a.status || 'Active').toLowerCase();
      const isActiveStatus = st === 'active' || st === 'in progress' || st === 'ongoing' || st === 'assigned' || st === 'on duty' || st === 'upcoming';
      return isActiveStatus && !isAssignmentDatePassed(a);
    }) || null;
  }

  // 3. Resolve Site Name
  let siteName = activeAsg?.site || activeAsg?.siteName || todayRecord?.siteName || todayRecord?.assignedSite || emp?.assignedSite || emp?.site;
  if (siteName && typeof siteName === 'string' && siteName.includes(',')) {
    siteName = siteName.split(',')[0].trim();
  }

  // 4. Resolve Shift
  let shift = resolveShift(activeAsg, emp) || todayRecord?.shift || emp?.shift || '08:00 AM - 05:00 PM';
  if (!shift || shift === 'Unassigned') shift = '08:00 AM - 05:00 PM';

  // 5. Resolve Date
  let dateStr = activeAsg?.assignDate || activeAsg?.date || 'Today';

  // 6. Resolve Address
  let address = activeAsg?.siteAddress || activeAsg?.address || todayRecord?.locationAddress || todayRecord?.actualLocation;
  if (!address && siteName) {
    try {
      const qSites = await getDocs(collection(db, 'Sites')).catch(() => null);
      if (qSites && !qSites.empty) {
        const sMatch = qSites.docs.find(d => {
          const sData = d.data();
          const sN = (sData.name || d.id || '').toLowerCase();
          return sN === siteName.toLowerCase() || sN.includes(siteName.toLowerCase()) || siteName.toLowerCase().includes(sN);
        });
        if (sMatch) {
          address = sMatch.data().address;
        }
      }
    } catch (_) {}
  }
  if (!address) address = 'Registered Worksite Address';

  // 7. Format Status
  let statusText = 'Active';
  let checkInTimeStr = '';
  let checkOutTimeStr = '';

  if (todayRecord?.timeIn || todayRecord?.checkIn) {
    const rawIn = todayRecord.timeIn || todayRecord.checkIn;
    const inD = rawIn?.toDate ? rawIn.toDate() : new Date(rawIn);
    if (!isNaN(inD.getTime())) {
      checkInTimeStr = inD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  if (todayRecord?.timeOut || todayRecord?.checkOut) {
    const rawOut = todayRecord.timeOut || todayRecord.checkOut;
    const outD = rawOut?.toDate ? rawOut.toDate() : new Date(rawOut);
    if (!isNaN(outD.getTime())) {
      checkOutTimeStr = outD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  const isCheckedIn = Boolean(checkInTimeStr && !checkOutTimeStr);
  const isCheckedOut = Boolean(checkOutTimeStr);

  if (isCheckedOut) {
    statusText = `Completed (Checked out at ${checkOutTimeStr})`;
  } else if (isCheckedIn) {
    statusText = `On Duty (Checked in at ${checkInTimeStr})`;
  } else if (activeAsg?.status) {
    statusText = activeAsg.status;
  }

  const hasAssignment = Boolean(
    siteName &&
    typeof siteName === 'string' &&
    siteName.trim().toLowerCase() !== 'unassigned' &&
    siteName.trim().toLowerCase() !== 'none'
  );

  return {
    hasAssignment,
    siteName: siteName || 'Unassigned Site',
    address,
    shift,
    dateStr,
    statusText,
    checkInTimeStr,
    checkOutTimeStr,
    isCheckedIn,
    isCheckedOut,
    todayRecord,
    assignment: activeAsg,
  };
}

/**
 * Personalize anomaly alert text for mobile employee view.
 * Converts 3rd person reports ("Employee Juan Dela Cruz did not check in...")
 * into 2nd person statements ("You did not check in...") for the logged-in employee's cards.
 */
export function personalizeAnomalyDescription(text, empNames = []) {
  if (!text || typeof text !== 'string') return text || '';
  let out = text;

  // 0. "Employee [Name] checked out early / departed early / left early" -> "You checked out early..."
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+checked out early/gi, 'You checked out early');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+checked out/gi, 'You checked out');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+clocked out early/gi, 'You clocked out early');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+clocked out/gi, 'You clocked out');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+departed early/gi, 'You departed early');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+departed/gi, 'You departed');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+left early/gi, 'You left early');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+left/gi, 'You left');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+is still clocked in/gi, 'You are still clocked in');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+clocked in/gi, 'You clocked in');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+stepped outside/gi, 'You stepped outside');

  // 1. "Employee <Name> did not check in" -> "You did not check in"
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+did not check in/gi, 'You did not check in');
  out = out.replace(/Employee\s+did not check in/gi, 'You did not check in');

  // 2. "Employee <Name> checked in but failed to check out" -> "You checked in but failed to check out"
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+checked in but failed to check out/gi, 'You checked in but failed to check out');
  out = out.replace(/Employee\s+checked in but failed to check out/gi, 'You checked in but failed to check out');

  // 3. "Employee <Name> failed to check in / check out"
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+failed to check in/gi, 'You failed to check in');
  out = out.replace(/Employee\s+failed to check in/gi, 'You failed to check in');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+failed to check out/gi, 'You failed to check out');
  out = out.replace(/Employee\s+failed to check out/gi, 'You failed to check out');

  // 4. "Employee <Name> has not checked in / checked out"
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+has not checked in/gi, 'You have not checked in');
  out = out.replace(/Employee\s+has not checked in/gi, 'You have not checked in');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+has not checked out/gi, 'You have not checked out');
  out = out.replace(/Employee\s+has not checked out/gi, 'You have not checked out');

  // 5. "Employee <Name> is/was outside the assigned geofence" -> "You are/were outside the assigned geofence"
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+is outside/gi, 'You are outside');
  out = out.replace(/Employee\s+is outside/gi, 'You are outside');
  out = out.replace(/Employee(?:\s+[A-Za-z0-9\s,\.\-']+?)?\s+was outside/gi, 'You were outside');
  out = out.replace(/Employee\s+was outside/gi, 'You were outside');

  // 6. Replace specific employee names if present
  const names = Array.isArray(empNames) ? empNames.filter(Boolean) : [empNames].filter(Boolean);
  names.forEach((name) => {
    if (!name || name.length < 2) return;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`flagged for (?:Employee\\s+)?${escaped}`, 'gi'), 'flagged for your shift');
    out = out.replace(new RegExp(`detected for (?:Employee\\s+)?${escaped}`, 'gi'), 'detected on your device');
    out = out.replace(new RegExp(`assigned to (?:Employee\\s+)?${escaped}`, 'gi'), 'assigned to you');
    out = out.replace(new RegExp(`^${escaped}\\s+did not check in`, 'gi'), 'You did not check in');
    out = out.replace(new RegExp(`^${escaped}\\s+checked in but failed to check out`, 'gi'), 'You checked in but failed to check out');
    out = out.replace(new RegExp(`^${escaped}\\s+checked out early`, 'gi'), 'You checked out early');
    out = out.replace(new RegExp(`^${escaped}\\s+checked out`, 'gi'), 'You checked out');
    out = out.replace(new RegExp(`^${escaped}\\s+departed early`, 'gi'), 'You departed early');
    out = out.replace(new RegExp(`^${escaped}\\s+left early`, 'gi'), 'You left early');
    out = out.replace(new RegExp(`^${escaped}\\s+is still clocked in`, 'gi'), 'You are still clocked in');
    out = out.replace(new RegExp(`^${escaped}\\s+clocked out`, 'gi'), 'You clocked out');
    out = out.replace(new RegExp(`^${escaped}\\s+stepped outside`, 'gi'), 'You stepped outside');
    out = out.replace(new RegExp(`^${escaped}\\s+is outside`, 'gi'), 'You are outside');
    out = out.replace(new RegExp(`^${escaped}\\s+was outside`, 'gi'), 'You were outside');
  });

  out = out.replace(/flagged for (?:Field |Fixed |Fixed Site )?Employee/gi, 'flagged for your shift');
  out = out.replace(/detected for (?:Field |Fixed |Fixed Site )?Employee/gi, 'detected on your device');

  // 7. Adjust pronouns
  out = out.replace(/\bfor his assignment\b/gi, 'for your assignment');
  out = out.replace(/\bfor her assignment\b/gi, 'for your assignment');
  out = out.replace(/\bfor his shift\b/gi, 'for your shift');
  out = out.replace(/\bfor her shift\b/gi, 'for your shift');
  out = out.replace(/\bhis assigned shift\b/gi, 'your assigned shift');
  out = out.replace(/\bher assigned shift\b/gi, 'your assigned shift');
  out = out.replace(/\bhis assigned worksite\b/gi, 'your assigned worksite');
  out = out.replace(/\bher assigned worksite\b/gi, 'your assigned worksite');
  out = out.replace(/\bhis device\b/gi, 'your device');
  out = out.replace(/\bher device\b/gi, 'your device');
  out = out.replace(/\bhis location\b/gi, 'your location');
  out = out.replace(/\bher location\b/gi, 'your location');
  out = out.replace(/\bwithout an employee response\b/gi, 'without your response');

  // 8. Catch-all starting with generic "Employee "
  out = out.replace(/^Employee\s+checked\s+out\s+early/i, 'You checked out early');
  out = out.replace(/^Employee\s+checked\s+out/i, 'You checked out');
  out = out.replace(/^Employee\s+departed\s+early/i, 'You departed early');
  out = out.replace(/^Employee\s+left\s+early/i, 'You left early');
  out = out.replace(/^Employee\s+is\s+outside/i, 'You are outside');
  out = out.replace(/^Employee\s+was\s+outside/i, 'You were outside');

  if (out.length > 0) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

export function personalizeAnomalyTitle(title, empNames = []) {
  if (!title || typeof title !== 'string') return title || 'Security Anomaly';
  let out = title;
  const names = Array.isArray(empNames) ? empNames.filter(Boolean) : [empNames].filter(Boolean);
  names.forEach((name) => {
    if (!name || name.length < 2) return;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\s+(?:for|-)\\s+(?:Employee\\s+)?${escaped}`, 'gi'), '');
    out = out.replace(new RegExp(`^${escaped}:?\\s*`, 'gi'), '');
  });
  out = out.replace(/\s+for\s+(?:Field\s+|Fixed\s+|Fixed\s+Site\s+)?Employee/gi, '');
  out = out.replace(/^(?:Field\s+|Fixed\s+|Fixed\s+Site\s+)?Employee\s+/i, '');
  out = out.replace(/^AI Anomaly:\s*/i, '');
  return out.trim();
}


