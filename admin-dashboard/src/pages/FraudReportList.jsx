import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, query, orderBy, limit, updateDoc, doc, deleteDoc, addDoc, serverTimestamp } from '../firebase';
import { Search, ShieldX, AlertCircle, Eye, Lock, Smartphone, Wifi, Cpu, Trash2, ShieldAlert, Radio, Activity, TrendingUp, ShieldCheck, Clock, MapPin, Scan } from 'lucide-react';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';

// Custom Tooltip for Fraud Vectors Radial/Pie Chart
const CustomVectorTooltip = ({ active, payload }) => {
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
        <div style={{ color: data.payload.color || '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color || '#DC2626' }}></span>
          {data.name}: <strong style={{ color: '#0F172A' }}>{data.value} breaches</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Device Stacked Bar Chart
const CustomDeviceTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        fontWeight: '600',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        zIndex: 99
      }}>
        <div style={{ color: '#64748B', fontSize: '11px', fontWeight: '700' }}>{payload[0].payload.os} OS Stream</div>
        {payload.map((item, idx) => (
          <div key={idx} style={{ color: item.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }}></span>
            {item.name}: <strong style={{ color: '#0F172A' }}>{item.value} devices</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Stepped Breach Area Chart
const CustomSteppedTooltip = ({ active, payload }) => {
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
        <div style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }}></span>
          {data.payload.time}: <strong style={{ color: '#0F172A' }}>{data.value} security breaches</strong>
        </div>
      </div>
    );
  }
  return null;
};

