import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, X, ClipboardList, Clock, CheckCircle, XCircle, AlertTriangle, PieChart as PieIcon, BarChart3, Activity, Calendar, Sun, Moon, ShieldAlert, User, Building2, Flag, IdCard, Truck, MapPin } from 'lucide-react';
import Swal from 'sweetalert2';
import { db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, getDocs } from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

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
          {data.payload.name}: <strong style={{ color: '#0F172A' }}>{data.value}</strong> assignment(s)
        </div>
      </div>
    );
  }
  return null;
};

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'white', borderRadius: 14, padding: '14px 20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
          border: `1.5px solid ${ t.type === 'success' ? '#D1FAE5' : t.type === 'error' ? '#FEE2E2' : '#FEF3C7' }`,
          minWidth: 260, maxWidth: 360,
          animation: 'toastIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275)',
          pointerEvents: 'auto',
        }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.type === 'success' ? '#D1FAE5' : t.type === 'error' ? '#FEE2E2' : '#FEF3C7' }}>
            { t.type === 'success' ? <CheckCircle size={20} color="#10B981" strokeWidth={2.5} /> : t.type === 'error' ? <XCircle size={20} color="#EF4444" strokeWidth={2.5} /> : <AlertTriangle size={20} color="#F59E0B" strokeWidth={2.5} /> }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>{t.title}</div>
            {t.text && <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{t.text}</div>}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((type, title, text = '') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  }, []);
  return { toasts, show };
}

