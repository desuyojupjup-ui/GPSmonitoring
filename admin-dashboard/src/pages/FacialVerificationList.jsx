import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, query, deleteDoc, doc, updateDoc, addDoc, serverTimestamp } from '../firebase';
import { Search, ShieldCheck, CheckCircle2, XCircle, Eye, ScanLine, Trash2, TrendingUp, ShieldAlert, Cpu, ClipboardCheck, Clock, Send, UserCheck, AlertCircle, X } from 'lucide-react';
import { showToast, showConfirmDelete } from '../utils/toast';
import { useCompany, DEFAULT_COMPANY_ID } from '../utils/companyContext';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: '600', zIndex: 99 }}>
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
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: '600', zIndex: 99 }}>
        <div style={{ color: '#6366F1', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.fill || '#6366F1' }}></span>
          {data.payload.range}: <strong style={{ color: '#0F172A' }}>{data.value} scans</strong> ({data.payload.pct}%)
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
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: '600', zIndex: 99 }}>
        <div style={{ color: '#4F46E5', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5' }}></span>
          {data.payload.time}: <strong style={{ color: '#0F172A' }}>{data.value} scan(s)</strong>
        </div>
      </div>
    );
  }
  return null;
};

function resolveVerificationStatus(item) {
  const rawStatus = (item.verificationStatus || item.status || item.result || '').toString().trim();
  const lower = rawStatus.toLowerCase();
  if (lower === 'pending' && item.expiresAt && Date.now() > Number(item.expiresAt)) {
    return 'Expired';
  }
  if (lower === 'successful' || lower === 'verified') return 'Verified';
  if (lower === 'failed' || lower === 'rejected') return 'Failed';
  if (lower === 'expired' || lower === 'missed') return 'Expired';
  if (lower === 'pending' || lower === 'pending_review') return 'Pending';
  return rawStatus || 'Pending';
}

function normalizeVerification(item) {
  const empName = item.employeeName || item.employee_name || item.name || item.empName || 'Staff Member';
  const empId = item.employeeId || item.employee_id || item.empId || 'N/A';
  const status = resolveVerificationStatus(item);
  const rawScore = item.confidenceScore ?? item.score;
  const score = rawScore != null && !isNaN(Number(rawScore)) ? Number(rawScore) : (status === 'Verified' ? 90 : 0);
  const loc = item.location || item.siteName || item.site_name || item.site || '—';
  const trigger = item.triggerType || item.type || item.action || 'Admin Verification Request';

  let photo = item.capturedImageUrl || item.imageRef || item.selfieUrl || item.photo || item.photoUrl || item.image || null;
  if (typeof photo === 'string' && photo.startsWith('file://')) {
    photo = null;
  }

  let rawTs = item.timestamp || item.requestedAt || item.createdAt || item.date;
  let formattedTs = new Date();
  if (rawTs) {
    if (typeof rawTs?.toDate === 'function') formattedTs = rawTs.toDate();
    else if (typeof rawTs?.seconds === 'number') formattedTs = new Date(rawTs.seconds * 1000);
    else if (typeof rawTs === 'number' || typeof rawTs === 'string') {
      const d = new Date(rawTs);
      if (!isNaN(d.getTime())) formattedTs = d;
    }
  }

  return {
    id: item.id,
    verificationRequestId: item.verificationRequestId || item.id,
    companyId: item.companyId || DEFAULT_COMPANY_ID,
    employeeName: empName,
    employeeId: empId,
    triggerType: trigger,
    confidenceScore: score,
    result: status,
    status,
    verificationStatus: status,
    location: loc,
    timestamp: formattedTs,
    imageRef: photo,
    selfieUrl: photo,
    photo,
    _raw: item,
  };
}

