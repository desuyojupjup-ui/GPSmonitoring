import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { db, collection, onSnapshot, query, orderBy, limit, updateDoc, doc, deleteDoc, addDoc, serverTimestamp } from '../firebase';
import { Search, ShieldAlert, AlertTriangle, CheckCircle, ArrowUpRight, Filter, Eye, Trash2, Activity, TrendingUp, Zap, BrainCircuit, ShieldX, Gauge, Sliders, CheckSquare } from 'lucide-react';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ComposedChart, Line } from 'recharts';

const formatAnomalyTimestamp = (ts) => {
  if (!ts) return '—';
  if (ts?.toDate && typeof ts.toDate === 'function') {
    try { return ts.toDate().toLocaleString(); } catch (_) {}
  }
  if (typeof ts?.seconds === 'number') {
    return new Date(ts.seconds * 1000).toLocaleString();
  }
  if (typeof ts === 'number') {
    return new Date(ts).toLocaleString();
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const getTsMillis = (ts) => {
  if (!ts) return 0;
  if (ts?.toDate && typeof ts.toDate === 'function') {
    try { return ts.toDate().getTime(); } catch (_) {}
  }
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

// Custom Tooltip for Semi-Circle Threat Gauge
const CustomGaugeTooltip = ({ active, payload }) => {
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
          {data.name}: <strong style={{ color: '#0F172A' }}>{data.value} alerts</strong>
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Horizontal Bar Chart
const CustomHBarTooltip = ({ active, payload }) => {
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
        <div style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color || '#F59E0B' }}></span>
          {data.payload.type}: <strong style={{ color: '#0F172A' }}>{data.value} detections</strong>
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Combo Bar + Line Chart
const CustomComboTooltip = ({ active, payload }) => {
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
        <div style={{ color: '#64748B', fontSize: '11px', fontWeight: '700' }}>{payload[0].payload.time}</div>
        {payload.map((item, idx) => (
          <div key={idx} style={{ color: item.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }}></span>
            {item.name}: <strong style={{ color: '#0F172A' }}>{item.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnomalyList() {
  const location = useLocation();
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);

  // Auto-select anomaly if passed from dashboard modal
  useEffect(() => {
    const targetId = location.state?.selectedAnomalyId || location.state?.anomalyId;
    if (targetId && anomalies.length > 0) {
      const match = anomalies.find(a => a.id === targetId);
      if (match) {
        setSelectedAnomaly(match);
      }
    }
  }, [location.state, anomalies]);

  // Pagination & Bulk Select state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    setLoading(true);
    let unsubAi = () => {};
    let unsubLogs = () => {};

    let aiItems = [];
    let logItems = [];

    const mergeAndSet = () => {
      const mergedMap = new Map();

      // Priority 1: ai_analysis records from mobile APK
      aiItems.forEach(item => {
        mergedMap.set(item.id, {
          ...item,
          confidence: item.confidence || '94%',
          severity: item.severity === 'Critical' ? 'High' : (item.severity || 'Medium'),
          type: item.type || item.eventType || 'Security Anomaly',
          status: item.status || 'Active',
          sourceCollection: 'ai_analysis',
        });
      });

      // Priority 2: ActivityLogs where type is Security Anomaly / Anomaly
      logItems.forEach(log => {
        const id = log.anomalyId || log.id;
        if (!mergedMap.has(id)) {
          mergedMap.set(id, {
            id,
            employeeName: log.employeeName || 'Field Employee',
            employeeId: log.employeeId || null,
            employeeEmail: log.employeeEmail || null,
            type: log.title?.replace('AI Anomaly: ', '') || log.type || 'Security Anomaly',
            severity: log.severity === 'Critical' ? 'High' : (log.severity || 'Medium'),
            confidence: '92%',
            status: log.status || 'Active',
            description: log.description || log.message || '',
            location: log.location || 'Field Site',
            latitude: log.latitude || null,
            longitude: log.longitude || null,
            timestamp: log.timestamp || log.createdAt,
            sourceCollection: 'ActivityLogs',
          });
        }
      });

      const list = Array.from(mergedMap.values());
      list.sort((a, b) => getTsMillis(b.timestamp || b.createdAt) - getTsMillis(a.timestamp || a.createdAt));
      setAnomalies(list);
      setLoading(false);
    };

    try {
      unsubAi = onSnapshot(collection(db, 'ai_analysis'), (snapshot) => {
        aiItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      }, (err) => {
        console.warn('ai_analysis listener err:', err);
        setLoading(false);
      });

      unsubLogs = onSnapshot(collection(db, 'ActivityLogs'), (snapshot) => {
        logItems = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.type === 'Security Anomaly' || d.type === 'Anomaly');
        mergeAndSet();
      }, () => {});
    } catch (e) {
      console.warn('Anomaly listener init err:', e);
      setLoading(false);
    }

    return () => {
      unsubAi();
      unsubLogs();
    };
  }, []);

  const handleAction = async (id, newStatus) => {
    try {
      const targetItem = anomalies.find(a => a.id === id) || selectedAnomaly;
      const isFromActivityLogs = targetItem?.sourceCollection === 'ActivityLogs';

      if (isFromActivityLogs) {
        try {
          await updateDoc(doc(db, 'ActivityLogs', id), { status: newStatus });
        } catch (_) {}
      } else {
        await updateDoc(doc(db, 'ai_analysis', id), { status: newStatus });
      }

      // Keep matching notification in sync
      if (newStatus === 'Resolved' || newStatus === 'Dismissed') {
        updateDoc(doc(db, 'notifications', `anomaly_${id}`), { status: 'Read', read: true, resolutionStatus: newStatus }).catch(() => {});
        window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
      }

      // If escalated to fraud, also create a record in fraud_reports collection
      if (newStatus === 'Escalated to Fraud' && targetItem) {
        await addDoc(collection(db, 'fraud_reports'), {
          employeeId: targetItem.employeeId || null,
          employeeName: targetItem.employeeName || 'Field Employee',
          employeeEmail: targetItem.employeeEmail || null,
          violationType: targetItem.type || 'Security Anomaly',
          severity: targetItem.severity || 'High',
          status: 'pending_review',
          description: targetItem.description || 'Escalated from AI Anomaly Detection Center',
          latitude: targetItem.latitude || null,
          longitude: targetItem.longitude || null,
          anomalyId: id,
          resolved: false,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
        showToast('warning', 'Escalated to Fraud', 'Incident escalated to Fraud & Security.');
      } else {
        showToast('success', 'Status Updated', `Anomaly marked as ${newStatus}.`);
      }
    } catch (e) {
      console.warn('Firestore update fallback:', e);
      showToast('error', 'Update Failed', e?.message || 'Could not update status');
    }
    setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    if (selectedAnomaly && selectedAnomaly.id === id) {
      setSelectedAnomaly(prev => ({ ...prev, status: newStatus }));
    }
  };

  const filtered = anomalies.filter(a => {
    const nameMatch = (a.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const typeMatch = (a.type || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSearch = nameMatch || typeMatch;
    const matchesSeverity = severityFilter === 'All' || a.severity === severityFilter;
    return matchesSearch && matchesSeverity;
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
      `Delete ${selectedIds.length} Selected Anomalies?`,
      `Are you sure you want to remove ${selectedIds.length} anomaly record(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedIds.map(async id => {
          const item = anomalies.find(a => a.id === id);
          deleteDoc(doc(db, 'notifications', `anomaly_${id}`)).catch(() => {});
          if (item?.sourceCollection === 'ActivityLogs') {
            return deleteDoc(doc(db, 'ActivityLogs', id)).catch(() => {});
          }
          return deleteDoc(doc(db, 'ai_analysis', id)).catch(() => {});
        }));
        window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
        showToast('success', 'Bulk Delete Successful', `${selectedIds.length} anomaly record(s) deleted.`);
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('error', 'Bulk Delete Failed', err.message || 'Error deleting selected anomaly records.');
      }
    }
  };

  const totalAnomalies = anomalies.length;
  const highRiskCount = anomalies.filter(a => a.severity === 'High').length;
  const medRiskCount = anomalies.filter(a => a.severity === 'Medium').length;
  const lowRiskCount = anomalies.filter(a => a.severity === 'Low').length;
  
  const activeCount = anomalies.filter(a => a.status === 'Active' || a.status === 'Open').length;
  const resolvedCount = anomalies.filter(a => a.status === 'Resolved' || a.status === 'Dismissed').length;

  // UNIQUE CHART 1: Semi-Circle Threat Gauge (180deg to 0deg Pie)
  const totalBase = Math.max(1, totalAnomalies);
  const highVal = highRiskCount;
  const medVal = medRiskCount;
  const lowVal = lowRiskCount;

  const gaugeData = [
    { name: 'Low Threat', value: lowVal, color: '#10B981' },
    { name: 'Medium Threat', value: medVal, color: '#F59E0B' },
    { name: 'High Threat', value: highVal, color: '#EF4444' },
  ];
  const threatScore = totalAnomalies > 0 ? Math.min(99, Math.round(((highVal * 3 + medVal * 1.5) / (totalBase * 3)) * 100)) : 0;

  // UNIQUE CHART 2: Horizontal Bar Chart for Top Anomaly Types
  const catVelocity = anomalies.filter(a => (a.type || '').toLowerCase().includes('velocity') || (a.type || '').toLowerCase().includes('speed')).length;
  const catGeofence = anomalies.filter(a => (a.type || '').toLowerCase().includes('geofence') || (a.type || '').toLowerCase().includes('boundary')).length;
  const catFace = anomalies.filter(a => (a.type || '').toLowerCase().includes('face') || (a.type || '').toLowerCase().includes('biometric')).length;
  const catAttendance = anomalies.filter(a => (a.type || '').toLowerCase().includes('attendance') || (a.type || '').toLowerCase().includes('shift') || (a.type || '').toLowerCase().includes('check-in') || (a.type || '').toLowerCase().includes('check-out')).length;
  const catInactivity = anomalies.filter(a => (a.type || '').toLowerCase().includes('inactivity') || (a.type || '').toLowerCase().includes('idle')).length;

  const horizontalBarData = [
    { type: 'Velocity', count: catVelocity, color: '#EF4444' },
    { type: 'Geofence', count: catGeofence, color: '#F59E0B' },
    { type: 'Shift Schedule', count: catAttendance, color: '#EC4899' },
    { type: 'Biometric', count: catFace, color: '#6366F1' },
    { type: 'Idle Time', count: catInactivity, color: '#3B82F6' },
  ];

  // UNIQUE CHART 3: Real hourly timeline or empty timeline
  const hourMap = {};
  anomalies.forEach(a => {
    const rawTs = a.timestamp || a.createdAt;
    let ts = new Date(0);
    if (rawTs?.toDate && typeof rawTs.toDate === 'function') {
      try { ts = rawTs.toDate(); } catch (_) {}
    } else if (rawTs?.seconds) {
      ts = new Date(rawTs.seconds * 1000);
    } else if (rawTs) {
      ts = new Date(rawTs);
    }
    const h = isNaN(ts.getTime()) ? 0 : ts.getHours();
    const label = `${String(h).padStart(2,'0')}:00`;
    if (!hourMap[label]) hourMap[label] = { Flagged: 0, Resolved: 0 };
    if (a.status === 'Resolved' || a.status === 'Dismissed') hourMap[label].Resolved++;
    else hourMap[label].Flagged++;
  });
  const comboTimelineData = Object.entries(hourMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, val]) => ({ time, Flagged: val.Flagged, Resolved: val.Resolved }));
  if (comboTimelineData.length === 0) comboTimelineData.push({ time: 'No Data', Flagged: 0, Resolved: 0 });

  return (
    <div className="security-page-container">
      
      {/* Top KPI Cards */}
      <div className="security-kpi-grid">
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>TOTAL ANOMALIES</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={18} color="#4F46E5" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalAnomalies}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>HIGH SEVERITY ALERTS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={18} color="#EF4444" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#EF4444', marginTop: '8px' }}>{highRiskCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>OPEN / ACTIVE</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>{activeCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>RESOLVED / DISMISSED</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#10B981', marginTop: '8px' }}>{resolvedCount}</div>
        </div>
      </div>

      {/* Main Content Layout: Responsive Split (Stacks smoothly on smaller screens) */}
      <div className="security-responsive-layout">
        
        {/* LEFT COLUMN: Controls & Interactive Datatable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          
          {/* Search & Filter Controls */}
          <div className="security-filter-bar">
            <div className="security-filter-search">
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search employee or anomaly type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '38px', paddingRight: '12px', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white' }}
              />
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ height: '40px', padding: '0 16px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              <option value="All">All Severities</option>
              <option value="High">High Severity</option>
              <option value="Medium">Medium Severity</option>
              <option value="Low">Low Severity</option>
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
          <div className="security-table-card">
            <table className="security-fluid-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                    />
                  </th>
                  <th>Employee</th>
                  <th>Anomaly Type</th>
                  <th>Severity</th>
                  <th className="security-col-optional-mobile">Confidence</th>
                  <th>Status</th>
                  <th className="security-col-optional-tablet">Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentPageItems.map(item => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr key={item.id} style={{ background: isSelected ? '#EFF6FF' : 'transparent' }}>
                      <td style={{ width: 36, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(item.id)}
                          style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                        />
                      </td>
                      <td style={{ fontWeight: '600', color: '#0F172A' }}>
                        <div>{item.employeeName || 'Field Employee'}</div>
                      </td>
                      <td style={{ color: '#1F2937', fontWeight: '500' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{item.type || 'Velocity Discrepancy'}</span>
                          {(item.type?.toLowerCase().includes('geofence') || item.eventType === 'UNAUTHORIZED_LOCATION') && (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#5B21B6', backgroundColor: '#EDE9FE', padding: '1px 5px', borderRadius: '4px', border: '1px solid #DDD6FE' }}>
                              🏢 Fixed Site
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                          backgroundColor: item.severity === 'High' ? '#FEE2E2' : item.severity === 'Medium' ? '#FEF3C7' : '#DBEAFE',
                          color: item.severity === 'High' ? '#991B1B' : item.severity === 'Medium' ? '#92400E' : '#1E40AF',
                          display: 'inline-block'
                        }}>
                          {item.severity || 'Medium'}
                        </span>
                      </td>
                      <td className="security-col-optional-mobile" style={{ fontWeight: '700', color: '#4F46E5' }}>
                        {item.confidence || '92%'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: item.status === 'Resolved' ? '#10B981' : item.status === 'Dismissed' ? '#64748B' : item.employeeResponse ? '#2563EB' : '#EF4444' }}>
                            {item.status || 'Active'}
                          </span>
                          {item.employeeResponse && (
                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#1E40AF', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '1px 4px', width: 'fit-content' }}>
                              💬 Responded
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="security-col-optional-tablet" style={{ color: '#64748B' }}>
                        <div style={{ fontWeight: '600', color: '#334155', fontSize: '12px' }}>{new Date(item.timestamp || item.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>{new Date(item.timestamp || item.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setSelectedAnomaly(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
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
                      </td>
                    </tr>
                  );
                })}

                {/* Empty Filler Rows */}
                {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                  <tr key={`empty-row-${idx}`} style={{ height: 38, borderBottom: '1px dashed #F8FAFC' }}>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11, textAlign: 'center' }}>—</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td className="security-col-optional-mobile" style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td className="security-col-optional-tablet" style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Datatable Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderTop: '1px solid #F1F5F9',
              background: '#FFFFFF',
              flexWrap: 'wrap',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
                  Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B', fontWeight: 500 }}>
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#0F172A', background: '#F8FAFC', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: safePage <= 1 ? '#F8FAFC' : '#FFFFFF', color: safePage <= 1 ? '#94A3B8' : '#334155', fontSize: 11, fontWeight: 600, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  Prev
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: 'none',
                      background: safePage === p ? '#1E5ADB' : 'transparent',
                      color: safePage === p ? '#FFFFFF' : '#334155',
                      fontSize: 11,
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
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: safePage >= totalPages ? '#F8FAFC' : '#FFFFFF', color: safePage >= totalPages ? '#94A3B8' : '#334155', fontSize: 11, fontWeight: 600, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 3 DISTINCT ANOMALY TELEMETRY CHARTS SIDEBAR */}
        <div className="security-sidebar-card">
          {/* Sidebar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BrainCircuit size={18} color="#EF4444" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>AI Threat Intelligence</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Anomaly Telemetry Models</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>LIVE AI</span>
            </div>
          </div>

          {/* DISTINCT CHART 1: Semi-Circle Threat Level Gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Gauge size={15} color="#EF4444" /> System Threat Level Gauge
              </span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: threatScore > 50 ? '#EF4444' : '#F59E0B' }}>
                {threatScore > 50 ? 'HIGH RISK' : 'MODERATE'}
              </span>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomGaugeTooltip />} />
                  <Pie
                    data={gaugeData}
                    cx="50%"
                    cy="75%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {gaugeData.map((entry, index) => (
                      <Cell key={`gauge-cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute',
                top: '55%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{threatScore}<span style={{ fontSize: 13, color: '#94A3B8' }}>/100</span></div>
                <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '700', marginTop: 4 }}>THREAT INDEX</div>
              </div>
            </div>

            {/* Gauge Legend Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: '#F8FAFC', padding: '8px 10px', borderRadius: '10px' }}>
              {gaugeData.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#334155', fontWeight: '600' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span>{item.name.split(' ')[0]}: <strong>{item.value}</strong></span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* DISTINCT CHART 2: Horizontal Bar Chart for Top Anomaly Types */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={15} color="#F59E0B" /> Top Anomaly Detections
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#F59E0B' }}>By Model</span>
            </div>

            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={horizontalBarData} margin={{ top: 5, right: 15, left: 15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={65} />
                  <Tooltip content={<CustomHBarTooltip />} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14}>
                    {horizontalBarData.map((entry, index) => (
                      <Cell key={`hbar-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* DISTINCT CHART 3: Composed Bar + Line Chart (Flagged vs Resolved) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckSquare size={15} color="#10B981" /> Detection vs Resolution Rate
              </span>
              <div style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 700 }}>
                <span style={{ color: '#EF4444' }}>● Flagged</span>
                <span style={{ color: '#10B981' }}>━ Resolved</span>
              </div>
            </div>

            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comboTimelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomComboTooltip />} />
                  <Bar dataKey="Flagged" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={10} />
                  <Line type="monotone" dataKey="Resolved" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: '#10B981' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>

      {/* Action Modal */}
      {selectedAnomaly && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Anomaly Action Center</h3>
              <button onClick={() => setSelectedAnomaly(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748B' }}>✕</button>
            </div>
            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', border: '1px solid #E2E8F0', maxHeight: '380px', overflowY: 'auto' }}>
              <p style={{ margin: 0 }}><strong>Employee:</strong> {selectedAnomaly.employeeName}</p>
              <p style={{ margin: 0 }}>
                <strong>Type:</strong> {selectedAnomaly.type}
                {(selectedAnomaly.type?.toLowerCase().includes('geofence') || selectedAnomaly.eventType === 'UNAUTHORIZED_LOCATION') && (
                  <span style={{ marginLeft: 8, fontSize: '11px', fontWeight: '700', color: '#5B21B6', backgroundColor: '#EDE9FE', padding: '2px 6px', borderRadius: '4px', border: '1px solid #DDD6FE' }}>
                    🏢 Fixed Site Policy (Not applied to field employees)
                  </span>
                )}
              </p>
              <p style={{ margin: 0 }}><strong>Severity:</strong> <span style={{ fontWeight: 700, color: selectedAnomaly.severity === 'High' ? '#EF4444' : '#F59E0B' }}>{selectedAnomaly.severity}</span></p>
              <p style={{ margin: 0 }}><strong>Description:</strong> {selectedAnomaly.description || 'Fast travel speed anomaly detected.'}</p>
              <p style={{ margin: 0 }}><strong>Location:</strong> {selectedAnomaly.location || 'N/A'}</p>
              <p style={{ margin: 0 }}><strong>Status:</strong> {selectedAnomaly.status}</p>

              {/* EMPLOYEE DIRECT RESPONSE SECTION */}
              {selectedAnomaly.employeeResponse ? (
                <div style={{ marginTop: '8px', padding: '12px', backgroundColor: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#1E40AF', fontSize: '13px' }}>💬 Employee Explanation:</span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      {selectedAnomaly.respondedAt ? formatAnomalyTimestamp(selectedAnomaly.respondedAt) : 'Recently submitted'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontStyle: 'italic', color: '#1E293B', fontSize: '13px', lineHeight: 1.45, backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px solid #DBEAFE' }}>
                    "{selectedAnomaly.employeeResponse}"
                  </p>
                  {selectedAnomaly.responseCategory && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>
                      Reason Category: <strong style={{ color: '#1E40AF' }}>{selectedAnomaly.responseCategory}</strong>
                    </div>
                  )}
                  {selectedAnomaly.responsePhoto && (
                    <div style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Attached Proof Photo:</span>
                      <img
                        src={selectedAnomaly.responsePhoto}
                        alt="Employee photo proof"
                        style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '6px', padding: '10px 12px', backgroundColor: '#FFFBEB', borderRadius: '8px', color: '#B45309', fontSize: '12.5px', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⏳</span>
                  <span>Awaiting employee explanation via the Mobile Anomaly Alerts screen.</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedAnomaly.employeeResponse && (
                <button
                  onClick={() => handleAction(selectedAnomaly.id, 'Resolved')}
                  style={{ padding: '10px', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
                >
                  ✓ Accept Explanation & Resolve
                </button>
              )}
              <button
                onClick={() => handleAction(selectedAnomaly.id, 'Acknowledged')}
                style={{ padding: '10px', backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
              >
                Acknowledge Alert
              </button>
              {!selectedAnomaly.employeeResponse && (
                <button
                  onClick={() => handleAction(selectedAnomaly.id, 'Resolved')}
                  style={{ padding: '10px', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Mark as Resolved
                </button>
              )}
              <button
                onClick={() => handleAction(selectedAnomaly.id, 'Escalated to Fraud')}
                style={{ padding: '10px', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
              >
                Escalate to Fraud Report
              </button>
              <button
                onClick={() => handleAction(selectedAnomaly.id, 'Dismissed')}
                style={{ padding: '10px', backgroundColor: '#94A3B8', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
              >
                Dismiss Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { backgroundColor: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0' };
const modalOverlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalBox = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
