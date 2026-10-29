import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, updateDoc, addDoc, serverTimestamp } from '../firebase';
import { Search, Filter, ShieldCheck, CheckCircle2, XCircle, AlertCircle, Eye, ScanLine, Trash2, Activity, Sparkles, TrendingUp, ShieldAlert, Cpu, ClipboardCheck, Clock } from 'lucide-react';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// Custom Tooltip for Verification Outcome Donut Chart
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

// Custom Tooltip for AI Confidence Bar Chart
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
        <div style={{ color: '#6366F1', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.fill || '#6366F1' }}></span>
          {data.payload.range}: <strong style={{ color: '#0F172A' }}>{data.value} scans</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Verification Stream Velocity Area Chart
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
        <div style={{ color: '#4F46E5', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5' }}></span>
          {data.payload.time}: <strong style={{ color: '#0F172A' }}>{data.value} scans/hr</strong>
        </div>
      </div>
    );
  }
  return null;
};

function normalizeVerification(item) {
  const empName = item.employeeName || item.employee_name || item.name || item.empName || 'Staff Member';
  const empId   = item.employeeId || item.employee_id || item.empId || item.id || 'N/A';
  const result  = item.result || item.status || 'Verified';
  const score   = item.confidenceScore || item.score || (result === 'Verified' ? 96 : 42);
  const loc     = item.location || item.siteName || item.site_name || item.site || 'Greenfield District';
  const trigger = item.triggerType || item.type || item.action || 'Check-in Verification';
  
  // Extract live selfie photo captured from mobile verification
  let photo = item.imageRef || item.selfieUrl || item.photo || item.photoUrl || item.avatar || item.image || (item._raw && (item._raw.imageRef || item._raw.selfieUrl || item._raw.photo || item._raw.photoUrl || item._raw.avatar)) || null;

  // Filter out invalid/local non-web file:// paths
  if (typeof photo === 'string' && photo.startsWith('file://')) {
    photo = null;
  }

  let rawTs = item.timestamp || item.createdAt || item.date;
  let formattedTs = new Date();
  if (rawTs) {
    if (rawTs.toDate) formattedTs = rawTs.toDate();
    else if (typeof rawTs === 'number' || typeof rawTs === 'string') formattedTs = new Date(rawTs);
  }

  return {
    id: item.id || `fv_${Math.random()}`,
    employeeName: empName,
    employeeId: empId,
    triggerType: trigger,
    confidenceScore: score,
    result: result,
    status: result,
    location: loc,
    timestamp: formattedTs,
    imageRef: photo,
    selfieUrl: photo,
    photo: photo,
    _raw: item
  };
}

