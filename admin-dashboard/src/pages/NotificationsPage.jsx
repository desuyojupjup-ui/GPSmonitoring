import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Eye, Check, Trash2, Bell, AlertTriangle, CheckCircle, Search, 
  Filter, CheckCheck, X, RefreshCw, ShieldAlert, Radio, Clock, Plus, Send,
  FileText, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, MessageSquare
} from 'lucide-react';
import { db, collection, onSnapshot, query, doc, updateDoc, deleteDoc, addDoc } from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import { startAnomalyNotificationSync } from '../services/anomalyNotificationSync';

const notifMillis = (n) => {
  const ts = n?.timestamp || n?.createdAt;
  if (!ts) return 0;
  if (typeof ts?.toDate === 'function') { try { return ts.toDate().getTime(); } catch (_) {} }
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};
const sortNotifs = (list) => [...list].sort((a, b) => notifMillis(b) - notifMillis(a));

const TABS = ['All Notifications', 'Unread', 'AI Anomaly Alerts', 'Geofence Alerts', 'Mobile Routes', 'System & Security'];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('All Notifications');
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearch(q);
    }
    if (params.get('action') === 'send') {
      setShowBroadcastModal(true);
    }
  }, [location.search]);

  useEffect(() => {
    const handleOpenBroadcast = () => setShowBroadcastModal(true);
    window.addEventListener('subai_open_broadcast', handleOpenBroadcast);
    return () => window.removeEventListener('subai_open_broadcast', handleOpenBroadcast);
  }, []);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Broadcast Alert Form
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    sender: 'Command Center Ops',
    type: 'System',
    workType: 'All Staff',
    message: ''
  });

  // Load notifications from local storage fallback
  const loadStoredNotifications = () => {
    try {
      const raw = localStorage.getItem('subai_store_notifications');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  };

  // 1. Live Firestore subscription with localStorage and seed fallback
  useEffect(() => {
    setLoading(true);
    let unsub = () => {};

    try {
      unsub = onSnapshot(query(collection(db, 'notifications')), (snap) => {
        if (!snap.empty) {
          const live = sortNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setNotifs(live);
          localStorage.setItem('subai_store_notifications', JSON.stringify(live));
        } else {
          const raw = localStorage.getItem('subai_store_notifications');
          if (raw === '[]') {
            setNotifs([]);
          } else {
            const initial = sortNotifs(loadStoredNotifications());
            setNotifs(initial);
          }
        }
        setLoading(false);
      }, () => {
        setNotifs(sortNotifs(loadStoredNotifications()));
        setLoading(false);
      });
    } catch {
      setNotifs(sortNotifs(loadStoredNotifications()));
      setLoading(false);
    }

    const stopAnomalySync = startAnomalyNotificationSync();

    const handleSyncEvent = () => {
      setNotifs(sortNotifs(loadStoredNotifications()));
    };

    window.addEventListener('subai_notifications_updated', handleSyncEvent);
    window.addEventListener('storage', (e) => {
      if (e.key === 'subai_store_notifications') handleSyncEvent();
    });

    return () => {
      unsub();
      stopAnomalySync();
      window.removeEventListener('subai_notifications_updated', handleSyncEvent);
    };
  }, []);

  // 2. Filtered list based on active tab and search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return notifs.filter(n => {
      const titleStr = (n.title || '').toLowerCase();
      const senderStr = (n.sender || '').toLowerCase();
      const msgStr = (n.message || '').toLowerCase();
      const typeStr = (n.type || '').toLowerCase();
      const workTypeStr = (n.workType || '').toLowerCase();

      const matchesSearch = !q || titleStr.includes(q) || senderStr.includes(q) || msgStr.includes(q) || typeStr.includes(q);

      let matchesTab = true;
      if (activeTab === 'Unread') {
        matchesTab = n.status === 'Unread' || n.read === false;
      } else if (activeTab === 'AI Anomaly Alerts') {
        matchesTab = n.category === 'AI Anomaly' || Boolean(n.anomalyId) || titleStr.includes('anomaly') || senderStr.includes('anomaly') || typeStr.includes('anomaly');
      } else if (activeTab === 'Geofence Alerts') {
        matchesTab = workTypeStr.includes('fixed') || typeStr.includes('geofence') || titleStr.includes('geofence') || senderStr.includes('geofence') || msgStr.includes('geofence');
      } else if (activeTab === 'Mobile Routes') {
        matchesTab = workTypeStr.includes('mobile') || typeStr.includes('route') || titleStr.includes('route') || senderStr.includes('route') || msgStr.includes('destination') || msgStr.includes('travel');
      } else if (activeTab === 'System & Security') {
        matchesTab = typeStr.includes('alert') || typeStr.includes('system') || typeStr.includes('security') || titleStr.includes('backup') || titleStr.includes('security') || n.category === 'AI Anomaly' || Boolean(n.anomalyId);
      }

      return matchesSearch && matchesTab;
    });
  }, [notifs, search, activeTab]);

  // Pagination metrics
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);

  // 3. Status Action Handlers
  const markRead = async (id) => {
    const updated = notifs.map(n => String(n.id) === String(id) ? { ...n, status: 'Read', read: true } : n);
    setNotifs(updated);
    localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notifications', items: updated, fullReplace: true })
      });
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'notifications', String(id)), { status: 'Read', read: true });
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    showToast('Notification Read', 'Alert marked as read.', 'info');
  };

  const markUnread = async (id) => {
    const updated = notifs.map(n => String(n.id) === String(id) ? { ...n, status: 'Unread', read: false } : n);
    setNotifs(updated);
    localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notifications', items: updated, fullReplace: true })
      });
    } catch (e) {}

    try {
      await updateDoc(doc(db, 'notifications', String(id)), { status: 'Unread', read: false });
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    showToast('Notification Unread', 'Alert marked as unread.', 'info');
  };

  const markAllRead = async () => {
    const updated = notifs.map(n => ({ ...n, status: 'Read', read: true }));
    setNotifs(updated);
    localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notifications', items: updated, fullReplace: true })
      });
    } catch (e) {}

    try {
      await Promise.all(notifs.filter(n => n.status === 'Unread' || n.read === false).map(n =>
        updateDoc(doc(db, 'notifications', String(n.id)), { status: 'Read', read: true }).catch(() => {})
      ));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    setSelectedIds([]);
    showToast('All Marked Read', 'All notifications updated to read state.', 'success');
  };

  const deleteNotif = async (id) => {
    const confirmed = await showConfirmDelete('Delete Notification?', 'Are you sure you want to remove this notification alert?');
    if (confirmed) {
      const updated = notifs.filter(n => String(n.id) !== String(id));
      setNotifs(updated);
      localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

      try {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'notifications', items: updated, fullReplace: true, action: 'delete', id: String(id) })
        });
      } catch (e) {}

      try {
        await deleteDoc(doc(db, 'notifications', String(id)));
      } catch (e) {}

      window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
      setSelectedIds(prev => prev.filter(i => String(i) !== String(id)));
      showToast('Notification Removed', 'Notification deleted successfully.', 'success');
    }
  };

  // 4. Bulk Selection and Actions
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(currentPageItems.map(n => n.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Notifications?`,
      `Permanently remove ${selectedIds.length} selected notification(s)?`
    );
    if (confirmed) {
      const idSet = new Set(selectedIds.map(String));
      const updated = notifs.filter(n => !idSet.has(String(n.id)));
      setNotifs(updated);
      localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

      try {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'notifications', items: updated, fullReplace: true, action: 'delete', ids: selectedIds.map(String) })
        });
      } catch (e) {}

      try {
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'notifications', String(id))).catch(() => {})));
      } catch (e) {}

      window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
      setSelectedIds([]);
      showToast('Bulk Delete', `Deleted ${selectedIds.length} notifications.`, 'success');
    }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds.map(String));
    const updated = notifs.map(n => idSet.has(String(n.id)) ? { ...n, status: 'Read', read: true } : n);
    setNotifs(updated);
    localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notifications', items: updated, fullReplace: true })
      });
    } catch (e) {}

    try {
      await Promise.all(selectedIds.map(id => updateDoc(doc(db, 'notifications', String(id)), { status: 'Read', read: true }).catch(() => {})));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    setSelectedIds([]);
    showToast('Bulk Read', `Marked ${selectedIds.length} notifications as read.`, 'info');
  };

  const handleClearAll = async () => {
    const confirmed = await showConfirmDelete(
      'Clear All Notifications?',
      'Warning: This will remove all notifications from the dispatch center. Proceed?'
    );
    if (confirmed) {
      const toDelete = [...notifs];
      setNotifs([]);
      localStorage.setItem('subai_store_notifications', JSON.stringify([]));

      try {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'notifications', items: [], fullReplace: true, action: 'clear_notifications' })
        });
      } catch (e) {}

      try {
        await Promise.all(toDelete.map(n => deleteDoc(doc(db, 'notifications', String(n.id))).catch(() => {})));
      } catch (e) {}

      window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
      setSelectedIds([]);
      showToast('Notifications Cleared', 'All notification records have been removed.', 'success');
    }
  };

  // 5. Manual Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const json = await res.json();
        const store = json.data || json.store || json;
        if (store && Array.isArray(store.notifications)) {
          setNotifs(store.notifications);
          localStorage.setItem('subai_store_notifications', JSON.stringify(store.notifications));
        }
      }
      showToast('Notifications Refreshed', 'Telemetry signal synced with dispatch queue.', 'info');
    } catch (e) {
      showToast('Refreshed', 'Notification feed updated.', 'info');
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // 6. Broadcast Alert Creation
  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) {
      return showToast('Validation Error', 'Title and message are required.', 'error');
    }

    const newAlert = {
      id: 'notif_' + Date.now(),
      title: broadcastForm.title.trim(),
      message: broadcastForm.message.trim(),
      sender: broadcastForm.sender.trim() || 'Command Center Ops',
      sub: 'Broadcast',
      type: broadcastForm.type,
      workType: broadcastForm.workType === 'All Staff' ? '' : broadcastForm.workType,
      date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Unread',
      read: false,
      timestamp: new Date().toISOString()
    };

    const updated = [newAlert, ...notifs];
    setNotifs(updated);
    localStorage.setItem('subai_store_notifications', JSON.stringify(updated));

    try {
      await addDoc(collection(db, 'notifications'), newAlert);
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'notifications', data: newAlert })
      });
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    setShowBroadcastModal(false);
    setBroadcastForm({ title: '', sender: 'Command Center Ops', type: 'System', workType: 'All Staff', message: '' });
    showToast('Alert Broadcasted', 'New notification dispatched to staff and topbar.', 'success');
  };

  // 7. Contextual Route Navigation
  const navigateToRelatedModule = (notif) => {
    setSelectedNotif(null);
    if (notif.anomalyId || notif.category === 'AI Anomaly') {
      navigate('/anomalies', { state: { selectedAnomalyId: notif.anomalyId } });
      return;
    }
    const text = `${notif.type || ''} ${notif.title || ''} ${notif.sender || ''} ${notif.message || ''}`.toLowerCase();
    if (text.includes('anomaly')) {
      navigate('/anomalies');
    } else if (text.includes('tracking') || text.includes('gps') || text.includes('speed') || text.includes('location')) {
      navigate('/tracking');
    } else if (text.includes('attendance') || text.includes('check-in') || text.includes('late')) {
      navigate('/attendance');
    } else if (text.includes('geofence') || text.includes('site') || text.includes('perimeter')) {
      navigate('/sites');
    } else if (text.includes('assign') || text.includes('schedule')) {
      navigate('/assignments');
    } else if (text.includes('verif') || text.includes('facial')) {
      navigate('/verifications');
    } else if (text.includes('fraud') || text.includes('spoof') || text.includes('mock') || text.includes('vpn')) {
      navigate('/fraud-reports');
    } else if (text.includes('delay') || text.includes('traffic') || text.includes('incident')) {
      navigate('/delay-reports');
    } else {
      navigate('/notifications');
    }
  };

  // Quick Stats
  const totalCount = notifs.length;
  const unreadCount = notifs.filter(n => n.status === 'Unread' || n.read === false).length;
  const anomalyCount = notifs.filter(n => n.category === 'AI Anomaly' || Boolean(n.anomalyId) || (n.title || '').toLowerCase().includes('anomaly') || (n.sender || '').toLowerCase().includes('anomaly')).length;
  const geofenceCount = notifs.filter(n => (n.sender || '').includes('Geofence') || (n.workType || '').includes('Fixed') || (n.title || '').includes('Geofence')).length;
  const systemCount = notifs.filter(n => n.type === 'Alert' || n.type === 'System' || (n.sender || '').includes('System')).length;

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* PAGE HEADER */}
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
            <Bell size={24} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>System Notifications & Dispatch Center</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '3px 9px', borderRadius: '12px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1E5ADB' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF' }}>TELEMETRY STREAM ACTIVE</span>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>Real-time telemetry alerts, geofence breaches, field dispatches, and system updates.</p>
          </div>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh Notification Feed"
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
            onClick={() => setShowBroadcastModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
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
            <Send size={14} /> Broadcast Alert
          </button>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #D1FAE5',
                background: '#ECFDF5',
                color: '#065F46',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <CheckCheck size={14} /> Mark All Read
            </button>
          )}

          <button
            onClick={handleClearAll}
            title="Clear all notifications"
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
            <Trash2 size={14} /> Clear All
          </button>
        </div>
      </div>

      {/* KPI STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard label="Total Notifications" value={totalCount} icon={Bell} color="#1E5ADB" bg="#EEF2FF" />
        <StatCard label="Unread Alerts" value={unreadCount} icon={Clock} color="#F59E0B" bg="#FFFBEB" />
        <StatCard label="AI Anomaly Alerts" value={anomalyCount} icon={ShieldAlert} color="#EF4444" bg="#FEF2F2" />
        <StatCard label="Geofence & Site Alerts" value={geofenceCount} icon={ShieldAlert} color="#8B5CF6" bg="#F3E8FF" />
        <StatCard label="System & Security Flags" value={systemCount} icon={AlertTriangle} color="#059669" bg="#ECFDF5" />
      </div>

      {/* MAIN DATATABLE CONTAINER */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        
        {/* Controls Header: Tabs + Bulk Actions + Search */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeTab === tab ? '#FFFFFF' : 'transparent',
                  color: activeTab === tab ? '#1E5ADB' : '#64748B',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab}
                {tab === 'Unread' && unreadCount > 0 && (
                  <span style={{ marginLeft: 6, background: '#EF4444', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                    {unreadCount}
                  </span>
                )}
                {tab === 'AI Anomaly Alerts' && anomalyCount > 0 && (
                  <span style={{ marginLeft: 6, background: '#DC2626', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                    {anomalyCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bulk Actions & Search Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {selectedIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleBulkMarkRead}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1FAE5',
                    background: '#ECFDF5',
                    color: '#065F46',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <Check size={13} /> Mark Read ({selectedIds.length})
                </button>
                <button
                  onClick={handleBulkDelete}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
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
                  <Trash2 size={13} /> Delete ({selectedIds.length})
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 14px', background: '#F8FAFC', width: '220px' }}>
              <Search size={14} color="#94A3B8" />
              <input
                placeholder="Search alerts..."
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

        {/* TABLE CONTENT */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '14px 18px', width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={currentPageItems.length > 0 && currentPageItems.every(n => selectedIds.includes(n.id))}
                    onChange={handleSelectAll}
                    style={{ accentColor: '#1E5ADB', cursor: 'pointer' }}
                  />
                </th>
                {['SENDER & DISPATCH', 'NOTIFICATION DETAIL', 'TIMESTAMP', 'CATEGORY', 'STATUS', 'ACTION'].map(h => (
                  <th key={h} style={{ padding: '14px 18px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '45px', color: '#64748B', fontSize: 13 }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#1E5ADB' }} />
                    Loading real-time notification stream...
                  </td>
                </tr>
              ) : currentPageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '45px', color: '#94A3B8', fontSize: 13, fontWeight: 500 }}>
                    No notifications match your current filter.
                  </td>
                </tr>
              ) : (
                currentPageItems.map(row => {
                  const isUnread = row.status === 'Unread' || row.read === false;
                  const isSelected = selectedIds.includes(row.id);

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: isSelected ? '#EFF6FF' : isUnread ? '#F8FAFC' : '#FFFFFF',
                        transition: 'background 0.15s'
                      }}
                      onMouseOver={e => !isSelected && (e.currentTarget.style.background = isUnread ? '#F1F5F9' : '#F8FAFC')}
                      onMouseOut={e => !isSelected && (e.currentTarget.style.background = isUnread ? '#F8FAFC' : '#FFFFFF')}
                    >
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(row.id)}
                          style={{ accentColor: '#1E5ADB', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: (row.category === 'AI Anomaly' || row.anomalyId) ? '#FEE2E2' : isUnread ? '#DBEAFE' : '#EFF6FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: (row.category === 'AI Anomaly' || row.anomalyId) ? '#DC2626' : '#1E5ADB',
                            fontWeight: '800',
                            fontSize: '12px',
                            flexShrink: 0
                          }}>
                            {(row.category === 'AI Anomaly' || row.anomalyId) ? (
                              <ShieldAlert size={18} />
                            ) : (
                              (row.sender || 'SYS').substring(0, 2).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.sender || 'System Dispatch'}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{row.sub || 'Automated'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', minWidth: '240px' }}>
                        <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: 2 }}>{row.title}</div>
                        <div style={{ color: '#64748B', fontSize: 12, lineHeight: 1.4 }}>{row.message}</div>
                        {row.workType && (
                          <span style={{
                            marginTop: 6,
                            display: 'inline-block',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: row.workType === 'Fixed Site' ? '#EDE9FE' : '#FEF3C7',
                            color: row.workType === 'Fixed Site' ? '#5B21B6' : '#92400E'
                          }}>
                            {row.workType === 'Fixed Site' ? '🏢 Fixed Site' : '🚚 Mobile Field'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#334155', fontWeight: 600 }}>{row.date || 'Today'}</div>
                        <div style={{ color: '#94A3B8', fontSize: 11 }}>{row.time || 'Recent'}</div>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        {(row.category === 'AI Anomaly' || row.anomalyId) ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: 12,
                            background: '#FEE2E2',
                            color: '#DC2626',
                            border: '1px solid #FCA5A5'
                          }}>
                            <ShieldAlert size={13} color="#DC2626" />
                            AI Anomaly
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                            {row.type === 'Alert' ? <AlertTriangle size={14} color="#EF4444" /> : row.type === 'System' ? <CheckCircle size={14} color="#10B981" /> : <Bell size={14} color="#3B82F6" />}
                            {row.category || row.type || 'Alert'}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          background: isUnread ? '#DBEAFE' : '#F1F5F9',
                          color: isUnread ? '#1E40AF' : '#64748B',
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontWeight: 700,
                          fontSize: 11
                        }}>
                          {isUnread ? 'Unread' : 'Read'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {isUnread ? (
                            <button
                              onClick={() => markRead(row.id)}
                              title="Mark as Read"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #D1FAE5',
                                backgroundColor: '#ECFDF5',
                                color: '#10B981',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Check size={14} color="#10B981" />
                            </button>
                          ) : (
                            <button
                              onClick={() => markUnread(row.id)}
                              title="Mark as Unread"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#F8FAFC',
                                color: '#64748B',
                                cursor: 'pointer'
                              }}
                            >
                              <Radio size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedNotif(row)}
                            title="View Notification Details"
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
                            onClick={() => deleteNotif(row.id)}
                            title="Delete"
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
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 24px',
          background: '#F8FAFC',
          borderTop: '1px solid #F1F5F9',
          fontSize: 12,
          color: '#64748B',
          fontWeight: 600,
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div>
            Showing <strong>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> notifications
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              disabled={safePage <= 1}
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: safePage <= 1 ? '#F1F5F9' : '#FFFFFF',
                color: safePage <= 1 ? '#94A3B8' : '#334155',
                cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 700
              }}
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <span style={{ padding: '0 6px', color: '#0F172A' }}>Page {safePage} of {totalPages}</span>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: safePage >= totalPages ? '#F1F5F9' : '#FFFFFF',
                color: safePage >= totalPages ? '#94A3B8' : '#334155',
                cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 700
              }}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>

      </div>

      {/* DETAIL INSPECTION MODAL */}
      {selectedNotif && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden', border: '1px solid #E2E8F0'
          }}>
            <div style={{ padding: '20px 24px', background: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Notification Dispatch Details</h3>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0 0' }}>Sender: {selectedNotif.sender || 'System'}</p>
              </div>
              <button onClick={() => setSelectedNotif(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: (selectedNotif.anomalyId || selectedNotif.category === 'AI Anomaly') ? '#FEE2E2' : '#EFF6FF',
                  color: (selectedNotif.anomalyId || selectedNotif.category === 'AI Anomaly') ? '#DC2626' : '#1E5ADB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '800',
                  fontSize: '15px'
                }}>
                  {(selectedNotif.anomalyId || selectedNotif.category === 'AI Anomaly') ? (
                    <ShieldAlert size={22} color="#DC2626" />
                  ) : (
                    (selectedNotif.sender || 'S').substring(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{selectedNotif.title}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: '2px' }}>
                    {selectedNotif.date || 'Today'} at {selectedNotif.time || '12:00 PM'}
                  </div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>MESSAGE PAYLOAD</span>
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: 4 }}>
                  {selectedNotif.message}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}>
                  <span style={{ color: '#64748B' }}>Category: </span>
                  <strong style={{ color: (selectedNotif.anomalyId || selectedNotif.category === 'AI Anomaly') ? '#DC2626' : '#0F172A' }}>
                    {selectedNotif.category || selectedNotif.type || 'Alert'}
                  </strong>
                </div>
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}>
                  <span style={{ color: '#64748B' }}>Work Environment: </span>
                  <strong style={{ color: '#0F172A' }}>{selectedNotif.workType || 'Standard'}</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigateToRelatedModule(selectedNotif)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: (selectedNotif.anomalyId || selectedNotif.category === 'AI Anomaly') ? '#DC2626' : '#1E5ADB',
                    color: 'white',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {(selectedNotif.anomalyId || selectedNotif.category === 'AI Anomaly') ? (
                    <>
                      <ShieldAlert size={14} /> Inspect in AI Anomaly Center <ArrowRight size={13} />
                    </>
                  ) : (
                    <>
                      Go to Module <ArrowRight size={13} />
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    const idToDelete = selectedNotif.id;
                    setSelectedNotif(null);
                    deleteNotif(idToDelete);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FCA5A5',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {selectedNotif.status === 'Unread' ? (
                  <button
                    onClick={() => { markRead(selectedNotif.id); setSelectedNotif(null); }}
                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#10B981', color: 'white', border: 'none', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Mark as Read
                  </button>
                ) : (
                  <button
                    onClick={() => { markUnread(selectedNotif.id); setSelectedNotif(null); }}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: '#FFFFFF', color: '#64748B', border: '1px solid #CBD5E1', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Mark Unread
                  </button>
                )}
                <button
                  onClick={() => setSelectedNotif(null)}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: '#0F172A', color: 'white', border: 'none', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BROADCAST ALERT MODAL */}
      {showBroadcastModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '480px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #E2E8F0'
          }}>
            <div style={{ padding: '20px 24px', background: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Send size={18} color="#1E5ADB" />
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Broadcast Notification</h3>
              </div>
              <button onClick={() => setShowBroadcastModal(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateBroadcast} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Notification Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inclement Weather Work Advisory"
                  value={broadcastForm.title}
                  onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select
                    value={broadcastForm.type}
                    onChange={e => setBroadcastForm({ ...broadcastForm, type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Alert">Alert (High Priority)</option>
                    <option value="System">System Notice</option>
                    <option value="Geofence">Geofence Event</option>
                    <option value="Message">Standard Message</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Target Workforce</label>
                  <select
                    value={broadcastForm.workType}
                    onChange={e => setBroadcastForm({ ...broadcastForm, workType: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="All Staff">All Personnel</option>
                    <option value="Fixed Site">Fixed Site Only</option>
                    <option value="Mobile Field">Mobile Field Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Sender Identity</label>
                <input
                  type="text"
                  placeholder="Command Center Ops"
                  value={broadcastForm.sender}
                  onChange={e => setBroadcastForm({ ...broadcastForm, sender: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Message Narrative *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Write message to broadcast to mobile devices and topbar feed..."
                  value={broadcastForm.message}
                  onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#64748B', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1E5ADB', color: '#FFFFFF', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 8px rgba(30, 90, 219, 0.25)' }}
                >
                  Dispatch Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div style={{ width: 42, height: 42, borderRadius: '12px', background: bg, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A' }}>{value}</div>
        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>{label}</div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '700',
  color: '#334155',
  marginBottom: '6px'
};

const inputStyle = {
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
