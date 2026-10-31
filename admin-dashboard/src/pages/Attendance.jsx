import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, FileText, Calendar, Users, MapPin, CheckCircle, Search, Filter, ChevronDown, Clock, XCircle, StopCircle, RefreshCw, Trash2, Activity, ShieldCheck, TrendingUp, UserCheck, Smile, Award, AlertTriangle } from 'lucide-react';
import { db, collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, setDoc } from '../firebase';
import { isAssignmentEnded } from './Assignments';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 99
      }}>
        <div style={{ color: data.payload.color || '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.name}: <strong style={{ color: '#0F172A' }}>{data.value}</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

const CustomAreaTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 99
      }}>
        <div style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }}></span>
          {data.payload.time}: <strong style={{ color: '#0F172A' }}>{data.value}% Check-ins</strong>
        </div>
      </div>
    );
  }
  return null;
};

const STATUS_STYLES = {
  'Completed':         { bg: '#F3E8FF', color: '#7E22CE', dot: '#A855F7' },
  'On Site':           { bg: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'On Duty':           { bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'Checked In':        { bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'In Transit':        { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Late':              { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Absent':            { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  'Missed Shift':      { bg: '#FEE2E2', color: '#B91C1C', dot: '#DC2626' },
  'Missing Check-Out': { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Flagged':           { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  'Offline':           { bg: '#F1F5F9', color: '#475569', dot: '#64748B' },
};

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function Attendance() {
  const [attendance, setAttendance] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearch(q);
    }
  }, [location.search]);

  // Pagination & Bulk Select state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);
  const [syncing, setSyncing] = useState(false);

  // Persistent deleted IDs to avoid sync server or Firestore snapshots resurrecting deleted records
  const deletedIdsRef = useRef(new Set((() => {
    try {
      return JSON.parse(localStorage.getItem('subai_deleted_att_ids') || '[]');
    } catch {
      return [];
    }
  })()));

  // Exposed refresh function (also called by Refresh button)
  const pullFromSyncServerRef = React.useRef(null);

  const handleRefresh = async () => {
    setSyncing(true);
    if (pullFromSyncServerRef.current) await pullFromSyncServerRef.current();
    setTimeout(() => setSyncing(false), 800);
  };

  const sitesRef = React.useRef([]);
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  function normalizeRecord(raw) {
    const parseDate = (ts) => {
      if (!ts) return null;
      if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
      if (typeof ts?.toDate === 'function') {
        try { const d = ts.toDate(); if (d instanceof Date && !isNaN(d.getTime())) return d; } catch(e){}
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
        const parsed = new Date(ts);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return null;
    };

    const formatTsInfo = (ts) => {
      if (!ts) return { time: '—', date: '', full: '—' };
      if (typeof ts === 'string' && /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(ts.trim())) {
        return { time: ts.trim(), date: '', full: ts.trim() };
      }
      const d = parseDate(ts);
      if (d) {
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return { time: timeStr, date: dateStr, full: `${dateStr}, ${timeStr}` };
      }
      return { time: typeof ts === 'string' && ts !== '—' ? ts : '—', date: '', full: typeof ts === 'string' && ts !== '—' ? ts : '—' };
    };

    const getDuration = (i, o) => {
      if (!i || !o) return null;
      const di = parseDate(i);
      const do_ = parseDate(o);
      if (!di || !do_) return null;
      const mins = Math.round((do_ - di) / 60000);
      if (isNaN(mins) || mins < 0) return null;
      const h = Math.floor(mins / 60); const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const isMissed = raw.status === 'Missed Shift' || raw.isMissedShift;
    const hasExplicitShift = Boolean(
      raw.shift &&
      raw.shift !== 'Unassigned' &&
      raw.shift !== 'Flexible' &&
      raw.shift !== 'No Shift Scheduled'
    );
    const isEarlyCheckOut = Boolean(
      hasExplicitShift &&
      (raw.earlyCheckOut ||
       raw.earlyDeparture ||
       raw.anomalyFlag === 'Early Check-Out' ||
       (raw.minutesEarly && Number(raw.minutesEarly) >= 15))
    );

    const inInfo  = formatTsInfo(raw.timeIn  || raw.checkIn  || raw.check_in  || raw.in);
    const outInfo = formatTsInfo(raw.timeOut || raw.checkOut || raw.check_out || raw.out);

    // Calculate late check-in if shift start exists
    const checkInTimeVal = raw.timeIn || raw.checkIn || raw.check_in || raw.in;
    const checkInDate = parseDate(checkInTimeVal);
    let calcMinutesLate = 0;
    let isCalculatedLate = false;
    if (hasExplicitShift && checkInDate) {
      const shiftParts = String(raw.shift).split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
      const startToken = shiftParts[0]?.trim();
      if (startToken) {
        let sHour = null, sMin = null;
        const ampmM = startToken.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i);
        if (ampmM) {
          let h = parseInt(ampmM[1], 10);
          const m = parseInt(ampmM[2], 10);
          const ap = ampmM[3].toUpperCase();
          if (ap === 'PM' && h < 12) h += 12;
          if (ap === 'AM' && h === 12) h = 0;
          sHour = h;
          sMin = m;
        } else {
          const h24M = startToken.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
          if (h24M) {
            sHour = parseInt(h24M[1], 10);
            sMin = parseInt(h24M[2], 10);
          }
        }
        if (sHour !== null && sMin !== null) {
          const shiftStartDt = new Date(
            checkInDate.getFullYear(),
            checkInDate.getMonth(),
            checkInDate.getDate(),
            sHour,
            sMin,
            0
          );
          const diffMs = checkInDate.getTime() - shiftStartDt.getTime();
          const mins = Math.round(diffMs / 60000);
          if (mins >= 15) {
            isCalculatedLate = true;
            calcMinutesLate = mins;
          }
        }
      }
    }

    const isLateCheckIn = Boolean(
      hasExplicitShift &&
      (raw.isLate ||
       raw.late ||
       raw.anomalyFlag === 'Late Check-In' ||
       (typeof raw.anomalyFlag === 'string' && raw.anomalyFlag.toLowerCase().includes('late')) ||
       (typeof raw.status === 'string' && raw.status.toLowerCase() === 'late') ||
       (raw.minutesLate && Number(raw.minutesLate) >= 1) ||
       isCalculatedLate)
    );

    const minutesLate = (raw.minutesLate != null && Number(raw.minutesLate) > 0)
      ? Number(raw.minutesLate)
      : (calcMinutesLate > 0 ? calcMinutesLate : null);

    // Resolve active physical location vs registered worksite:
    const lat = raw.latitude != null ? Number(raw.latitude) : null;
    const lng = raw.longitude != null ? Number(raw.longitude) : null;
    let matchedSiteName = null;

    if (lat != null && lng != null && Array.isArray(sitesRef.current) && sitesRef.current.length > 0) {
      for (const s of sitesRef.current) {
        const sLat = s.latitude != null ? Number(s.latitude) : (s.lat != null ? Number(s.lat) : null);
        const sLng = s.longitude != null ? Number(s.longitude) : (s.lng != null ? Number(s.lng) : null);
        const sRad = Number(s.radius || s.geofenceRadius || 200);
        if (sLat != null && sLng != null) {
          const R = 6371000;
          const dLat = ((lat - sLat) * Math.PI) / 180;
          const dLon = ((lng - sLng) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos((sLat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (dist <= sRad) {
            matchedSiteName = s.name;
            break;
          }
        }
      }
    }

    const activeAddress = raw.actualLocation || raw.locationAddress || raw.address;
    let displaySite = matchedSiteName || activeAddress || raw.siteName || raw.site_name || raw.site || '—';

    // If marked out of fence or if raw.siteName was set to assigned site but active location was logged:
    if (activeAddress && (raw.inFence === false || displaySite === 'Unassigned Site' || displaySite.toLowerCase() === 'uc banilad')) {
      displaySite = activeAddress;
    }

    return {
      id:            raw.id,
      assignmentId:  raw.assignmentId || null,
      employee_name: raw.employeeName || raw.employee_name || raw.name || raw.emp || '—',
      site_name:     displaySite,
      active_location: activeAddress || null,
      isEarlyCheckOut,
      minutesEarly:  raw.minutesEarly || null,
      departureNote: raw.departureNote || null,
      isLateCheckIn,
      minutesLate,
      check_in:      isMissed ? 'Missed (No Check-in)' : inInfo.full,
      check_in_time: isMissed ? 'Missed' : inInfo.time,
      check_in_date: inInfo.date || (raw.date ? (typeof raw.date === 'string' ? raw.date : formatDate(raw.date)) : ''),
      check_out:     outInfo.full,
      check_out_time: outInfo.time,
      check_out_date: outInfo.date,
      duration:      raw.duration || (isMissed ? '0m' : getDuration(raw.timeIn || raw.checkIn || raw.check_in, raw.timeOut || raw.checkOut || raw.check_out)) || '—',
      status:        raw.status || 'On Site',
      verification:  raw.verification || (isMissed ? 'No Show' : (raw.inFence === false ? 'GPS Geofence' : 'Verified')),
      _raw:          raw,
    };
  }

  useEffect(() => {
    // ── Direct sync-server polling (bypasses firebase.js chain for reliability) ──
    const pullFromSyncServer = async () => {
      try {
        const res = await fetch('/api/sync');
        if (!res.ok) return;
        const data = await res.json();

        const mergeAttCollections = (key) => {
          const remoteItems = data[key];
          if (!Array.isArray(remoteItems)) return;
          const existing = (() => {
            try { return JSON.parse(localStorage.getItem('subai_store_' + key) || '[]'); } catch { return []; }
          })();
          const map = new Map();
          existing.forEach(i => { if (i && i.id && !deletedIdsRef.current.has(i.id)) map.set(i.id, i); });
          remoteItems.forEach(i => { if (i && i.id && !deletedIdsRef.current.has(i.id)) map.set(i.id, { ...map.get(i.id), ...i }); });
          const merged = Array.from(map.values());
          if (JSON.stringify(merged) !== JSON.stringify(existing)) {
            localStorage.setItem('subai_store_' + key, JSON.stringify(merged));
          }
          return merged;
        };

        const attRecords = mergeAttCollections('Attendance') || [];
        const attRecordsLc = mergeAttCollections('attendance') || [];
        const asgRecords = mergeAttCollections('Assignments') || [];
        const asgRecordsLc = mergeAttCollections('assignments') || [];

        // Merge assignments from sync server
        const combinedAsg = new Map();
        asgRecordsLc.forEach(r => { if (r && r.id && !deletedIdsRef.current.has(r.id)) combinedAsg.set(r.id, r); });
        asgRecords.forEach(r => { if (r && r.id && !deletedIdsRef.current.has(r.id)) combinedAsg.set(r.id, r); });
        if (combinedAsg.size > 0) {
          setAssignments(Array.from(combinedAsg.values()));
        }

        // Merge both collections into component state directly
        const combined = new Map();
        attRecordsLc.forEach(r => { if (r && r.id && !deletedIdsRef.current.has(r.id)) combined.set(r.id, r); });
        attRecords.forEach(r => { if (r && r.id && !deletedIdsRef.current.has(r.id)) combined.set(r.id, r); });
        const allRecs = Array.from(combined.values());

        if (allRecs.length > 0) {
          setAttendance(prev => {
            const others = prev.filter(r => r._source !== '__direct__' && !deletedIdsRef.current.has(r.id));
            const incoming = allRecs.map(r => ({ ...normalizeRecord(r), _source: '__direct__' }));
            // Deduplicate by id across all sources
            const idMap = new Map();
            [...others, ...incoming].forEach(r => { if (r.id && !deletedIdsRef.current.has(r.id)) idMap.set(r.id, r); });
            return Array.from(idMap.values());
          });
          setLoading(false);
        }

        // Sync employees from server too
        if (Array.isArray(data.employees) && data.employees.length > 0) {
          setEmployees(data.employees);
        }
      } catch (e) {
        // silent — fallback to onSnapshot below
      }
    };

    // Expose to refresh button
    pullFromSyncServerRef.current = pullFromSyncServer;

    pullFromSyncServer();
    const directInterval = setInterval(pullFromSyncServer, 1500);

    try {
      const mergeAndSet = (collKey, newDocs) => {
        setAttendance(prev => {
          const others = prev.filter(r => r._source !== collKey && !deletedIdsRef.current.has(r.id));
          const incoming = newDocs
            .filter(d => !deletedIdsRef.current.has(d.id))
            .map(d => ({ ...normalizeRecord({ id: d.id, ...d.data() }), _source: collKey }));
          const idMap = new Map();
          [...others, ...incoming].forEach(r => { if (r.id && !deletedIdsRef.current.has(r.id)) idMap.set(r.id, r); });
          return Array.from(idMap.values());
        });
      };
      const unsubAtt1 = onSnapshot(query(collection(db, 'attendance')), snap => mergeAndSet('attendance', snap.docs));
      const unsubAtt2 = onSnapshot(query(collection(db, 'Attendance')), snap => mergeAndSet('Attendance', snap.docs));
      const unsubAsg1 = onSnapshot(query(collection(db, 'Assignments')), snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => !deletedIdsRef.current.has(d.id))));
      const unsubAsg2 = onSnapshot(query(collection(db, 'assignments')), snap => {
        setAssignments(prev => {
          const map = new Map();
          prev.forEach(a => { if (!deletedIdsRef.current.has(a.id)) map.set(a.id, a); });
          snap.docs.forEach(d => { if (!deletedIdsRef.current.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }); });
          return Array.from(map.values());
        });
      });
      const unsubEmp  = onSnapshot(query(collection(db, 'employees')), snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubSites = onSnapshot(query(collection(db, 'Sites')), snap => setSites(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      const unsubLogs  = onSnapshot(query(collection(db, 'tracking_logs'), limit(20)), snap => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return () => { clearInterval(directInterval); unsubAtt1(); unsubAtt2(); unsubAsg1(); unsubAsg2(); unsubEmp(); unsubSites(); unsubLogs(); };
    } catch (e) {
      console.warn('Attendance live error:', e);
      return () => clearInterval(directInterval);
    }
  }, []);

  // Note: Missed shifts are calculated dynamically in memory below via combinedAttendance
  // to avoid repeated Firestore write cycles that exceed quota.


  // Consolidate live Firestore attendance records with Missed Shifts and Active Workforce
  const combinedAttendance = React.useMemo(() => {
    const list = attendance.filter(a => a && a.id && !deletedIdsRef.current.has(a.id));
    const existingKeys = new Set();
    list.forEach(a => {
      const eName = (a.employee_name || a.employeeName || '').toLowerCase().trim();
      const date = (a.check_in_date || a.date || '').toString().toLowerCase().trim();
      if (a.assignmentId) existingKeys.add(`asg_${a.assignmentId}`);
      if (eName && date) existingKeys.add(`${eName}_${date}`);
      if (a.id) existingKeys.add(a.id);
    });

    const now = new Date();

    // 1. Process Missed Shifts from Assignments
    assignments.forEach(asg => {
      if (!asg || !asg.id || deletedIdsRef.current.has(asg.id)) return;
      const rawStatus = (asg.status || '').trim().toLowerCase();
      if (rawStatus === 'cancelled') return;

      let ended = false;
      try {
        ended = isAssignmentEnded(asg, now);
      } catch (_) {}

      const isMissed = rawStatus === 'missed shift' || (ended && !asg.hasCheckIn && rawStatus !== 'completed');

      if (isMissed) {
        const asgId = asg.id;
        const autoId = `att_missed_${asgId}`;
        if (deletedIdsRef.current.has(asgId) || deletedIdsRef.current.has(autoId)) return;

        const eName = (asg.empName || asg.employeeName || '').trim();
        const eId = asg.empId || asg.employeeId || '';
        const eMail = asg.empEmail || asg.employeeEmail || '';
        const siteName = asg.site || asg.siteName || (Array.isArray(asg.assignedSites) ? asg.assignedSites.join(', ') : 'Assigned Site');
        const rawDate = asg.assignDate || asg.scheduleDate || asg.date || '';

        let formattedDate = rawDate;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }

        const matchKey1 = `asg_${asgId}`;

        // Check if employee already has an active or completed check-in for this assignment
        const hasExistingCheckIn = list.some(a => {
          const aStatus = (a.status || '').toLowerCase();
          const isPresent = ['on site', 'checked in', 'on duty', 'completed', 'present'].includes(aStatus);
          return (a.assignmentId === asgId || a.id === asgId) && isPresent;
        });

        if (!hasExistingCheckIn && !existingKeys.has(matchKey1) && !existingKeys.has(autoId)) {
          existingKeys.add(matchKey1);
          existingKeys.add(autoId);
          list.push(normalizeRecord({
            id: autoId,
            assignmentId: asgId,
            employee_name: eName || '—',
            employeeName: eName || '—',
            employee_id: eId,
            employeeId: eId,
            email: eMail,
            site_name: siteName,
            siteName: siteName,
            site: siteName,
            check_in: 'Missed (No Check-in)',
            check_in_time: '—',
            check_in_date: formattedDate,
            check_out: '—',
            check_out_time: '—',
            check_out_date: '',
            duration: '0m',
            status: 'Missed Shift',
            verification: 'No Show',
            shift: asg.shift || asg.shiftTime || '',
            inFence: false,
            isMissedShift: true,
            createdAt: asg.createdAt || Date.now()
          }));
        }
      }
    });

    // 2. Include active employees currently On Site / On Duty / In Transit who do not have an explicit attendance log doc yet
    employees.forEach(emp => {
      if (emp.status && emp.status !== 'Offline') {
        const empNameLower = (emp.name || '').toLowerCase();
        const autoEmpId = `emp_auto_att_${emp.id}`;
        if (deletedIdsRef.current.has(autoEmpId) || deletedIdsRef.current.has(emp.id)) return;
        if (!existingKeys.has(empNameLower)) {
          existingKeys.add(empNameLower);
          list.push(normalizeRecord({
            id: autoEmpId,
            employee_name: emp.name,
            site_name: emp.assignedSiteName || emp.assignedSite || emp.org || 'Assigned Site',
            check_in: emp.lastCheckIn ? emp.lastCheckIn : '—',
            check_out: emp.status === 'Completed' ? '—' : '—',
            duration: emp.status === 'Completed' ? '—' : 'On Site',
            status: emp.status === 'On Duty' ? 'Checked In' : emp.status,
            verification: emp.geofenceStatus === 'Outside Assigned Site' ? 'GPS Geofence' : 'Verified'
          }));
        }
      }
    });

    return list;
  }, [attendance, assignments, employees]);

  const filteredAtt = combinedAttendance.filter(a =>
    (a.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.site_name || '').toLowerCase().includes(search.toLowerCase())
  );

  // Pagination metrics
  const totalItems = filteredAtt.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filteredAtt.slice(startIndex, startIndex + pageSize);
  const emptyRowsCount = Math.max(0, Math.min(pageSize, 8) - currentPageItems.length);

  // Bulk Selection Logic
  const isAllSelected = currentPageItems.length > 0 && currentPageItems.every(d => selectedIds.includes(d.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const currentItemIds = new Set(currentPageItems.map(item => item.id));
      setSelectedIds(prev => prev.filter(id => !currentItemIds.has(id)));
    } else {
      const currentItemIds = currentPageItems.map(item => item.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentItemIds])));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Records?`,
      `Are you sure you want to remove ${selectedIds.length} attendance record(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const idsToDelete = [...selectedIds];

        // 1. Immediately register in deletedIdsRef and persist
        idsToDelete.forEach(id => deletedIdsRef.current.add(id));
        try {
          localStorage.setItem('subai_deleted_att_ids', JSON.stringify(Array.from(deletedIdsRef.current)));
        } catch (_) {}

        // 2. Perform deletions in parallel across collections
        await Promise.all(idsToDelete.map(async id => {
          if (id.startsWith('att_missed_')) {
            const asgId = id.replace('att_missed_', '');
            deletedIdsRef.current.add(asgId);
            deleteDoc(doc(db, 'Assignments', asgId)).catch(() => {});
            deleteDoc(doc(db, 'assignments', asgId)).catch(() => {});
            ['Assignments', 'assignments'].forEach(k => {
              try {
                const store = JSON.parse(localStorage.getItem('subai_store_' + k) || '[]');
                const filtered = store.filter(x => x && x.id !== asgId);
                localStorage.setItem('subai_store_' + k, JSON.stringify(filtered));
              } catch (_) {}
            });
            setAssignments(prev => prev.filter(a => a.id !== asgId));
          }

          // Delete from all attendance collections
          deleteDoc(doc(db, 'Attendance', id)).catch(() => {});
          deleteDoc(doc(db, 'attendance', id)).catch(() => {});
          deleteDoc(doc(db, 'attendance_logs', id)).catch(() => {});

          // Clean local store
          ['Attendance', 'attendance', 'attendance_logs'].forEach(k => {
            try {
              const store = JSON.parse(localStorage.getItem('subai_store_' + k) || '[]');
              const filtered = store.filter(x => x && x.id !== id);
              localStorage.setItem('subai_store_' + k, JSON.stringify(filtered));
            } catch (_) {}
          });
        }));

        // 3. Notify sync server
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', ids: idsToDelete })
        }).catch(() => {});

        // 4. Optimistically update local attendance state
        setAttendance(prev => prev.filter(a => !idsToDelete.includes(a.id)));
        setSelectedIds([]);
        showToast('success', 'Bulk Delete Successful', `${idsToDelete.length} attendance record(s) deleted.`);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('error', 'Bulk Delete Failed', err.message || 'Error deleting selected attendance records.');
      }
    }
  };

  const handleDeleteRow = async (row) => {
    if (!row || !row.id) return;
    const confirmed = await showConfirmDelete(
      'Delete Attendance Record?',
      `Are you sure you want to delete the attendance record for ${row.employee_name || 'this employee'}? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const id = row.id;
        deletedIdsRef.current.add(id);
        try {
          localStorage.setItem('subai_deleted_att_ids', JSON.stringify(Array.from(deletedIdsRef.current)));
        } catch (_) {}

        if (id.startsWith('att_missed_')) {
          const asgId = id.replace('att_missed_', '');
          deletedIdsRef.current.add(asgId);
          deleteDoc(doc(db, 'Assignments', asgId)).catch(() => {});
          deleteDoc(doc(db, 'assignments', asgId)).catch(() => {});
          ['Assignments', 'assignments'].forEach(k => {
            try {
              const store = JSON.parse(localStorage.getItem('subai_store_' + k) || '[]');
              const filtered = store.filter(x => x && x.id !== asgId);
              localStorage.setItem('subai_store_' + k, JSON.stringify(filtered));
            } catch (_) {}
          });
          setAssignments(prev => prev.filter(a => a.id !== asgId));
        }

        deleteDoc(doc(db, 'Attendance', id)).catch(() => {});
        deleteDoc(doc(db, 'attendance', id)).catch(() => {});
        deleteDoc(doc(db, 'attendance_logs', id)).catch(() => {});

        ['Attendance', 'attendance', 'attendance_logs'].forEach(k => {
          try {
            const store = JSON.parse(localStorage.getItem('subai_store_' + k) || '[]');
            const filtered = store.filter(x => x && x.id !== id);
            localStorage.setItem('subai_store_' + k, JSON.stringify(filtered));
          } catch (_) {}
        });

        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', ids: [id] })
        }).catch(() => {});

        setAttendance(prev => prev.filter(a => a.id !== id));
        setSelectedIds(prev => prev.filter(i => i !== id));
        showToast('success', 'Record Deleted', 'Attendance record deleted successfully.');
      } catch (err) {
        console.error('Delete error:', err);
        showToast('error', 'Delete Failed', err.message || 'Error deleting attendance record.');
      }
    }
  };

  const presentCount = combinedAttendance.filter(a => ['on site', 'checked in', 'on duty', 'completed', 'present'].includes((a.status || '').toLowerCase())).length;
  const lateCount = combinedAttendance.filter(a => (a.status || '').toLowerCase() === 'late' || a.isLateCheckIn).length;
  const absentCount = combinedAttendance.filter(a => ['absent', 'missed shift', 'missed'].includes((a.status || '').toLowerCase())).length + employees.filter(e => (e.status || '').toLowerCase() === 'absent').length;
  const onSiteCount = combinedAttendance.filter(a => ['on site', 'checked in'].includes((a.status || '').toLowerCase())).length;
  const checkedOutCount = combinedAttendance.filter(a => (a.status || '').toLowerCase() === 'completed').length;

  const SUMMARY_METRICS = [
    { title: 'Present', value: presentCount, trend: '+0%', isUp: true, color: '#10B981', bg: '#D1FAE5', icon: <CheckCircle size={20}/> },
    { title: 'Late', value: lateCount, trend: '0%', isUp: false, color: '#F59E0B', bg: '#FEF3C7', icon: <Clock size={20}/> },
    { title: 'Absent', value: absentCount, trend: absentCount > 0 ? `${absentCount} Missed` : '0%', isUp: absentCount > 0 ? false : null, color: '#EF4444', bg: '#FEE2E2', icon: <XCircle size={20}/> },
    { title: 'On Site', value: onSiteCount, trend: '+0%', isUp: true, color: '#3B82F6', bg: '#DBEAFE', icon: <MapPin size={20}/> },
    { title: 'Checked Out', value: checkedOutCount, trend: '+0%', isUp: true, color: '#64748B', bg: '#F1F5F9', icon: <StopCircle size={20}/> },
  ];

  const totalEvaluated = presentCount + absentCount + lateCount;
  const presentRate = totalEvaluated > 0
    ? Math.min(100, Math.round((presentCount / totalEvaluated) * 100))
    : (employees.length ? 100 : 0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: 8, color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Calendar size={16} color="#64748B" /> Today <ChevronDown size={14} />
        </button>
        <button
          onClick={handleRefresh}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4F46E5', border: 'none', padding: '10px 16px', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: syncing ? 0.8 : 1 }}
        >
          <RefreshCw size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} /> {syncing ? 'Syncing...' : 'Refresh Live Stream'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {SUMMARY_METRICS.map((m, i) => (
          <div key={i} style={{ background: 'white', padding: '16px 20px', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{m.icon}</div>
            <div>
              <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, marginBottom: 2 }}>{m.title}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Workspace Grid: Datatable on Left, 3 Charts Sidebar on Right ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'stretch' }}>
        
        {/* Attendance Records Datatable (Left Column) */}
        <div style={{ background: 'white', padding: 0, borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Attendance Records</h3>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Real-time check-in, check-out & verification telemetry</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#DC2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 14px',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Trash2 size={14} /> Delete Selected ({selectedIds.length})
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: 10, padding: '7px 14px', background: '#F8FAFC' }}>
                  <Search size={14} color="#94A3B8" />
                  <input placeholder="Search attendance..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#0F172A', fontWeight: 500 }} />
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr>
                    <th style={{ width: 40, padding: '14px 18px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                      />
                    </th>
                    {['EMPLOYEE', 'SITE', 'CHECK IN', 'CHECK OUT', 'DURATION', 'STATUS', 'VERIFICATION', 'ACTION'].map(h => (
                      <th key={h} style={{ padding: '14px 18px', textAlign: h === 'ACTION' ? 'center' : 'left', color: '#64748B', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentPageItems.length === 0 && filteredAtt.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>No attendance records logged yet.</td></tr>
                  )}
                  {currentPageItems.map((row, i) => {
                    const statusStyle = STATUS_STYLES[row.status] || STATUS_STYLES['Offline'];
                    const isSelected = selectedIds.includes(row.id);
                    return (
                      <tr key={row.id || i} style={{ borderBottom: '1px solid #F1F5F9', background: isSelected ? '#EFF6FF' : 'transparent' }}>
                        <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(row.id)}
                            style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                          />
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>{row.employee_name}</td>
                        <td style={{ padding: '14px 18px', color: '#475569', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{row.site_name}</div>
                          {row.active_location && row.active_location !== row.site_name && (
                            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={11} color="#94A3B8" /> {row.active_location}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 18px', whiteSpace: 'nowrap' }}>
                          <div style={{ color: row.status === 'Missed Shift' ? '#DC2626' : '#0F172A', fontWeight: 600 }}>
                            {row.status === 'Missed Shift' ? 'Missed (No Check-in)' : (row.check_in_time || row.check_in)}
                          </div>
                          {row.check_in_date ? (
                            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 2 }}>{row.check_in_date}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: '12px 18px', whiteSpace: 'nowrap' }}>
                          <div style={{ color: '#0F172A', fontWeight: 600 }}>{row.check_out_time || row.check_out}</div>
                          {row.check_out_date ? (
                            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 2 }}>{row.check_out_date}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.duration}</td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: statusStyle.bg, color: statusStyle.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.dot }}></div>
                            {row.status}
                          </div>
                          {row.isLateCheckIn && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              marginLeft: 6,
                              background: '#FFFBEB',
                              color: '#B45309',
                              border: '1px solid #FDE68A',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 10,
                              fontWeight: 700,
                            }}>
                              <Clock size={11} color="#B45309" />
                              Late Check-In{row.minutesLate ? ` (+${row.minutesLate}m)` : ''}
                            </div>
                          )}
                          {row.isEarlyCheckOut && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              marginLeft: 6,
                              background: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 10,
                              fontWeight: 700,
                            }}>
                              <AlertTriangle size={11} color="#DC2626" />
                              Early Check-Out{row.minutesEarly ? ` (-${row.minutesEarly}m)` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: row.verification === 'Verified' ? '#10B981' : (['No Show', 'Missed Check-In'].includes(row.verification) ? '#DC2626' : '#F59E0B'),
                            fontWeight: 600,
                            fontSize: 12
                          }}>
                            {row.verification === 'Verified' && <CheckCircle size={14}/>}
                            {['No Show', 'Missed Check-In'].includes(row.verification) && <XCircle size={14} color="#DC2626" />}
                            {row.verification !== 'Verified' && !['No Show', 'Missed Check-In'].includes(row.verification) && <Clock size={14}/>}
                            {row.verification}
                          </div>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => handleDeleteRow(row)}
                            title="Delete Record"
                            style={{
                              background: '#FEE2E2',
                              border: 'none',
                              borderRadius: 6,
                              padding: '5px 8px',
                              cursor: 'pointer',
                              color: '#DC2626',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#FCA5A5'}
                            onMouseLeave={e => e.currentTarget.style.background = '#FEE2E2'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Empty Filler Rows */}
                  {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                    <tr key={`empty-${idx}`} style={{ height: 53, borderBottom: '1px dashed #F1F5F9' }}>
                      <td colSpan={9} style={{ padding: 0 }}>&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Datatable Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            borderTop: '1px solid #F1F5F9',
            background: '#FFFFFF',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong> entries
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{ padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#0F172A', background: '#F8FAFC', outline: 'none', cursor: 'pointer' }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: safePage <= 1 ? '#F8FAFC' : '#FFFFFF', color: safePage <= 1 ? '#94A3B8' : '#334155', fontSize: 12, fontWeight: 600, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: 'none',
                    background: safePage === p ? '#1E5ADB' : 'transparent',
                    color: safePage === p ? '#FFFFFF' : '#334155',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: safePage === p ? '0 2px 6px rgba(30, 90, 219, 0.3)' : 'none'
                  }}
                >
                  {p}
                </button>
              ))}

              <button
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: safePage >= totalPages ? '#F8FAFC' : '#FFFFFF', color: safePage >= totalPages ? '#94A3B8' : '#334155', fontSize: 12, fontWeight: 600, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Unified 3-Chart Attendance Telemetry Card (Right Column) */}
        <div style={{
          background: 'white',
          borderRadius: 20,
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          border: '1px solid #F1F5F9',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          {/* Card Title Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="#1E5ADB" /> Attendance Telemetry
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Real-time check-in & verification metrics</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#1E5ADB', padding: '3px 8px', borderRadius: 12 }}>
              3 Charts
            </span>
          </div>

          {/* CHART 1: Attendance Compliance Donut Chart */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={14} color="#10B981" /> 1. Attendance Compliance
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#D1FAE5', color: '#065F46', padding: '2px 7px', borderRadius: 10 }}>
                {presentRate}% Present
              </span>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={(() => {
                      const totalSlices = presentCount + onSiteCount + lateCount + absentCount || 1;
                      const slices = [
                        { name: 'Present', value: presentCount, color: '#10B981', pct: Math.round((presentCount / totalSlices) * 100) },
                        { name: 'On Site', value: onSiteCount, color: '#3B82F6', pct: Math.round((onSiteCount / totalSlices) * 100) },
                        { name: 'Late', value: lateCount, color: '#F59E0B', pct: Math.round((lateCount / totalSlices) * 100) },
                        { name: 'Absent', value: absentCount, color: '#EF4444', pct: Math.round((absentCount / totalSlices) * 100) }
                      ].filter(d => d.value > 0);
                      return slices.length > 0 ? slices : [{ name: 'None', value: 1, color: '#E2E8F0', pct: 0 }];
                    })()}
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={52}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {[
                      { name: 'Present', color: '#10B981' },
                      { name: 'On Site', color: '#3B82F6' },
                      { name: 'Late', color: '#F59E0B' },
                      { name: 'Absent', color: '#EF4444' },
                      { name: 'None', color: '#E2E8F0' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{presentRate}%</div>
                <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, marginTop: 2 }}>Rate</div>
              </div>
            </div>

            {/* Custom Grid Legend */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 2 }}>
              {[
                { name: 'Present', value: presentCount, color: '#10B981' },
                { name: 'On Site', value: onSiteCount, color: '#3B82F6' },
                { name: 'Late', value: lateCount, color: '#F59E0B' },
                { name: 'Absent', value: absentCount, color: '#EF4444' }
              ].map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F8FAFC', padding: '3px 7px', borderRadius: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color }}></span>
                  <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, flex: 1 }}>{d.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0F172A' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: '#F1F5F9', margin: '8px 0' }} />

          {/* CHART 2: Check-in Velocity Area Chart */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#1E5ADB" /> 2. Peak Check-In Curve
              </div>
              <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>08:00 AM Peak</span>
            </div>

            <div style={{ width: '100%', height: 85 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[
                    { time: '06:00', value: 12 },
                    { time: '08:00', value: 85 },
                    { time: '10:00', value: 35 },
                    { time: '12:00', value: 15 },
                    { time: '14:00', value: 8 },
                    { time: '16:00', value: 4 }
                  ]}
                  margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="attAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#attAreaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ height: 1, background: '#F1F5F9', margin: '8px 0' }} />

          {/* CHART 3: Verification Method Density Bars */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={14} color="#1E5ADB" /> 3. Verification Telemetry
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#1E5ADB', padding: '2px 7px', borderRadius: 10 }}>
                AI Verified
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { method: 'Facial AI + GPS', pct: 82, fill: '#1E5ADB' },
                { method: 'GPS Geofence', pct: 15, fill: '#10B981' },
                { method: 'Manual Admin', pct: 3, fill: '#F59E0B' }
              ].map(b => (
                <div key={b.method} style={{ background: '#F8FAFC', borderRadius: 6, padding: '5px 8px', border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', fontWeight: 600, marginBottom: 3 }}>
                    <span>{b.method}</span>
                    <span style={{ fontWeight: 800, color: b.fill }}>{b.pct}%</span>
                  </div>
                  <div style={{ width: '100%', height: 4, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${b.pct}%`, height: '100%', background: b.fill, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}