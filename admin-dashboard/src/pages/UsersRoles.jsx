import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Search, Plus, Edit2, Trash2, X, ShieldCheck, UserCog, Shield, Users, 
  Lock, Activity, CheckCircle2, UserX, KeyRound, Eye, EyeOff, Sparkles, Check,
  UserCheck, Briefcase
} from 'lucide-react';
import Swal from 'sweetalert2';
import { 
  db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query,
  registerAdminUser, getRegisteredAdminAccounts, saveRegisteredAdminAccounts, safeLocalStorageSet 
} from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ROLE_OPTIONS, ROLE_PERMISSIONS, getRoleConfig } from '../utils/roles';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';

const STATUS_STYLE = {
  'Active':   { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Inactive': { background: '#F1F5F9', color: '#475569', dot: '#94A3B8' },
};

const EMPTY = { 
  name: '', 
  email: '', 
  password: '', 
  role: 'Manager', 
  access: 'Operations & Fleet Management', 
  status: 'Active' 
};

// Custom Tooltip for Role Composition Pie Chart
const CustomRoleTooltip = ({ active, payload }) => {
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
        <div style={{ color: data.payload.color || '#1E5ADB', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.name}: <strong style={{ color: '#0F172A' }}>{data.value}</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Access Level Bar Chart
const CustomAccessTooltip = ({ active, payload }) => {
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
        <div style={{ color: data.payload.color || '#8B5CF6', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.payload.access}: <strong style={{ color: '#0F172A' }}>{data.value} users</strong>
        </div>
      </div>
    );
  }
  return null;
};

// Helper: load real registered admin accounts from local storage
const loadRealAdminAccounts = () => {
  try {
    const raw = localStorage.getItem('subai_store_users');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return getRegisteredAdminAccounts();
};

export default function UsersRoles() {
  const [data, setData] = useState(() => loadRealAdminAccounts());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Pagination & Bulk Select state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);

  const location = useLocation();

  // Support URL search param (?search=...) from TopNav
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearch(q);
    }
  }, [location.search]);

  // Synchronize real admin users from local storage and Cloud Firestore
  useEffect(() => {
    // 1. Initial load from local registered admin store
    const localUsers = loadRealAdminAccounts();
    setData(localUsers);

    // 2. Real-time Firestore sync
    let unsub = () => {};
    try {
      const q = query(collection(db, 'users'));
      unsub = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const firestoreUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Merge by email
          const merged = new Map();
          loadRealAdminAccounts().forEach(u => {
            if (u && u.email) merged.set(u.email.toLowerCase(), u);
          });
          firestoreUsers.forEach(u => {
            if (u && u.email) merged.set(u.email.toLowerCase(), { ...merged.get(u.email.toLowerCase()), ...u });
          });
          const list = Array.from(merged.values());
          setData(list);
          safeLocalStorageSet('subai_store_users', JSON.stringify(list));
        } else {
          // If Firestore is empty, retain local registered admins
          const fallback = loadRealAdminAccounts();
          setData(fallback);
        }
      }, (err) => {
        console.warn('Firestore users sync warning:', err);
        setData(loadRealAdminAccounts());
      });
    } catch (e) {
      setData(loadRealAdminAccounts());
    }

    // 3. Listen for account updates across components
    const handleUpdate = () => {
      setData(loadRealAdminAccounts());
    };
    window.addEventListener('subai_admin_accounts_updated', handleUpdate);
    window.addEventListener('storage', (e) => {
      if (e.key === 'subai_store_users' || e.key === 'subai_admin_accounts') {
        handleUpdate();
      }
    });

    return () => {
      unsub();
      window.removeEventListener('subai_admin_accounts_updated', handleUpdate);
    };
  }, []);

  // Filtered dataset based on search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q) ||
      (d.role || '').toLowerCase().includes(q) ||
      (d.access || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  // Pagination metrics
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);

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

    // Disallow deleting primary admin account
    const deletableIds = selectedIds.filter(id => {
      const u = data.find(d => d.id === id);
      return !u || (u.email || '').toLowerCase() !== 'admin@subai.com';
    });

    if (deletableIds.length === 0) {
      return showToast('Notice', 'Primary Super Administrator (admin@subai.com) is protected from deletion.', 'warning');
    }

    const confirmed = await showConfirmDelete(
      `Delete ${deletableIds.length} Selected Users?`,
      `Are you sure you want to remove ${deletableIds.length} admin account(s)? This will revoke their access to the Admin Portal.`
    );
    if (confirmed) {
      try {
        // 1. Delete from Firestore if present
        await Promise.all(deletableIds.map(id => deleteDoc(doc(db, 'users', id)).catch(() => {})));

        // 2. Delete from registered admin storage
        const deletableSet = new Set(deletableIds);
        const accounts = getRegisteredAdminAccounts().filter(a => !deletableSet.has(a.id));
        saveRegisteredAdminAccounts(accounts);

        // 3. Delete from subai_store_users
        try {
          const raw = localStorage.getItem('subai_store_users');
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const cleaned = list.filter(u => !deletableSet.has(u.id));
              safeLocalStorageSet('subai_store_users', JSON.stringify(cleaned));
            }
          }
        } catch (e) {}

        setSelectedIds([]);
        const updated = loadRealAdminAccounts();
        setData(updated);
        window.dispatchEvent(new CustomEvent('subai_admin_accounts_updated'));
        showToast('Users Deleted', `${deletableIds.length} user account(s) removed.`, 'success');
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected users.', 'error');
      }
    }
  };

  const openAdd = () => { 
    setForm(EMPTY); 
    setEditId(null); 
    setShowPassword(false);
    setModal(true); 
  };

  const openEdit = (row) => { 
    setForm({
      name: row.name || '',
      email: row.email || '',
      password: '', // blank unless changing
      role: row.role || 'Manager',
      access: row.access || 'Operations & Fleet Management',
      status: row.status || 'Active'
    }); 
    setEditId(row.id); 
    setShowPassword(false);
    setModal(true); 
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.email?.trim()) {
      return showToast('Validation Error', 'Name and Email are required.', 'error');
    }
    const cleanEmail = form.email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      return showToast('Validation Error', 'Please enter a valid email address.', 'error');
    }

    setIsSaving(true);
    try {
      if (editId) {
        // Edit existing admin user
        const existingAcc = getRegisteredAdminAccounts().find(a => a.id === editId || (a.email || '').toLowerCase() === cleanEmail);
        const assignedPass = form.password?.trim() || existingAcc?.password || 'password123';
        const roleCfg = getRoleConfig(form.role || 'Super Admin');
        
        const updatedUser = {
          id: editId,
          name: form.name.trim(),
          email: cleanEmail,
          password: assignedPass,
          role: roleCfg.role,
          access: roleCfg.access,
          status: form.status || 'Active',
          lastLogin: existingAcc?.lastLogin || 'Never'
        };

        // 1. Update registered admin accounts store
        await registerAdminUser(updatedUser);

        // 2. Update Firestore if accessible
        try {
          await updateDoc(doc(db, 'users', editId), updatedUser);
        } catch (err) {}

        // 3. Update local state
        const updatedList = loadRealAdminAccounts();
        setData(updatedList);
        window.dispatchEvent(new CustomEvent('subai_admin_accounts_updated'));

        showToast('User Updated', `Updated permissions for ${form.name}.`, 'success');
      } else {
        // Create new admin user
        const assignedPass = form.password?.trim() || 'password123';
        const roleCfg = getRoleConfig(form.role || 'Manager');
        const newUserDoc = {
          name: form.name.trim(),
          email: cleanEmail,
          password: assignedPass,
          role: roleCfg.role,
          access: roleCfg.access,
          status: form.status || 'Active',
          lastLogin: 'Never',
          createdAt: new Date().toISOString()
        };

        // 1. Register in admin storage engine (guarantees sign-in access immediately)
        const res = await registerAdminUser(newUserDoc);
        const finalId = res?.user?.uid || ('admin_' + Date.now());

        // 2. Add to Firestore if accessible
        try {
          await addDoc(collection(db, 'users'), { ...newUserDoc, id: finalId });
        } catch (err) {}

        // 3. Update local state
        const updatedList = loadRealAdminAccounts();
        setData(updatedList);
        window.dispatchEvent(new CustomEvent('subai_admin_accounts_updated'));

        showToast('Account Created', `Created ${form.role} account for ${form.name}.`, 'success');
      }
      setModal(false);
      setForm(EMPTY);
      setEditId(null);
    } catch (e) {
      console.warn('Save user error:', e);
      showToast('Save Failed', e.message || 'Failed to save user', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const row = data.find(d => d.id === id);
    if (!row) return;

    // Disallow deleting primary Super Administrator
    if (row.email && row.email.toLowerCase() === 'admin@subai.com') {
      return showToast('Action Prohibited', 'The primary Super Administrator (admin@subai.com) cannot be removed.', 'warning');
    }

    const confirmed = await showConfirmDelete(
      'Remove Admin User?',
      `Are you sure you want to remove ${row.name || row.email}? This will revoke their access to the Admin Portal.`
    );
    if (confirmed) {
      try {
        // 1. Delete from Firestore if accessible
        try {
          await deleteDoc(doc(db, 'users', id));
        } catch (e) {}

        // 2. Delete from registered admin accounts
        const accounts = getRegisteredAdminAccounts().filter(a => a.id !== id && (a.email || '').toLowerCase() !== (row.email || '').toLowerCase());
        saveRegisteredAdminAccounts(accounts);

        // 3. Delete from subai_store_users
        try {
          const raw = localStorage.getItem('subai_store_users');
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const cleaned = list.filter(u => u.id !== id && (u.email || '').toLowerCase() !== (row.email || '').toLowerCase());
              safeLocalStorageSet('subai_store_users', JSON.stringify(cleaned));
            }
          }
        } catch (e) {}

        // 4. Update local state
        setData(loadRealAdminAccounts());
        window.dispatchEvent(new CustomEvent('subai_admin_accounts_updated'));

        showToast('User Removed', `Removed admin account for ${row.name}.`, 'success');
      } catch (e) {
        console.warn('Delete error:', e);
        showToast('Delete Failed', e.message || 'Could not remove user', 'error');
      }
    }
  };

  // ── Real KPI metrics from actual registered users - NO FAKE FALLBACKS ──
  const totalUsers = data.length;
  const superCount = data.filter(d => (d.role || '').toLowerCase().includes('super')).length;
  const managerCount = data.filter(d => {
    const r = (d.role || '').toLowerCase();
    return (r === 'manager' || r.includes('operat')) && !r.includes('supervisor');
  }).length;
  const supervisorCount = data.filter(d => (d.role || '').toLowerCase().includes('supervisor')).length;
  const hrCount = data.filter(d => {
    const r = (d.role || '').toLowerCase();
    return r === 'hr' || r.includes('human') || r.includes('resource');
  }).length;

  // Real Role Composition Donut Data
  const rolePieData = useMemo(() => {
    if (totalUsers === 0) return [];
    const list = [
      { name: 'Super Admin', value: superCount, color: '#8B5CF6', pct: Math.round((superCount / totalUsers) * 100) },
      { name: 'Manager', value: managerCount, color: '#1E5ADB', pct: Math.round((managerCount / totalUsers) * 100) },
      { name: 'Supervisor', value: supervisorCount, color: '#10B981', pct: Math.round((supervisorCount / totalUsers) * 100) },
      { name: 'HR', value: hrCount, color: '#F59E0B', pct: Math.round((hrCount / totalUsers) * 100) },
    ];
    return list.filter(item => item.value > 0);
  }, [totalUsers, superCount, managerCount, supervisorCount, hrCount]);

  // Real Access Permission Matrix Bar Data
  const accessBarData = useMemo(() => {
    if (totalUsers === 0) return [];
    return [
      { access: 'Full System', value: superCount, color: '#8B5CF6' },
      { access: 'Ops & Fleet', value: managerCount, color: '#1E5ADB' },
      { access: 'Field Duty', value: supervisorCount, color: '#10B981' },
      { access: 'HR & Staff', value: hrCount, color: '#F59E0B' },
    ];
  }, [totalUsers, superCount, managerCount, supervisorCount, hrCount]);

  return (
    <div style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top KPI Cards - Real Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>TOTAL USERS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#1E5ADB" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalUsers}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>SUPER ADMINS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#8B5CF6" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#8B5CF6', marginTop: '8px' }}>{superCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>MANAGERS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCog size={18} color="#1E5ADB" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#1E5ADB', marginTop: '8px' }}>{managerCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>SUPERVISORS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#10B981', marginTop: '8px' }}>{supervisorCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>HR PERSONNEL</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={18} color="#F59E0B" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>{hrCount}</div>
        </div>
      </div>

      {/* Main Content Layout: Datatable Left + Telemetry Sidebar Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Search & Filter + Datatable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Controls Bar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                placeholder="Search users by name, email, or role..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ width: '100%', paddingLeft: 38, paddingRight: 12, height: 42, borderRadius: 8, border: '1px solid #E2E8F0', background: 'white', fontSize: 13, outline: 'none' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
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
                  borderRadius: 8,
                  padding: '0 16px',
                  height: 42,
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

            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 8, padding: '0 18px', height: 42, fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 6px rgba(30, 90, 219, 0.25)' }}>
              <Plus size={16} /> Add User
            </button>
          </div>

          {/* Users Table */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
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
                    {['USER', 'EMAIL', 'ROLE', 'ACCESS LEVEL', 'STATUS', 'LAST LOGIN', 'ACTIONS'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentPageItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '56px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={22} color="#94A3B8" />
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>
                            {search ? `No administrator found matching "${search}"` : 'No administrator accounts registered'}
                          </div>
                          <div style={{ fontSize: 13, color: '#64748B', maxWidth: 360 }}>
                            {search ? 'Try adjusting your search terms.' : 'Click "+ Add User" above to create an administrator account.'}
                          </div>
                          {!search && (
                            <button
                              onClick={openAdd}
                              style={{
                                marginTop: 6,
                                padding: '8px 16px',
                                background: '#1E5ADB',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Add First User
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentPageItems.map(row => {
                      const isSelected = selectedIds.includes(row.id);
                      const isPrimaryAdmin = (row.email || '').toLowerCase() === 'admin@subai.com';
                      const initial = (row.name || row.email || 'A').charAt(0).toUpperCase();

                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9', background: isSelected ? '#EFF6FF' : 'transparent' }}>
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
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                                {initial}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.name || 'Unnamed Admin'}</div>
                                {isPrimaryAdmin && (
                                  <span style={{ fontSize: 10, color: '#8B5CF6', fontWeight: 700, background: '#F3E8FF', padding: '1px 6px', borderRadius: 4 }}>
                                    Primary Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#334155', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>{row.email}</td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {(() => {
                              const roleCfg = getRoleConfig(row.role);
                              return (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '3px 10px',
                                  borderRadius: 20,
                                  background: roleCfg.bg,
                                  color: roleCfg.color,
                                  border: `1px solid ${roleCfg.border}`,
                                  fontWeight: 700,
                                  fontSize: 11
                                }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleCfg.color }} />
                                  {roleCfg.role}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>{row.access || 'Full Access'}</td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[row.status]?.background || STATUS_STYLE['Active'].background, color: STATUS_STYLE[row.status]?.color || STATUS_STYLE['Active'].color, padding: '4px 10px', borderRadius: 20, fontWeight: 700, fontSize: 11 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[row.status]?.dot || STATUS_STYLE['Active'].dot }}></div>
                              {row.status || 'Active'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {row.lastLogin && row.lastLogin !== 'Never' ? new Date(row.lastLogin).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                onClick={() => openEdit(row)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 10px',
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

                              {!isPrimaryAdmin && (
                                <button
                                  onClick={() => handleDelete(row.id)}
                                  title="Remove user"
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
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: safePage === p ? '1px solid #1E5ADB' : '1px solid #E2E8F0',
                      background: safePage === p ? '#1E5ADB' : '#FFFFFF',
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

        {/* RIGHT COLUMN: REAL USER TELEMETRY SIDEBAR */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Sidebar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={18} color="#1E5ADB" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Role Distribution</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>Live System Admin Summary</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #6EE7B7', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>SECURE</span>
            </div>
          </div>

          {/* CHART 1: Real Role Composition Donut */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="#1E5ADB" /> Admin Role Composition
              </span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#1E5ADB' }}>{totalUsers} {totalUsers === 1 ? 'Account' : 'Accounts'}</span>
            </div>

            {totalUsers === 0 ? (
              <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12 }}>
                No accounts registered
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<CustomRoleTooltip />} />
                    <Pie
                      data={rolePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={66}
                      paddingAngle={rolePieData.length > 1 ? 4 : 0}
                      dataKey="value"
                    >
                      {rolePieData.map((entry, index) => (
                        <Cell key={`role-cell-${index}`} fill={entry.color} stroke="none" />
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
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{totalUsers}</div>
                  <div style={{ fontSize: '10px', color: '#1E5ADB', fontWeight: '700', marginTop: 2 }}>ADMINS</div>
                </div>
              </div>
            )}

            {/* Real Legend */}
            {rolePieData.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rolePieData.length}, 1fr)`, gap: 8, background: '#F8FAFC', padding: '10px', borderRadius: '10px' }}>
                {rolePieData.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: '#64748B', fontWeight: '600' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color }} />
                      {item.name}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', marginTop: 2 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: '1px', background: '#F1F5F9' }} />

          {/* CHART 2: Access Permission Matrix */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={15} color="#8B5CF6" /> Access Permissions Matrix
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#8B5CF6' }}>4 Privilege Tiers</span>
            </div>

            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={accessBarData} margin={{ top: 5, right: 15, left: 35, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="access" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<CustomAccessTooltip />} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                    {accessBarData.map((entry, index) => (
                      <Cell key={`access-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>

      {/* Edit / Add User Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  {editId ? 'Edit Administrator Account' : 'Provision New Administrator'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  {editId ? 'Update role privileges and credentials' : 'Create an admin account with immediate portal login access'}
                </p>
              </div>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Full Name *</label>
                <input 
                  value={form.name} 
                  onChange={e => setForm({...form, name: e.target.value})} 
                  placeholder="e.g. Maria Santos"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} 
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Email Address *</label>
                <input 
                  type="email" 
                  value={form.email} 
                  onChange={e => setForm({...form, email: e.target.value})} 
                  placeholder="e.g. maria.santos@subai.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} 
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Administrator Role *</label>
                <select 
                  value={form.role} 
                  onChange={e => {
                    const r = e.target.value;
                    const cfg = getRoleConfig(r);
                    setForm({...form, role: r, access: cfg.access });
                  }} 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white', fontWeight: 600, color: '#0F172A' }}
                >
                  <option value="Super Admin">Super Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="HR">HR</option>
                </select>
                <div style={{ marginTop: 6, fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: getRoleConfig(form.role).color }} />
                  <strong>{getRoleConfig(form.role).role}:</strong> {getRoleConfig(form.role).description}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                  {editId ? 'New Password (leave blank to keep current)' : 'Account Login Password *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={form.password || ''} 
                    onChange={e => setForm({...form, password: e.target.value})} 
                    placeholder={editId ? '••••••••••••' : 'Set password (e.g. password123)'} 
                    style={{ width: '100%', padding: '10px 38px 10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2 }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Access Level</label>
                  <span style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock size={11} color="#94A3B8" /> Auto-assigned (Read-only)
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input 
                    readOnly
                    disabled
                    tabIndex={-1}
                    value={getRoleConfig(form.role).access} 
                    onKeyDown={e => e.preventDefault()}
                    onFocus={e => e.target.blur()}
                    title="Access level is automatically configured based on the selected Administrator Role"
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px 10px 34px', 
                      borderRadius: 8, 
                      border: '1px solid #E2E8F0', 
                      fontSize: 13, 
                      fontWeight: 600,
                      color: '#475569',
                      outline: 'none', 
                      background: '#F1F5F9',
                      cursor: 'not-allowed',
                      userSelect: 'none',
                      boxSizing: 'border-box'
                    }} 
                  />
                  <Lock size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Account Status</label>
                <select 
                  value={form.status} 
                  onChange={e => setForm({...form, status: e.target.value})} 
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white' }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button 
                onClick={() => setModal(false)} 
                disabled={isSaving} 
                style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                disabled={isSaving} 
                style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#1E5ADB', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: isSaving ? 0.7 : 1 }}
              >
                {isSaving ? 'Saving...' : editId ? 'Update User' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { 
  backgroundColor: 'white', 
  padding: '20px', 
  borderRadius: '12px', 
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)', 
  border: '1px solid #E2E8F0' 
};