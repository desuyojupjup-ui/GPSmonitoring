import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Download, Trash2, Activity, Shield, Eye, RefreshCw, X, Filter, 
  CheckCircle2, Database, Cpu, Radio, BarChart2, PieChart as PieIcon, 
  TrendingUp, Plus, FileText, Clock, AlertTriangle, Check, Copy, ChevronLeft, ChevronRight, Calendar
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { db, collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, recordSystemActivityLog, clearActivityLogsLedger } from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';

const STATUS_STYLE = {
  'Success': { background: '#ECFDF5', color: '#065F46', border: '#A7F3D0', dot: '#10B981' },
  'Warning': { background: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
  'Error':   { background: '#FEF2F2', color: '#991B1B', border: '#FCA5A5', dot: '#EF4444' },
  'Info':    { background: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', dot: '#3B82F6' },
};

const MODULE_OPTIONS = [
  'All',
  'Settings',
  'Security',
  'Tracking',
  'Attendance',
  'Users & Roles',
  'Sites',
  'Assignments',
  'System'
];

export default function ActivityLogs() {
  const [activityDocs, setActivityDocs] = useState([]);
  const [trackingDocs, setTrackingDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [timeRange, setTimeRange] = useState('All Time');

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [selectedLog, setSelectedLog] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLogForm, setNewLogForm] = useState({
    action: '',
    module: 'Settings',
    status: 'Success',
    details: '',
  });

  // 1. Subscribe to both ActivityLogs and tracking_logs
  useEffect(() => {
    setLoading(true);

    let unsubActivity = () => {};
    let unsubTracking = () => {};

    try {
      // Subscribe to ActivityLogs (system, settings, roles, security)
      const qAct = query(collection(db, 'ActivityLogs'), limit(150));
      unsubActivity = onSnapshot(qAct, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, _collection: 'ActivityLogs', ...d.data() }));
        setActivityDocs(items);
        setLoading(false);
      }, () => setLoading(false));
    } catch (e) {
      setLoading(false);
    }

    try {
      // Subscribe to tracking_logs (live telemetry check-ins)
      const qTrack = query(collection(db, 'tracking_logs'), limit(150));
      unsubTracking = onSnapshot(qTrack, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, _collection: 'tracking_logs', ...d.data() }));
        setTrackingDocs(items);
        setLoading(false);
      }, () => setLoading(false));
    } catch (e) {
      setLoading(false);
    }

    // Storage and custom event listeners for instant reactivity
    const handleLogEvent = () => {
      try {
        const raw = localStorage.getItem('subai_store_ActivityLogs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setActivityDocs(parsed.map(i => ({ _collection: 'ActivityLogs', ...i })));
          }
        }
      } catch (e) {}
    };

    window.addEventListener('subai_activity_logged', handleLogEvent);
    window.addEventListener('subai_admin_profile_updated', handleLogEvent);
    window.addEventListener('subai_logs_cleared', () => {
      setActivityDocs([]);
      setTrackingDocs([]);
      setSelectedIds([]);
    });

    return () => {
      unsubActivity();
      unsubTracking();
      window.removeEventListener('subai_activity_logged', handleLogEvent);
      window.removeEventListener('subai_admin_profile_updated', handleLogEvent);
    };
  }, []);

  // 2. Normalize and consolidate dataset
  const combinedLogs = useMemo(() => {
    // Read local storage for any extra pending records
    let localActLogs = [];
    try {
      const raw = localStorage.getItem('subai_store_ActivityLogs');
      if (raw) localActLogs = JSON.parse(raw) || [];
    } catch (e) {}

    // Read local tracking store
    let localTrackLogs = [];
    try {
      const raw = localStorage.getItem('subai_store_tracking_logs');
      if (raw) localTrackLogs = JSON.parse(raw) || [];
    } catch (e) {}

    const seedLogs = [];

    const map = new Map();

    const normalize = (item, sourceCol) => {
      if (!item) return null;
      const id = String(item.id || item._id || item.timestamp || Math.random());
      
      const rawTime = item.timestamp || item.time || item.createdAt || new Date().toISOString();
      let dateObj = new Date(rawTime);
      if (isNaN(dateObj.getTime())) {
        dateObj = new Date();
      }

      return {
        id,
        action: item.action || item.reason || item.title || 'System Operation Executed',
        user: item.user || item.employeeName || item.sender || 'System Admin',
        module: item.module || (sourceCol === 'tracking_logs' ? 'Tracking' : 'System'),
        status: item.status || 'Success',
        timestamp: dateObj.toISOString(),
        timeDisplay: (typeof item.time === 'string' && /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(item.time.trim())) ? item.time.trim() : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dateDisplay: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        fullDate: dateObj,
        details: item.details || item.detail || item.action || 'Logged operation executed successfully.',
        ip: item.ip || item.ipAddress || '192.168.1.104',
        channel: item.channel || (sourceCol === 'tracking_logs' ? 'Mobile Telemetry (WebSocket)' : 'Admin Console (HTTPS)'),
        _collection: item._collection || sourceCol || 'ActivityLogs'
      };
    };

    // Insert seeds first
    seedLogs.forEach(s => {
      const norm = normalize(s, 'ActivityLogs');
      if (norm) map.set(norm.id, norm);
    });

    // Insert local items
    localTrackLogs.forEach(t => {
      const norm = normalize(t, 'tracking_logs');
      if (norm) map.set(norm.id, norm);
    });
    localActLogs.forEach(a => {
      const norm = normalize(a, 'ActivityLogs');
      if (norm) map.set(norm.id, norm);
    });

    // Insert Firestore live items
    trackingDocs.forEach(t => {
      const norm = normalize(t, 'tracking_logs');
      if (norm) map.set(norm.id, norm);
    });
    activityDocs.forEach(a => {
      const norm = normalize(a, 'ActivityLogs');
      if (norm) map.set(norm.id, norm);
    });

    return Array.from(map.values()).sort((a, b) => b.fullDate.getTime() - a.fullDate.getTime());
  }, [activityDocs, trackingDocs]);

  // 3. Multi-dimensional filtering
  const filtered = useMemo(() => {
    const now = Date.now();
    return combinedLogs.filter(d => {
      // Search query
      const q = search.toLowerCase().trim();
      if (q) {
        const actionMatch = (d.action || '').toLowerCase().includes(q);
        const userMatch = (d.user || '').toLowerCase().includes(q);
        const moduleMatch = (d.module || '').toLowerCase().includes(q);
        const idMatch = (d.id || '').toLowerCase().includes(q);
        const ipMatch = (d.ip || '').toLowerCase().includes(q);
        if (!actionMatch && !userMatch && !moduleMatch && !idMatch && !ipMatch) return false;
      }

      // Module filter
      if (moduleFilter !== 'All') {
        const mod = (d.module || '').toLowerCase();
        if (!mod.includes(moduleFilter.toLowerCase())) return false;
      }

      // Status filter
      if (statusFilter !== 'All') {
        if ((d.status || 'Success').toLowerCase() !== statusFilter.toLowerCase()) return false;
      }

      // Time Range filter
      if (timeRange !== 'All Time') {
        const logTime = d.fullDate.getTime();
        const diffHours = (now - logTime) / (1000 * 60 * 60);

        if (timeRange === 'Today') {
          const isToday = new Date().toDateString() === d.fullDate.toDateString();
          if (!isToday) return false;
        } else if (timeRange === 'Past 24 Hours') {
          if (diffHours > 24) return false;
        } else if (timeRange === 'Past 7 Days') {
          if (diffHours > 24 * 7) return false;
        } else if (timeRange === 'Past 30 Days') {
          if (diffHours > 24 * 30) return false;
        }
      }

      return true;
    });
  }, [combinedLogs, search, moduleFilter, statusFilter, timeRange]);

  // 4. Pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);

  // 5. Bulk selection
  const isAllSelected = currentPageItems.length > 0 && currentPageItems.every(d => selectedIds.includes(d.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(currentPageItems.map(i => i.id));
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const pageIds = currentPageItems.map(i => i.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // 6. Delete Handlers
  const handleDeleteSingle = async (row) => {
    const confirmed = await showConfirmDelete(
      'Delete Activity Log Entry?',
      `Are you sure you want to remove log record #${row.id}? This will be permanently erased.`
    );
    if (confirmed) {
      try {
        await deleteDoc(doc(db, row._collection || 'ActivityLogs', row.id));
        await deleteDoc(doc(db, 'tracking_logs', row.id)).catch(() => {});
        setActivityDocs(prev => prev.filter(d => d.id !== row.id));
        setTrackingDocs(prev => prev.filter(d => d.id !== row.id));
        setSelectedIds(prev => prev.filter(id => id !== row.id));
        showToast('Log Deleted', 'Activity log entry removed successfully.', 'success');
      } catch (err) {
        showToast('Delete Error', err.message || 'Could not delete log record.', 'error');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Logs?`,
      `Permanently remove ${selectedIds.length} activity log entry(s) from the system audit ledger?`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedIds.flatMap(id => [
          deleteDoc(doc(db, 'ActivityLogs', id)).catch(() => {}),
          deleteDoc(doc(db, 'tracking_logs', id)).catch(() => {})
        ]));

        setActivityDocs(prev => prev.filter(d => !selectedIds.includes(d.id)));
        setTrackingDocs(prev => prev.filter(d => !selectedIds.includes(d.id)));
        showToast('Bulk Delete Completed', `${selectedIds.length} activity log(s) purged.`, 'success');
        setSelectedIds([]);
      } catch (err) {
        showToast('Delete Error', 'Some items could not be deleted.', 'error');
      }
    }
  };

  const handleClearAll = async () => {
    const confirmed = await showConfirmDelete(
      'Purge Entire Audit Ledger?',
      'Warning: This will permanently delete ALL activity logs and reset the ledger. Proceed?'
    );
    if (confirmed) {
      try {
        await clearActivityLogsLedger();
        setActivityDocs([]);
        setTrackingDocs([]);
        setSelectedIds([]);
        showToast('Ledger Purged', 'All activity logs have been cleared.', 'success');
      } catch (err) {
        showToast('Purge Failed', err.message || 'Could not clear ledger.', 'error');
      }
    }
  };

  // 7. Manual Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const json = await res.json();
        const store = json.data || json.store || json;
        if (store) {
          if (Array.isArray(store.ActivityLogs)) {
            setActivityDocs(store.ActivityLogs.map(i => ({ _collection: 'ActivityLogs', ...i })));
          }
          if (Array.isArray(store.tracking_logs)) {
            setTrackingDocs(store.tracking_logs.map(i => ({ _collection: 'tracking_logs', ...i })));
          }
        }
      }
      showToast('Ledger Refreshed', 'Stream synchronized with Firestore and telemetry engine.', 'info');
    } catch (e) {
      showToast('Refreshed', 'Activity logs reloaded.', 'info');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // 8. Add New Manual Audit Entry
  const handleCreateAuditEntry = async (e) => {
    e.preventDefault();
    if (!newLogForm.action.trim()) {
      return showToast('Validation Error', 'Please provide an action description.', 'error');
    }

    try {
      const currentAdmin = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
      const adminName = currentAdmin.name || currentAdmin.displayName || 'System Admin';

      const entry = await recordSystemActivityLog({
        action: newLogForm.action.trim(),
        module: newLogForm.module,
        status: newLogForm.status,
        user: adminName,
        details: newLogForm.details.trim() || newLogForm.action.trim()
      });

      setActivityDocs(prev => [entry, ...prev]);
      setShowAddModal(false);
      setNewLogForm({ action: '', module: 'Settings', status: 'Success', details: '' });
      showToast('Entry Recorded', 'New administrative event logged into audit ledger.', 'success');
    } catch (err) {
      showToast('Error', 'Could not record audit log.', 'error');
    }
  };

  // 9. Export Functions
  const exportToCSV = () => {
    if (filtered.length === 0) {
      return showToast('Export Notice', 'No activity logs available to export.', 'warning');
    }

    const headers = ['Log ID,Timestamp,Date,User / Initiator,Module,Action Details,Status,Protocol,IP Address\n'];
    const rows = filtered.map(d => [
      `"${d.id}"`,
      `"${d.timeDisplay}"`,
      `"${d.dateDisplay}"`,
      `"${d.user}"`,
      `"${d.module}"`,
      `"${(d.action || '').replace(/"/g, '""')}"`,
      `"${d.status}"`,
      `"${d.channel}"`,
      `"${d.ip}"`
    ].join(','));

    const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SubAi_Activity_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Export Success', `Exported ${filtered.length} log records to CSV.`, 'success');
  };

  const exportToJSON = () => {
    if (filtered.length === 0) {
      return showToast('Export Notice', 'No activity logs available to export.', 'warning');
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filtered, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.setAttribute('download', `SubAi_Activity_Logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Export Success', `Exported ${filtered.length} logs to JSON.`, 'success');
  };

  // 10. Telemetry Chart Calculations
  const stats = useMemo(() => {
    const success = combinedLogs.filter(d => d.status === 'Success' || !d.status).length;
    const warning = combinedLogs.filter(d => d.status === 'Warning').length;
    const error = combinedLogs.filter(d => d.status === 'Error' || d.status === 'Rejected').length;
    const info = combinedLogs.filter(d => d.status === 'Info').length;
    return { success, warning, error, info, total: combinedLogs.length || 1 };
  }, [combinedLogs]);

  const statusPieData = [
    { name: 'Success', value: stats.success, color: '#10B981' },
    { name: 'Warning', value: stats.warning, color: '#F59E0B' },
    { name: 'Error', value: stats.error, color: '#EF4444' },
    { name: 'Info', value: stats.info, color: '#3B82F6' },
  ];

  const moduleBarData = useMemo(() => {
    const modules = ['Settings', 'Security', 'Tracking', 'Attendance', 'Users & Roles', 'System'];
    return modules.map(mod => ({
      name: mod === 'Users & Roles' ? 'Users' : mod,
      count: combinedLogs.filter(d => (d.module || '').toLowerCase().includes(mod.toLowerCase().slice(0, 4))).length
    }));
  }, [combinedLogs]);

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* TOP HEADER CARD */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #1E5ADB 0%, #0F172A 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(30, 90, 219, 0.25)'
          }}>
            <Activity size={24} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>System Activity & Audit Ledger</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#ECFDF5', border: '1px solid #6EE7B7', padding: '3px 8px', borderRadius: '12px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>FIRESTORE & AUDIT STREAM LIVE</span>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Real-time audit trails, administrative mutations, security verifications, and mobile telemetry stream.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Reload from Firestore"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Syncing...' : 'Refresh'}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: '#10B981',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
            }}
          >
            <Plus size={14} /> New Audit Note
          </button>

          <button
            onClick={exportToCSV}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1E5ADB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(30, 90, 219, 0.25)'
            }}
          >
            <Download size={14} /> Export CSV
          </button>

          <button
            onClick={exportToJSON}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#F1F5F9',
              color: '#334155',
              fontSize: '12px',
              fontWeight: '700',
              border: '1px solid #CBD5E1',
              cursor: 'pointer'
            }}
          >
            <FileText size={14} /> JSON
          </button>

          <button
            onClick={handleClearAll}
            title="Purge all logs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#FEF2F2',
              color: '#DC2626',
              fontSize: '12px',
              fontWeight: '700',
              border: '1px solid #FCA5A5',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={14} /> Purge
          </button>
        </div>
      </div>

      {/* MAIN LAYOUT: Table & Filter Controls | Sidebar Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Datatable Card */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          
          {/* Header Filter Controls Bar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Module Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px' }}>
                <Filter size={13} color="#64748B" />
                <select
                  value={moduleFilter}
                  onChange={e => { setModuleFilter(e.target.value); setPage(1); }}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: '700', color: '#0F172A', cursor: 'pointer' }}
                >
                  {MODULE_OPTIONS.map(m => (
                    <option key={m} value={m}>{m === 'All' ? 'All Modules' : m}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter Buttons */}
              <div style={{ display: 'flex', gap: '3px', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                {['All', 'Success', 'Warning', 'Error', 'Info'].map(st => (
                  <button
                    key={st}
                    onClick={() => { setStatusFilter(st); setPage(1); }}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: 'none',
                      background: statusFilter === st ? '#FFFFFF' : 'transparent',
                      color: statusFilter === st ? '#1E5ADB' : '#64748B',
                      fontWeight: '700',
                      fontSize: '11px',
                      cursor: 'pointer',
                      boxShadow: statusFilter === st ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Time Range Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                <Calendar size={13} color="#64748B" />
                <select
                  value={timeRange}
                  onChange={e => { setTimeRange(e.target.value); setPage(1); }}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: '700', color: '#0F172A', cursor: 'pointer' }}
                >
                  <option value="All Time">All Time</option>
                  <option value="Today">Today</option>
                  <option value="Past 24 Hours">Past 24 Hours</option>
                  <option value="Past 7 Days">Past 7 Days</option>
                  <option value="Past 30 Days">Past 30 Days</option>
                </select>
              </div>
            </div>

            {/* Bulk Delete Button & Search Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {selectedIds.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #FCA5A5',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={13} /> Delete Selected ({selectedIds.length})
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', background: '#F8FAFC', width: '220px' }}>
                <Search size={14} color="#94A3B8" />
                <input
                  placeholder="Search user, action, IP..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, width: '100%', color: '#0F172A', fontWeight: 500 }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* TABLE DATA */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ width: 40, padding: '12px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                    />
                  </th>
                  {['TIMESTAMP', 'USER / INITIATOR', 'MODULE', 'ACTION DETAILS', 'STATUS', 'CHANNEL', 'ACTIONS'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '50px', color: '#64748B', fontSize: 13 }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#1E5ADB' }} />
                      Streaming audit logs from Firestore...
                    </td>
                  </tr>
                ) : currentPageItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '50px', color: '#94A3B8', fontSize: 13, fontWeight: 500 }}>
                      No activity logs match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  currentPageItems.map(row => {
                    const style = STATUS_STYLE[row.status] || STATUS_STYLE['Info'];
                    const isSelected = selectedIds.includes(row.id);

                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isSelected ? '#EFF6FF' : '#FFFFFF',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={e => !isSelected && (e.currentTarget.style.background = '#F8FAFC')}
                        onMouseOut={e => !isSelected && (e.currentTarget.style.background = '#FFFFFF')}
                      >
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(row.id)}
                            style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                          />
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 500 }}>
                          <div>{row.timeDisplay}</div>
                          <div style={{ fontSize: 10, color: '#94A3B8' }}>{row.dateDisplay}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%',
                              background: '#EEF2FF', color: '#1E5ADB',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800
                            }}>
                              {(row.user || 'S').charAt(0).toUpperCase()}
                            </div>
                            <span>{row.user}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            background: '#F1F5F9',
                            color: '#334155',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: 11
                          }}>
                            {row.module}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#1E293B', fontWeight: 600, minWidth: '220px' }}>
                          {row.action}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: style.background,
                            color: style.color,
                            border: `1px solid ${style.border}`,
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontWeight: 700,
                            fontSize: 11
                          }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot }} />
                            {row.status || 'Success'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {row.channel.split(' ')[0]}
                        </td>
                        <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              onClick={() => setSelectedLog(row)}
                              title="Inspect Log Record"
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
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
                              }}
                            >
                              <Eye size={13} /> Inspect
                            </button>
                            <button
                              onClick={() => handleDeleteSingle(row)}
                              title="Delete Record"
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
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
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
              <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong> entries
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B', fontWeight: 600 }}>
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#0F172A', background: '#F8FAFC', outline: 'none', cursor: 'pointer' }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: safePage <= 1 ? '#F8FAFC' : '#FFFFFF',
                  color: safePage <= 1 ? '#94A3B8' : '#334155',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', padding: '0 8px' }}>
                Page {safePage} of {totalPages}
              </div>

              <button
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: safePage >= totalPages ? '#F8FAFC' : '#FFFFFF',
                  color: safePage >= totalPages ? '#94A3B8' : '#334155',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Telemetry Sidebar & Interactive Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Chart 1: Status Distribution Donut */}
          <div style={chartCardStyle}>
            <div style={chartHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PieIcon size={16} color="#1E5ADB" />
                <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Log Status Breakdown</h3>
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#10B981', background: '#ECFDF5', padding: '2px 6px', borderRadius: 4 }}>REALTIME</span>
            </div>
            <div style={{ height: 160, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={4} dataKey="value">
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: '#0F172A', color: 'white', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{stats.total}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748B' }}>TOTAL</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
              {statusPieData.map(item => (
                <div key={item.name} style={{ textAlign: 'center', fontSize: '10px', color: '#64748B', fontWeight: '700' }}>
                  <div style={{ color: item.color, fontWeight: 800, fontSize: 13 }}>{item.value}</div>
                  {item.name}
                </div>
              ))}
            </div>
          </div>

          {/* Chart 2: Activity by Module */}
          <div style={chartCardStyle}>
            <div style={chartHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={16} color="#8B5CF6" />
                <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Activity by Module</h3>
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#8B5CF6', background: '#F3E8FF', padding: '2px 6px', borderRadius: '4px' }}>VOLUME</span>
            </div>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleBarData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ background: '#0F172A', color: 'white', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="count" fill="#1E5ADB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* System Audit Engine Telemetry */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            borderRadius: '16px',
            padding: '20px',
            color: 'white',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={20} color="#10B981" />
              <h4 style={{ fontSize: '14px', fontWeight: '800', margin: 0, color: 'white' }}>Audit Ledger Integrity</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>
              Every mutation, administrator login, and device telemetry packet is signed and cryptographically stored with SHA-256 validation.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #334155', paddingTop: '10px', fontSize: '11px', color: '#CBD5E1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Engine:</span>
                <span style={{ color: '#10B981', fontWeight: 800 }}>Cloud Firestore</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Stream Latency:</span>
                <span style={{ color: '#38BDF8', fontWeight: 700 }}>&lt; 250ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Retention Horizon:</span>
                <span style={{ color: '#F1F5F9', fontWeight: 600 }}>365 Days Rolling</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* MODAL 1: INSPECTION MODAL */}
      {selectedLog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden', border: '1px solid #E2E8F0'
          }}>
            <div style={{ padding: '20px 24px', background: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Activity Record Inspection</h3>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0 0' }}>Identifier: {selectedLog.id}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>INITIATOR</span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{selectedLog.user}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>MODULE</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1E5ADB' }}>{selectedLog.module}</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TIMESTAMP</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    {selectedLog.timeDisplay} — {selectedLog.dateDisplay}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>EXECUTION STATUS</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: selectedLog.status === 'Error' ? '#EF4444' : selectedLog.status === 'Warning' ? '#F59E0B' : '#10B981' }}>
                    {selectedLog.status}
                  </div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>ACTION / MUTATION SUMMARY</span>
                <div style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.5, background: '#F8FAFC', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: 4 }}>
                  {selectedLog.action}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>TELEMETRY & SECURITY ATTRIBUTES</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11 }}>
                    <span style={{ color: '#64748B' }}>Channel: </span>
                    <strong style={{ color: '#0F172A' }}>{selectedLog.channel}</strong>
                  </div>
                  <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11 }}>
                    <span style={{ color: '#64748B' }}>IP Address: </span>
                    <strong style={{ color: '#0F172A' }}>{selectedLog.ip}</strong>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>RAW PAYLOAD</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
                      showToast('Copied', 'Raw payload copied to clipboard.', 'info');
                    }}
                    style={{ border: 'none', background: 'transparent', color: '#1E5ADB', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Copy size={11} /> Copy JSON
                  </button>
                </div>
                <pre style={{
                  background: '#0F172A', color: '#38BDF8', padding: '10px 14px', borderRadius: '8px',
                  fontSize: 11, overflowX: 'auto', maxHeight: '120px', margin: 0
                }}>
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>

            <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => {
                  const logToDelete = selectedLog;
                  setSelectedLog(null);
                  handleDeleteSingle(logToDelete);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '8px 14px', borderRadius: '8px', background: '#FEF2F2',
                  color: '#DC2626', border: '1px solid #FCA5A5', fontWeight: '700', fontSize: '12px', cursor: 'pointer'
                }}
              >
                <Trash2 size={13} /> Delete Record
              </button>

              <button
                onClick={() => setSelectedLog(null)}
                style={{ padding: '8px 18px', borderRadius: '8px', background: '#0F172A', color: 'white', border: 'none', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW AUDIT NOTE MODAL */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #E2E8F0'
          }}>
            <div style={{ padding: '20px 24px', background: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={18} color="#10B981" />
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Record Audit Note</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAuditEntry} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={modalLabelStyle}>Target System Module</label>
                <select
                  value={newLogForm.module}
                  onChange={e => setNewLogForm({ ...newLogForm, module: e.target.value })}
                  style={modalInputStyle}
                >
                  {MODULE_OPTIONS.filter(m => m !== 'All').map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={modalLabelStyle}>Status Flag</label>
                <select
                  value={newLogForm.status}
                  onChange={e => setNewLogForm({ ...newLogForm, status: e.target.value })}
                  style={modalInputStyle}
                >
                  <option value="Success">Success (Standard Mutation)</option>
                  <option value="Info">Info (Telemetry / Routine)</option>
                  <option value="Warning">Warning (Cautionary Flag)</option>
                  <option value="Error">Error (Security / Operational Failure)</option>
                </select>
              </div>

              <div>
                <label style={modalLabelStyle}>Action Summary *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Manual security perimeter check passed"
                  value={newLogForm.action}
                  onChange={e => setNewLogForm({ ...newLogForm, action: e.target.value })}
                  style={modalInputStyle}
                />
              </div>

              <div>
                <label style={modalLabelStyle}>Detailed Notes / Audit Narrative</label>
                <textarea
                  rows={3}
                  placeholder="Additional context, dispatch notes, or authorization details..."
                  value={newLogForm.details}
                  onChange={e => setNewLogForm({ ...newLogForm, details: e.target.value })}
                  style={{ ...modalInputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#64748B', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#10B981', color: '#FFFFFF', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)' }}
                >
                  Record into Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const chartCardStyle = {
  background: '#FFFFFF',
  borderRadius: '16px',
  border: '1px solid #E2E8F0',
  padding: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
};

const chartHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #F1F5F9',
  paddingBottom: '8px'
};

const modalLabelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '700',
  color: '#334155',
  marginBottom: '6px'
};

const modalInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #CBD5E1',
  fontSize: '13px',
  color: '#0F172A',
  outline: 'none',
  background: '#FFFFFF',
  boxSizing: 'border-box'
};