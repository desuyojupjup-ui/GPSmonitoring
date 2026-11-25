import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, UserCheck, Clock, AlertTriangle, UserX, MapPin, Navigation, Building2, Truck, ShieldAlert, Database, RefreshCw, Users, PieChart as PieIcon, BarChart3, Activity, UserPlus, User, Mail, Lock, IdCard, Briefcase, Shield, Sliders, Check, ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';
import Swal from 'sweetalert2';
import { db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, getDocs, createSecondaryAuthUser } from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import { useCompany, DEFAULT_COMPANY_ID } from '../utils/companyContext';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { hasEmployeeCheckedOut, hasActiveSiteAssignment, hasActiveShiftSchedule, resolveEmployeeWorkType } from '../utils/statusUtils';

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

const CustomBarTooltip = ({ active, payload }) => {
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
        <div style={{ color: data.payload.fill || '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.fill }}></span>
          {data.payload.name}: <strong style={{ color: '#0F172A' }}>{data.value}</strong>
        </div>
      </div>
    );
  }
  return null;
};

const CustomGeofenceTooltip = ({ active, payload }) => {
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

const STATUS_STYLE = {
  'On Site':    { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'On Duty':    { background: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'Online':     { background: '#E0F2FE', color: '#0369A1', dot: '#0284C7' },
  'In Transit': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Offline':    { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

// Real-time Presence Evaluation (Active when heartbeat is fresh within 120s)
export function isEmployeeOnline(emp, customNow) {
  if (!emp) return false;
  if (emp.isOnline === false) return false;
  if ((emp.status || '').toString().trim().toLowerCase() === 'offline') return false;

  const now = (typeof customNow === 'number' && customNow > 1000000000000) ? customNow : Date.now();

  const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen || emp.lastLocationUpdate || emp.updatedAt;
  if (rawTime) {
    const ts = typeof rawTime === 'number'
      ? rawTime
      : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
    if (ts && !isNaN(ts)) {
      const diff = now - ts;
      return diff >= 0 && diff <= 120000; // 2 minutes active window
    }
  }

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

export function getEmployeeStatus(emp, customNow, assignments = []) {
  const now = (typeof customNow === 'number' && customNow > 1000000000000) ? customNow : Date.now();
  if (!isEmployeeOnline(emp, now)) return 'Offline';

  const isCheckedOut = hasEmployeeCheckedOut(emp);
  const rawStatus = (emp.status || '').trim();
  const isCompleted = isCheckedOut || rawStatus === 'Completed' || rawStatus === 'Checked Out';

  const workType = resolveEmployeeWorkType(emp, assignments);
  if (isCompleted) {
    if (workType === 'Fixed Site Employee') {
      return 'Online';
    }
    return 'Completed';
  }

  // Strict Rule: If no active site assignment or no shift scheduled, do NOT status On Duty
  const hasSiteAsg = hasActiveSiteAssignment(emp, assignments);
  const hasSchedule = hasActiveShiftSchedule(emp, assignments);
  if (!hasSiteAsg || !hasSchedule) {
    return 'Online';
  }

  return (emp.status && emp.status !== 'Offline') ? emp.status : 'Online';
}

const WORK_TYPE_STYLE = {
  'Fixed Site Employee':   { bg: '#EDE9FE', color: '#5B21B6', icon: Building2 },
  'Mobile Field Employee': { bg: '#FEF3C7', color: '#92400E', icon: Truck },
};

const GEOFENCE_STATUS_STYLE = {
  'Inside Assigned Site':  { bg: '#D1FAE5', color: '#065F46' },
  'Outside Assigned Site': { bg: '#FEE2E2', color: '#991B1B' },
};

export const to12hTime = (t) => {
  if (!t) return '';
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3] ? m[3].toUpperCase() : (h >= 12 ? 'PM' : 'AM');
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
};

export const to24hTime = (t) => {
  if (!t) return '08:00';
  const ampmMatch = String(t).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const ampm = ampmMatch[3].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  const h24Match = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
  if (h24Match) {
    return `${String(parseInt(h24Match[1], 10)).padStart(2, '0')}:${h24Match[2]}`;
  }
  return '08:00';
};

export const calculateShiftHours = (start24, end24) => {
  if (!start24 || !end24) return null;
  const [sh, sm] = String(start24).split(':').map(Number);
  const [eh, em] = String(end24).split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  const startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  const isOvernight = endMinutes <= startMinutes;
  if (isOvernight) {
    endMinutes += 24 * 60;
  }
  const diffMinutes = endMinutes - startMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  const timeStr = mins === 0 ? `${hours} hrs` : `${hours}h ${mins}m`;
  return isOvernight ? `${timeStr} (overnight)` : timeStr;
};

const EMPTY = {
  name: '', email: '', password: '', idNum: '', org: '', type: '', status: 'Offline', joined: '',
  workType: 'Fixed Site Employee',
  assignedSite: '',
  assignedSites: [],
  geofenceRadius: 100,
  assignedRoute: '',
  assignedDestinations: [],
  shiftStart: '08:00',
  shiftEnd: '17:00',
  shift: '08:00 AM - 05:00 PM',
  shiftTime: '08:00 AM - 05:00 PM',
  workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
};

export const calculatePasswordStrength = (pass) => {
  if (!pass) return { score: 0, label: '', color: '#E2E8F0', pct: 0, hint: '' };
  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 8) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[a-z]/.test(pass) && (/[A-Z]/.test(pass) || /[^A-Za-z0-9]/.test(pass))) score += 1;

  if (score <= 1) {
    return { score: 1, label: 'Weak', color: '#EF4444', pct: 25, hint: 'At least 6 chars; mix letters & numbers' };
  } else if (score === 2) {
    return { score: 2, label: 'Fair', color: '#F59E0B', pct: 50, hint: 'Add uppercase letters or symbols' };
  } else if (score === 3) {
    return { score: 3, label: 'Good', color: '#3B82F6', pct: 75, hint: 'Good password security' };
  } else {
    return { score: 4, label: 'Strong', color: '#10B981', pct: 100, hint: 'Excellent password strength!' };
  }
};

export default function Employees() {
  const { matchesCompany, stampCompany, activeCompanyId } = useCompany();
  // Start with empty array - NO hardcoded sample data pre-filled!
  const [rawEmployees, setRawEmployees]     = useState([]);
  const [rawSites, setRawSites]             = useState([]);
  const [rawAssignments, setRawAssignments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]       = useState('');
  const [wtFilter, setWtFilter]   = useState('All');
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [editId, setEditId]       = useState(null);
  const [isSaving, setIsSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');

  const employees = React.useMemo(() => rawEmployees.filter(matchesCompany), [rawEmployees, matchesCompany]);
  const sites = React.useMemo(() => rawSites.filter(matchesCompany), [rawSites, matchesCompany]);
  const assignments = React.useMemo(() => rawAssignments.filter(matchesCompany), [rawAssignments, matchesCompany]);

  // Pagination state
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(10);

  // Bulk Selection state
  const [selectedIds, setSelectedIds] = useState([]);

  // Real-time Firestore query listener
  useEffect(() => {
    setLoading(true);
    try {
      const qEmp = query(collection(db, 'employees'));
      const unsubEmp = onSnapshot(qEmp, (snapshot) => {
        const liveData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const empByEmail = new Map();
        liveData.forEach(item => {
          if (!item) return;
          const email = (item.email || item.empEmail || '').trim().toLowerCase();
          const key = email || item.id;
          if (!empByEmail.has(key)) {
            empByEmail.set(key, item);
          } else {
            const existing = empByEmail.get(key);
            if (!existing.idNum && item.idNum) {
              empByEmail.set(key, { ...existing, ...item, id: item.id });
            } else {
              empByEmail.set(key, { ...item, ...existing, id: existing.id });
            }
          }
        });
        setRawEmployees(Array.from(empByEmail.values()));
        setLoading(false);
      }, (err) => {
        console.warn('Firestore subscription error:', err);
        setLoading(false);
      });

      const qSites = query(collection(db, 'Sites'));
      const unsubSites = onSnapshot(qSites, (snapshot) => {
        setRawSites(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      const qAsg = query(collection(db, 'Assignments'));
      const unsubAsg = onSnapshot(qAsg, (snapshot) => {
        setRawAssignments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});

      return () => {
        unsubEmp();
        unsubSites();
        unsubAsg();
      };
    } catch (e) {
      console.warn('Firestore subscription caught error:', e);
      setLoading(false);
    }
  }, []);

  const fixedCount  = employees.filter(e => e.workType === 'Fixed Site Employee').length;
  const mobileCount = employees.filter(e => e.workType === 'Mobile Field Employee').length;
  const unassignedCount = employees.filter(e => !e.workType).length;
  const outsideCount= employees.filter(e => e.geofenceStatus === 'Outside Assigned Site').length;
  const inTransitCount = employees.filter(e => e.status === 'In Transit' && e.workType === 'Mobile Field Employee').length;

  const totalEmployees = employees.length || 1;

  // Auto-tick every 10s to re-evaluate presence in real time as heartbeats arrive/expire
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Chart 1: Workforce Type Donut Data
  const workforceChartData = [
    { name: 'Fixed Site', value: fixedCount, color: '#6366F1', pct: ((fixedCount / totalEmployees) * 100).toFixed(0) },
    { name: 'Mobile Field', value: mobileCount, color: '#F59E0B', pct: ((mobileCount / totalEmployees) * 100).toFixed(0) },
    ...(unassignedCount > 0 ? [{ name: 'Unassigned', value: unassignedCount, color: '#94A3B8', pct: ((unassignedCount / totalEmployees) * 100).toFixed(0) }] : [])
  ];

  // Helper: get employee effective status taking into account assignments and schedule
  const getStatus = (emp) => getEmployeeStatus(emp, null, assignments);

  // Chart 2: Status Breakdown Bar Data
  const statusChartData = [
    { name: 'On Duty', count: employees.filter(e => getStatus(e) === 'On Duty' || getStatus(e) === 'On Site').length, fill: '#3B82F6' },
    { name: 'Online', count: employees.filter(e => getStatus(e) === 'Online').length, fill: '#0284C7' },
    { name: 'In Transit', count: employees.filter(e => getStatus(e) === 'In Transit').length, fill: '#F59E0B' },
    { name: 'Offline', count: employees.filter(e => getStatus(e) === 'Offline').length, fill: '#94A3B8' },
  ];

  // Chart 3: Geofence Compliance Data
  const insideGeofenceCount = employees.filter(e => e.geofenceStatus === 'Inside Assigned Site' || e.geofenceStatus === 'Inside Site' || !e.geofenceStatus).length;
  const outsideGeofenceCount = employees.filter(e => e.geofenceStatus === 'Outside Assigned Site' || e.geofenceStatus === 'Outside Site').length;

  const geofenceChartData = [
    { name: 'Inside Site', value: insideGeofenceCount, color: '#10B981', pct: ((insideGeofenceCount / totalEmployees) * 100).toFixed(0) },
    { name: 'Outside Site', value: outsideGeofenceCount, color: '#EF4444', pct: ((outsideGeofenceCount / totalEmployees) * 100).toFixed(0) },
  ];

  const filtered = employees.filter(emp => {
    const matchSearch = (emp.name || '').toLowerCase().includes(search.toLowerCase()) ||
                        (emp.idNum || '').toLowerCase().includes(search.toLowerCase());
    const matchType = wtFilter === 'All' || emp.workType === wtFilter;
    return matchSearch && matchType;
  });

  // Pagination metrics
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);
  const emptyRowsCount = loading ? 0 : Math.max(0, Math.min(pageSize, 8) - currentPageItems.length);

  // Bulk Selection Logic
  const isAllSelected = currentPageItems.length > 0 && currentPageItems.every(emp => selectedIds.includes(emp.id));

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

  const cleanupDeletedEmployeeRecords = async (empList = []) => {
    if (!empList.length) return;
    const deletedIds = new Set();
    const deletedEmails = new Set();
    const deletedNames = new Set();

    empList.forEach(e => {
      if (!e) return;
      if (e.id) deletedIds.add(e.id.toString().trim().toLowerCase());
      if (e.idNum) deletedIds.add(e.idNum.toString().trim().toLowerCase());
      if (e.email) deletedEmails.add(e.email.toString().trim().toLowerCase());
      if (e.name) deletedNames.add(e.name.toString().trim().toLowerCase());
    });

    const matchesDeletedEmp = (d = {}) => {
      const dId = (d.employeeId || d.empId || '').toString().trim().toLowerCase();
      const dEmail = (d.employeeEmail || d.empEmail || d.email || '').toString().trim().toLowerCase();
      const dName = (d.employeeName || d.empName || d.name || '').toString().trim().toLowerCase();
      if (dId && deletedIds.has(dId)) return true;
      if (dEmail && deletedEmails.has(dEmail)) return true;
      if (dName && deletedNames.has(dName)) return true;
      return false;
    };

    const collectionsToClean = ['ai_analysis', 'ActivityLogs', 'notifications', 'Assignments', 'assignments'];
    for (const colName of collectionsToClean) {
      try {
        const snap = await getDocs(collection(db, colName));
        const toRemove = snap.docs.filter(d => matchesDeletedEmp(d.data()));
        await Promise.all(toRemove.map(d => deleteDoc(doc(db, colName, d.id)).catch(() => {})));
      } catch (_) {}
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Employees?`,
      `Are you sure you want to delete ${selectedIds.length} employee record(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const deletedEmps = employees.filter(e => selectedIds.includes(e.id));
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'employees', id))));
        cleanupDeletedEmployeeRecords(deletedEmps).catch(() => {});
        showToast('Bulk Delete Successful', `${selectedIds.length} employee(s) removed from backend.`, 'success');
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected employees.', 'error');
      }
    }
  };

  const [showPassword, setShowPassword] = useState(false);

  // Real-time validations for Add/Edit Employee Modal
  const cleanIdNum = (form.idNum || '').trim();
  const cleanEmail = (form.email || '').trim().toLowerCase();
  const cleanUsername = (form.username || '').trim().toLowerCase();
  const targetCompanyId = form.companyId || (activeCompanyId !== 'ALL' ? activeCompanyId : DEFAULT_COMPANY_ID);

  // Unique ID Number within same company; Email globally unique across live Firestore employees
  const duplicateIdEmployee = cleanIdNum
    ? rawEmployees.find(e =>
        e.id !== editId &&
        (e.companyId || DEFAULT_COMPANY_ID) === targetCompanyId &&
        (e.idNum || '').trim().toLowerCase() === cleanIdNum.toLowerCase()
      )
    : null;

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const duplicateEmailEmployee = cleanEmail
    ? rawEmployees.find(e => e.id !== editId && (e.email || '').trim().toLowerCase() === cleanEmail)
    : null;

  const duplicateUsernameEmployee = cleanUsername
    ? rawEmployees.find(e => e.id !== editId && (e.username || '').trim().toLowerCase() === cleanUsername)
    : null;

  const pwdStrength = calculatePasswordStrength(form.password || '');

  const validateEmployeeForm = (liveRecords = rawEmployees) => {
    const trimmedName = (form.name || '').trim();
    if (!trimmedName) return 'Full Name is required.';

    if (!cleanEmail) return 'Email Address is required.';
    if (!isValidEmail) return 'Please enter a valid email address (e.g. employee@gmail.com).';

    const dupEmail = liveRecords.find(
      e => e.id !== editId && (e.email || '').trim().toLowerCase() === cleanEmail
    );
    if (dupEmail) {
      return `Duplicate Employee: Email "${cleanEmail}" is already registered to ${dupEmail.name || 'another employee'}.`;
    }

    if (cleanIdNum) {
      const dupId = liveRecords.find(
        e => e.id !== editId &&
          (e.companyId || DEFAULT_COMPANY_ID) === targetCompanyId &&
          (e.idNum || '').trim().toLowerCase() === cleanIdNum.toLowerCase()
      );
      if (dupId) {
        return `Duplicate Employee: Employee ID "${cleanIdNum}" is already assigned to ${dupId.name || 'another employee'}.`;
      }
    }

    if (cleanUsername) {
      const dupUser = liveRecords.find(
        e => e.id !== editId && (e.username || '').trim().toLowerCase() === cleanUsername
      );
      if (dupUser) {
        return `Duplicate Employee: Username "${cleanUsername}" is already taken.`;
      }
    }

    if (!editId && (!form.password || form.password.length < 6)) {
      return 'Account Password is required and must be at least 6 characters.';
    }
    if (form.password && form.password.length < 6) {
      return 'Account Password must be at least 6 characters.';
    }

    return null;
  };

  const location = useLocation();

  const openAdd  = () => { 
    setForm({ 
      ...EMPTY, 
      username: '',
      assignedSites: [],
      shiftStart: '08:00',
      shiftEnd: '17:00',
      shift: '08:00 AM - 05:00 PM',
      shiftTime: '08:00 AM - 05:00 PM',
      workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    }); 
    setEditId(null); 
    setSaveError('');
    setShowPassword(false);
    setModal(true); 
  };
  
  const openEdit = (emp) => { 
    let sitesArr = [];
    if (Array.isArray(emp.assignedSites)) {
      sitesArr = emp.assignedSites;
    } else if (emp.assignedSite) {
      sitesArr = emp.assignedSite.split(',').map(s => s.trim()).filter(Boolean);
    }

    let sStart = emp.shiftStart ? to24hTime(emp.shiftStart) : '08:00';
    let sEnd = emp.shiftEnd ? to24hTime(emp.shiftEnd) : '17:00';
    if (!emp.shiftStart && (emp.shift || emp.shiftTime)) {
      const parts = (emp.shift || emp.shiftTime || '').split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
      if (parts.length >= 2) {
        sStart = to24hTime(parts[0]);
        sEnd = to24hTime(parts[1]);
      }
    }

    const formattedShift = `${to12hTime(sStart)} - ${to12hTime(sEnd)}`;
    const empWorkDays = Array.isArray(emp.workDays) && emp.workDays.length > 0
      ? emp.workDays
      : (emp.scheduleDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

    setForm({ 
      ...EMPTY, 
      ...emp, 
      assignedSites: sitesArr,
      shiftStart: sStart,
      shiftEnd: sEnd,
      shift: emp.shift || formattedShift,
      shiftTime: emp.shiftTime || emp.shift || formattedShift,
      workDays: empWorkDays,
    }); 
    setEditId(emp.id); 
    setSaveError('');
    setShowPassword(false);
    setModal(true); 
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearch(q);
    }
    if (params.get('action') === 'add') {
      openAdd();
    }
  }, [location.search]);

  useEffect(() => {
    const handleOpenAdd = () => openAdd();
    window.addEventListener('subai_open_add_employee', handleOpenAdd);
    return () => window.removeEventListener('subai_open_add_employee', handleOpenAdd);
  }, []);

  const handleDelete = async (id) => {
    const confirmed = await showConfirmDelete(
      'Delete Employee?',
      'Are you sure you want to remove this employee from your workforce records?'
    );
    if (confirmed) {
      try {
        const deletedEmp = employees.find(e => e.id === id) || { id };
        await deleteDoc(doc(db, 'employees', id));
        cleanupDeletedEmployeeRecords([deletedEmp]).catch(() => {});
        showToast('Employee Removed', 'The employee record has been deleted.', 'success');
      } catch (e) {
        console.warn('Firestore delete error:', e);
        showToast('Delete Failed', e.message || 'Could not delete employee', 'error');
      }
    }
  };

  const handleSave = async () => {
    setSaveError('');
    // 1. Immediate client-side check before any Firestore calls
    const preErr = validateEmployeeForm(rawEmployees);
    if (preErr) {
      setSaveError(preErr);
      return showToast('Validation Error', preErr, 'error');
    }

    setIsSaving(true);
    try {
      // 2. Authoritative live Firestore duplicate check BEFORE creating/updating (Requirement 2: NEVER save after duplicate error)
      const liveSnap = await getDocs(collection(db, 'employees'));
      const liveRecords = liveSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const liveDupErr = validateEmployeeForm(liveRecords);
      if (liveDupErr) {
        setSaveError(liveDupErr);
        showToast('Duplicate Employee Detected', liveDupErr, 'error');
        return; // HARD ABORT — never proceed to Firestore write
      }

      const isMobile = form.workType === 'Mobile Field Employee';
      const isFixed = form.workType === 'Fixed Site Employee';
      const existing = editId ? liveRecords.find(e => e.id === editId) : null;

      const sStartFormatted = to12hTime(form.shiftStart || '08:00');
      const sEndFormatted = to12hTime(form.shiftEnd || '17:00');
      const computedShift = `${sStartFormatted} - ${sEndFormatted}`;
      const effectiveWorkDays = Array.isArray(form.workDays) && form.workDays.length > 0
        ? form.workDays
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

      let createdUid = existing?.uid || null;
      if (form.password && cleanEmail) {
        const authRes = await createSecondaryAuthUser(cleanEmail, form.password);
        if (authRes?.uid) createdUid = authRes.uid;
      }

      const dataToSave = stampCompany({
        ...form,
        companyId: existing?.companyId || form.companyId || undefined,
        name: (form.name || '').trim(),
        email: cleanEmail,
        username: cleanUsername,
        idNum: cleanIdNum,
        ...(createdUid ? { uid: createdUid } : {}),
        assignedSites: isMobile ? (existing?.assignedSites || []) : (form.assignedSite ? [form.assignedSite] : []),
        assignedSite: isMobile ? (existing?.assignedSite || '') : (form.assignedSite || ''),
        assignedDestinations: isMobile ? (existing?.assignedDestinations || []) : [],
        ...(isFixed ? {
          shiftStart: form.shiftStart || '08:00',
          shiftEnd: form.shiftEnd || '17:00',
          shift: computedShift,
          shiftTime: computedShift,
          workDays: effectiveWorkDays,
          schedule: `${computedShift} (${effectiveWorkDays.join(', ')})`,
        } : {}),
        updatedAt: Date.now(),
      });

      if (editId) {
        await updateDoc(doc(db, 'employees', editId), dataToSave);
        showToast('Employee Updated', `${dataToSave.name} saved to Cloud Firestore.`, 'success');
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newEmp = {
          ...dataToSave,
          faceRegistered: false,
          faceReferencePhoto: null,
          joined: nowStr.replace(', ', '\n'),
          profilePic: null,
          createdAt: Date.now(),
        };
        await addDoc(collection(db, 'employees'), newEmp);
        showToast('Employee Created', `${dataToSave.name} created successfully.`, 'success');
      }

      // Fixed Site Employees have their assigned site set directly on the Employees page;
      // ensure no duplicate records exist in Assignments / assignments for Fixed Site Employees.
      if (isFixed) {
        try {
          const collectionsToCheck = ['Assignments', 'assignments'];
          const cleanNameLower = (dataToSave.name || '').toLowerCase();
          for (const colName of collectionsToCheck) {
            try {
              const snap = await getDocs(collection(db, colName));
              for (const d of snap.docs) {
                const data = d.data();
                const dEmail = (data.empEmail || data.employeeEmail || '').toLowerCase();
                const dId = (data.empId || data.employeeId || '').toString().toLowerCase();
                const dName = (data.empName || data.employeeName || '').toLowerCase();
                const isMatch = (cleanEmail && dEmail === cleanEmail) ||
                                (cleanIdNum && dId === cleanIdNum.toLowerCase()) ||
                                (cleanNameLower && dName === cleanNameLower);
                if (isMatch) {
                  await deleteDoc(doc(db, colName, d.id)).catch(() => {});
                }
              }
            } catch (err) {
              console.warn(`Error cleaning fixed employee from ${colName}:`, err);
            }
          }
        } catch (asgErr) {
          console.warn('Assignments cleanup warning:', asgErr);
        }
      }

      setModal(false);
    } catch (e) {
      console.warn('Save error:', e);
      showToast('Save Failed', e.message || 'Failed to save employee', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, outline:'none', fontFamily:'Inter,sans-serif', boxSizing:'border-box' };
  const labelStyle = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5, textTransform:'capitalize' };

  return (
    <>
      <div className="page-body">


        {/* ── Work Type KPI Cards ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
          {[
            { label:'Fixed Site Employees',     value: fixedCount,    color:'#5B21B6', bg:'#EDE9FE', icon: Building2 },
            { label:'Mobile Field Employees',    value: mobileCount,   color:'#92400E', bg:'#FEF3C7', icon: Truck },
            { label:'Employees Outside Geofence',value: outsideCount,  color:'#991B1B', bg:'#FEE2E2', icon: ShieldAlert },
            { label:'Employees In Transit',      value: inTransitCount,color:'#1E40AF', bg:'#DBEAFE', icon: Navigation },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} style={{ background:'white', border:`1.5px solid ${bg}`, borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon size={18} color={color} />
              </div>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:'#111827', lineHeight:1 }}>{value}</div>
                <div style={{ fontSize:11, color:'#6B7280', fontWeight:500, marginTop:3 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'flex-start' }}>

          {/* Left: Data Table */}
          <div className="widget" style={{ padding:0, overflow:'hidden' }}>

            {/* Toolbar */}
            <div style={{ display:'flex', gap:10, padding:16, borderBottom:'1px solid #F3F4F6', alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, border:'1px solid #E5E7EB', borderRadius:6, padding:'8px 12px', minWidth:200 }}>
                <Search size={14} color="#9CA3AF" />
                <input placeholder="Search name or ID..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ border:'none', outline:'none', width:'100%', fontSize:13, color:'#374151' }} />
              </div>
              <select value={wtFilter} onChange={e => setWtFilter(e.target.value)}
                style={{ padding:'9px 12px', border:'1px solid #E5E7EB', borderRadius:6, fontSize:13, color:'#374151', outline:'none', background:'white' }}>
                <option value="All">All Types</option>
                <option value="Fixed Site Employee">Fixed Site</option>
                <option value="Mobile Field Employee">Mobile Field</option>
              </select>

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
                    borderRadius: 6,
                    padding: '9px 14px',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Trash2 size={14} /> Delete Selected ({selectedIds.length})
                </button>
              )}

              <button onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6, background:'#1E5ADB', color:'white', border:'none', borderRadius:6, padding:'9px 16px', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                <Plus size={14} /> Add Employee
              </button>
            </div>

            {/* Table */}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead style={{ background:'#F9FAFB' }}>
                  <tr>
                    <th style={{ width:40, padding:'12px 14px', textAlign:'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor:'pointer', accentColor:'#1E5ADB', width:15, height:15 }}
                      />
                    </th>
                    {['USER','ID NUMBER','DEPT / TYPE','WORK TYPE','GEOFENCE STATUS','STATUS','DATE REG.','ACTIONS'].map(h => (
                      <th key={h} style={{ padding:'12px 14px', textAlign:'left', color:'#6B7280', fontWeight:700, fontSize:10, letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentPageItems.map(emp => {
                    const wtStyle = WORK_TYPE_STYLE[emp.workType] || WORK_TYPE_STYLE['Fixed Site Employee'];
                    const WTIcon  = wtStyle.icon;
                    const gfStyle = emp.geofenceStatus ? (GEOFENCE_STATUS_STYLE[emp.geofenceStatus] || {}) : null;
                    const isSelected = selectedIds.includes(emp.id);
                    return (
                      <tr key={emp.id} style={{ borderBottom:'1px solid #F3F4F6', background: isSelected ? '#EFF6FF' : 'transparent' }}>
                        <td style={{ padding:'12px 14px', textAlign:'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(emp.id)}
                            style={{ cursor:'pointer', accentColor:'#1E5ADB', width:15, height:15 }}
                          />
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', color:'#1E5ADB', fontWeight:700, fontSize:12, flexShrink:0, overflow:'hidden' }}>
                              {emp.profilePic ? <img src={emp.profilePic} alt={emp.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (emp.name || 'Emp').split(' ').map(n=>n[0]).join('').substring(0,2)}
                            </div>
                            <div>
                              <div style={{ fontWeight:600, color:'#111827', display:'flex', alignItems:'center', gap:6 }}>
                                <span>{emp.name}</span>
                                <span
                                  title={emp.faceRegistered && emp.faceReferencePhoto ? 'Face registered for verification' : 'Face registration required before verification'}
                                  style={{
                                    fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:10,
                                    background: emp.faceRegistered && emp.faceReferencePhoto ? '#D1FAE5' : '#FEF3C7',
                                    color: emp.faceRegistered && emp.faceReferencePhoto ? '#065F46' : '#92400E',
                                  }}
                                >
                                  {emp.faceRegistered && emp.faceReferencePhoto ? 'Face ID ✓' : 'No Face ID'}
                                </span>
                              </div>
                              <div style={{ fontSize:11, color:'#6B7280' }}>{emp.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px', color:'#374151', fontWeight:500 }}>{emp.idNum || 'N/A'}</td>
                        <td style={{ padding:'12px 14px', color:'#374151' }}>
                          <div>{emp.org || 'Operations'}</div>
                          <div style={{ fontSize:11, color:'#6B7280' }}>{emp.type || 'Field Staff'}</div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:wtStyle.bg, color:wtStyle.color, padding:'4px 8px', borderRadius:6, fontWeight:600, fontSize:10, whiteSpace:'nowrap' }}>
                            <WTIcon size={11} />
                            {emp.workType === 'Fixed Site Employee' ? 'Fixed Site' : 'Mobile Field'}
                          </div>
                          {emp.workType === 'Fixed Site Employee' && (emp.shift || emp.shiftTime) && (
                            <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#64748B', marginTop:4, fontWeight:500, whiteSpace:'nowrap' }}>
                              <Clock size={10} color="#94A3B8" />
                              <span>{emp.shift || emp.shiftTime}</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          {emp.workType === 'Fixed Site Employee' && emp.geofenceStatus ? (
                            <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:gfStyle?.bg || '#F3F4F6', color:gfStyle?.color || '#374151', padding:'4px 8px', borderRadius:6, fontWeight:600, fontSize:10, whiteSpace:'nowrap' }}>
                              {emp.geofenceStatus === 'Outside Assigned Site' && <ShieldAlert size={11} />}
                              {emp.geofenceStatus}
                            </div>
                          ) : emp.workType === 'Mobile Field Employee' ? (
                            <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#FEF3C7', color:'#92400E', padding:'4px 8px', borderRadius:6, fontWeight:600, fontSize:10 }}>
                              <Navigation size={11} /> En Route
                            </div>
                          ) : (
                            <span style={{ color:'#D1D5DB', fontSize:12 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          {(() => {
                            const effStatus = getStatus(emp);
                            const style = STATUS_STYLE[effStatus] || STATUS_STYLE.Offline;
                            return (
                              <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:style.background, color:style.color, padding:'4px 9px', borderRadius:20, fontWeight:600, fontSize:11 }}>
                                <div style={{ width:5, height:5, borderRadius:'50%', background:style.dot }} />
                                {effStatus}
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding:'12px 14px', color:'#6B7280', fontSize:11, whiteSpace:'pre-line' }}>{emp.joined}</td>
                        <td style={{ padding:'10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              onClick={() => openEdit(emp)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #DBEAFE',
                                backgroundColor: '#FFFFFF',
                                color: '#1E5ADB',
                                fontWeight: '700',
                                fontSize: '11px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Edit2 size={13} color="#1E5ADB" /> Edit
                            </button>
                            <button
                              onClick={() => handleDelete(emp.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #FCA5A5',
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Trash2 size={13} color="#DC2626" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Empty Filler Rows if page has fewer items than pageSize */}
                  {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                    <tr key={`empty-row-${idx}`} style={{ height: 38, borderBottom: '1px dashed #F8FAFC' }}>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11, textAlign: 'center' }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                      <td style={{ padding: '8px 14px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>Loading employee database from backend...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: '#6B7280' }}>
                <Users size={36} color="#94A3B8" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>No Employees Found</div>
                <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Click <strong>Add Employee</strong> to create real records in your database.</p>
                <button onClick={openAdd} style={{ marginTop: 12, padding: '9px 18px', backgroundColor: '#1E5ADB', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                  + Add First Employee
                </button>
              </div>
            ) : null}

            {/* Premium Datatable Pagination Header/Footer */}
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
              {/* Left: Info & Rows per page selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                  Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong> entries
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    style={{
                      padding: '5px 10px',
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0F172A',
                      background: '#F8FAFC',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                  </select>
                  <span>per page</span>
                </div>
              </div>

              {/* Right: Page Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    background: safePage <= 1 ? '#F8FAFC' : '#FFFFFF',
                    color: safePage <= 1 ? '#94A3B8' : '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: pNum === safePage ? 'none' : '1px solid #E2E8F0',
                      background: pNum === safePage ? '#1E5ADB' : '#FFFFFF',
                      color: pNum === safePage ? '#FFFFFF' : '#334155',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: pNum === safePage ? '0 2px 6px rgba(30, 90, 219, 0.3)' : 'none'
                    }}
                  >
                    {pNum}
                  </button>
                ))}

                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    background: safePage >= totalPages ? '#F8FAFC' : '#FFFFFF',
                    color: safePage >= totalPages ? '#94A3B8' : '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Right: Single Unified Widget Card containing 3 Charts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="widget" style={{ padding: 20 }}>
              
              {/* Main Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #F1F5F9', paddingBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={18} color="#1E5ADB" /> Workforce Analytics
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Real-time telemetry & presence insights</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, background: '#EFF6FF', color: '#1E5ADB', padding: '4px 10px', borderRadius: 12 }}>
                  3 Charts
                </span>
              </div>

              {/* CHART 1: Workforce Distribution (Donut Chart) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PieIcon size={14} color="#6366F1" /> 1. Workforce Distribution
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B' }}>Fixed vs Mobile</span>
                </div>

                <div style={{ position: 'relative', width: '100%', height: 135 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={workforceChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={54}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {workforceChartData.map((entry, index) => (
                          <Cell key={`cell-wf-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>

                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none'
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{employees.length}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginTop: 2 }}>Staff</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '7px 10px', border: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1' }}></span> Fixed Site
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                      {fixedCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#6366F1' }}>({((fixedCount / totalEmployees) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '7px 10px', border: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }}></span> Mobile Field
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                      {mobileCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B' }}>({((mobileCount / totalEmployees) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />

              {/* CHART 2: Real-time Status Breakdown (Bar Chart) */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart3 size={14} color="#1E5ADB" /> 2. Real-time Status Breakdown
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#10B981', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}></span> Live
                  </span>
                </div>

                <div style={{ width: '100%', height: 135 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94A3B8' }} />
                      <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#F8FAFC' }} />
                      <Bar dataKey="count" radius={[5, 5, 0, 0]} barSize={22}>
                        {statusChartData.map((entry, index) => (
                          <Cell key={`bar-cell-unified-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                  {[
                    { label: 'On Site', count: employees.filter(e => getStatus(e) === 'On Site').length, color: '#10B981' },
                    { label: 'On Duty', count: employees.filter(e => ['On Duty', 'Online'].includes(getStatus(e))).length, color: '#3B82F6' },
                    { label: 'In Transit', count: employees.filter(e => getStatus(e) === 'In Transit').length, color: '#F59E0B' },
                    { label: 'Offline', count: employees.filter(e => getStatus(e) === 'Offline').length, color: '#6B7280' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '5px 8px', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#475569', fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }}></span> {s.label}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#0F172A' }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />

              {/* CHART 3: Geofence Security & Compliance (Pie / Donut Chart) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={14} color="#EF4444" /> 3. Geofence Compliance
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: outsideGeofenceCount > 0 ? '#FEE2E2' : '#D1FAE5', color: outsideGeofenceCount > 0 ? '#991B1B' : '#065F46', padding: '2px 7px', borderRadius: 10 }}>
                    {outsideGeofenceCount > 0 ? `${outsideGeofenceCount} Outside` : '100% Inside'}
                  </span>
                </div>

                <div style={{ position: 'relative', width: '100%', height: 135 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={geofenceChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={54}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {geofenceChartData.map((entry, index) => (
                          <Cell key={`cell-geo-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomGeofenceTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>

                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none'
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: outsideGeofenceCount > 0 ? '#DC2626' : '#10B981', lineHeight: 1 }}>
                      {((insideGeofenceCount / totalEmployees) * 100).toFixed(0)}%
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginTop: 2 }}>Compliant</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '7px 10px', border: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}></span> Inside Site
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                      {insideGeofenceCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#10B981' }}>({((insideGeofenceCount / totalEmployees) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '7px 10px', border: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }}></span> Outside Site
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                      {outsideGeofenceCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#EF4444' }}>({((outsideGeofenceCount / totalEmployees) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Add/Edit Modal (Scrolldown-Free Modern Layout) ── */}
      {modal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 24,
            width: 700,
            maxWidth: '95vw',
            boxShadow: '0 25px 60px -15px rgba(30, 90, 219, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>

            {/* Modal Header with Light Mesh Gradient Background */}
            <div style={{
              background: 'linear-gradient(135deg, #EFF6FF 0%, #EEF2FF 50%, #F5F3FF 100%)',
              padding: '22px 28px 18px 28px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: '#FFFFFF',
                  color: '#1E5ADB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 16px rgba(30, 90, 219, 0.15)'
                }}>
                  <UserPlus size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editId ? 'Edit Employee Profile' : 'Add New Employee'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: 500 }}>
                    Workforce Directory & Deployment Setup
                  </div>
                </div>
              </div>

              <button
                onClick={() => setModal(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Simplified Single-Page Scrollable Employee Form (Personal Info, Account Info, Role, Deployment & Status) */}
            <div style={{ padding: '20px 28px', maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {saveError && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', color: '#991B1B', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} color="#DC2626" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Section 1: Personal & Role Information */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1E5ADB', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  1. Personal &amp; Role Information
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px', alignItems: 'start' }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Full Name *</label>
                    <div style={{ position: 'relative' }}>
                      <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.name || ''}
                        onChange={e => { setSaveError(''); setForm(p => ({ ...p, name: e.target.value })); }}
                        placeholder="e.g. John Doe"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span>Employee ID Number</span>
                      {duplicateIdEmployee && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 700 }}>Duplicate ID</span>}
                      {!duplicateIdEmployee && cleanIdNum && <span style={{ fontSize: 10, color: '#10B981', fontWeight: 700 }}>Available</span>}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <IdCard size={15} color={duplicateIdEmployee ? '#EF4444' : '#94A3B8'} style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.idNum || ''}
                        onChange={e => { setSaveError(''); setForm(p => ({ ...p, idNum: e.target.value })); }}
                        placeholder="e.g. EMP-1001"
                        style={{
                          width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12,
                          border: duplicateIdEmployee ? '1.5px solid #EF4444' : (cleanIdNum ? '1.5px solid #10B981' : '1.5px solid #E2E8F0'),
                          fontSize: 13, outline: 'none', background: duplicateIdEmployee ? '#FEF2F2' : '#FFFFFF',
                          boxSizing: 'border-box', color: '#0F172A', fontWeight: 500
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Department / Unit</label>
                    <div style={{ position: 'relative' }}>
                      <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.org || ''}
                        onChange={e => setForm(p => ({ ...p, org: e.target.value }))}
                        placeholder="e.g. Field Operations"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Role / Job Title</label>
                    <div style={{ position: 'relative' }}>
                      <Briefcase size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.type || ''}
                        onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                        placeholder="e.g. Security Guard, Field Technician"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Account Credentials & Status */}
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1E5ADB', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  2. Account Information &amp; Status
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px', alignItems: 'start' }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span>Email Address *</span>
                      {duplicateEmailEmployee && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 700 }}>Already registered</span>}
                      {!duplicateEmailEmployee && isValidEmail && <span style={{ fontSize: 10, color: '#10B981', fontWeight: 700 }}>Valid</span>}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={15} color={duplicateEmailEmployee ? '#EF4444' : '#94A3B8'} style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="email"
                        value={form.email || ''}
                        onChange={e => { setSaveError(''); setForm(p => ({ ...p, email: e.target.value })); }}
                        placeholder="e.g. employee@gmail.com"
                        style={{
                          width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12,
                          border: duplicateEmailEmployee ? '1.5px solid #EF4444' : (isValidEmail ? '1.5px solid #10B981' : '1.5px solid #E2E8F0'),
                          fontSize: 13, outline: 'none', background: duplicateEmailEmployee ? '#FEF2F2' : '#FFFFFF',
                          boxSizing: 'border-box', color: '#0F172A', fontWeight: 500
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span>Account Password {editId ? '(Optional)' : '*'}</span>
                      {form.password && <span style={{ fontSize: 10.5, fontWeight: 800, color: pwdStrength.color }}>{pwdStrength.label}</span>}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password || ''}
                        onChange={e => { setSaveError(''); setForm(p => ({ ...p, password: e.target.value })); }}
                        placeholder={editId ? 'Leave blank to keep current' : 'Min. 6 characters'}
                        style={{
                          width: '100%', padding: '10px 38px 10px 38px', borderRadius: 12,
                          border: form.password ? `1.5px solid ${pwdStrength.color}` : '1.5px solid #E2E8F0',
                          fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 10, top: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: '#94A3B8' }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span>Username (Optional)</span>
                      {duplicateUsernameEmployee && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 700 }}>Already taken</span>}
                    </label>
                    <input
                      type="text"
                      value={form.username || ''}
                      onChange={e => { setSaveError(''); setForm(p => ({ ...p, username: e.target.value })); }}
                      placeholder="e.g. jdoe"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12,
                        border: duplicateUsernameEmployee ? '1.5px solid #EF4444' : '1.5px solid #E2E8F0',
                        fontSize: 13, outline: 'none', background: duplicateUsernameEmployee ? '#FEF2F2' : '#FFFFFF',
                        boxSizing: 'border-box', color: '#0F172A', fontWeight: 500
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Account Status</label>
                    <select
                      value={form.status || 'Offline'}
                      onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                    >
                      <option value="Offline">Active (Offline until mobile login)</option>
                      <option value="Online">Online</option>
                      <option value="Inactive">Inactive / Suspended</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Deployment Type, Worksite & Shift */}
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1E5ADB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  3. Deployment Type &amp; Schedule
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Employee Work Type</label>
                  <select
                    value={form.workType || 'Fixed Site Employee'}
                    onChange={e => {
                      const wt = e.target.value;
                      setForm(p => ({ ...p, workType: wt, geofenceRadius: wt === 'Fixed Site Employee' ? (p.geofenceRadius || 20) : 100 }));
                    }}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 600 }}
                  >
                    <option value="Fixed Site Employee">Fixed Site Employee</option>
                    <option value="Mobile Field Employee">Mobile Field Employee</option>
                  </select>
                </div>

                {form.workType === 'Fixed Site Employee' && (
                  <div style={{ background: '#F8FAFC', borderRadius: 14, padding: 16, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Assigned Worksite</label>
                        <select
                          value={form.assignedSite || ''}
                          onChange={e => {
                            const selSite = e.target.value;
                            const matched = sites.find(s => (s.name || s.id) === selSite);
                            const rad = matched?.radius ? (typeof matched.radius === 'number' ? matched.radius : parseInt(matched.radius)) : 20;
                            setForm(p => ({ ...p, assignedSite: selSite, assignedSites: selSite ? [selSite] : [], geofenceRadius: rad || p.geofenceRadius || 20 }));
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                        >
                          <option value="">— Select a Site —</option>
                          {sites.map(s => <option key={s.id} value={s.name || s.id}>{s.name} ({typeof s.radius === 'number' ? s.radius : (parseInt(s.radius) || 20)}m)</option>)}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                          Geofence Radius: <strong style={{ color: '#1E5ADB' }}>{form.geofenceRadius || 20}m</strong>
                        </label>
                        <input
                          type="range"
                          min={20}
                          max={1000}
                          step={5}
                          value={form.geofenceRadius || 20}
                          onChange={e => setForm(p => ({ ...p, geofenceRadius: parseInt(e.target.value) || 20 }))}
                          style={{ width: '100%', accentColor: '#1E5ADB', cursor: 'pointer' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Shift Start Time</label>
                        <input
                          type="time"
                          value={form.shiftStart || '08:00'}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(p => {
                              const sEnd = p.shiftEnd || '17:00';
                              return { ...p, shiftStart: val, shift: `${to12hTime(val)} - ${to12hTime(sEnd)}`, shiftTime: `${to12hTime(val)} - ${to12hTime(sEnd)}` };
                            });
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Shift End Time</label>
                        <input
                          type="time"
                          value={form.shiftEnd || '17:00'}
                          onChange={e => {
                            const val = e.target.value;
                            setForm(p => {
                              const sStart = p.shiftStart || '08:00';
                              return { ...p, shiftEnd: val, shift: `${to12hTime(sStart)} - ${to12hTime(val)}`, shiftTime: `${to12hTime(sStart)} - ${to12hTime(val)}` };
                            });
                          }}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Working Days</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                          const isDayActive = Array.isArray(form.workDays) ? form.workDays.includes(day) : false;
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                setForm(p => {
                                  const curr = Array.isArray(p.workDays) ? [...p.workDays] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                                  return { ...p, workDays: curr.includes(day) ? curr.filter(d => d !== day) : [...curr, day] };
                                });
                              }}
                              style={{
                                padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                border: isDayActive ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                                background: isDayActive ? '#1E5ADB' : '#FFFFFF',
                                color: isDayActive ? '#FFFFFF' : '#475569',
                              }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {form.workType === 'Mobile Field Employee' && (
                  <div style={{ background: '#FFFBEB', borderRadius: 12, padding: 14, border: '1px solid #FDE68A', fontSize: 12, color: '#78350F' }}>
                    <strong>Mobile Field Employee:</strong> Multi-destination routes, travel time windows, and shift dates are configured in the <strong>Assignments</strong> page.
                  </div>
                )}

                {editId && (
                  <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 12, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#334155' }}>Face Registration Status:</span>
                    <span style={{
                      fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                      background: form.faceRegistered && form.faceReferencePhoto ? '#D1FAE5' : '#FEF3C7',
                      color: form.faceRegistered && form.faceReferencePhoto ? '#065F46' : '#92400E',
                    }}>
                      {form.faceRegistered && form.faceReferencePhoto ? 'Registered ✓' : 'Not Registered (Required on Mobile)'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Clean Single Primary Action Bar (ONE Save Employee Button) */}
            <div style={{
              padding: '16px 28px 20px 28px',
              borderTop: '1px solid #F1F5F9',
              background: '#FAFAFA',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 12
            }}>
              <button
                onClick={() => setModal(false)}
                disabled={isSaving}
                style={{
                  padding: '10px 20px', borderRadius: 12, border: '1px solid #CBD5E1',
                  background: '#FFFFFF', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || Boolean(duplicateEmailEmployee) || Boolean(duplicateIdEmployee) || Boolean(duplicateUsernameEmployee)}
                style={{
                  padding: '10px 26px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #1E5ADB 0%, #1E40AF 100%)',
                  color: '#FFFFFF', fontSize: 13, fontWeight: 700,
                  cursor: (isSaving || duplicateEmailEmployee || duplicateIdEmployee || duplicateUsernameEmployee) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(30, 90, 219, 0.35)',
                  opacity: (isSaving || duplicateEmailEmployee || duplicateIdEmployee || duplicateUsernameEmployee) ? 0.6 : 1
                }}
              >
                {isSaving ? 'Validating & Saving...' : 'Save Employee'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}