export default function FacialVerificationList() {
  const [fvRecords, setFvRecords] = useState([]);
  const [logRecords, setLogRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [empTypeFilter, setEmpTypeFilter] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  // Pagination & Bulk Select state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  // Persistent Deleted synthetic / hidden IDs state
  const [deletedSyntheticIds, setDeletedSyntheticIds] = useState(() => {
    try {
      const saved = localStorage.getItem('subai_deleted_fv_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('subai_deleted_fv_ids', JSON.stringify(Array.from(deletedSyntheticIds)));
    } catch (e) {
      console.warn('Error saving deleted IDs:', e);
    }
  }, [deletedSyntheticIds]);

  useEffect(() => {
    setLoading(true);
    try {
      const unsubFV = onSnapshot(query(collection(db, 'facial_verifications'), limit(100)), (snap) => {
        const fvDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFvRecords(fvDocs);
        setLoading(false);
      }, (err) => {
        console.warn('facial_verifications listener warn:', err);
        setLoading(false);
      });

      const unsubLogs = onSnapshot(query(collection(db, 'ActivityLogs'), limit(100)), (snap) => {
        const logDocs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => (d.type && d.type.includes('Verification')) || (d.action && d.action.includes('Facial')));
        setLogRecords(logDocs);
      });

      const unsubDel = onSnapshot(collection(db, 'deleted_verifications'), (snap) => {
        const ids = snap.docs.map(d => d.data()?.id || d.id);
        if (ids.length > 0) {
          setDeletedSyntheticIds(prev => {
            const updated = new Set(prev);
            ids.forEach(id => updated.add(id));
            return updated;
          });
        }
      });

      return () => { unsubFV(); unsubLogs(); unsubDel(); };
    } catch (e) {
      console.warn('FacialVerification subscription error:', e);
      setLoading(false);
    }
  }, []);

  // Consolidate records: facial_verifications (primary) + ActivityLogs (supplement, no duplicate)
  const combinedVerifications = useMemo(() => {
    const recordsMap = new Map();

    // Primary: direct facial_verifications documents
    fvRecords.forEach(raw => {
      const norm = normalizeVerification(raw);
      if (!deletedSyntheticIds.has(norm.id)) {
        recordsMap.set(norm.id, { ...norm, _raw: raw });
      }
    });

    // Supplement: ActivityLog entries not already covered
    logRecords.forEach(raw => {
      const normId = `act_${raw.id}`;
      if (!deletedSyntheticIds.has(normId) && !recordsMap.has(normId)) {
        const norm = normalizeVerification({
          id: normId,
          employeeName: raw.employeeName || raw.employee_name || raw.name,
          employeeId: raw.employee_id || raw.employeeId,
          triggerType: raw.type || raw.action || 'Security Verification',
          confidenceScore: raw.confidenceScore || 96,
          result: raw.status === 'Warning' ? 'failed' : 'verified',
          verificationResult: raw.status === 'Warning' ? 'failed' : 'verified',
          verificationStatus: raw.status === 'Warning' ? 'pending_review' : 'successful',
          location: raw.siteName || raw.site || '',
          timestamp: raw.timestamp,
          imageRef: raw.photo || raw.imageRef || null,
          capturedImageUrl: raw.photo || raw.imageRef || null,
        });
        recordsMap.set(norm.id, { ...norm, _raw: raw });
      }
    });

    return Array.from(recordsMap.values()).sort((a, b) => {
      const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
  }, [fvRecords, logRecords, deletedSyntheticIds]);

  const filtered = combinedVerifications.filter(v => {
    const matchesSearch = (v.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (v.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase());
    const vs = (v.verificationStatus || v.result || v.status || '').toLowerCase();
    const vr = (v.verificationResult || v.result || '').toLowerCase();
    const matchesStatus = statusFilter === 'All'
      || vs === statusFilter.toLowerCase()
      || vr === statusFilter.toLowerCase();
    const matchesDate = !dateFilter || (v.timestamp && new Date(v.timestamp).toISOString().startsWith(dateFilter));
    const matchesType = empTypeFilter === 'All' || (v._raw?.employeeType || '').toLowerCase().includes(empTypeFilter.toLowerCase());
    return matchesSearch && matchesStatus && matchesDate && matchesType;
  });

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

  const persistSingleDeletion = async (id) => {
    try {
      await addDoc(collection(db, 'deleted_verifications'), { id, deletedAt: new Date().toISOString() }).catch(e => console.warn(e));
      if (id.startsWith('act_')) {
        const rawId = id.replace('act_', '');
        await deleteDoc(doc(db, 'ActivityLogs', rawId)).catch(e => console.warn(e));
      } else {
        await deleteDoc(doc(db, 'facial_verifications', id)).catch(e => console.warn(e));
      }
    } catch (e) {
      console.warn('Deletion error:', e);
    }
  };

  // Admin review: Verify / Reject / Dismiss
  const handleAdminReview = async (action) => {
    if (!selectedItem) return;
    if (action === 'rejected' && !reviewNotes.trim()) {
      showToast('warning', 'Notes Required', 'Please add a reason for rejection before submitting.');
      return;
    }
    setReviewing(true);
    try {
      const adminUser = 'Admin';
      const now = new Date().toISOString();
      const updatePayload = {
        verificationStatus: action,
        reviewedBy: adminUser,
        reviewedAt: now,
        adminNotes: reviewNotes || '',
      };

      // Update in facial_verifications
      const docId = selectedItem.id?.startsWith('act_') ? null : selectedItem.id;
      if (docId) {
        await updateDoc(doc(db, 'facial_verifications', docId), updatePayload).catch(e => console.warn(e));
      }

      // Write employee notification
      await addDoc(collection(db, 'notifications'), {
        type: 'employee',
        employeeId: selectedItem.employeeId || selectedItem._raw?.employeeId,
        employeeName: selectedItem.employeeName,
        title: action === 'verified' ? 'Verification Approved' : action === 'rejected' ? 'Verification Rejected' : 'Verification Dismissed',
        message: action === 'verified'
          ? 'Your identity verification was approved by the administrator.'
          : action === 'rejected'
          ? `Your identity verification was rejected. Reason: ${reviewNotes || 'Please contact your supervisor.'}`
          : 'Your verification request has been dismissed.',
        timestamp: now,
        read: false,
      }).catch(e => console.warn(e));

      // Update local state optimistically
      setSelectedItem(prev => prev ? { ...prev, ...updatePayload } : null);
      setReviewNotes('');
      showToast('success', 'Review Submitted', `Verification marked as ${action}.`);
    } catch (e) {
      console.error('Admin review error:', e);
      showToast('error', 'Review Failed', e.message || 'Could not update verification status.');
    } finally {
      setReviewing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Record(s)?`,
      `Are you sure you want to remove ${selectedIds.length} verification record(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const newDeletedSet = new Set(deletedSyntheticIds);
        await Promise.all(selectedIds.map(async id => {
          newDeletedSet.add(id);
          await persistSingleDeletion(id);
        }));
        setDeletedSyntheticIds(newDeletedSet);
        try {
          localStorage.setItem('subai_deleted_fv_ids', JSON.stringify(Array.from(newDeletedSet)));
        } catch (e) {}
        showToast('success', 'Bulk Delete Successful', `${selectedIds.length} verification record(s) deleted.`);
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('error', 'Bulk Delete Failed', err.message || 'Error deleting selected verification records.');
      }
    }
  };

  const handleSingleDelete = async (item) => {
    const confirmed = await showConfirmDelete(
      `Delete Record for ${item.employeeName}?`,
      `Are you sure you want to remove this verification record? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const newDeletedSet = new Set(deletedSyntheticIds);
        newDeletedSet.add(item.id);
        setDeletedSyntheticIds(newDeletedSet);
        try {
          localStorage.setItem('subai_deleted_fv_ids', JSON.stringify(Array.from(newDeletedSet)));
        } catch (e) {}
        await persistSingleDeletion(item.id);
        showToast('success', 'Record Deleted', `Verification record removed for ${item.employeeName}.`);
      } catch (err) {
        console.error('Single delete error:', err);
        showToast('error', 'Delete Failed', err.message || 'Error deleting verification record.');
      }
    }
  };

  const totalCount = combinedVerifications.length;
  const verifiedCount = combinedVerifications.filter(v => {
    const s = (v.verificationStatus || v.result || v.status || '').toLowerCase();
    return s === 'successful' || s === 'verified';
  }).length;
  const pendingReviewCount = combinedVerifications.filter(v => {
    const s = (v.verificationStatus || '').toLowerCase();
    return s === 'pending_review';
  }).length;
  const missedCount = combinedVerifications.filter(v => {
    const r = (v.verificationResult || v.result || '').toLowerCase();
    return r === 'missed';
  }).length;
  const failedCount = combinedVerifications.filter(v => {
    const r = (v.verificationResult || v.result || v.status || '').toLowerCase();
    return r === 'failed';
  }).length;
  const flaggedCount = combinedVerifications.filter(v => (v.result || '').toLowerCase() === 'flagged').length;
  const passRate = totalCount ? Math.round((verifiedCount / totalCount) * 100) : 0;
  const avgConfidence = totalCount ? Math.round(combinedVerifications.reduce((acc, v) => acc + (v.confidenceScore || 0), 0) / totalCount) : 0;

  // Chart 1 Data: Match Accuracy Ratio (Donut)
  const matchPieData = [
    { name: 'Verified', value: verifiedCount, color: '#10B981', pct: totalCount ? Math.round((verifiedCount / totalCount) * 100) : 0 },
    { name: 'Flagged', value: flaggedCount, color: '#F59E0B', pct: totalCount ? Math.round((flaggedCount / totalCount) * 100) : 0 },
    { name: 'Failed', value: failedCount, color: '#EF4444', pct: totalCount ? Math.round((failedCount / totalCount) * 100) : 0 },
  ];

  // Chart 2 Data: AI Confidence Score Distribution (Bar Chart)
  const confRange95 = combinedVerifications.filter(v => (v.confidenceScore || 0) >= 95).length;
  const confRange85 = combinedVerifications.filter(v => (v.confidenceScore || 0) >= 85 && (v.confidenceScore || 0) < 95).length;
  const confRange75 = combinedVerifications.filter(v => (v.confidenceScore || 0) >= 75 && (v.confidenceScore || 0) < 85).length;
  const confRangeLow = combinedVerifications.filter(v => (v.confidenceScore || 0) < 75).length;
  const sumBarScans = totalCount || 1;

  const confidenceBarData = [
    { range: '95-100%', count: confRange95, fill: '#10B981', pct: Math.round((confRange95 / sumBarScans) * 100) },
    { range: '85-94%', count: confRange85, fill: '#6366F1', pct: Math.round((confRange85 / sumBarScans) * 100) },
    { range: '75-84%', count: confRange75, fill: '#F59E0B', pct: Math.round((confRange75 / sumBarScans) * 100) },
    { range: '< 75%', count: confRangeLow, fill: '#EF4444', pct: Math.round((confRangeLow / sumBarScans) * 100) },
  ];

  // Chart 3 Data: Verification Stream Velocity (Area Chart)
  const velocityAreaData = [
    { time: '06:00 AM', velocity: 12 },
    { time: '08:00 AM', velocity: 45 },
    { time: '10:00 AM', velocity: 28 },
    { time: '12:00 PM', velocity: 34 },
    { time: '02:00 PM', velocity: 19 },
    { time: '04:00 PM', velocity: 41 },
    { time: '06:00 PM', velocity: 15 },
  ];

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>TOTAL VERIFICATIONS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ScanLine size={18} color="#4F46E5" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalCount || 50}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>PASS RATE</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#10B981', marginTop: '8px' }}>{passRate}%</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>AVG CONFIDENCE SCORE</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Cpu size={18} color="#6366F1" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#6366F1', marginTop: '8px' }}>{avgConfidence}%</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>PENDING REVIEW</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>{pendingReviewCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>FAILED / MISSED</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={18} color="#EF4444" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#EF4444', marginTop: '8px' }}>{failedCount + missedCount}</div>
        </div>
      </div>

      {/* Main Content Layout: Datatable Left + Telemetry Sidebar Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Controls & Interactive Datatable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Search & Filter Controls */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search employee name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '38px', paddingRight: '12px', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white' }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              <option value="All">All Results</option>
              <option value="successful">Verified</option>
              <option value="pending_review">Pending Review</option>
              <option value="failed">Failed</option>
              <option value="missed">Missed</option>
              <option value="rejected">Rejected</option>
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setPage(1); }}
              style={{ height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            />
            <select
              value={empTypeFilter}
              onChange={e => { setEmpTypeFilter(e.target.value); setPage(1); }}
              style={{ height: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              <option value="All">All Types</option>
              <option value="Field">Field Employee</option>
              <option value="Office">Office Employee</option>
              <option value="Delivery">Delivery</option>
              <option value="Guard">Security Guard</option>
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
                  borderRadius: 8,
                  padding: '0 16px',
                  height: '40px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Trash2 size={15} /> Delete Selected ({selectedIds.length})
              </button>
            )}
          </div>

          {/* Data Table */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: '700' }}>
                    <th style={{ width: 40, padding: '12px 16px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                      />
                    </th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Employee</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Trigger Type</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Confidence</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Result</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Location</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Timestamp</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPageItems.map(item => {
                    const isSelected = selectedIds.includes(item.id);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9', background: isSelected ? '#EFF6FF' : 'transparent' }}>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(item.id)}
                            style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                          />
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap' }}>
                          {item.employeeName || 'Staff Member'}
                          <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '400' }}>ID: {item.employeeId || 'N/A'}</div>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#475569', whiteSpace: 'nowrap' }}>{item.triggerType || 'Check-in Verification'}</td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: (item.confidenceScore || 0) >= 90 ? '#10B981' : (item.confidenceScore || 0) >= 75 ? '#F59E0B' : '#EF4444' }}>
                            {item.confidenceScore || 0}%
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                            backgroundColor: item.result === 'Verified' ? '#D1FAE5' : item.result === 'Flagged' ? '#FEF3C7' : '#FEE2E2',
                            color: item.result === 'Verified' ? '#065F46' : item.result === 'Flagged' ? '#92400E' : '#991B1B',
                          }}>
                            {item.result || 'Verified'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>{item.location || 'Greenfield Site'}</td>
                        <td style={{ padding: '14px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>{new Date(item.timestamp || Date.now()).toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setSelectedItem(item)}
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
                            <Eye size={13} color="#1E5ADB" /> View
                          </button>
                          <button
                            onClick={() => handleSingleDelete(item)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #FEE2E2',
                              backgroundColor: '#FFFFFF',
                              color: '#EF4444',
                              fontWeight: '700',
                              fontSize: '11px',
                              cursor: 'pointer',
                              marginLeft: '6px',
                              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Trash2 size={13} color="#EF4444" /> Delete
                          </button>
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
        </div>

        {/* RIGHT COLUMN: 3 UNIQUE VERIFICATION TELEMETRY CHARTS SIDEBAR */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          sticky: 'top',
          top: '24px'
        }}>
          {/* Sidebar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ScanLine size={18} color="#6366F1" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Verification Telemetry</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Biometric AI Stream Analysis</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>LIVE AI</span>
            </div>
          </div>

          {/* CHART 1: Match Accuracy Ratio (Donut Chart) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={15} color="#10B981" /> Match Accuracy Breakdown
              </span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#10B981' }}>{passRate}% Pass</span>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Pie
                    data={matchPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {matchPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
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
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{passRate}%</div>
                <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600', marginTop: 2 }}>MATCHED</div>
              </div>
            </div>

            {/* Custom Pie Legend */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: '#F8FAFC', padding: '10px', borderRadius: '10px' }}>
              {matchPieData.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: '#64748B', fontWeight: '600' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
                    {item.name}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', marginTop: 2 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 2: AI Confidence Score Distribution (Bar Chart) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cpu size={15} color="#6366F1" /> AI Confidence Distribution
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#6366F1' }}>Avg: {avgConfidence}%</span>
            </div>

            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confidenceBarData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {confidenceBarData.map((entry, index) => (
                      <Cell key={`bar-cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 3: Verification Stream Velocity (Area Chart) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={15} color="#4F46E5" /> Verification Flow Velocity
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#4F46E5' }}>Peak 08:00 AM</span>
            </div>

            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={velocityAreaData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="verificationVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area type="monotone" dataKey="velocity" stroke="#4F46E5" strokeWidth={2} fillOpacity={1} fill="url(#verificationVelocityGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>

      {/* View Detail Modal */}
      {selectedItem && (
        <div style={modalOverlay} onClick={() => setSelectedItem(null)}>
          <div style={{ ...modalBox, maxHeight: '90vh', overflowY: 'auto', width: '90%', maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#0F172A' }}>Facial Verification Details</h3>
              <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748B' }}>✕</button>
            </div>

            {/* Selfie */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              {(selectedItem._raw?.capturedImageUrl || selectedItem.imageRef || selectedItem.photo) ? (
                <>
                  <img
                    src={selectedItem._raw?.capturedImageUrl || selectedItem.imageRef || selectedItem.photo}
                    alt="Verification Selfie"
                    onError={e => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedItem.employeeName || 'Staff')}&background=4F46E5&color=fff&size=128&bold=true`; }}
                    style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid #6366F1', boxShadow: '0 4px 12px rgba(99,102,241,0.25)', cursor: 'pointer' }}
                    onClick={() => setExpandedPhoto(selectedItem._raw?.capturedImageUrl || selectedItem.imageRef || selectedItem.photo)}
                  />
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Click to expand</div>
                </>
              ) : (
                <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedItem.employeeName || 'Staff')}&background=4F46E5&color=fff&size=128&bold=true`} alt="Avatar" style={{ width: 120, height: 120, borderRadius: '50%', border: '3px solid #6366F1' }} />
              )}
            </div>

            {/* Info Grid */}
            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, fontSize: 13, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {[
                ['Employee', `${selectedItem.employeeName} (${selectedItem.employeeId || 'N/A'})`],
                ['Email', selectedItem._raw?.employeeEmail || '—'],
                ['Employee Type', selectedItem._raw?.employeeType || '—'],
                ['Assignment', selectedItem._raw?.assignmentId || '—'],
                ['Trigger', (selectedItem.triggerType || 'manual').replace(/_/g, ' ')],
                ['Result', selectedItem._raw?.verificationResult || selectedItem.result || '—'],
                ['Status', selectedItem._raw?.verificationStatus || selectedItem.status || '—'],
                ['Confidence', `${selectedItem.confidenceScore || 0}%`],
                ['Latitude', selectedItem._raw?.latitude?.toFixed(5) || '—'],
                ['Longitude', selectedItem._raw?.longitude?.toFixed(5) || '—'],
                ['Location Accuracy', `±${selectedItem._raw?.locationAccuracy || 0}m`],
                ['Timestamp', new Date(selectedItem.timestamp?.toDate ? selectedItem.timestamp.toDate() : (selectedItem.timestamp || Date.now())).toLocaleString()],
                ['Attendance ID', selectedItem._raw?.attendanceId || '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: '#374151' }}>{label}</span>
                  <span style={{ color: '#0F172A', textAlign: 'right', maxWidth: '55%', wordBreak: 'break-word' }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Previous Review (if any) */}
            {selectedItem._raw?.reviewedBy && (
              <div style={{ background: '#ECFDF5', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid #A7F3D0', fontSize: 13 }}>
                <div style={{ fontWeight: 800, color: '#065F46', marginBottom: 6 }}>Previous Review</div>
                <div>Reviewed by: <strong>{selectedItem._raw.reviewedBy}</strong></div>
                {selectedItem._raw.adminNotes && <div style={{ marginTop: 4, fontStyle: 'italic', color: '#374151' }}>{selectedItem._raw.adminNotes}</div>}
              </div>
            )}

            {/* Admin Review Actions */}
            {(() => {
              const vs = (selectedItem._raw?.verificationStatus || selectedItem.status || '').toLowerCase();
              const canReview = vs !== 'successful' && vs !== 'verified';
              if (!canReview) return null;
              return (
                <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 14, border: '1px solid #E2E8F0', marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: 10, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClipboardCheck size={16} color="#4F46E5" /> Admin Review
                  </div>
                  <textarea
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Admin notes (required for Reject)…"
                    rows={2}
                    style={{ width: '100%', borderRadius: 8, border: '1px solid #E2E8F0', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAdminReview('verified')}
                      disabled={reviewing}
                      style={{ flex: 1, padding: '9px 0', background: '#10B981', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: reviewing ? 0.6 : 1 }}
                    >✓ Verify</button>
                    <button
                      onClick={() => handleAdminReview('rejected')}
                      disabled={reviewing}
                      style={{ flex: 1, padding: '9px 0', background: '#EF4444', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: reviewing ? 0.6 : 1 }}
                    >✗ Reject</button>
                    <button
                      onClick={() => handleAdminReview('dismissed')}
                      disabled={reviewing}
                      style={{ flex: 1, padding: '9px 0', background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: reviewing ? 0.6 : 1 }}
                    >Dismiss</button>
                  </div>
                </div>
              );
            })()}

            <button onClick={() => setSelectedItem(null)} style={{ width: '100%', padding: '10px', backgroundColor: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Expanded Photo Modal */}
      {expandedPhoto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setExpandedPhoto(null)}>
          <img src={expandedPhoto} alt="Full Selfie" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
          <button onClick={() => setExpandedPhoto(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: 'white', fontSize: 28, cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

const cardStyle = { backgroundColor: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0' };
const modalOverlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalBox = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