export default function FacialVerificationList() {
  const { matchesCompany, stampCompany } = useCompany();
  const [rawFvRecords, setRawFvRecords] = useState([]);
  const [rawEmployees, setRawEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [empTypeFilter, setEmpTypeFilter] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  // Admin-Initiated Request Facial Verification Modal
  const [requestModal, setRequestModal] = useState(false);
  const [reqEmployeeId, setReqEmployeeId] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqExpireMins, setReqExpireMins] = useState(15);
  const [sendingRequest, setSendingRequest] = useState(false);

  // Pagination & Bulk Select
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  const employees = useMemo(() => rawEmployees.filter(matchesCompany), [rawEmployees, matchesCompany]);

  // Real-time Firestore subscriptions (NO deleted_verifications, NO localStorage suppression, NO limit(100) cutoff)
  useEffect(() => {
    setLoading(true);
    let unsubFV = () => {};
    let unsubEmp = () => {};
    try {
      unsubFV = onSnapshot(query(collection(db, 'facial_verifications')), (snap) => {
        setRawFvRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error('facial_verifications listener error:', err);
        setLoading(false);
      });

      unsubEmp = onSnapshot(query(collection(db, 'employees')), (snap) => {
        setRawEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
    } catch (e) {
      console.error('FacialVerification subscription error:', e);
      setLoading(false);
    }
    return () => { unsubFV(); unsubEmp(); };
  }, []);

  const combinedVerifications = useMemo(() => {
    return rawFvRecords
      .filter(matchesCompany)
      .map(raw => normalizeVerification(raw))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [rawFvRecords, matchesCompany]);

  const filtered = combinedVerifications.filter(v => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = (v.employeeName || '').toLowerCase().includes(q) || (v.employeeId || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || v.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesDate = !dateFilter || (v.timestamp && v.timestamp.toISOString().startsWith(dateFilter));
    const matchesType = empTypeFilter === 'All' || (v._raw?.employeeType || '').toLowerCase().includes(empTypeFilter.toLowerCase());
    return matchesSearch && matchesStatus && matchesDate && matchesType;
  });

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);
  const emptyRowsCount = loading ? 0 : Math.max(0, Math.min(pageSize, 8) - currentPageItems.length);

  const isAllSelected = currentPageItems.length > 0 && currentPageItems.every(d => selectedIds.includes(d.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      const ids = new Set(currentPageItems.map(i => i.id));
      setSelectedIds(prev => prev.filter(id => !ids.has(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageItems.map(i => i.id)])));
    }
  };
  const toggleSelectOne = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Requirement 7 & 8: Admin clicks "Request Facial Verification" -> creates real-time Firestore request
  const handleSendVerificationRequest = async () => {
    const emp = employees.find(e => e.id === reqEmployeeId);
    if (!emp) {
      return showToast('warning', 'Select Employee', 'Please choose an employee to send a facial verification request.');
    }

    setSendingRequest(true);
    try {
      const currentAdmin = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
      const reqId = `fv_req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const expiresAt = Date.now() + Math.max(5, Number(reqExpireMins) || 15) * 60 * 1000;
      const empCompanyId = emp.companyId || DEFAULT_COMPANY_ID;

      const reqPayload = stampCompany({
        companyId: empCompanyId,
        verificationRequestId: reqId,
        employeeId: emp.idNum || emp.id,
        employeeDocId: emp.id,
        employeeName: emp.name || 'Employee',
        employeeEmail: emp.email || '',
        employeeType: emp.workType || emp.type || 'Field Employee',
        location: emp.assignedSite || 'Assigned Worksite',
        siteName: emp.assignedSite || 'Assigned Worksite',
        triggerType: 'admin_request',
        requestedBy: currentAdmin.name || currentAdmin.email || 'Administrator',
        requestedNote: reqNote.trim() || 'Administrator requested live identity verification.',
        faceRegisteredAtRequest: Boolean(emp.faceRegistered && emp.faceReferencePhoto),
        status: 'Pending',
        verificationStatus: 'Pending',
        result: 'Pending',
        verificationResult: 'Pending',
        confidenceScore: 0,
        expiresAt,
        createdAt: Date.now(),
        requestedAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      });

      const docRef = await addDoc(collection(db, 'facial_verifications'), reqPayload);

      // Persistent notification record for employee & audit
      await addDoc(collection(db, 'notifications'), stampCompany({
        companyId: empCompanyId,
        type: 'Verification Request',
        category: 'Facial Verification',
        severity: 'Medium',
        employeeId: emp.idNum || emp.id,
        employeeDocId: emp.id,
        employeeName: emp.name || 'Employee',
        relatedRecordId: docRef.id,
        verificationRequestId: reqId,
        title: 'Facial Verification Requested',
        message: emp.faceRegistered
          ? `Administrator requested live facial verification for ${emp.name}. (Safe-state verified — mobile app will defer prompt while driving.)`
          : `Facial verification requested for ${emp.name}. Employee will be prompted to register their face first.`,
        sender: currentAdmin.name || 'Admin Portal',
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Unread',
        read: false,
        timestamp: new Date().toISOString(),
        createdAt: Date.now(),
      })).catch(() => {});

      showToast(
        'success',
        'Verification Requested',
        `Live facial verification request sent to ${emp.name}. Mobile app will receive it in real time.`
      );
      setRequestModal(false);
      setReqEmployeeId('');
      setReqNote('');
    } catch (err) {
      console.error('Request verification error:', err);
      showToast('error', 'Request Failed', err.message || 'Could not create facial verification request.');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAdminReview = async (action) => {
    if (!selectedItem) return;
    if (action === 'Failed' && !reviewNotes.trim()) {
      showToast('warning', 'Notes Required', 'Please add a reason for rejecting this verification.');
      return;
    }
    setReviewing(true);
    try {
      const currentAdmin = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
      const now = new Date().toISOString();
      const updatePayload = {
        status: action,
        verificationStatus: action,
        result: action,
        verificationResult: action,
        reviewedBy: currentAdmin.name || currentAdmin.email || 'Admin',
        reviewedAt: now,
        adminNotes: reviewNotes.trim(),
      };

      await updateDoc(doc(db, 'facial_verifications', selectedItem.id), updatePayload);

      await addDoc(collection(db, 'notifications'), {
        companyId: selectedItem.companyId || DEFAULT_COMPANY_ID,
        type: 'Facial Verification',
        employeeId: selectedItem.employeeId,
        employeeName: selectedItem.employeeName,
        relatedRecordId: selectedItem.id,
        title: action === 'Verified' ? 'Verification Approved' : 'Verification Rejected',
        message: action === 'Verified'
          ? 'Your facial verification was approved by the administrator.'
          : `Your facial verification was rejected. Reason: ${reviewNotes.trim()}`,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Unread',
        read: false,
        timestamp: now,
        createdAt: Date.now(),
      }).catch(() => {});

      setSelectedItem(prev => prev ? { ...prev, ...updatePayload, _raw: { ...prev._raw, ...updatePayload } } : null);
      setReviewNotes('');
      showToast('success', 'Review Submitted', `Verification marked as ${action}.`);
    } catch (e) {
      showToast('error', 'Review Failed', e.message || 'Could not update verification status.');
    } finally {
      setReviewing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Record(s)?`,
      `Are you sure you want to permanently delete ${selectedIds.length} verification record(s) from Firestore?`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'facial_verifications', id))));
        setSelectedIds([]);
        showToast('success', 'Bulk Delete Successful', `${selectedIds.length} verification record(s) deleted.`);
      } catch (err) {
        showToast('error', 'Bulk Delete Failed', err.message || 'Error deleting verification records.');
      }
    }
  };

  const handleSingleDelete = async (item) => {
    const confirmed = await showConfirmDelete(
      `Delete Record for ${item.employeeName}?`,
      'Are you sure you want to permanently remove this verification record from Firestore?'
    );
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'facial_verifications', item.id));
        showToast('success', 'Record Deleted', `Verification record removed for ${item.employeeName}.`);
      } catch (err) {
        showToast('error', 'Delete Failed', err.message || 'Error deleting verification record.');
      }
    }
  };

  // Real KPI metrics (FIXED: no fake `totalCount || 50`!)
  const totalCount = combinedVerifications.length;
  const verifiedCount = combinedVerifications.filter(v => v.status === 'Verified').length;
  const pendingCount = combinedVerifications.filter(v => v.status === 'Pending').length;
  const failedCount = combinedVerifications.filter(v => v.status === 'Failed').length;
  const expiredCount = combinedVerifications.filter(v => v.status === 'Expired').length;
  const completedCount = verifiedCount + failedCount;
  const passRate = completedCount > 0 ? Math.round((verifiedCount / completedCount) * 100) : 0;
  const scoredRecords = combinedVerifications.filter(v => v.confidenceScore > 0);
  const avgConfidence = scoredRecords.length > 0
    ? Math.round(scoredRecords.reduce((acc, v) => acc + v.confidenceScore, 0) / scoredRecords.length)
    : 0;
  const registeredFaceCount = employees.filter(e => Boolean(e.faceRegistered && e.faceReferencePhoto)).length;

  const matchPieData = [
    { name: 'Verified', value: verifiedCount, color: '#10B981', pct: totalCount ? Math.round((verifiedCount / totalCount) * 100) : 0 },
    { name: 'Pending', value: pendingCount, color: '#F59E0B', pct: totalCount ? Math.round((pendingCount / totalCount) * 100) : 0 },
    { name: 'Failed', value: failedCount, color: '#EF4444', pct: totalCount ? Math.round((failedCount / totalCount) * 100) : 0 },
    { name: 'Expired', value: expiredCount, color: '#94A3B8', pct: totalCount ? Math.round((expiredCount / totalCount) * 100) : 0 },
  ];

  const confRange95 = scoredRecords.filter(v => v.confidenceScore >= 95).length;
  const confRange85 = scoredRecords.filter(v => v.confidenceScore >= 85 && v.confidenceScore < 95).length;
  const confRange75 = scoredRecords.filter(v => v.confidenceScore >= 75 && v.confidenceScore < 85).length;
  const confRangeLow = scoredRecords.filter(v => v.confidenceScore < 75).length;
  const sumBarScans = scoredRecords.length || 1;

  const confidenceBarData = [
    { range: '95-100%', count: confRange95, fill: '#10B981', pct: scoredRecords.length ? Math.round((confRange95 / sumBarScans) * 100) : 0 },
    { range: '85-94%', count: confRange85, fill: '#6366F1', pct: scoredRecords.length ? Math.round((confRange85 / sumBarScans) * 100) : 0 },
    { range: '75-84%', count: confRange75, fill: '#F59E0B', pct: scoredRecords.length ? Math.round((confRange75 / sumBarScans) * 100) : 0 },
    { range: '< 75%', count: confRangeLow, fill: '#EF4444', pct: scoredRecords.length ? Math.round((confRangeLow / sumBarScans) * 100) : 0 },
  ];

  // Real hourly velocity computed strictly from Firestore verification timestamps
  const velocityAreaData = useMemo(() => {
    const buckets = [
      { time: '06:00 AM', minH: 5, maxH: 8 },
      { time: '08:00 AM', minH: 8, maxH: 10 },
      { time: '10:00 AM', minH: 10, maxH: 12 },
      { time: '12:00 PM', minH: 12, maxH: 14 },
      { time: '02:00 PM', minH: 14, maxH: 16 },
      { time: '04:00 PM', minH: 16, maxH: 18 },
      { time: '06:00 PM+', minH: 18, maxH: 24 },
    ];
    return buckets.map(b => ({
      time: b.time,
      velocity: combinedVerifications.filter(v => {
        const h = v.timestamp.getHours();
        return h >= b.minH && h < b.maxH;
      }).length,
    }));
  }, [combinedVerifications]);

  const selectedRequestEmp = employees.find(e => e.id === reqEmployeeId);

  return (
    <div className="security-page-container">

      {/* Top KPI Summary Cards — 100% Real Firestore Counts */}
      <div className="security-kpi-grid">
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>TOTAL VERIFICATIONS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ScanLine size={18} color="#4F46E5" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalCount}</div>
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
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>REGISTERED FACES</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={18} color="#1E5ADB" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#1E5ADB', marginTop: '8px' }}>
            {registeredFaceCount}<span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}> / {employees.length}</span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>PENDING REQUESTS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>{pendingCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>FAILED / EXPIRED</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={18} color="#EF4444" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#EF4444', marginTop: '8px' }}>{failedCount + expiredCount}</div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="security-responsive-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          {/* Search, Filter & Request Facial Verification Bar */}
          <div className="security-filter-bar">
            <div className="security-filter-search">
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
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ height: '40px', padding: '0 14px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Verified">Verified</option>
              <option value="Failed">Failed</option>
              <option value="Expired">Expired</option>
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
              style={{ height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            />

            <button
              onClick={() => setRequestModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white',
                border: 'none', borderRadius: 8, padding: '0 16px', height: '40px',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(30, 90, 219, 0.25)'
              }}
            >
              <Send size={14} /> Request Facial Verification
            </button>

            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: '#DC2626', color: 'white',
                  border: 'none', borderRadius: 8, padding: '0 16px', height: '40px',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                <Trash2 size={15} /> Delete ({selectedIds.length})
              </button>
            )}
          </div>

          {/* Data Table */}
          <div className="security-table-card">
            <table className="security-fluid-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }} />
                  </th>
                  <th>Employee</th>
                  <th className="security-col-optional-tablet">Trigger</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th className="security-col-optional-tablet">Location</th>
                  <th className="security-col-optional-mobile">Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#64748B' }}>Streaming facial verification records from Cloud Firestore...</td></tr>
                ) : currentPageItems.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>No facial verification records yet. Click <strong>Request Facial Verification</strong> to verify an employee.</td></tr>
                ) : (
                  currentPageItems.map(item => {
                    const isSelected = selectedIds.includes(item.id);
                    const badgeStyle =
                      item.status === 'Verified' ? { bg: '#D1FAE5', color: '#065F46' } :
                      item.status === 'Pending' ? { bg: '#FEF3C7', color: '#92400E' } :
                      item.status === 'Expired' ? { bg: '#F1F5F9', color: '#475569' } :
                      { bg: '#FEE2E2', color: '#991B1B' };
                    return (
                      <tr key={item.id} style={{ background: isSelected ? '#EFF6FF' : 'transparent' }}>
                        <td style={{ width: 36, textAlign: 'center' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(item.id)} style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }} />
                        </td>
                        <td style={{ fontWeight: '600', color: '#0F172A' }}>
                          <div>{item.employeeName}</div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '400' }}>ID: {item.employeeId}</div>
                        </td>
                        <td className="security-col-optional-tablet" style={{ color: '#475569', textTransform: 'capitalize' }}>
                          {(item.triggerType || '').replace(/_/g, ' ')}
                        </td>
                        <td>
                          {item.status === 'Pending' || item.status === 'Expired' ? (
                            <span style={{ color: '#94A3B8', fontWeight: 600 }}>—</span>
                          ) : (
                            <span style={{ fontWeight: '700', color: item.confidenceScore >= 85 ? '#10B981' : item.confidenceScore >= 70 ? '#F59E0B' : '#EF4444' }}>
                              {item.confidenceScore}%
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', backgroundColor: badgeStyle.bg, color: badgeStyle.color, display: 'inline-block' }}>
                            {item.status}
                          </span>
                        </td>
                        <td className="security-col-optional-tablet" style={{ color: '#64748B' }}>{item.location}</td>
                        <td className="security-col-optional-mobile" style={{ color: '#64748B' }}>
                          <div style={{ fontWeight: '600', color: '#334155', fontSize: '12px' }}>{item.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                          <div style={{ fontSize: '10px', color: '#94A3B8' }}>{item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              onClick={() => setSelectedItem(item)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', height: '28px', borderRadius: '6px', border: '1px solid #DBEAFE', backgroundColor: '#FFFFFF', color: '#1E5ADB', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }}
                            >
                              <Eye size={13} color="#1E5ADB" /> View
                            </button>
                            <button
                              onClick={() => handleSingleDelete(item)}
                              style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', height: '28px', borderRadius: '6px', border: '1px solid #FEE2E2', backgroundColor: '#FFFFFF', color: '#EF4444', cursor: 'pointer' }}
                            >
                              <Trash2 size={13} color="#EF4444" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}

                {!loading && currentPageItems.length > 0 && emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                  <tr key={`empty-row-${idx}`} style={{ height: 38, borderBottom: '1px dashed #F8FAFC' }}>
                    <td colSpan={8} style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Datatable Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #F1F5F9', background: '#FFFFFF', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
                  Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong>
                </div>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(p - 1, 1))} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 11, fontWeight: 600, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}>Prev</button>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', padding: '0 6px' }}>{safePage} / {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(p + 1, totalPages))} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 11, fontWeight: 600, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: REAL TELEMETRY CHARTS */}
        <div className="security-sidebar-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ScanLine size={18} color="#6366F1" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Verification Telemetry</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Live Firestore Stream</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>LIVE</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={15} color="#10B981" /> Verification Status Breakdown
              </span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#10B981' }}>{passRate}% Pass</span>
            </div>
            <div style={{ position: 'relative', width: '100%', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Pie data={matchPieData.filter(d => d.value > 0).length ? matchPieData.filter(d => d.value > 0) : [{ name: 'No Data', value: 1, color: '#E2E8F0', pct: 0 }]} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} dataKey="value">
                    {(matchPieData.filter(d => d.value > 0).length ? matchPieData.filter(d => d.value > 0) : [{ color: '#E2E8F0' }]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{totalCount}</div>
                <div style={{ fontSize: '9px', color: '#64748B', fontWeight: '600', marginTop: 2 }}>RECORDS</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, background: '#F8FAFC', padding: '8px', borderRadius: '10px' }}>
              {matchPieData.map((item, idx) => (
                <div key={idx} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600' }}>{item.name}</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cpu size={15} color="#6366F1" /> Match Confidence Distribution
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#6366F1' }}>Avg: {avgConfidence}%</span>
            </div>
            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confidenceBarData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={15} color="#4F46E5" /> Verification Activity By Hour
              </span>
            </div>
            <div style={{ width: '100%', height: 110 }}>
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
                  <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area type="monotone" dataKey="velocity" stroke="#4F46E5" strokeWidth={2} fillOpacity={1} fill="url(#verificationVelocityGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Request Facial Verification Modal (Admin-Initiated On-Demand Flow) */}
      {requestModal && (
        <div style={modalOverlay} onClick={() => setRequestModal(false)}>
          <div style={{ ...modalBox, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0F172A' }}>Request Facial Verification</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  Sends a real-time verification request to the employee&apos;s mobile app. Prompts are safely deferred while driving.
                </p>
              </div>
              <button onClick={() => setRequestModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Select Employee *</label>
                <select
                  value={reqEmployeeId}
                  onChange={e => setReqEmployeeId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, fontWeight: 600, background: '#FFFFFF' }}
                >
                  <option value="">— Choose an employee —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.idNum || emp.email}) — {emp.faceRegistered && emp.faceReferencePhoto ? 'Face Registered ✓' : 'Face Not Registered'}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRequestEmp && (
                <div style={{
                  padding: '10px 12px', borderRadius: 10, fontSize: 12,
                  background: selectedRequestEmp.faceRegistered && selectedRequestEmp.faceReferencePhoto ? '#ECFDF5' : '#FFFBEB',
                  border: `1px solid ${selectedRequestEmp.faceRegistered && selectedRequestEmp.faceReferencePhoto ? '#A7F3D0' : '#FDE68A'}`,
                  color: selectedRequestEmp.faceRegistered && selectedRequestEmp.faceReferencePhoto ? '#065F46' : '#92400E',
                  display: 'flex', alignItems: 'center', gap: 8
                }}>
                  {selectedRequestEmp.faceRegistered && selectedRequestEmp.faceReferencePhoto ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span><strong>Face Reference Ready:</strong> Captured selfie will be compared against {selectedRequestEmp.name}&apos;s registered face.</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} />
                      <span><strong>No Registered Face Yet:</strong> Mobile app will require {selectedRequestEmp.name} to complete Face Registration before verification can pass.</span>
                    </>
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Request Expiration Window</label>
                <select
                  value={reqExpireMins}
                  onChange={e => setReqExpireMins(Number(e.target.value))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, background: '#FFFFFF' }}
                >
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes (Recommended)</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Instruction / Note (Optional)</label>
                <input
                  value={reqNote}
                  onChange={e => setReqNote(e.target.value)}
                  placeholder="e.g. Confirm presence at assigned post when stationary"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setRequestModal(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleSendVerificationRequest}
                disabled={sendingRequest || !reqEmployeeId}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#1E5ADB', color: '#FFFFFF', fontWeight: 700, fontSize: 13, cursor: sendingRequest || !reqEmployeeId ? 'not-allowed' : 'pointer', opacity: sendingRequest || !reqEmployeeId ? 0.65 : 1 }}
              >
                {sendingRequest ? 'Sending Request...' : 'Request Verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {selectedItem && (
        <div style={modalOverlay} onClick={() => setSelectedItem(null)}>
          <div style={{ ...modalBox, maxHeight: '90vh', overflowY: 'auto', width: '90%', maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#0F172A' }}>Facial Verification Details</h3>
              <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748B' }}>✕</button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              {(selectedItem._raw?.capturedImageUrl || selectedItem.imageRef || selectedItem.photo) ? (
                <>
                  <img
                    src={selectedItem._raw?.capturedImageUrl || selectedItem.imageRef || selectedItem.photo}
                    alt="Verification Selfie"
                    style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid #6366F1', boxShadow: '0 4px 12px rgba(99,102,241,0.25)', cursor: 'pointer' }}
                    onClick={() => setExpandedPhoto(selectedItem._raw?.capturedImageUrl || selectedItem.imageRef || selectedItem.photo)}
                  />
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Click selfie to expand</div>
                </>
              ) : (
                <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: 12, color: '#64748B', fontSize: 12 }}>
                  {selectedItem.status === 'Pending' ? 'Awaiting employee selfie capture...' : 'No selfie captured.'}
                </div>
              )}
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, fontSize: 13, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {[
                ['Request ID', selectedItem.verificationRequestId],
                ['Employee', `${selectedItem.employeeName} (${selectedItem.employeeId})`],
                ['Email', selectedItem._raw?.employeeEmail || '—'],
                ['Trigger', (selectedItem.triggerType || '').replace(/_/g, ' ')],
                ['Verification Status', selectedItem.status],
                ['Verification Result', selectedItem._raw?.verificationResult || selectedItem.result],
                ['Confidence', selectedItem.confidenceScore ? `${selectedItem.confidenceScore}%` : '—'],
                ['Requested By', selectedItem._raw?.requestedBy || '—'],
                ['Location', selectedItem.location],
                ['Timestamp', selectedItem.timestamp.toLocaleString()],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: '#374151' }}>{label}</span>
                  <span style={{ color: '#0F172A', textAlign: 'right', maxWidth: '58%', wordBreak: 'break-word' }}>{val}</span>
                </div>
              ))}
            </div>

            {selectedItem._raw?.reviewedBy && (
              <div style={{ background: '#ECFDF5', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid #A7F3D0', fontSize: 13 }}>
                <div style={{ fontWeight: 800, color: '#065F46', marginBottom: 4 }}>Admin Review</div>
                <div>Reviewed by: <strong>{selectedItem._raw.reviewedBy}</strong></div>
                {selectedItem._raw.adminNotes && <div style={{ marginTop: 4, fontStyle: 'italic', color: '#374151' }}>{selectedItem._raw.adminNotes}</div>}
              </div>
            )}

            {selectedItem.status !== 'Verified' && (
              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 14, border: '1px solid #E2E8F0', marginBottom: 14 }}>
                <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: 8, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ClipboardCheck size={16} color="#4F46E5" /> Manual Override / Review
                </div>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Admin notes (required to mark Failed)..."
                  rows={2}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid #E2E8F0', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAdminReview('Verified')} disabled={reviewing} style={{ flex: 1, padding: '9px 0', background: '#10B981', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✓ Mark Verified</button>
                  <button onClick={() => handleAdminReview('Failed')} disabled={reviewing} style={{ flex: 1, padding: '9px 0', background: '#EF4444', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✗ Mark Failed</button>
                </div>
              </div>
            )}

            <button onClick={() => setSelectedItem(null)} style={{ width: '100%', padding: '10px', backgroundColor: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {expandedPhoto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setExpandedPhoto(null)}>
          <img src={expandedPhoto} alt="Full Selfie" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
          <button onClick={() => setExpandedPhoto(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: 'white', fontSize: 28, cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

const cardStyle = { backgroundColor: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0' };
const modalOverlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '24px 16px' };
const modalBox = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