const STATUS_STYLE = {
  'Active':    { background: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'Upcoming':  { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Completed': { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Cancelled': { background: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
};

const PRIORITY_COLOR = {
  'High': '#EF4444',
  'Medium': '#F59E0B',
  'Low': '#10B981'
};

export function parseTimeToHoursMinutes(timeStr) {
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

export function getAssignmentShiftTimes(asg) {
  let startStr = asg?.shiftStart || asg?.startTime || '';
  let endStr = asg?.shiftEnd || asg?.endTime || '';

  if ((!startStr || !endStr) && (asg?.shift || asg?.shiftTime)) {
    const combined = asg.shift || asg.shiftTime || '';
    const parts = combined.split(/\s*[-~]|(?:\s+to\s+)\s*/i).filter(Boolean);
    if (parts.length >= 2) {
      if (!startStr) startStr = parts[0].trim();
      if (!endStr) endStr = parts[1].trim();
    } else if (parts.length === 1 && !endStr) {
      endStr = parts[0].trim();
    }
  }

  const startParsed = parseTimeToHoursMinutes(startStr);
  const endParsed = parseTimeToHoursMinutes(endStr);

  return {
    start: startParsed,
    end: endParsed,
  };
}

export function getAssignmentScheduledDate(asg) {
  if (!asg) return null;
  const rawDate = asg.assignDate || asg.scheduleDate || asg.date || asg.assignmentDate || asg.scheduledDate || asg.endDate;
  if (!rawDate) return null;

  let y, m, d;
  if (typeof rawDate === 'string') {
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
  } else if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
    const dt = rawDate.toDate();
    y = dt.getFullYear();
    m = dt.getMonth();
    d = dt.getDate();
  } else if (typeof rawDate?.seconds === 'number') {
    const dt = new Date(rawDate.seconds * 1000);
    y = dt.getFullYear();
    m = dt.getMonth();
    d = dt.getDate();
  } else if (typeof rawDate === 'number') {
    const dt = new Date(rawDate);
    y = dt.getFullYear();
    m = dt.getMonth();
    d = dt.getDate();
  }

  if (y === undefined || m === undefined || d === undefined) return null;
  return { year: y, month: m, day: d };
}

export function isAssignmentEnded(asg, now = new Date()) {
  if (!asg) return false;
  const status = (asg.status || '').toString().trim().toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'archived' || status === 'expired') {
    return true;
  }

  const dateParts = getAssignmentScheduledDate(asg);
  if (!dateParts) return false;

  const { year, month, day } = dateParts;
  const shiftTimes = getAssignmentShiftTimes(asg);

  let endHour = 23;
  let endMin = 59;
  let endSec = 59;
  let isNextDay = false;

  if (shiftTimes.end) {
    endHour = shiftTimes.end.hours;
    endMin = shiftTimes.end.minutes;
    endSec = shiftTimes.end.seconds || 0;

    if (shiftTimes.start && shiftTimes.end.hours < shiftTimes.start.hours) {
      isNextDay = true;
    }
  }

  const endDateTime = new Date(year, month, isNextDay ? day + 1 : day, endHour, endMin, endSec, 999);
  return now.getTime() >= endDateTime.getTime();
}

export function isAssignmentUpcoming(asg, now = new Date()) {
  if (!asg) return false;
  const status = (asg.status || '').toString().trim().toLowerCase();
  if (status === 'completed' || status === 'cancelled') return false;

  const dateParts = getAssignmentScheduledDate(asg);
  if (!dateParts) return false;

  const { year, month, day } = dateParts;
  const shiftTimes = getAssignmentShiftTimes(asg);

  let startHour = 0;
  let startMin = 0;
  if (shiftTimes.start) {
    startHour = shiftTimes.start.hours;
    startMin = shiftTimes.start.minutes;
  }

  const startDateTime = new Date(year, month, day, startHour, startMin, 0, 0);
  return now.getTime() < startDateTime.getTime();
}

export function resolveAssignmentStatus(asg, now = new Date()) {
  if (!asg) return 'Completed';
  const raw = (asg.status || 'Active').trim();
  const rawLower = raw.toLowerCase();

  if (rawLower === 'cancelled') return 'Cancelled';
  if (rawLower === 'completed') return 'Completed';

  if (isAssignmentEnded(asg, now)) {
    return 'Completed';
  }

  if (isAssignmentUpcoming(asg, now)) {
    return 'Upcoming';
  }

  return 'Active';
}

const EMPTY = { empName: '', empId: '', site: '', assignedSites: [], assignDate: '', shiftStart: '08:00', shiftEnd: '17:00', shift: '08:00 AM - 05:00 PM', priority: 'Medium', status: 'Active' };

const selStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'Inter, sans-serif' };
const inpStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' };

export default function Assignments() {
  const [data, setData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toasts, show } = useToast();

  // Pagination & Bulk Selection state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    setLoading(true);
    try {
      let docs1 = [], docs2 = [];
      const updateMerged = () => {
        const merged = [...docs1, ...docs2];
        const uniqueData = Array.from(new Map(merged.map(item => [item.id, item])).values());
        setData(uniqueData);
        setLoading(false);
      };

      const unsub1 = onSnapshot(query(collection(db, 'Assignments')), (snapshot) => {
        docs1 = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        updateMerged();
      }, () => setLoading(false));

      const unsub2 = onSnapshot(query(collection(db, 'assignments')), (snapshot) => {
        docs2 = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        updateMerged();
      }, () => setLoading(false));

      const qEmp = query(collection(db, 'employees'));
      const unsubEmp = onSnapshot(qEmp, (snapshot) => {
        setEmployees(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      const qSites = query(collection(db, 'Sites'));
      const unsubSites = onSnapshot(qSites, (snapshot) => {
        setSites(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      return () => { unsub1(); unsub2(); unsubEmp(); unsubSites(); };
    } catch (e) {
      setLoading(false);
    }
  }, []);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Background auto-sync: persistently update ended assignments in Firestore to 'Completed'
  useEffect(() => {
    if (!data.length) return;
    const now = new Date();
    const endedDocs = data.filter(d => 
      (d.status === 'Active' || d.status === 'active' || d.status === 'Upcoming' || d.status === 'upcoming') &&
      isAssignmentEnded(d, now)
    );

    if (endedDocs.length > 0) {
      endedDocs.forEach(async (asg) => {
        try {
          if (asg.id) {
            await updateDoc(doc(db, 'Assignments', asg.id), { status: 'Completed', updatedAt: Date.now() }).catch(() => {});
            await updateDoc(doc(db, 'assignments', asg.id), { status: 'Completed', updatedAt: Date.now() }).catch(() => {});
          }
        } catch (_) {}
      });
    }
  }, [data]);

  const totalAssignments = data.length || 1;

  // Chart 1: Assignment Status Breakdown Donut Data (Dynamically resolved)
  const activeCount    = data.filter(d => resolveAssignmentStatus(d) === 'Active').length;
  const upcomingCount  = data.filter(d => resolveAssignmentStatus(d) === 'Upcoming').length;
  const completedCount = data.filter(d => resolveAssignmentStatus(d) === 'Completed').length;
  const cancelledCount = data.filter(d => resolveAssignmentStatus(d) === 'Cancelled').length;

  const asgStatusChartData = [
    { name: 'Active', value: activeCount, color: '#3B82F6', pct: ((activeCount / totalAssignments) * 100).toFixed(0) },
    { name: 'Upcoming', value: upcomingCount, color: '#F59E0B', pct: ((upcomingCount / totalAssignments) * 100).toFixed(0) },
    { name: 'Completed', value: completedCount, color: '#10B981', pct: ((completedCount / totalAssignments) * 100).toFixed(0) },
    { name: 'Cancelled', value: cancelledCount, color: '#EF4444', pct: ((cancelledCount / totalAssignments) * 100).toFixed(0) },
  ];

  // Chart 2: Priority Level Breakdown Bar Data
  const highPriorityCount   = data.filter(d => d.priority === 'High').length;
  const medPriorityCount    = data.filter(d => d.priority === 'Medium' || !d.priority).length;
  const lowPriorityCount    = data.filter(d => d.priority === 'Low').length;

  const priorityChartData = [
    { name: 'High', count: highPriorityCount, fill: '#EF4444' },
    { name: 'Medium', count: medPriorityCount, fill: '#F59E0B' },
    { name: 'Low', count: lowPriorityCount, fill: '#10B981' },
  ];

  // Chart 3: Shift Type Breakdown Donut Data
  const dayShiftCount   = data.filter(d => (d.shift || '').toLowerCase().includes('day') || (d.shiftStart && parseInt(d.shiftStart) < 18 && parseInt(d.shiftStart) >= 6)).length;
  const nightShiftCount = data.filter(d => (d.shift || '').toLowerCase().includes('night') || (d.shiftStart && (parseInt(d.shiftStart) >= 18 || parseInt(d.shiftStart) < 6))).length;
  const customShiftCount= Math.max(0, totalAssignments - (dayShiftCount + nightShiftCount));

  const shiftChartData = [
    { name: 'Day Shift', value: dayShiftCount, color: '#F59E0B', pct: ((dayShiftCount / totalAssignments) * 100).toFixed(0) },
    { name: 'Night Shift', value: nightShiftCount, color: '#6366F1', pct: ((nightShiftCount / totalAssignments) * 100).toFixed(0) },
    ...(customShiftCount > 0 ? [{ name: 'Flexible', value: customShiftCount, color: '#10B981', pct: ((customShiftCount / totalAssignments) * 100).toFixed(0) }] : [])
  ];

  const filtered = data.filter(d =>
    (d.empName || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.site || '').toLowerCase().includes(search.toLowerCase()) ||
    (resolveAssignmentStatus(d) || '').toLowerCase().includes(search.toLowerCase())
  );

  // Pagination metrics
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);
  const emptyRowsCount = loading ? 0 : Math.max(0, Math.min(pageSize, 8) - currentPageItems.length);

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
      `Delete ${selectedIds.length} Selected Assignments?`,
      `Are you sure you want to remove ${selectedIds.length} assignment record(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const itemsToDelete = data.filter(d => selectedIds.includes(d.id));
        await Promise.all(selectedIds.flatMap(id => [
          deleteDoc(doc(db, 'Assignments', id)).catch(() => {}),
          deleteDoc(doc(db, 'assignments', id)).catch(() => {})
        ]));

        // Clear assignedSite on matching employee docs
        const empSnap = await getDocs(collection(db, 'employees')).catch(() => null);
        if (empSnap && !empSnap.empty) {
          for (const item of itemsToDelete) {
            const empIdToClear = (item.employeeId || item.empId || item.employeeUid || '').toString().toLowerCase();
            const empNameToClear = (item.employeeName || item.empName || '').toLowerCase();
            for (const empDoc of empSnap.docs) {
              const ed = empDoc.data();
              const eId = (ed.idNum || ed.id || ed.uid || '').toString().toLowerCase();
              const eName = (ed.name || '').toLowerCase();
              const isMatch = (empIdToClear && eId && (eId === empIdToClear || eId.includes(empIdToClear))) ||
                              (empNameToClear && eName && (eName === empNameToClear || eName.includes(empNameToClear)));
              if (isMatch) {
                await updateDoc(doc(db, 'employees', empDoc.id), {
                  assignedSite: 'Unassigned',
                  assignedSiteId: '',
                  shift: 'Unassigned',
                  updatedAt: Date.now()
                }).catch(() => {});
              }
            }
          }
        }

        showToast('success', 'Bulk Delete Successful', `${selectedIds.length} assignment(s) deleted.`);
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('error', 'Bulk Delete Failed', err.message || 'Error deleting selected assignments.');
      }
    }
  };

  const location = useLocation();

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (row) => {
    let sitesArray = Array.isArray(row.assignedSites) ? row.assignedSites : [];
    if (sitesArray.length === 0 && row.site) {
      sitesArray = row.site.split(',').map(s => s.trim()).filter(Boolean);
    }
    setForm({
      ...row,
      assignedSites: sitesArray,
      site: row.site || sitesArray.join(', ')
    });
    setEditId(row.id);
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
    window.addEventListener('subai_open_add_assignment', handleOpenAdd);
    return () => window.removeEventListener('subai_open_add_assignment', handleOpenAdd);
  }, []);

  const handleDelete = async (id) => {
    const itemToDelete = data.find(d => d.id === id);
    const confirmed = await showConfirmDelete(
      'Delete Assignment?',
      'Are you sure you want to remove this site assignment?'
    );
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'Assignments', id)).catch(() => {});
        await deleteDoc(doc(db, 'assignments', id)).catch(() => {});

        if (itemToDelete) {
          const empIdToClear = (itemToDelete.employeeId || itemToDelete.empId || itemToDelete.employeeUid || '').toString().toLowerCase();
          const empNameToClear = (itemToDelete.employeeName || itemToDelete.empName || '').toLowerCase();
          const empSnap = await getDocs(collection(db, 'employees')).catch(() => null);
          if (empSnap && !empSnap.empty) {
            for (const empDoc of empSnap.docs) {
              const ed = empDoc.data();
              const eId = (ed.idNum || ed.id || ed.uid || '').toString().toLowerCase();
              const eName = (ed.name || '').toLowerCase();
              const isMatch = (empIdToClear && eId && (eId === empIdToClear || eId.includes(empIdToClear))) ||
                              (empNameToClear && eName && (eName === empNameToClear || eName.includes(empNameToClear)));
              if (isMatch) {
                await updateDoc(doc(db, 'employees', empDoc.id), {
                  assignedSite: 'Unassigned',
                  assignedSiteId: '',
                  assignedSites: [],
                  shift: 'Unassigned',
                  updatedAt: Date.now()
                }).catch(() => {});
              }
            }
          }
        }

        showToast('success', 'Assignment Deleted', 'The assignment record was removed.');
      } catch (e) {
        console.warn('Delete error:', e);
        showToast('error', 'Delete Failed', e.message || 'Could not delete assignment');
      }
    }
  };

  const handleEmpSelect = (e) => {
    const empName = e.target.value;
    const emp = employees.find(em => em.name === empName);
    const isMobile = emp?.workType === 'Mobile Field Employee';
    const defaultSites = Array.isArray(emp?.assignedSites) ? emp.assignedSites : (emp?.assignedSite ? emp.assignedSite.split(',').map(s => s.trim()).filter(Boolean) : []);

    setForm(prev => ({
      ...prev,
      empName: empName,
      empId: emp?.idNum || emp?.id || '',
      assignedSites: isMobile ? (defaultSites.length ? defaultSites : prev.assignedSites || []) : [],
      site: isMobile 
        ? ((defaultSites.length ? defaultSites : prev.assignedSites || []).join(', '))
        : (emp?.assignedSite || prev.site || '')
    }));
  };

  const handleSave = async () => {
    if (!form.empName) return showToast('error', 'Missing Fields', 'Please select an employee.');

    const cleanFormName = (form.empName || '').trim().toLowerCase();
    const empToUpdate = employees.find(em => {
      const emName = (em.name || '').trim().toLowerCase();
      const emEmail = (em.email || '').trim().toLowerCase();
      const emId = (em.idNum || em.id || em.uid || '').toString().trim().toLowerCase();
      const formId = (form.empId || '').toString().trim().toLowerCase();

      if (emName && cleanFormName && (emName === cleanFormName || emName.includes(cleanFormName) || cleanFormName.includes(emName))) return true;
      if (emEmail && cleanFormName && emEmail.includes(cleanFormName)) return true;
      if (emId && formId && (emId === formId || emId.includes(formId))) return true;

      const formTokens = cleanFormName.split(/\s+/).filter(t => t.length > 1);
      const emTokens = emName.split(/\s+/).filter(t => t.length > 1);
      if (formTokens.some(ft => emTokens.some(et => ft.includes(et) || et.includes(ft)))) return true;

      return false;
    });

    const isMobile = empToUpdate?.workType === 'Mobile Field Employee';

    let siteId = 'site-main';
    let siteName = form.site || 'Assigned Worksite';
    let siteAddress = 'Registered Worksite Address';
    let latitude = 10.2818;
    let longitude = 123.8808;
    let geofenceRadius = 20;
    let assignedSitesList = [];

    if (isMobile) {
      assignedSitesList = (form.assignedSites && form.assignedSites.length > 0)
        ? form.assignedSites
        : (form.site ? form.site.split(',').map(s => s.trim()).filter(Boolean) : []);

      if (assignedSitesList.length === 0) {
        return showToast('error', 'Missing Assigned Sites', 'Please select at least one site for this mobile field employee.');
      }

      siteName = assignedSitesList.join(', ');
      const matchedSites = sites.filter(s => assignedSitesList.includes(s.name || s.id));
      if (matchedSites.length > 0) {
        siteId = matchedSites.map(s => s.id).join(', ');
        siteAddress = matchedSites.map(s => s.address || s.location || s.name).join(' | ');
        latitude = Number(matchedSites[0].latitude || matchedSites[0].lat || 10.2818);
        longitude = Number(matchedSites[0].longitude || matchedSites[0].lng || 123.8808);
        geofenceRadius = Number(matchedSites[0].geofenceRadius ?? matchedSites[0].radius ?? 20);
      }
    } else {
      if (!form.site) return showToast('error', 'Missing Fields', 'Please select an assigned site.');

      const formSiteClean = (form.site || '').trim().toLowerCase();
      const selectedSiteObj = sites.find(s => {
        const sName = (s.name || '').trim().toLowerCase();
        const sId = (s.id || '').trim().toLowerCase();
        return sName === formSiteClean || sId === formSiteClean || (sName && formSiteClean && (sName.includes(formSiteClean) || formSiteClean.includes(sName)));
      });
      siteId = selectedSiteObj?.id || form.siteId || 'site-main';
      siteName = selectedSiteObj?.name || form.site || 'Assigned Worksite';
      siteAddress = selectedSiteObj?.address || selectedSiteObj?.location || 'Registered Worksite Address';
      latitude = Number(selectedSiteObj?.latitude || selectedSiteObj?.lat || 10.2818);
      longitude = Number(selectedSiteObj?.longitude || selectedSiteObj?.lng || 123.8808);
      geofenceRadius = Number(selectedSiteObj?.geofenceRadius ?? selectedSiteObj?.radius ?? 20);
      assignedSitesList = [siteName];
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (form.assignDate && form.assignDate < todayStr) {
      return showToast('error', 'Invalid Date', 'Schedule Assignment Date cannot be in the past. Please select today or a future date.');
    }

    setIsSaving(true);
    
    try {
      const to12h = (t) => {
        if (!t || typeof t !== 'string') return t;
        const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
        if (!m) return t;
        let h = parseInt(m[1], 10);
        const min = m[2];
        const ampm = m[3] ? m[3].toUpperCase() : (h >= 12 ? 'PM' : 'AM');
        h = h % 12 || 12;
        return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
      };

      const sStartFormatted = to12h(form.shiftStart || '08:00');
      const sEndFormatted = to12h(form.shiftEnd || '17:00');
      const computedShift = (form.shiftStart && form.shiftEnd)
        ? `${sStartFormatted} - ${sEndFormatted}`
        : form.shift || form.shiftTime || '08:00 AM - 05:00 PM';

      const finalForm = {
        ...form,
        employeeId: empToUpdate?.idNum || empToUpdate?.id || empToUpdate?.uid || form.empId || '',
        employeeUid: empToUpdate?.uid || empToUpdate?.id || '',
        employeeName: empToUpdate?.name || form.empName || '',
        employeeEmail: empToUpdate?.email || form.empEmail || '',
        employeeType: empToUpdate?.employeeType || empToUpdate?.role || 'On-Site',
        empName: empToUpdate?.name || form.empName || '',
        empEmail: empToUpdate?.email || form.empEmail || '',
        empId: empToUpdate?.idNum || empToUpdate?.id || form.empId || '',
        siteId,
        siteName,
        site: siteName,
        assignedSites: assignedSitesList,
        assignedDestinations: assignedSitesList,
        siteAddress,
        address: siteAddress,
        latitude,
        longitude,
        geofenceRadius,
        scheduleDate: form.assignDate || new Date().toISOString().split('T')[0],
        assignDate: form.assignDate || new Date().toISOString().split('T')[0],
        startTime: sStartFormatted,
        endTime: sEndFormatted,
        shiftStart: sStartFormatted,
        shiftEnd: sEndFormatted,
        shift: computedShift,
        shiftTime: computedShift,
        supervisorName: form.supervisorName || empToUpdate?.supervisorName || 'Operations Supervisor',
        supervisorContact: form.supervisorContact || empToUpdate?.supervisorContact || '+63 917 123 4567',
        priority: form.priority || 'Medium',
        status: form.status || 'Active',
        updatedAt: Date.now(),
      };

      if (!editId && (finalForm.status === 'Active' || finalForm.status === 'active') && empToUpdate) {
        // Complete older active assignments for this employee
        try {
          const collectionsToCheck = ['Assignments', 'assignments'];
          for (const colName of collectionsToCheck) {
            const oldSnaps = await getDocs(query(collection(db, colName))).catch(() => null);
            if (oldSnaps && !oldSnaps.empty) {
              const eMail = (empToUpdate.email || '').toLowerCase();
              const eName = (empToUpdate.name || '').toLowerCase();
              const eId   = (empToUpdate.idNum || empToUpdate.id || empToUpdate.uid || '').toString().toLowerCase();

              for (const dDoc of oldSnaps.docs) {
                const dData = dDoc.data();
                const st = (dData.status || '').toLowerCase();
                if (st === 'active' || st === 'upcoming') {
                  const asgEmail = (dData.employeeEmail || dData.empEmail || dData.email || '').toLowerCase();
                  const asgName  = (dData.employeeName || dData.empName || dData.name || '').toLowerCase();
                  const asgId    = (dData.employeeId || dData.employeeUid || dData.empId || '').toString().toLowerCase();

                  const isMatch = (eMail && asgEmail && eMail === asgEmail) ||
                                  (eId && asgId && eId === asgId) ||
                                  (eName && asgName && (eName === asgName || eName.includes(asgName) || asgName.includes(eName)));

                  if (isMatch) {
                    await updateDoc(doc(db, colName, dDoc.id), { status: 'Completed', updatedAt: Date.now() }).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('Deactivating old active assignments warning:', err);
        }
      }

      if (editId) {
        await updateDoc(doc(db, 'Assignments', editId), finalForm).catch(() => {});
        await updateDoc(doc(db, 'assignments', editId), finalForm).catch(() => {});
        showToast('success', 'Assignment Updated', 'Assignment details saved.');
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newAsg = { ...finalForm, assignedAt: nowStr.replace(', ', '\n'), createdAt: Date.now() };
        
        // Write to both collections for instant multi-app real-time synchronization
        const newRef1 = await addDoc(collection(db, 'Assignments'), newAsg);
        await addDoc(collection(db, 'assignments'), { ...newAsg, id: newRef1.id, assignmentId: newRef1.id }).catch(() => {});
        
        showToast('success', 'Assignment Created', 'New site assignment created and active.');
      }

      // Sync site assignment directly to matching employee profiles in Firestore
      if (cleanFormName) {
        try {
          const empQuerySnap = await getDocs(collection(db, 'employees'));
          if (empQuerySnap && !empQuerySnap.empty) {
            const formTokens = cleanFormName.split(/\s+/).filter(t => t.length > 1);
            for (const empDoc of empQuerySnap.docs) {
              const eData = empDoc.data();
              const eName = (eData.name || '').toLowerCase();
              const eEmail = (eData.email || '').toLowerCase();
              const isMatch = (eName && (cleanFormName.includes(eName) || eName.includes(cleanFormName))) ||
                              (eEmail && eEmail.includes(cleanFormName)) ||
                              (formTokens.length > 0 && formTokens.some(ft => eName.includes(ft)));

              if (isMatch) {
                const empUpdateData = {
                  assignedSite: siteName,
                  assignedSiteId: siteId,
                  shift: computedShift,
                  updatedAt: Date.now()
                };
                if (isMobile) {
                  empUpdateData.assignedSites = assignedSitesList;
                  empUpdateData.assignedDestinations = assignedSitesList;
                } else {
                  empUpdateData.assignedSites = [siteName];
                  empUpdateData.assignedDestinations = [siteName];
                }
                await updateDoc(doc(db, 'employees', empDoc.id), empUpdateData).catch(console.warn);
              }
            }
          }
        } catch (eErr) {
          console.warn('Sync employee profile error:', eErr);
        }
      }

      setModal(false);
    } catch (e) {
      console.warn('Save error:', e);
      showToast('error', 'Save Failed', e.message || 'Failed to save assignment');
    } finally {
      setIsSaving(false);
    }
  };

  const stats = ['Active','Upcoming','Completed','Cancelled'].map(s => ({
    label: s,
    count: data.filter(d => resolveAssignmentStatus(d) === s).length,
    pct: data.length ? ((data.filter(d => resolveAssignmentStatus(d) === s).length / data.length) * 100).toFixed(1) + '%' : '0.0%',
    color: STATUS_STYLE[s]?.dot || '#9CA3AF',
    bg: STATUS_STYLE[s]?.background || '#F3F4F6',
    icon: s === 'Active' ? <ClipboardList size={14}/> : s === 'Upcoming' ? <Clock size={14}/> : s === 'Completed' ? <CheckCircle size={14}/> : <XCircle size={14}/>
  }));

  return (
    <>
      <Toast toasts={toasts} />
      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        <div className="widget" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
              <Search size={14} color="#9CA3AF" />
              <input placeholder="Search by employee or site..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#374151' }} />
            </div>

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

            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={14} /> New Assignment
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <th style={{ width: 40, padding: '12px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                    />
                  </th>
                  {['EMPLOYEE','ASSIGNED SITE','SHIFT TIME','PRIORITY','STATUS','ASSIGNED ON','ACTIONS'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentPageItems.map(row => {
                  const isSelected = selectedIds.includes(row.id);
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', background: isSelected ? '#EFF6FF' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(row.id)}
                          style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', flexShrink: 0 }}>
                            <ClipboardList size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{row.empName}</div>
                            <div style={{ fontSize: 11, color: '#6B7280' }}>ID: {row.empId || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>
                        {(() => {
                          const sitesList = Array.isArray(row.assignedSites) && row.assignedSites.length > 0
                            ? row.assignedSites
                            : (row.site ? row.site.split(',').map(s => s.trim()).filter(Boolean) : []);
                          if (sitesList.length > 1) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Truck size={10} color="#D97706" /> {sitesList.length} Sites
                                </span>
                                <span style={{ fontSize: 12, color: '#1E293B' }}>{row.site}</span>
                              </div>
                            );
                          }
                          return <span style={{ whiteSpace: 'nowrap' }}>{row.site || '—'}</span>;
                        })()}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6B7280', whiteSpace: 'nowrap' }}>{row.shift || '—'}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: PRIORITY_COLOR[row.priority] || '#374151', whiteSpace: 'nowrap' }}>{row.priority}</td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const status = resolveAssignmentStatus(row);
                          const style = STATUS_STYLE[status] || STATUS_STYLE.Active;
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: style.background, color: style.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot }}></div>
                              {status}
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {row.assignDate && <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>📅 {row.assignDate}</div>}
                        <div style={{ color: '#9CA3AF' }}>{row.created}</div>
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => openEdit(row)}
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
                            onClick={() => handleDelete(row.id)}
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

                {/* Empty Filler Rows */}
                {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                  <tr key={`empty-row-${idx}`} style={{ height: 38, borderBottom: '1px dashed #F8FAFC' }}>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11, textAlign: 'center' }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* Right Column: Single Unified Card with 3 Assignment Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="widget" style={{ padding: 20 }}>
            
            {/* Main Card Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #F1F5F9', paddingBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ClipboardList size={18} color="#1E5ADB" /> Shift & Duty Analytics
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Schedule execution & priority insights</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#EFF6FF', color: '#1E5ADB', padding: '4px 10px', borderRadius: 12 }}>
                3 Charts
              </span>
            </div>

            {/* CHART 1: Assignment Status Lifecycle (Donut Chart) */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PieIcon size={14} color="#3B82F6" /> 1. Status Breakdown
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B' }}>Lifecycle State</span>
              </div>

              <div style={{ position: 'relative', width: '100%', height: 135 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={asgStatusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={54}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {asgStatusChartData.map((entry, index) => (
                        <Cell key={`cell-asg-status-${index}`} fill={entry.color} />
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
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{data.length}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginTop: 2 }}>Shifts</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                {asgStatusChartData.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '5px 8px', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#475569', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }}></span> {s.name}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0F172A' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />

            {/* CHART 2: Shift Priority Level Distribution (Bar Chart) */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart3 size={14} color="#EF4444" /> 2. Priority Level Distribution
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#EF4444' }}>Task Urgency</span>
              </div>

              <div style={{ width: '100%', height: 135 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94A3B8' }} />
                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="count" radius={[5, 5, 0, 0]} barSize={24}>
                      {priorityChartData.map((entry, index) => (
                        <Cell key={`bar-cell-prio-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
                {priorityChartData.map(p => (
                  <div key={p.name} style={{ background: '#F8FAFC', padding: '5px 8px', borderRadius: 6, textAlign: 'center', border: '1px solid #F1F5F9' }}>
                    <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600 }}>{p.name} Prio</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: p.fill, marginTop: 1 }}>{p.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />

            {/* CHART 3: Shift Schedule Distribution (Day vs Night Shift Donut Chart) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color="#F59E0B" /> 3. Day vs Night Shift Profile
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 7px', borderRadius: 10 }}>
                  Time Ratio
                </span>
              </div>

              <div style={{ position: 'relative', width: '100%', height: 135 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={shiftChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={54}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {shiftChartData.map((entry, index) => (
                        <Cell key={`cell-shift-${index}`} fill={entry.color} />
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
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>
                    {((dayShiftCount / totalAssignments) * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginTop: 2 }}>Day Shift</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '7px 10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                    <Sun size={12} color="#F59E0B" /> Day Shift
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                    {dayShiftCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B' }}>({((dayShiftCount / totalAssignments) * 100).toFixed(0)}%)</span>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '7px 10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                    <Moon size={12} color="#6366F1" /> Night Shift
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                    {nightShiftCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#6366F1' }}>({((nightShiftCount / totalAssignments) * 100).toFixed(0)}%)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Modern Add/Edit Assignment Modal ── */}
      {modal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 24,
            width: 540,
            maxWidth: '92vw',
            boxShadow: '0 25px 60px -15px rgba(30, 90, 219, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>

            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #EFF6FF 0%, #EEF2FF 50%, #F5F3FF 100%)',
              padding: '22px 28px',
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
                  <ClipboardList size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editId ? 'Edit Staff Duty Assignment' : 'New Staff Assignment'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: 500 }}>
                    Shift Schedule & Site Deployment Configuration
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

            {/* Modal Form Content */}
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {(() => {
                const selectedEmp = employees.find(em => em.name === form.empName || (form.empId && (em.idNum === form.empId || em.id === form.empId)));
                const isMobileEmp = selectedEmp?.workType === 'Mobile Field Employee';
                return (
                  <>
                    {/* Employee Selection */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                        Select Employee *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                        <select
                          value={form.empName}
                          onChange={handleEmpSelect}
                          style={{
                            width: '100%',
                            padding: '10px 14px 10px 38px',
                            borderRadius: 12,
                            border: '1.5px solid #E2E8F0',
                            fontSize: 13,
                            outline: 'none',
                            background: '#FFFFFF',
                            boxSizing: 'border-box',
                            color: '#0F172A',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">— Select Employee —</option>
                          {employees.map(e => (
                            <option key={e.id} value={e.name}>{e.name} ({e.email || 'Staff'})</option>
                          ))}
                        </select>
                      </div>
                      {form.empName && selectedEmp && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: isMobileEmp ? '#FEF3C7' : '#EFF6FF',
                            color: isMobileEmp ? '#92400E' : '#1E40AF',
                            border: isMobileEmp ? '1px solid #FDE68A' : '1px solid #BFDBFE'
                          }}>
                            {isMobileEmp ? <Truck size={12} color="#D97706" /> : <Building2 size={12} color="#2563EB" />}
                            {selectedEmp.workType || 'Fixed Site Employee'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Employee ID (Auto-filled) */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                        Employee ID (Auto-filled)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <IdCard size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                        <input
                          readOnly
                          value={form.empId || ''}
                          placeholder="Auto-filled upon employee selection"
                          style={{
                            width: '100%',
                            padding: '10px 14px 10px 38px',
                            borderRadius: 12,
                            border: '1.5px solid #E2E8F0',
                            fontSize: 13,
                            outline: 'none',
                            background: '#F8FAFC',
                            boxSizing: 'border-box',
                            color: '#64748B',
                            fontWeight: 600
                          }}
                        />
                      </div>
                    </div>

                    {/* Assigned Site(s) Selection */}
                    {isMobileEmp ? (
                      <div style={{ background: '#F8FAFC', borderRadius: 14, padding: 16, border: '1.5px solid #FDE68A' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Truck size={15} color="#D97706" /> Multiple Assigned Sites (Field Patrol / Visit) *
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 6 }}>
                            {(form.assignedSites || []).length} Selected
                          </span>
                        </div>

                        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748B' }}>
                          Select all worksites this mobile field employee is authorized to patrol or visit (can assign multiple sites):
                        </p>

                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                          gap: 8,
                          maxHeight: 180,
                          overflowY: 'auto',
                          padding: 8,
                          background: '#FFFFFF',
                          borderRadius: 10,
                          border: '1px solid #E2E8F0'
                        }}>
                          {sites.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#94A3B8', padding: 12, gridColumn: '1 / -1', textAlign: 'center' }}>
                              No sites configured in system yet.
                            </div>
                          ) : (
                            sites.map(s => {
                              const siteName = s.name || s.id;
                              const isSelected = (form.assignedSites || []).includes(siteName);
                              return (
                                <label
                                  key={s.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    border: isSelected ? '1.5px solid #D97706' : '1px solid #E2E8F0',
                                    background: isSelected ? '#FFFBEB' : '#FFFFFF',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e => {
                                      const current = form.assignedSites || [];
                                      const next = e.target.checked
                                        ? [...current, siteName]
                                        : current.filter(n => n !== siteName);
                                      setForm(p => ({
                                        ...p,
                                        assignedSites: next,
                                        site: next.join(', ')
                                      }));
                                    }}
                                    style={{ accentColor: '#D97706', width: 15, height: 15, cursor: 'pointer' }}
                                  />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#92400E' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {siteName}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94A3B8' }}>
                                      {typeof s.radius === 'number' ? s.radius : (parseInt(s.radius) || 20)}m perimeter
                                    </div>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <span style={{ fontSize: 11, color: '#64748B' }}>
                            ✓ Mobile employee can check in/out at any assigned site.
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                const allNames = sites.map(s => s.name || s.id);
                                setForm(p => ({
                                  ...p,
                                  assignedSites: allNames,
                                  site: allNames.join(', ')
                                }));
                              }}
                              style={{ fontSize: 11, fontWeight: 600, color: '#1E5ADB', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Select All
                            </button>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <button
                              type="button"
                              onClick={() => {
                                setForm(p => ({
                                  ...p,
                                  assignedSites: [],
                                  site: ''
                                }));
                              }}
                              style={{ fontSize: 11, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Assigned Site for Fixed Site Employee */
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                          Assigned Site Location *
                        </label>
                        <div style={{ position: 'relative' }}>
                          <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                          <select
                            value={form.site}
                            onChange={e => {
                              const val = e.target.value;
                              setForm(p => ({ ...p, site: val, assignedSites: val ? [val] : [] }));
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 14px 10px 38px',
                              borderRadius: 12,
                              border: '1.5px solid #E2E8F0',
                              fontSize: 13,
                              outline: 'none',
                              background: '#FFFFFF',
                              boxSizing: 'border-box',
                              color: '#0F172A',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">— Select Site —</option>
                            {sites.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        {form.site && (() => {
                          const sel = sites.find(s => s.name === form.site || s.id === form.site);
                          const rad = sel?.radius ? (typeof sel.radius === 'number' ? sel.radius : parseInt(sel.radius)) : 20;
                          return (
                            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#1E5ADB', fontWeight: 600 }}>
                              <span>📍 Perimeter: <strong>{rad}m</strong></span>
                              {rad <= 30 && (
                                <span style={{ background: '#EFF6FF', padding: '2px 6px', borderRadius: 6, border: '1px solid #BFDBFE', fontSize: 10, color: '#1D4ED8' }}>
                                  🏢 Building Fit
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Assign Date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Schedule Assignment Date *
                </label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={form.assignDate || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const today = new Date().toISOString().split('T')[0];
                      if (val && val < today) {
                        showToast('warning', 'Past Date Not Allowed', 'Please select today or a future date.');
                        return;
                      }
                      setForm(p => ({ ...p, assignDate: val }));
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 38px',
                      borderRadius: 12,
                      border: '1.5px solid #E2E8F0',
                      fontSize: 13,
                      outline: 'none',
                      background: '#FFFFFF',
                      boxSizing: 'border-box',
                      color: '#0F172A',
                      fontWeight: 600
                    }}
                  />
                </div>
              </div>

              {/* Shift Start & End Time */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Shift Time Range *
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <Clock size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input
                      type="time"
                      value={form.shiftStart || ''}
                      onChange={e => setForm(p => ({ ...p, shiftStart: e.target.value, shift: `${e.target.value} - ${p.shiftEnd || ''}` }))}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 38px',
                        borderRadius: 12,
                        border: '1.5px solid #E2E8F0',
                        fontSize: 13,
                        outline: 'none',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        color: '#0F172A',
                        fontWeight: 600
                      }}
                    />
                  </div>

                  <span style={{ fontSize: 12, fontWeight: 800, color: '#64748B', background: '#F1F5F9', padding: '6px 12px', borderRadius: 10 }}>
                    TO
                  </span>

                  <div style={{ flex: 1, position: 'relative' }}>
                    <Clock size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input
                      type="time"
                      value={form.shiftEnd || ''}
                      onChange={e => setForm(p => ({ ...p, shiftEnd: e.target.value, shift: `${p.shiftStart || ''} - ${e.target.value}` }))}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 38px',
                        borderRadius: 12,
                        border: '1.5px solid #E2E8F0',
                        fontSize: 13,
                        outline: 'none',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        color: '#0F172A',
                        fontWeight: 600
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Priority & Status Dropdowns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Priority Level
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Flag size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <select
                      value={form.priority}
                      onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 38px',
                        borderRadius: 12,
                        border: '1.5px solid #E2E8F0',
                        fontSize: 13,
                        outline: 'none',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        color: '#0F172A',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {['High', 'Medium', 'Low'].map(p => (
                        <option key={p} value={p}>{p} Priority</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Assignment Status
                  </label>
                  <div style={{ position: 'relative' }}>
                    <CheckCircle size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <select
                      value={form.status}
                      onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 38px',
                        borderRadius: 12,
                        border: '1.5px solid #E2E8F0',
                        fontSize: 13,
                        outline: 'none',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        color: '#0F172A',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {['Active', 'Upcoming', 'Completed', 'Cancelled'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Bottom Action Bar */}
            <div style={{
              padding: '16px 28px 22px 28px',
              borderTop: '1px solid #F1F5F9',
              background: '#FAFAFA',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>
                * All scheduled assignments sync in real-time
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setModal(false)}
                  disabled={isSaving}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 12,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    padding: '9px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #1E5ADB 0%, #1E40AF 100%)',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(30, 90, 219, 0.35)',
                    opacity: isSaving ? 0.7 : 1
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}