import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, UserCheck, Clock, AlertTriangle, UserX, MapPin, Navigation, Building2, Truck, ShieldAlert, Database, RefreshCw, Users, PieChart as PieIcon, BarChart3, Activity, UserPlus, User, Mail, Lock, IdCard, Briefcase, Shield, Sliders, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import Swal from 'sweetalert2';
import { db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from '../firebase';
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
  'In Transit': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Offline':    { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

// Real-time Presence Evaluation (Active when heartbeat or online flag is fresh within 120s)
export function isEmployeeOnline(emp) {
  if (!emp) return false;
  if (emp.isOnline === false) return false;

  const rawTime = emp.lastActive || emp.lastHeartbeat || emp.lastSeen;
  if (rawTime) {
    const ts = typeof rawTime === 'number'
      ? rawTime
      : (rawTime?.toDate ? rawTime.toDate().getTime() : new Date(rawTime).getTime());
    if (ts && !isNaN(ts)) {
      return (Date.now() - ts) <= 120000; // 2 minutes active window
    }
  }

  if (emp.isOnline === true) {
    if (emp.lastLogin) {
      const loginTs = new Date(emp.lastLogin).getTime();
      if (loginTs && !isNaN(loginTs)) {
        return (Date.now() - loginTs) <= 120000;
      }
    }
    return true;
  }

  return false;
}

export function getEmployeeStatus(emp) {
  if (!isEmployeeOnline(emp)) return 'Offline';
  return (emp.status && emp.status !== 'Offline') ? emp.status : 'On Duty';
}

const WORK_TYPE_STYLE = {
  'Fixed Site Employee':   { bg: '#EDE9FE', color: '#5B21B6', icon: Building2 },
  'Mobile Field Employee': { bg: '#FEF3C7', color: '#92400E', icon: Truck },
};

const GEOFENCE_STATUS_STYLE = {
  'Inside Assigned Site':  { bg: '#D1FAE5', color: '#065F46' },
  'Outside Assigned Site': { bg: '#FEE2E2', color: '#991B1B' },
};

const EMPTY = {
  name: '', email: '', password: '', idNum: '', org: '', type: '', status: 'Offline', joined: '',
  workType: 'Fixed Site Employee',
  assignedSite: '',
  assignedSites: [],
  geofenceRadius: 100,
  assignedRoute: '',
  assignedDestinations: [],
};

export default function Employees() {
  // Start with empty array - NO hardcoded sample data pre-filled!
  const [employees, setEmployees] = useState([]);
  const [sites, setSites]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [wtFilter, setWtFilter]   = useState('All');
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [editId, setEditId]       = useState(null);
  const [isSaving, setIsSaving]   = useState(false);

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
            // Always retain the canonical record with idNum / complete details
            if (!existing.idNum && item.idNum) {
              empByEmail.set(key, { ...existing, ...item, id: item.id });
            } else {
              empByEmail.set(key, { ...item, ...existing, id: existing.id });
            }
          }
        });
        const uniqueEmps = Array.from(empByEmail.values());
        setEmployees(uniqueEmps);
        setLoading(false);
      }, (err) => {
        console.warn('Firestore subscription error:', err);
        setLoading(false);
      });

      const qSites = query(collection(db, 'Sites'));
      const unsubSites = onSnapshot(qSites, (snapshot) => {
        const liveSites = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setSites(liveSites);
      });

      return () => {
        unsubEmp();
        unsubSites();
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

  // Chart 2: Status Breakdown Bar Data
  const statusChartData = [
    { name: 'On Site', count: employees.filter(e => getEmployeeStatus(e) === 'On Site').length, fill: '#10B981' },
    { name: 'On Duty', count: employees.filter(e => getEmployeeStatus(e) === 'On Duty').length, fill: '#3B82F6' },
    { name: 'In Transit', count: employees.filter(e => getEmployeeStatus(e) === 'In Transit').length, fill: '#F59E0B' },
    { name: 'Offline', count: employees.filter(e => getEmployeeStatus(e) === 'Offline').length, fill: '#94A3B8' },
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Employees?`,
      `Are you sure you want to delete ${selectedIds.length} employee record(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'employees', id))));
        showToast('Bulk Delete Successful', `${selectedIds.length} employee(s) removed from backend.`, 'success');
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected employees.', 'error');
      }
    }
  };

  // Modal Tab state ('info' | 'assignment' | 'all')
  const [modalTab, setModalTab]   = useState('info');

  const location = useLocation();

  const openAdd  = () => { 
    setForm({ ...EMPTY, assignedSites: [] }); 
    setEditId(null); 
    setModalTab('info'); 
    setModal(true); 
  };
  
  const openEdit = (emp) => { 
    let sitesArr = [];
    if (Array.isArray(emp.assignedSites)) {
      sitesArr = emp.assignedSites;
    } else if (emp.assignedSite) {
      sitesArr = emp.assignedSite.split(',').map(s => s.trim()).filter(Boolean);
    }
    setForm({ 
      ...EMPTY, 
      ...emp, 
      assignedSites: sitesArr 
    }); 
    setEditId(emp.id); 
    setModalTab('info'); 
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
        await deleteDoc(doc(db, 'employees', id));
        showToast('Employee Removed', 'The employee record has been deleted.', 'success');
      } catch (e) {
        console.warn('Firestore delete error:', e);
        showToast('Delete Failed', e.message || 'Could not delete employee', 'error');
      }
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return showToast('Validation Error', 'Name and Email are required.', 'error');
    setIsSaving(true);
    try {
      const isMobile = form.workType === 'Mobile Field Employee';
      const existing = editId ? employees.find(e => e.id === editId) : null;
      const dataToSave = {
        ...form,
        assignedSites: isMobile ? (existing?.assignedSites || []) : (form.assignedSite ? [form.assignedSite] : []),
        assignedSite: isMobile ? (existing?.assignedSite || '') : (form.assignedSite || ''),
        assignedDestinations: isMobile ? (existing?.assignedDestinations || []) : []
      };
      if (editId) {
        await updateDoc(doc(db, 'employees', editId), dataToSave);
        showToast('Employee Updated', 'Record saved successfully.', 'success');
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newEmp = { ...dataToSave, joined: nowStr.replace(', ', '\n'), profilePic: null };
        await addDoc(collection(db, 'employees'), newEmp);
        showToast('Employee Created', 'New employee added to database.', 'success');
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
                              <div style={{ fontWeight:600, color:'#111827' }}>{emp.name}</div>
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
                            const effStatus = getEmployeeStatus(emp);
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
                    { label: 'On Site', count: employees.filter(e => e.status === 'On Site').length, color: '#10B981' },
                    { label: 'On Duty', count: employees.filter(e => e.status === 'On Duty').length, color: '#3B82F6' },
                    { label: 'In Transit', count: employees.filter(e => e.status === 'In Transit').length, color: '#F59E0B' },
                    { label: 'Offline', count: employees.filter(e => e.status === 'Offline').length, color: '#6B7280' },
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

            {/* Modern Stepper Progress Header */}
            <div style={{ padding: '16px 28px 14px 28px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                
                {/* Step 1 Badge */}
                <div
                  onClick={() => setModalTab('info')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: modalTab === 'info' ? '#1E5ADB' : (modalTab === 'assignment' || modalTab === 'all' ? '#10B981' : '#F1F5F9'),
                    color: (modalTab === 'info' || modalTab === 'assignment' || modalTab === 'all') ? '#FFFFFF' : '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    boxShadow: modalTab === 'info' ? '0 4px 12px rgba(30, 90, 219, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}>
                    {modalTab === 'assignment' || modalTab === 'all' ? <Check size={16} strokeWidth={3} /> : '1'}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: modalTab === 'info' ? '#1E5ADB' : '#0F172A' }}>1. Identity & Role</div>
                    <div style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>Personal & Credentials</div>
                  </div>
                </div>

                {/* Connecting Line 1 */}
                <div style={{ flex: 1, height: 2, background: (modalTab === 'assignment' || modalTab === 'all') ? '#10B981' : '#E2E8F0', margin: '0 12px', transition: 'all 0.3s ease' }} />

                {/* Step 2 Badge */}
                <div
                  onClick={() => setModalTab('assignment')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: modalTab === 'assignment' ? '#1E5ADB' : (modalTab === 'all' ? '#10B981' : '#F1F5F9'),
                    color: (modalTab === 'assignment' || modalTab === 'all') ? '#FFFFFF' : '#64748B',
                    border: modalTab === 'assignment' ? 'none' : '1.5px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    boxShadow: modalTab === 'assignment' ? '0 4px 12px rgba(30, 90, 219, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}>
                    {modalTab === 'all' ? <Check size={16} strokeWidth={3} /> : '2'}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: modalTab === 'assignment' ? '#1E5ADB' : '#0F172A' }}>2. Work & Deployment</div>
                    <div style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>Site & Geofence</div>
                  </div>
                </div>

                {/* Connecting Line 2 */}
                <div style={{ flex: 1, height: 2, background: modalTab === 'all' ? '#10B981' : '#E2E8F0', margin: '0 12px', transition: 'all 0.3s ease' }} />

                {/* Step 3 Badge */}
                <div
                  onClick={() => setModalTab('all')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: modalTab === 'all' ? '#1E5ADB' : '#F1F5F9',
                    color: modalTab === 'all' ? '#FFFFFF' : '#64748B',
                    border: modalTab === 'all' ? 'none' : '1.5px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    boxShadow: modalTab === 'all' ? '0 4px 12px rgba(30, 90, 219, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  }}>
                    3
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: modalTab === 'all' ? '#1E5ADB' : '#0F172A' }}>3. Full Overview</div>
                    <div style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>Review & Save</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Body Form Fields - Optimized for Scrolldown-Free Display */}
            <div style={{ padding: '24px 28px' }}>
              {modalTab === 'info' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Full Name *</label>
                    <div style={{ position: 'relative' }}>
                      <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.name || ''}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. John Doe"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>ID Number</label>
                    <div style={{ position: 'relative' }}>
                      <IdCard size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.idNum || ''}
                        onChange={e => setForm(p => ({ ...p, idNum: e.target.value }))}
                        placeholder="e.g. EMP-1001"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Department / Org</label>
                    <div style={{ position: 'relative' }}>
                      <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="text"
                        value={form.org || ''}
                        onChange={e => setForm(p => ({ ...p, org: e.target.value }))}
                        placeholder="e.g. Field Operations"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
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
                        placeholder="e.g. Security Guard"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Email Address *</label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="email"
                        value={form.email || ''}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="e.g. johndoe@subai.com"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Account Password</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input
                        type="password"
                        value={form.password || ''}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        placeholder="Enter secure password"
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'assignment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Employee Work Type</label>
                    <div style={{ position: 'relative' }}>
                      <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <select
                        value={form.workType || 'Fixed Site Employee'}
                        onChange={e => {
                          const wt = e.target.value;
                          setForm(p => ({
                            ...p,
                            workType: wt,
                            geofenceRadius: wt === 'Fixed Site Employee' ? (p.geofenceRadius || 20) : 100
                          }));
                        }}
                        style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                      >
                        <option value="Fixed Site Employee">Fixed Site Employee</option>
                        <option value="Mobile Field Employee">Mobile Field Employee</option>
                      </select>
                    </div>
                  </div>

                  {form.workType === 'Fixed Site Employee' && (
                    <div style={{ background: '#F8FAFC', borderRadius: 16, padding: 18, border: '1px solid #E2E8F0', marginTop: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1E5ADB', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={15} /> Fixed Site Location & Geofence Perimeter
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Assigned Site</label>
                          <select
                            value={form.assignedSite || ''}
                            onChange={e => {
                              const selSite = e.target.value;
                              const matched = sites.find(s => (s.name || s.id) === selSite);
                              const rad = matched?.radius ? (typeof matched.radius === 'number' ? matched.radius : parseInt(matched.radius)) : 20;
                              setForm(p => ({
                                ...p,
                                assignedSite: selSite,
                                assignedSites: selSite ? [selSite] : [],
                                geofenceRadius: rad || p.geofenceRadius || 20
                              }));
                            }}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                          >
                            <option value="">— Select a Site —</option>
                            {sites.map(s => <option key={s.id} value={s.name || s.id}>{s.name} ({typeof s.radius === 'number' ? s.radius : (parseInt(s.radius) || 20)}m)</option>)}
                          </select>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Geofence Radius</label>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#1E5ADB', background: '#EFF6FF', padding: '2px 8px', borderRadius: 8 }}>
                              {form.geofenceRadius || 20} meters
                            </span>
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={1000}
                            step={5}
                            value={form.geofenceRadius || 20}
                            onChange={e => setForm(p => ({ ...p, geofenceRadius: parseInt(e.target.value) || 20 }))}
                            style={{ width: '100%', accentColor: '#1E5ADB', cursor: 'pointer' }}
                          />
                          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                            {[
                              { r: 20, label: '20m (Bldg)' },
                              { r: 50, label: '50m' },
                              { r: 100, label: '100m' },
                              { r: 300, label: '300m' },
                              { r: 500, label: '500m' }
                            ].map(item => (
                              <button
                                key={item.r}
                                type="button"
                                onClick={() => setForm(p => ({ ...p, geofenceRadius: item.r }))}
                                style={{
                                  flex: 1,
                                  padding: '3px 0',
                                  borderRadius: 6,
                                  border: (form.geofenceRadius || 20) === item.r ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                                  background: (form.geofenceRadius || 20) === item.r ? '#EFF6FF' : '#FFFFFF',
                                  color: (form.geofenceRadius || 20) === item.r ? '#1E5ADB' : '#64748B',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                          {(form.geofenceRadius || 20) <= 30 && (
                            <div style={{ marginTop: 6, fontSize: 10, color: '#1D4ED8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              🏢 20m Building Fit: restricts check-in strictly inside building footprint.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {form.workType === 'Mobile Field Employee' && (
                    <div style={{ background: '#FFFBEB', borderRadius: 16, padding: 18, border: '1px solid #FDE68A', marginTop: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Truck size={16} color="#D97706" /> Mobile Field Employee Mode
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                        Site assignments and patrol locations for mobile field employees are scheduled and assigned in the <strong>Assignments</strong> page modal.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {modalTab === 'all' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    background: '#F8FAFC', 
                    padding: '10px 14px', 
                    borderRadius: 10, 
                    border: '1px solid #E2E8F0' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#1E5ADB' }}>
                      <Check size={15} color="#10B981" /> Profile Summary Review
                    </div>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Lock size={12} color="#94A3B8" /> View-only • Click Back to modify
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Full Name</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{form.name || '—'}</div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Email Address</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', wordBreak: 'break-all' }}>{form.email || '—'}</div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>ID Number</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{form.idNum || '—'}</div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Department</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{form.org || '—'}</div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Role / Title</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{form.type || '—'}</div>
                    </div>

                    <div style={{ 
                      background: '#FFFFFF', 
                      padding: '10px 14px', 
                      borderRadius: 10, 
                      border: '1px solid #E2E8F0',
                      gridColumn: 'span 1'
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Work Type</div>
                      <div style={{ 
                        fontSize: 13, 
                        fontWeight: 700, 
                        color: form.workType === 'Mobile Field Employee' ? '#92400E' : '#5B21B6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        {form.workType === 'Mobile Field Employee' ? <Truck size={14} color="#D97706" /> : <Building2 size={14} color="#7C3AED" />}
                        {form.workType || 'Fixed Site Employee'}
                      </div>
                    </div>

                    {form.workType === 'Fixed Site Employee' && (
                      <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0', gridColumn: 'span 2' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Assigned Fixed Site & Geofence</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={14} color="#1E5ADB" />
                          {form.assignedSite ? (
                            <>
                              <span>{form.assignedSite}</span>
                              <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1E5ADB', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                                {form.geofenceRadius || 20}m radius
                              </span>
                            </>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>No site assigned</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Action Bar with Stepper Controls */}
            <div style={{
              padding: '16px 28px 22px 28px',
              borderTop: '1px solid #F1F5F9',
              background: '#FAFAFA',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {modalTab !== 'info' ? (
                  <button
                    onClick={() => setModalTab(modalTab === 'all' ? 'assignment' : 'info')}
                    style={{
                      padding: '9px 18px',
                      borderRadius: 12,
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                ) : (
                  <button
                    onClick={() => setModal(false)}
                    style={{
                      padding: '9px 18px',
                      borderRadius: 12,
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#64748B',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                {modalTab !== 'all' ? (
                  <button
                    onClick={() => setModalTab(modalTab === 'info' ? 'assignment' : 'all')}
                    style={{
                      padding: '9px 20px',
                      borderRadius: 12,
                      border: '1px solid #1E5ADB',
                      background: '#EFF6FF',
                      color: '#1E5ADB',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    Next Step <ChevronRight size={16} />
                  </button>
                ) : null}

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
                  {isSaving ? 'Saving Profile...' : 'Save Employee'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}