export default function FraudReportList() {
  const [reports, setReports] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [violationFilter, setViolationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    setLoading(true);
    try {
      // Primary: security_events collection
      const unsubSE = onSnapshot(
        query(collection(db, 'security_events'), orderBy('createdAt', 'desc'), limit(100)),
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, _source: 'security_events', ...d.data() }));
          setSecurityEvents(docs);
          setLoading(false);
        }, () => setLoading(false)
      );
      // Legacy: fraud_reports collection
      const unsubFR = onSnapshot(
        query(collection(db, 'fraud_reports'), orderBy('timestamp', 'desc'), limit(50)),
        (snap) => {
          setReports(snap.docs.map(d => ({ id: d.id, _source: 'fraud_reports', ...d.data() })));
        }, () => {}
      );
      return () => { unsubSE(); unsubFR(); };
    } catch (e) { setLoading(false); }
  }, []);

  // Merge security_events (primary) + legacy fraud_reports (no duplication)
  const allReports = useMemo(() => {
    const map = new Map();
    // Primary source first
    securityEvents.forEach(e => map.set(e.id, {
      id: e.id,
      employeeName: e.employeeName,
      employeeId: e.employeeId,
      employeeType: e.employeeType,
      violationType: e.eventType,
      severity: e.severity,
      status: e.status,
      assignmentId: e.assignmentId,
      assignmentName: e.assignmentName,
      siteId: e.siteId,
      siteName: e.siteName,
      latitude: e.latitude,
      longitude: e.longitude,
      locationAccuracy: e.locationAccuracy,
      previousLatitude: e.previousLatitude,
      previousLongitude: e.previousLongitude,
      description: e.description,
      deviceInformation: e.deviceInformation,
      relatedVerificationId: e.relatedVerificationId,
      relatedAttendanceId: e.relatedAttendanceId,
      reviewedBy: e.reviewedBy,
      reviewedAt: e.reviewedAt,
      adminNotes: e.adminNotes,
      timestamp: e.createdAt || e.timestamp,
      _source: 'security_events',
      _raw: e,
    }));
    // Legacy supplement
    reports.forEach(r => {
      const legacyId = r.relatedSecurityEventId || r.id;
      if (!map.has(legacyId)) map.set(r.id, {
        ...r,
        violationType: r.violationType || r.category,
        _source: 'fraud_reports',
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
      const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
      return tb - ta;
    });
  }, [securityEvents, reports]);

  const handleUpdateStatus = async (id, status, notes = '') => {
    setSubmitting(true);
    try {
      const source = allReports.find(r => r.id === id)?._source || 'security_events';
      const colName = source === 'security_events' ? 'security_events' : 'fraud_reports';
      await updateDoc(doc(db, colName, id), {
        status,
        reviewedBy: 'Admin',
        reviewedAt: new Date().toISOString(),
        adminNotes: notes || '',
      });
      // Write employee notification
      const rep = allReports.find(r => r.id === id);
      if (rep?.employeeId) {
        await addDoc(collection(db, 'notifications'), {
          type: 'employee',
          employeeId: rep.employeeId,
          title: status === 'verified' ? 'Security Review Completed' : 'Security Report Dismissed',
          message: status === 'verified'
            ? 'A security event on your account has been confirmed by the administrator.'
            : 'A security event on your account has been reviewed and dismissed.',
          timestamp: serverTimestamp(),
          read: false,
        });
      }
      setSelectedReport(prev => prev?.id === id ? { ...prev, status, adminNotes: notes } : prev);
      showToast('success', 'Status Updated', `Report marked as ${status}.`);
    } catch (e) {
      showToast('error', 'Update Failed', e.message);
    } finally { setSubmitting(false); }
  };

  const filtered = allReports.filter(r => {
    const nameMatch = (r.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const typeMatch = (r.violationType || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSearch = nameMatch || typeMatch;
    const matchesType = violationFilter === 'All' || (r.violationType || '').includes(violationFilter);
    const matchesSev = severityFilter === 'All' || r.severity === severityFilter;
    const matchesStat = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesType && matchesSev && matchesStat;
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Fraud Reports?`,
      `Are you sure you want to remove ${selectedIds.length} fraud report(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'fraud_reports', id))));
        showToast('success', 'Bulk Delete Successful', `${selectedIds.length} fraud report(s) deleted.`);
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('error', 'Bulk Delete Failed', err.message || 'Error deleting selected fraud reports.');
      }
    }
  };

  const totalViolations = allReports.length;
  const pendingCount = allReports.filter(r => r.status === 'pending_review').length;
  const verifiedCount = allReports.filter(r => r.status === 'verified').length;
  const dismissedCount = allReports.filter(r => r.status === 'dismissed').length;
  const mockCount = allReports.filter(r => (r.violationType || '').includes('FAKE_GPS') || (r.violationType || '').toLowerCase().includes('mock')).length;
  const vpnCount = allReports.filter(r => (r.violationType || '').includes('VPN')).length;
  const rootCount = allReports.filter(r => (r.violationType || '').includes('INTEGRITY') || (r.violationType || '').toLowerCase().includes('root')).length;
  const facialCount = allReports.filter(r => (r.violationType || '').includes('FACIAL') || (r.violationType || '').includes('FACE')).length;

  const sumVectors = Math.max(1, mockCount + vpnCount + rootCount + facialCount + (totalViolations - mockCount - vpnCount - rootCount - facialCount));
  const vectorPieData = [
    { name: 'Fake GPS', value: mockCount, color: '#DC2626', pct: Math.round((mockCount / sumVectors) * 100) },
    { name: 'VPN / Proxy', value: vpnCount, color: '#6366F1', pct: Math.round((vpnCount / sumVectors) * 100) },
    { name: 'Device Integrity', value: rootCount, color: '#F59E0B', pct: Math.round((rootCount / sumVectors) * 100) },
    { name: 'Facial Failures', value: facialCount, color: '#06B6D4', pct: Math.round((facialCount / sumVectors) * 100) },
  ];

  // Chart 2: Severity breakdown (real data)
  const criticalCount = allReports.filter(r => r.severity === 'Critical').length;
  const highCount = allReports.filter(r => r.severity === 'High').length;
  const medCount = allReports.filter(r => r.severity === 'Medium').length;
  const lowCount = allReports.filter(r => r.severity === 'Low').length;
  const deviceStackedData = [
    { os: 'Critical', Blocked: criticalCount, Flagged: 0 },
    { os: 'High', Blocked: highCount, Flagged: 0 },
    { os: 'Medium', Blocked: 0, Flagged: medCount },
    { os: 'Low', Blocked: 0, Flagged: lowCount },
  ];

  // Chart 3: Events by hour from today (real data)
  const hourBuckets = {};
  allReports.forEach(r => {
    const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp || 0);
    const h = ts.getHours();
    const label = `${String(h).padStart(2,'0')}:00`;
    hourBuckets[label] = (hourBuckets[label] || 0) + 1;
  });
  const steppedTimelineData = Object.entries(hourBuckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, breaches]) => ({ time, breaches }));
  if (steppedTimelineData.length === 0) steppedTimelineData.push({ time: 'No Data', breaches: 0 });


  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>TOTAL EVENTS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldX size={18} color="#DC2626" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalViolations}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 4 }}>security events</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>PENDING REVIEW</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>{pendingCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 4 }}>awaiting admin review</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>FAKE GPS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Radio size={18} color="#DC2626" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#DC2626', marginTop: '8px' }}>{mockCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 4 }}>GPS spoofing events</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>VPN / PROXY</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wifi size={18} color="#6366F1" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#6366F1', marginTop: '8px' }}>{vpnCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 4 }}>VPN detections</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>VERIFIED FRAUD</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={18} color="#DC2626" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#DC2626', marginTop: '8px' }}>{verifiedCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 4 }}>confirmed by admin</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>DISMISSED</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#64748B" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#64748B', marginTop: '8px' }}>{dismissedCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B4', marginTop: 4 }}>false positives</div>
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
                placeholder="Search employee or violation type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '38px', paddingRight: '12px', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white' }}
              />
            </div>
            <select
              value={violationFilter}
              onChange={(e) => setViolationFilter(e.target.value)}
              style={{ height: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              <option value="All">All Violations</option>
              <option value="Mock">Mock Location</option>
              <option value="Root">Root / Jailbreak</option>
              <option value="VPN">VPN / Proxy</option>
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
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Violation Type</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>IP Address</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Device Details</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Status</th>
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
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: '700', color: '#DC2626', whiteSpace: 'nowrap' }}>
                          {item.violationType || 'Mock Location App'}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#64748B', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{item.ipAddress || '112.203.45.18'}</td>
                        <td style={{ padding: '14px 16px', color: '#475569', whiteSpace: 'nowrap' }}>{item.deviceModel || 'Samsung Galaxy S22'}</td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                            backgroundColor: item.status === 'Confirmed Fraud' ? '#FEE2E2' : item.status === 'Resolved' ? '#D1FAE5' : '#FEF3C7',
                            color: item.status === 'Confirmed Fraud' ? '#991B1B' : item.status === 'Resolved' ? '#065F46' : '#92400E',
                          }}>
                            {item.status || 'Unresolved'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>{new Date(item.timestamp || Date.now()).toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setSelectedReport(item)}
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
                            <Eye size={13} color="#1E5ADB" /> Inspect
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

        {/* RIGHT COLUMN: 3 UNIQUE FRAUD TELEMETRY CHARTS SIDEBAR */}
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
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldX size={18} color="#DC2626" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Anti-Spoofing Telemetry</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Device Integrity Stream</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>SECURE AI</span>
            </div>
          </div>

          {/* CHART 1: Fraud Breach Vectors (Donut Ring Chart with Security Icon Center) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={15} color="#DC2626" /> Fraud Detection Vectors
              </span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#DC2626' }}>{mockCount} GPS Mocks</span>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomVectorTooltip />} />
                  <Pie
                    data={vectorPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={66}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {vectorPieData.map((entry, index) => (
                      <Cell key={`vector-cell-${index}`} fill={entry.color} stroke="none" />
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
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{totalViolations}</div>
                <div style={{ fontSize: '10px', color: '#DC2626', fontWeight: '700', marginTop: 2 }}>BREACHES</div>
              </div>
            </div>

            {/* Custom Legend */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, background: '#F8FAFC', padding: '10px', borderRadius: '10px' }}>
              {vectorPieData.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#475569', fontWeight: '600' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span>{item.name}: <strong>{item.value}</strong></span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 2: Device OS Security Stream Stacked Bar Chart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Smartphone size={15} color="#F59E0B" /> OS Device Security Breakdown
              </span>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 700 }}>
                <span style={{ color: '#DC2626' }}>● Blocked</span>
                <span style={{ color: '#F59E0B' }}>● Flagged</span>
              </div>
            </div>

            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deviceStackedData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="os" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomDeviceTooltip />} />
                  <Bar dataKey="Blocked" stackId="a" fill="#DC2626" radius={[0, 0, 4, 4]} barSize={24} />
                  <Bar dataKey="Flagged" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 3: Live Stepped Security Breach Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={15} color="#DC2626" /> Stepped Breach Timeline
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#DC2626' }}>
                {steppedTimelineData.length > 0 && steppedTimelineData[0].time !== 'No Data' ? 'Live Activity' : 'No Events'}
              </span>
            </div>

            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={steppedTimelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="steppedFraudGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomSteppedTooltip />} />
                  <Area type="stepAfter" dataKey="breaches" stroke="#DC2626" strokeWidth={2.5} fillOpacity={1} fill="url(#steppedFraudGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>

      {/* Detail Modal — Full Review Workflow */}
      {selectedReport && (
        <div style={modalOverlay} onClick={(e) => e.target === e.currentTarget && setSelectedReport(null)}>
          <div style={{ ...modalBox, maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Security Event Review</h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>ID: {selectedReport.id}</span>
              </div>
              <button onClick={() => { setSelectedReport(null); setAdminNotes(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}>✕</button>
            </div>

            {/* Employee + Event Info */}
            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Employee</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedReport.employeeName || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Type</span>
                <span style={{ fontWeight: 700, color: '#64748B' }}>{selectedReport.employeeType || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Event Type</span>
                <span style={{ fontWeight: 700, color: '#DC2626' }}>{(selectedReport.violationType || '—').replace(/_/g, ' ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Severity</span>
                <span style={{ padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: selectedReport.severity === 'Critical' ? '#F5F3FF' : selectedReport.severity === 'High' ? '#FEF2F2' : selectedReport.severity === 'Medium' ? '#FEF3C7' : '#DBEAFE',
                  color: selectedReport.severity === 'Critical' ? '#7C3AED' : selectedReport.severity === 'High' ? '#991B1B' : selectedReport.severity === 'Medium' ? '#92400E' : '#1E40AF'
                }}>{selectedReport.severity || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Current Status</span>
                <span style={{ padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: selectedReport.status === 'verified' ? '#FEF2F2' : selectedReport.status === 'dismissed' ? '#F1F5F9' : '#FEF3C7',
                  color: selectedReport.status === 'verified' ? '#991B1B' : selectedReport.status === 'dismissed' ? '#64748B' : '#92400E'
                }}>{(selectedReport.status || 'pending_review').replace(/_/g, ' ')}</span>
              </div>
              {selectedReport.assignmentName && <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Assignment</span>
                <span style={{ fontWeight: 600 }}>{selectedReport.assignmentName}</span>
              </div>}
              {selectedReport.siteName && <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B', fontWeight: 600 }}>Site</span>
                <span style={{ fontWeight: 600 }}>{selectedReport.siteName}</span>
              </div>}
            </div>

            {/* Description */}
            {selectedReport.description && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
                <strong>Description:</strong> {selectedReport.description}
              </div>
            )}

            {/* GPS Info */}
            {(selectedReport.latitude || selectedReport.previousLatitude) && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#065F46', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} /> GPS Information
                </div>
                {selectedReport.latitude && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748B' }}>Current Location</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedReport.latitude?.toFixed(6)}, {selectedReport.longitude?.toFixed(6)}</span>
                </div>}
                {selectedReport.previousLatitude && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748B' }}>Previous Location</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedReport.previousLatitude?.toFixed(6)}, {selectedReport.previousLongitude?.toFixed(6)}</span>
                </div>}
                {selectedReport.locationAccuracy != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>GPS Accuracy</span>
                  <span>±{Math.round(selectedReport.locationAccuracy)}m</span>
                </div>}
              </div>
            )}

            {/* Device Info */}
            {selectedReport.deviceInformation && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: 8 }}>Device Information</div>
                {selectedReport.deviceInformation.model && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748B' }}>Model</span>
                  <span>{selectedReport.deviceInformation.model}</span>
                </div>}
                {selectedReport.deviceInformation.ipAddress && <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>IP Address</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{selectedReport.deviceInformation.ipAddress}</span>
                </div>}
              </div>
            )}

            {/* Reviewed Info */}
            {selectedReport.reviewedBy && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: '#1E40AF' }}>
                Reviewed by <strong>{selectedReport.reviewedBy}</strong> · {selectedReport.reviewedAt ? new Date(selectedReport.reviewedAt).toLocaleString() : '—'}
                {selectedReport.adminNotes && <div style={{ marginTop: 6, color: '#334155' }}><strong>Notes:</strong> {selectedReport.adminNotes}</div>}
              </div>
            )}

            {/* Admin Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Admin Notes <span style={{ color: '#DC2626' }}>*</span></label>
              <textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="Required for Confirm Fraud or Dismiss. Describe your findings..."
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  disabled={submitting || !adminNotes.trim()}
                  onClick={() => handleUpdateStatus(selectedReport.id, 'verified', adminNotes)}
                  style={{ padding: '10px', backgroundColor: !adminNotes.trim() ? '#FCA5A5' : '#DC2626', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: !adminNotes.trim() ? 'not-allowed' : 'pointer', fontSize: 13 }}
                >
                  ✓ Confirm Fraud
                </button>
                <button
                  disabled={submitting || !adminNotes.trim()}
                  onClick={() => handleUpdateStatus(selectedReport.id, 'dismissed', adminNotes)}
                  style={{ padding: '10px', backgroundColor: !adminNotes.trim() ? '#E2E8F0' : '#64748B', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: !adminNotes.trim() ? 'not-allowed' : 'pointer', fontSize: 13 }}
                >
                  ✗ Dismiss
                </button>
              </div>
              <button
                disabled={submitting}
                onClick={() => handleUpdateStatus(selectedReport.id, 'under_review', adminNotes)}
                style={{ padding: '10px', backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: 13 }}
              >
                🔄 Mark Under Review
              </button>
            </div>
            {!adminNotes.trim() && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 8, textAlign: 'center' }}>Admin notes are required to Confirm Fraud or Dismiss.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { backgroundColor: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0' };
const modalOverlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' };
const modalBox = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
