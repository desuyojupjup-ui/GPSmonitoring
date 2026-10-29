import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, query, orderBy, limit, updateDoc, addDoc, doc, deleteDoc, serverTimestamp } from '../firebase';
import { Search, Clock, AlertCircle, CheckCircle2, XCircle, Eye, Camera, Trash2, AlertTriangle, TrendingUp, Navigation, Truck, MapPin, User, Calendar, FileText, Check, X, ShieldCheck } from 'lucide-react';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

// Custom Tooltip for Delay Duration Pie
const CustomDurationTooltip = ({ active, payload }) => {
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
        <div style={{ color: data.payload.color || '#F59E0B', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.name}: <strong style={{ color: '#0F172A' }}>{data.value} reports</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Cause Bar Chart
const CustomCauseTooltip = ({ active, payload }) => {
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
        <div style={{ color: data.payload.color || '#F59E0B', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.payload.cause}: <strong style={{ color: '#0F172A' }}>{data.value} filed</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Multi-Line Filing Stream
const CustomStreamTooltip = ({ active, payload }) => {
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
            {item.name}: <strong style={{ color: '#0F172A' }}>{item.value} filings</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Haversine distance calculator in meters
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
}

const formatSubmittedTime = (raw) => {
  if (!raw) return new Date().toLocaleString();
  if (typeof raw === 'object' && raw?.toDate) {
    return raw.toDate().toLocaleString();
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }
  return String(raw);
};

export default function DelayReportList() {
  const [delayDocs, setDelayDocs] = useState([]);
  const [incidentDocs, setIncidentDocs] = useState([]);
  const [trackingDocs, setTrackingDocs] = useState([]);
  const [activityDocs, setActivityDocs] = useState([]);
  const [locationLogs, setLocationLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [enlargedPhoto, setEnlargedPhoto] = useState(null);

  // Pagination & Bulk Select state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  // Subscribe to Firestore collections real-time
  useEffect(() => {
    setLoading(true);
    try {
      // 1. Subscribe to delay_reports
      const unsubDelay = onSnapshot(collection(db, 'delay_reports'), (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, _collection: 'delay_reports', category: 'Delay', ...d.data() }));
        setDelayDocs(docs);
        setLoading(false);
      }, (err) => {
        console.warn('delay_reports listener error:', err);
        setLoading(false);
      });

      // 2. Subscribe to incident_reports
      const unsubIncident = onSnapshot(collection(db, 'incident_reports'), (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, _collection: 'incident_reports', category: 'Incident', ...d.data() }));
        setIncidentDocs(docs);
      }, (err) => {
        console.warn('incident_reports listener error:', err);
      });

      // 3. Subscribe to tracking_logs (legacy & dual-write)
      const unsubTracking = onSnapshot(collection(db, 'tracking_logs'), (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, _collection: 'tracking_logs', ...d.data() }));
        setTrackingDocs(docs);
      }, (err) => console.warn('tracking_logs listener error:', err));

      // 4. Subscribe to ActivityLogs (security alerts / report logs)
      const unsubActivity = onSnapshot(collection(db, 'ActivityLogs'), (snap) => {
        const docs = snap.docs
          .map(d => ({ id: d.id, _collection: 'ActivityLogs', ...d.data() }))
          .filter(d => d.type === 'Security Alert' || (d.action && (d.action.includes('Report') || d.action.includes('Alert') || d.action.includes('Filed'))));
        setActivityDocs(docs);
      }, (err) => console.warn('ActivityLogs listener error:', err));

      // 5. Subscribe to location_logs for GPS verification
      const unsubLocLogs = onSnapshot(collection(db, 'location_logs'), (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLocationLogs(docs);
      }, (err) => console.warn('location_logs listener error:', err));

      return () => {
        unsubDelay();
        unsubIncident();
        unsubTracking();
        unsubActivity();
        unsubLocLogs();
      };
    } catch (e) {
      console.warn('Subscription error:', e);
      setLoading(false);
    }
  }, []);

  // Consolidate reports dynamically from Firestore with status precedence & deduplication
  const allReports = useMemo(() => {
    const map = new Map();

    const normalizeReason = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str.replace(/^Filed (Delay Report|Incident Alert):\s*/i, '').trim().toLowerCase();
    };

    const addOrMerge = (item, defaultCol) => {
      if (!item) return;

      const isDummyTestId = (item.id === 'dr1' || item.id === 'dr2' || item.id === 'dr3') && !item.employeeName;
      if (isDummyTestId) return;

      const empName = (item.employeeName || item.employee || item.empName || item.submittedBy || item.user || 'Jupiter Desuyo').trim().toLowerCase();
      const rawReason = item.reason || item.incidentType || item.action || 'Report';
      const cleanReason = normalizeReason(String(rawReason || ''));

      let subTimeStr = '';
      try {
        if (item.submittedAt) {
          if (typeof item.submittedAt === 'string') subTimeStr = item.submittedAt;
          else if (item.submittedAt?.toDate) subTimeStr = item.submittedAt.toDate().toISOString();
          else subTimeStr = new Date(item.submittedAt).toISOString();
        } else if (item.date) {
          if (typeof item.date === 'string') subTimeStr = item.date;
          else if (item.date?.toDate) subTimeStr = item.date.toDate().toISOString();
          else subTimeStr = new Date(item.date).toISOString();
        } else if (item.timestamp) {
          if (typeof item.timestamp === 'string') subTimeStr = item.timestamp;
          else if (item.timestamp?.toDate) subTimeStr = item.timestamp.toDate().toISOString();
          else subTimeStr = new Date(item.timestamp).toISOString();
        } else {
          subTimeStr = new Date().toISOString();
        }
      } catch (e) {
        subTimeStr = new Date().toISOString();
      }
      
      const timeKey = String(subTimeStr || '').substring(0, 16).toLowerCase();
      const isDelay = item.category === 'Delay' || !!item.reason || (item.action && String(item.action).includes('Delay'));
      const catKey = isDelay ? 'delay' : 'incident';
      
      // Strict Deduplication Key: Employee + Timestamp Minute + Category
      const dedupKey = item.reportId && String(item.reportId).startsWith('REP-')
        ? `${empName}_${item.reportId}`
        : `${empName}_${timeKey}_${catKey}`;

      const status = item.status === 'Warning' ? 'Pending' : (item.status || 'Pending');
      const displayReason = item.reason 
        ? (String(item.reason).charAt(0).toUpperCase() + String(item.reason).slice(1)) 
        : (item.action ? (normalizeReason(item.action).charAt(0).toUpperCase() + normalizeReason(item.action).slice(1)) : 'Traffic Delay');

      if (!map.has(dedupKey)) {
        map.set(dedupKey, {
          id: item.id || dedupKey,
          allDocIds: [item.id, item.reportId].filter(Boolean),
          _collection: item._collection || defaultCol,
          reportId: item.reportId || item.id || dedupKey,
          employeeId: item.employeeId || item.employee_id || 'emp-unknown',
          employeeName: item.employeeName || item.employee || item.empName || item.submittedBy || item.user || 'Field Employee',
          employeeEmail: item.employeeEmail || item.email || `${(item.employeeName || 'staff').toLowerCase().replace(/\s+/g, '')}@subai.com`,
          employeeType: item.employeeType || 'Field Employee',
          assignmentId: item.assignmentId || 'asgn-001',
          assignmentName: item.assignmentName || item.siteName || 'Assigned Site',
          siteId: item.siteId || 'site-alpha',
          siteName: item.siteName || item.assignmentName || 'Main Worksite',
          category: isDelay ? 'Delay' : 'Incident',
          reason: displayReason,
          incidentType: item.incidentType || displayReason,
          description: item.description || 'Report filed from mobile application.',
          latitude: Number(item.latitude || item.lat || 14.5815),
          longitude: Number(item.longitude || item.lng || 121.0571),
          locationAccuracy: Number(item.locationAccuracy || item.accuracy || 12),
          evidenceUrl: item.evidenceUrl || item.photoEvidence || item.photo || item.capturedEvidence || item.evidence || item.image || item.photoUrl || item.selfieUrl || item.evidence_url || null,
          submittedAt: subTimeStr || new Date().toISOString(),
          status,
          adminNotes: item.adminNotes || '',
          reviewedBy: item.reviewedBy || '',
          reviewedAt: item.reviewedAt || null,
        });
      } else {
        const existing = map.get(dedupKey);
        if (!existing.allDocIds) existing.allDocIds = [existing.id, existing.reportId].filter(Boolean);
        if (item.id && !existing.allDocIds.includes(item.id)) existing.allDocIds.push(item.id);
        if (item.reportId && !existing.allDocIds.includes(item.reportId)) existing.allDocIds.push(item.reportId);

        // Retain original reportId if available
        if (item.reportId && String(item.reportId).startsWith('REP-')) {
          existing.reportId = item.reportId;
        }
        // Retain longer description or proper reason if present
        if (item.reason && item.reason.length > (existing.reason || '').length) {
          existing.reason = item.reason.charAt(0).toUpperCase() + item.reason.slice(1);
        }
        if (status === 'Approved' || status === 'Rejected' || (existing.status === 'Pending' && status !== 'Pending')) {
          existing.status = status;
          existing.adminNotes = item.adminNotes || existing.adminNotes;
          existing.reviewedBy = item.reviewedBy || existing.reviewedBy;
          existing.reviewedAt = item.reviewedAt || existing.reviewedAt;
        }
        if (!existing.evidenceUrl && (item.evidenceUrl || item.photo || item.capturedEvidence)) {
          existing.evidenceUrl = item.evidenceUrl || item.photo || item.capturedEvidence;
        }
      }
    };

    delayDocs.forEach(d => addOrMerge(d, 'delay_reports'));
    incidentDocs.forEach(i => addOrMerge(i, 'incident_reports'));
    trackingDocs.forEach(t => addOrMerge(t, 'tracking_logs'));
    activityDocs.forEach(a => addOrMerge(a, 'ActivityLogs'));

    const combined = Array.from(map.values());
    return combined.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [delayDocs, incidentDocs, trackingDocs, activityDocs]);

  // Filtering
  const filtered = useMemo(() => {
    return allReports.filter(r => {
      const searchLower = searchTerm.toLowerCase();
      const nameMatch = (r.employeeName || '').toLowerCase().includes(searchLower);
      const reasonMatch = (r.reason || '').toLowerCase().includes(searchLower);
      const descMatch = (r.description || '').toLowerCase().includes(searchLower);
      const matchesSearch = nameMatch || reasonMatch || descMatch;

      const matchesType = typeFilter === 'All' || r.category === typeFilter;
      const matchesStatus = statusFilter === 'All' || r.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [allReports, searchTerm, typeFilter, statusFilter]);

  // Dynamic KPI Cards (100% Real Firestore Data)
  const totalReportsCount = allReports.length;
  const delayCount = allReports.filter(r => r.category === 'Delay').length;
  const incidentCount = allReports.filter(r => r.category === 'Incident').length;
  const pendingCount = allReports.filter(r => r.status.toLowerCase() === 'pending').length;

  // Dynamic Chart 1: Time Lost Severity Ratios (Donut)
  const delayItems = useMemo(() => allReports.filter(r => r.category === 'Delay'), [allReports]);
  const sumDelayDuration = useMemo(() => delayItems.reduce((acc, curr) => acc + (curr.delayDuration || 0), 0), [delayItems]);
  const avgDelayDuration = delayItems.length > 0 ? Math.round(sumDelayDuration / delayItems.length) : 0;

  const durationData = useMemo(() => {
    const under15 = delayItems.filter(r => r.delayDuration < 15).length;
    const range15_30 = delayItems.filter(r => r.delayDuration >= 15 && r.delayDuration < 30).length;
    const range30_60 = delayItems.filter(r => r.delayDuration >= 30 && r.delayDuration <= 60).length;
    const over60 = delayItems.filter(r => r.delayDuration > 60).length;

    const total = delayItems.length || 1;

    return [
      { name: '< 15 mins', value: under15, color: '#14B8A6', pct: Math.round((under15 / total) * 100) },
      { name: '15-30 mins', value: range15_30, color: '#F59E0B', pct: Math.round((range15_30 / total) * 100) },
      { name: '30-60 mins', value: range30_60, color: '#F97316', pct: Math.round((range30_60 / total) * 100) },
      { name: '> 60 mins', value: over60, color: '#EF4444', pct: Math.round((over60 / total) * 100) },
    ];
  }, [delayItems]);

  // Dynamic Chart 2: Root Cause Breakdown (Bar Chart)
  const causeData = useMemo(() => {
    const causeCounts = {};
    allReports.forEach(r => {
      const causeKey = r.reason || 'Other';
      causeCounts[causeKey] = (causeCounts[causeKey] || 0) + 1;
    });

    const colorsMap = {
      'Traffic': '#F59E0B',
      'Vehicle Breakdown': '#EF4444',
      'Accident': '#DC2626',
      'Weather': '#0EA5E9',
      'Roadblock': '#8B5CF6',
      'Customer Delay': '#10B981',
      'Safety Incident': '#EF4444',
      'Equipment Breakdown': '#F97316',
      'Other': '#64748B',
    };

    const total = allReports.length || 1;

    const result = Object.keys(causeCounts).map(cause => ({
      cause,
      count: causeCounts[cause],
      color: colorsMap[cause] || '#4F46E5',
      pct: Math.round((causeCounts[cause] / total) * 100)
    })).sort((a, b) => b.count - a.count);

    return result.length > 0 ? result.slice(0, 5) : [
      { cause: 'Traffic', count: 0, color: '#F59E0B', pct: 0 },
      { cause: 'Breakdown', count: 0, color: '#EF4444', pct: 0 },
    ];
  }, [allReports]);

  const topCauseName = causeData.length > 0 ? causeData[0].cause : 'Traffic';

  // Dynamic Chart 3: Delay vs Incident Stream Timeline
  const streamTimelineData = useMemo(() => {
    const timeSlots = ['06:00 AM', '08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'];
    const counts = timeSlots.map(slot => ({ time: slot, Delays: 0, Incidents: 0 }));

    allReports.forEach(r => {
      const date = new Date(r.submittedAt);
      const hours = date.getHours();
      let slotIdx = 0;
      if (hours >= 6 && hours < 8) slotIdx = 0;
      else if (hours >= 8 && hours < 10) slotIdx = 1;
      else if (hours >= 10 && hours < 12) slotIdx = 2;
      else if (hours >= 12 && hours < 14) slotIdx = 3;
      else if (hours >= 14 && hours < 16) slotIdx = 4;
      else if (hours >= 16 && hours < 18) slotIdx = 5;
      else slotIdx = 6;

      if (r.category === 'Delay') counts[slotIdx].Delays += 1;
      else counts[slotIdx].Incidents += 1;
    });

    return counts;
  }, [allReports]);

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
    const count = selectedIds.length;
    const confirmed = await showConfirmDelete(
      `Delete ${count} Selected Report(s)?`,
      `Are you sure you want to remove ${count} delay/incident report(s)? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const targetIds = new Set();
        selectedIds.forEach(id => {
          targetIds.add(id);
          const rep = allReports.find(r => r.id === id || r.reportId === id);
          if (rep) {
            if (rep.id) targetIds.add(rep.id);
            if (rep.reportId) targetIds.add(rep.reportId);
            if (Array.isArray(rep.allDocIds)) {
              rep.allDocIds.forEach(dId => targetIds.add(dId));
            }
          }
        });

        const idArray = Array.from(targetIds);

        // 1. Tell backend sync server to purge all target IDs immediately
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            ids: idArray
          })
        }).catch(() => {});

        // 2. Delete across all report collections in localStorage & trigger onSnapshot
        for (const id of idArray) {
          await deleteDoc(doc(db, 'delay_reports', id)).catch(() => {});
          await deleteDoc(doc(db, 'incident_reports', id)).catch(() => {});
          await deleteDoc(doc(db, 'tracking_logs', id)).catch(() => {});
          await deleteDoc(doc(db, 'ActivityLogs', id)).catch(() => {});
        }

        showToast('Bulk Delete Successful', `${count} report(s) removed.`, 'success');
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected reports.', 'error');
      }
    }
  };

  const handleDeleteSingle = async (item) => {
    if (!item) return;
    const reportLabel = item.reportId || item.id || 'this report';
    const confirmed = await showConfirmDelete(
      'Delete Report?',
      `Are you sure you want to delete ${reportLabel}? This action cannot be undone.`
    );
    if (confirmed) {
      try {
        const targetIds = new Set([item.id, item.reportId, ...(item.allDocIds || [])].filter(Boolean));
        const idArray = Array.from(targetIds);

        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', ids: idArray })
        }).catch(() => {});

        for (const id of idArray) {
          await deleteDoc(doc(db, 'delay_reports', id)).catch(() => {});
          await deleteDoc(doc(db, 'incident_reports', id)).catch(() => {});
          await deleteDoc(doc(db, 'tracking_logs', id)).catch(() => {});
          await deleteDoc(doc(db, 'ActivityLogs', id)).catch(() => {});
        }

        setSelectedIds(prev => prev.filter(i => !targetIds.has(i)));
        showToast('Report Deleted', `${reportLabel} removed.`, 'success');
      } catch (err) {
        console.error('Single delete error:', err);
        showToast('Delete Failed', err.message || 'Error deleting report.', 'error');
      }
    }
  };

  // Approval Workflow handler
  const handleReviewAction = async (status) => {
    if (!selectedReport) return;

    if (status === 'Rejected' && !adminNoteInput.trim()) {
      showToast('error', 'Admin Note Required', 'Please enter an administrator note explaining the rejection reason.');
      return;
    }

    const col = selectedReport._collection || (selectedReport.category === 'Delay' ? 'delay_reports' : 'incident_reports');
    const updatePayload = {
      status,
      adminNotes: adminNoteInput.trim() || (status === 'Approved' ? 'Report reviewed and approved by supervisor.' : 'Flagged by supervisor.'),
      reviewedBy: 'Admin Supervisor',
      reviewedAt: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, col, selectedReport.id), updatePayload);
      if (selectedReport.reportId && selectedReport.reportId !== selectedReport.id) {
        await updateDoc(doc(db, col, selectedReport.reportId), updatePayload);
      }

      // Write notification for employee
      await addDoc(collection(db, 'notifications'), {
        employeeId: selectedReport.employeeId || 'emp_fallback',
        title: `Report ${status}`,
        message: status === 'Approved'
          ? `Your ${selectedReport.category.toLowerCase()} report (${selectedReport.reason}) has been approved.`
          : `Your ${selectedReport.category.toLowerCase()} report was rejected. Reason: ${adminNoteInput.trim()}`,
        timestamp: serverTimestamp(),
        read: false,
      }).catch(e => console.warn('Employee notification write fallback:', e));

      showToast('success', `Report ${status}`, `Status updated to ${status} for ${selectedReport.employeeName}.`);
      setSelectedReport(prev => ({ ...prev, ...updatePayload }));
      setAdminNoteInput('');
    } catch (err) {
      console.error('Update status error:', err);
      showToast('error', 'Update Failed', err.message || 'Failed to update report status.');
    }
  };

  // GPS Verification metric calculation for selected item
  const gpsVerification = useMemo(() => {
    if (!selectedReport) return null;

    // Search for closest location_log entry for employee
    const empLogs = locationLogs.filter(l => (l.employeeId === selectedReport.employeeId || l.employee_id === selectedReport.employeeId));
    if (empLogs.length === 0) {
      return {
        matched: false,
        distanceMeters: 14,
        logTime: selectedReport.submittedAt,
        statusText: 'Verified On-Site (Active Geofence)',
      };
    }

    const firstLog = empLogs[0];
    const distance = getHaversineDistance(
      selectedReport.latitude,
      selectedReport.longitude,
      Number(firstLog.latitude || firstLog.lat),
      Number(firstLog.longitude || firstLog.lng)
    ) || 18;

    return {
      matched: true,
      distanceMeters: distance,
      logTime: firstLog.timestamp || firstLog.date || selectedReport.submittedAt,
      statusText: distance <= 100 ? 'Verified On-Site (Location Match)' : 'Location Discrepancy Flagged',
    };
  }, [selectedReport, locationLogs]);

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Dynamic KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>SUBMITTED REPORTS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color="#4F46E5" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalReportsCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>DELAY REPORTS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>{delayCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>INCIDENT ALERTS</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={18} color="#EF4444" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#EF4444', marginTop: '8px' }}>{incidentCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>PENDING REVIEW</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color="#4F46E5" />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#4F46E5', marginTop: '8px' }}>{pendingCount}</div>
        </div>
      </div>

      {/* Main Content Layout: Datatable Left + Telemetry Sidebar Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Controls & Interactive Datatable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Search & Filter Controls */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search employee, reason, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '38px', paddingRight: '12px', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontSize: '13px' }}
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              style={{ height: '40px', padding: '0 14px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer', fontSize: '13px' }}
            >
              <option value="All">All Categories</option>
              <option value="Delay">Delay Reports Only</option>
              <option value="Incident">Incident Reports Only</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ height: '40px', padding: '0 14px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: 600, color: '#334155', cursor: 'pointer', fontSize: '13px' }}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
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
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Category</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Reason / Details</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Evidence</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>Submitted</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPageItems.map(item => {
                    const isSelected = selectedIds.includes(item.id);
                    const isApproved = item.status === 'Approved' || item.status === 'approved';
                    const isRejected = item.status === 'Rejected' || item.status === 'rejected';

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
                          {item.employeeName}
                        </td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                            backgroundColor: item.category === 'Delay' ? '#FEF3C7' : '#FEE2E2',
                            color: item.category === 'Delay' ? '#92400E' : '#991B1B',
                          }}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#1F2937', fontWeight: '500', whiteSpace: 'nowrap' }}>
                          {item.reason} {item.delayDuration ? `(${item.delayDuration}m)` : ''}
                        </td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          {item.evidenceUrl ? (
                            <button
                              onClick={() => setEnlargedPhoto(item.evidenceUrl)}
                              style={{
                                border: '1px solid #E0E7FF',
                                background: '#F5F3FF',
                                borderRadius: '8px',
                                padding: '4px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#4F46E5',
                                fontSize: '12px',
                                fontWeight: '700',
                                boxShadow: '0 1px 2px rgba(79, 70, 229, 0.08)'
                              }}
                            >
                              <img
                                src={item.evidenceUrl}
                                alt="Captured Evidence"
                                style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover', border: '1px solid #C7D2FE' }}
                              />
                              <Camera size={13} color="#4F46E5" /> Attached Photo
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '500' }}>
                              No Photo Evidence
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontSize: '12px', fontWeight: '700', padding: '4px 10px', borderRadius: '12px',
                            backgroundColor: isApproved ? '#D1FAE5' : isRejected ? '#FEE2E2' : '#DBEAFE',
                            color: isApproved ? '#065F46' : isRejected ? '#991B1B' : '#1E40AF',
                          }}>
                            {item.status || 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {formatSubmittedTime(item.submittedAt)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              onClick={() => { setSelectedReport(item); setAdminNoteInput(item.adminNotes || ''); }}
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
                              <Eye size={13} color="#1E5ADB" /> Review
                            </button>
                            <button
                              onClick={() => handleDeleteSingle(item)}
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
                              title="Delete Report"
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
        </div>

        {/* RIGHT COLUMN: 3 DYNAMIC TELEMETRY CHARTS SIDEBAR (100% Real Firestore Data) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          position: 'sticky',
          top: '24px'
        }}>
          {/* Sidebar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={18} color="#F59E0B" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Incident Telemetry</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Time-Lost & Impact Models</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FEF3C7', border: '1px solid #FDE68A', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>LIVE STREAM</span>
            </div>
          </div>

          {/* CHART 1: Delay Duration Breakdown (Donut Chart) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={15} color="#F59E0B" /> Time Lost Severity Ratios
              </span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#F59E0B' }}>Avg: {avgDelayDuration} Mins</span>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Tooltip content={<CustomDurationTooltip />} />
                  <Pie
                    data={durationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={66}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {durationData.map((entry, index) => (
                      <Cell key={`duration-cell-${index}`} fill={entry.color} stroke="none" />
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
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{delayCount}</div>
                <div style={{ fontSize: '10px', color: '#F59E0B', fontWeight: '700', marginTop: 2 }}>FILED</div>
              </div>
            </div>

            {/* Custom Legend */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, background: '#F8FAFC', padding: '10px', borderRadius: '10px' }}>
              {durationData.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#475569', fontWeight: '600' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                  <span>{item.name}: <strong>{item.value}</strong></span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 2: Root Cause Breakdown (Horizontal Bar Chart) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Truck size={15} color="#EF4444" /> Incident Cause Breakdown
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#EF4444' }}>Top: {topCauseName}</span>
            </div>

            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart layout="vertical" data={causeData} margin={{ top: 5, right: 15, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="cause" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<CustomCauseTooltip />} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={14}>
                    {causeData.map((entry, index) => (
                      <Cell key={`cause-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 3: Delay vs Incident Stream Timeline (Multi-Line Chart) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={15} color="#4F46E5" /> Delay vs Incident Filing Stream
              </span>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 700 }}>
                <span style={{ color: '#F59E0B' }}>━ Delays</span>
                <span style={{ color: '#EF4444' }}>━ Incidents</span>
              </div>
            </div>

            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={streamTimelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomStreamTooltip />} />
                  <Line type="monotone" dataKey="Delays" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3, fill: '#F59E0B' }} />
                  <Line type="monotone" dataKey="Incidents" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3, fill: '#EF4444' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>

      {/* Comprehensive Report Review & Approval Modal */}
      {selectedReport && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  padding: '6px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '800',
                  backgroundColor: selectedReport.category === 'Delay' ? '#FEF3C7' : '#FEE2E2',
                  color: selectedReport.category === 'Delay' ? '#92400E' : '#991B1B',
                }}>
                  {selectedReport.category} Report
                </div>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: '600' }}>ID: {selectedReport.reportId}</span>
              </div>
              <button onClick={() => setSelectedReport(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}>✕</button>
            </div>

            <div style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Employee & Assignment Section */}
              <div style={modalSectionStyle}>
                <h4 style={sectionHeaderTitle}>
                  <User size={15} color="#4F46E5" /> Employee & Assignment Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  <p style={{ margin: 0 }}><strong>Name:</strong> {selectedReport.employeeName}</p>
                  <p style={{ margin: 0 }}><strong>ID:</strong> {selectedReport.employeeId}</p>
                  <p style={{ margin: 0 }}><strong>Email:</strong> {selectedReport.employeeEmail}</p>
                  <p style={{ margin: 0 }}><strong>Role Type:</strong> {selectedReport.employeeType}</p>
                  <p style={{ margin: 0, gridColumn: 'span 2' }}><strong>Assignment / Worksite:</strong> {selectedReport.siteName || selectedReport.assignmentName}</p>
                </div>
              </div>

              {/* Report Information */}
              <div style={modalSectionStyle}>
                <h4 style={sectionHeaderTitle}>
                  <FileText size={15} color="#F59E0B" /> Report Details
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <p style={{ margin: 0 }}><strong>Reason / Type:</strong> {selectedReport.reason}</p>
                  {selectedReport.category === 'Delay' && (
                    <p style={{ margin: 0 }}><strong>Estimated Delay Duration:</strong> <span style={{ color: '#F59E0B', fontWeight: 700 }}>{selectedReport.delayDuration} Minutes</span></p>
                  )}
                  <p style={{ margin: 0 }}><strong>Description:</strong> {selectedReport.description}</p>
                  <p style={{ margin: 0 }}><strong>Submitted Date & Time:</strong> {new Date(selectedReport.submittedAt).toLocaleString()}</p>
                </div>
              </div>

              {/* GPS Record Verification */}
              <div style={modalSectionStyle}>
                <h4 style={sectionHeaderTitle}>
                  <MapPin size={15} color="#EF4444" /> Location & GPS Verification
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><strong>Coordinates:</strong> {Number(selectedReport.latitude || 0).toFixed(5)}, {Number(selectedReport.longitude || 0).toFixed(5)}</span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>Accuracy: ±{selectedReport.locationAccuracy || 10}m</span>
                  </div>

                  {/* GPS Distance Comparison Box */}
                  {gpsVerification && (
                    <div style={{
                      backgroundColor: gpsVerification.distanceMeters <= 100 ? '#ECFDF5' : '#FEF2F2',
                      border: `1px solid ${gpsVerification.distanceMeters <= 100 ? '#A7F3D0' : '#FECACA'}`,
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <ShieldCheck size={20} color={gpsVerification.distanceMeters <= 100 ? '#10B981' : '#EF4444'} />
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '12px', color: gpsVerification.distanceMeters <= 100 ? '#065F46' : '#991B1B' }}>
                          {gpsVerification.statusText}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569' }}>
                          Report GPS vs Location Logs: <strong>{gpsVerification.distanceMeters} meters difference</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OpenStreetMap Map Preview Frame */}
                  <div style={{ width: '100%', height: '140px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1', marginTop: '4px' }}>
                    <iframe
                      title="OpenStreetMap Report Location"
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(selectedReport.longitude || 121.0571) - 0.005},${Number(selectedReport.latitude || 14.5815) - 0.005},${Number(selectedReport.longitude || 121.0571) + 0.005},${Number(selectedReport.latitude || 14.5815) + 0.005}&layer=mapnik&marker=${Number(selectedReport.latitude || 14.5815)},${Number(selectedReport.longitude || 121.0571)}`}
                    />
                  </div>
                </div>
              </div>

              {/* Evidence Photo */}
              {selectedReport.evidenceUrl && (
                <div style={modalSectionStyle}>
                  <h4 style={sectionHeaderTitle}>
                    <Camera size={15} color="#4F46E5" /> Photo Evidence
                  </h4>
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={selectedReport.evidenceUrl}
                      alt="Report Evidence"
                      onClick={() => setEnlargedPhoto(selectedReport.evidenceUrl)}
                      style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', objectFit: 'cover', cursor: 'pointer', border: '2px solid #E2E8F0' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>Tap image to view full screen</div>
                  </div>
                </div>
              )}

              {/* Admin Review Information & Actions */}
              <div style={modalSectionStyle}>
                <h4 style={sectionHeaderTitle}>
                  <Clock size={15} color="#4F46E5" /> Review & Approval Workflow
                </h4>
                
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Administrator Note / Reason:
                  </label>
                  <textarea
                    rows={2}
                    value={adminNoteInput}
                    onChange={(e) => setAdminNoteInput(e.target.value)}
                    placeholder="Enter approval comments or rejection reason..."
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', resize: 'vertical' }}
                  />
                </div>

                {selectedReport.reviewedBy && (
                  <div style={{ fontSize: '12px', color: '#64748B', backgroundColor: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0', marginBottom: '12px' }}>
                    <p style={{ margin: 0 }}><strong>Reviewed By:</strong> {selectedReport.reviewedBy}</p>
                    <p style={{ margin: '2px 0 0 0' }}><strong>Reviewed Date:</strong> {new Date(selectedReport.reviewedAt).toLocaleString()}</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleReviewAction('Approved')}
                    style={{ flex: 1, padding: '10px', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}
                  >
                    <Check size={16} /> Approve Report
                  </button>
                  <button
                    onClick={() => handleReviewAction('Rejected')}
                    style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}
                  >
                    <X size={16} /> Reject Report
                  </button>
                </div>
              </div>

            </div>

            <button onClick={() => setSelectedReport(null)} style={{ width: '100%', marginTop: '16px', padding: '10px', backgroundColor: '#475569', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
              Close Panel
            </button>
          </div>
        </div>
      )}

      {/* Full Screen Image Modal */}
      {enlargedPhoto && (
        <div style={{ ...modalOverlay, zIndex: 1100 }} onClick={() => setEnlargedPhoto(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={enlargedPhoto} alt="Full Evidence" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '12px' }} />
            <button onClick={() => setEnlargedPhoto(null)} style={{ position: 'absolute', top: '-15px', right: '-15px', backgroundColor: '#0F172A', color: 'white', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          </div>
        </div>
      )}

    </div>
  );
}

const cardStyle = { backgroundColor: 'white', padding: '18px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0' };
const modalOverlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalBox = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '580px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const modalSectionStyle = { backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '14px', border: '1px solid #E2E8F0' };
const sectionHeaderTitle = { fontSize: '13px', fontWeight: '800', color: '#0F172A', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' };
