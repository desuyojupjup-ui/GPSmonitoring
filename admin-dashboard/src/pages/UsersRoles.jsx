import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search, Plus, Edit2, Trash2, X, ShieldCheck, Users,
  Lock, KeyRound, Eye, EyeOff, UserCheck, Building2, Sliders, Briefcase, CheckCircle2
} from 'lucide-react';
import {
  db, collection, onSnapshot, updateDoc, deleteDoc, doc, query,
  registerAdminUser
} from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import {
  MODULE_PERMISSIONS,
  SUGGESTED_POSITIONS,
  buildEmptyCustomPermissions,
  buildAllPermissions,
  getEffectivePermissions,
  isDeveloper,
  isCompanyAdmin,
} from '../utils/roles';
import { useCompany, DEFAULT_COMPANY_ID } from '../utils/companyContext';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const STATUS_STYLE = {
  'Active':           { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Pending Approval': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Inactive':         { background: '#F1F5F9', color: '#475569', dot: '#94A3B8' },
};

const PROTECTED_EMAILS = new Set(['developer@subai.com', 'admin@subai.com']);

const CustomRoleTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px',
        padding: '8px 12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px', fontWeight: '600', zIndex: 99
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

const CustomAccessTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px',
        padding: '8px 12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px', fontWeight: '600', zIndex: 99
      }}>
        <div style={{ color: data.payload.color || '#1E5ADB', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.payload.access}: <strong style={{ color: '#0F172A' }}>{data.value} users</strong>
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Company Admin Portal — Company Users & Custom Permissions (/users)
 *
 * Strictly isolated to the signed-in Company Owner / Company Admin's own company.
 * Follows the exact configurable access model:
 *   User → Position (custom label, e.g. HR, Manager, Supervisor) → Custom Permissions (checkboxes)
 *
 * Position NEVER forces fixed permissions — two companies can assign completely different
 * module permissions to users with the same Position label.
 */
export default function UsersRoles() {
  const {
    companies,
    activeCompanyId,
    activeCompany,
    matchesCompany,
  } = useCompany();

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
    } catch {
      return {};
    }
  }, []);

  const userIsCompanyAdmin = isCompanyAdmin(currentUser);
  const currentCompanyId = currentUser?.companyId || (activeCompanyId && activeCompanyId !== 'ALL' ? activeCompanyId : DEFAULT_COMPANY_ID);
  const getCompanyNameById = (cid) => {
    if (!cid) return 'Default Organization';
    const match = companies.find((c) => c.id === cid);
    return match?.name || cid;
  };
  const currentCompanyName = activeCompany?.name || currentUser?.companyName || getCompanyNameById(currentCompanyId);

  const [rawUsers, setRawUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editingCompanyAdminRow, setEditingCompanyAdminRow] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const buildEmptyUserForm = () => ({
    name: '',
    email: '',
    password: '',
    position: '',
    permissions: buildEmptyCustomPermissions(),
    status: 'Active',
  });

  const [form, setForm] = useState(buildEmptyUserForm);

  // Pagination & Bulk Select state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) setSearch(q);
  }, [location.search]);

  // Real-time Cloud Firestore listener (auto-scoped to this company only)
  useEffect(() => {
    setLoading(true);
    let unsub = () => {};
    try {
      unsub = onSnapshot(query(collection(db, 'users')), (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRawUsers(list);
        setLoading(false);
      }, (err) => {
        console.error('Firestore users sync error:', err);
        setLoading(false);
      });
    } catch (e) {
      console.error('Firestore users listener init error:', e);
      setLoading(false);
    }
    return () => unsub();
  }, []);

  // Strictly show ONLY accounts belonging to this company (never Developers or other companies)
  const data = useMemo(() => {
    return rawUsers.filter((u) => {
      if (!u) return false;
      if (isDeveloper(u)) return false;
      return matchesCompany(u);
    });
  }, [rawUsers, matchesCompany]);

  // Company Admin rows are provisioned/approved by the System Provider in the Developer Portal;
  // inside the Company Admin Portal, Company Admins can edit their own name/password, and manage all Company Users.
  const canEditRow = (row) => {
    if (!row || isDeveloper(row)) return false;
    if (isCompanyAdmin(row)) {
      return (row.email || '').toLowerCase() === (currentUser.email || '').toLowerCase();
    }
    return true;
  };

  const canDeleteRow = (row) => {
    if (!row || isDeveloper(row)) return false;
    const cleanEmail = (row.email || '').toLowerCase();
    if (PROTECTED_EMAILS.has(cleanEmail)) return false;
    if (cleanEmail === (currentUser.email || '').toLowerCase()) return false;
    if (isCompanyAdmin(row)) return false;
    return true;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((d) =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q) ||
      (d.jobTitle || '').toLowerCase().includes(q) ||
      (d.role || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);

  const selectableItems = currentPageItems.filter(canDeleteRow);
  const isAllSelected = selectableItems.length > 0 && selectableItems.every((d) => selectedIds.includes(d.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const ids = new Set(selectableItems.map((i) => i.id));
      setSelectedIds((prev) => prev.filter((id) => !ids.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...selectableItems.map((i) => i.id)])));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const deletableIds = selectedIds.filter((id) => canDeleteRow(data.find((d) => d.id === id)));
    if (deletableIds.length === 0) {
      return showToast('Notice', 'Company Owner / Admin accounts are managed in the Developer Portal.', 'warning');
    }
    const confirmed = await showConfirmDelete(
      `Remove ${deletableIds.length} Company User(s)?`,
      `Are you sure you want to remove ${deletableIds.length} user account(s) from ${currentCompanyName}? This revokes their access immediately.`
    );
    if (confirmed) {
      try {
        await Promise.all(deletableIds.map((id) => deleteDoc(doc(db, 'users', id))));
        setSelectedIds([]);
        showToast('Users Removed', `${deletableIds.length} company user(s) removed from Firestore.`, 'success');
      } catch (err) {
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected users.', 'error');
      }
    }
  };

  const openAdd = () => {
    setForm(buildEmptyUserForm());
    setEditId(null);
    setEditingCompanyAdminRow(false);
    setShowPassword(false);
    setModal(true);
  };

  const openEdit = (row) => {
    if (!canEditRow(row)) {
      return showToast('Protected Account', 'Company Owner / Admin accounts are managed by the SUBAI System Provider.', 'warning');
    }
    const rowIsCompAdmin = isCompanyAdmin(row);
    const effectivePerms = getEffectivePermissions(row);
    setForm({
      name: row.name || '',
      email: row.email || '',
      password: '',
      position: row.jobTitle || (rowIsCompAdmin ? 'Company Owner / Admin' : row.role || ''),
      permissions: { ...effectivePerms },
      status: row.status || 'Active',
    });
    setEditId(row.id);
    setEditingCompanyAdminRow(rowIsCompAdmin);
    setShowPassword(false);
    setModal(true);
  };

  const handleTogglePermission = (permKey) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...(prev.permissions || {}),
        [permKey]: !prev.permissions?.[permKey],
      },
    }));
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.email?.trim()) {
      return showToast('Validation Error', 'Full Name and Email Address are required.', 'error');
    }
    if (!editingCompanyAdminRow && !form.position?.trim()) {
      return showToast('Validation Error', 'Position / Title is required (e.g., HR, Manager, Supervisor).', 'error');
    }
    const cleanEmail = form.email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      return showToast('Validation Error', 'Please enter a valid email address.', 'error');
    }
    if (!editId && (!form.password?.trim() || form.password.trim().length < 6)) {
      return showToast('Validation Error', 'A login password of at least 6 characters is required.', 'error');
    }
    if (form.password?.trim() && form.password.trim().length < 6) {
      return showToast('Validation Error', 'Password must be at least 6 characters.', 'error');
    }

    // Duplicate email guard against live Firestore records
    const duplicateUser = rawUsers.find(
      (u) => u.id !== editId && (u.email || '').trim().toLowerCase() === cleanEmail
    );
    if (duplicateUser) {
      return showToast('Duplicate Email', `Email "${cleanEmail}" is already registered to ${duplicateUser.name || 'another user'}.`, 'error');
    }

    const existingRow = editId ? rawUsers.find((u) => u.id === editId) : null;
    const isAdminRow = Boolean(editingCompanyAdminRow && existingRow && isCompanyAdmin(existingRow));
    const finalRole = isAdminRow ? 'Company Admin' : 'Company User';
    const finalPosition = (form.position || (isAdminRow ? 'Company Owner / Admin' : 'Company Staff')).trim();
    const finalPerms = isAdminRow ? buildAllPermissions() : { ...buildEmptyCustomPermissions(), ...(form.permissions || {}) };
    const enabledPermCount = Object.values(finalPerms).filter(Boolean).length;

    if (!isAdminRow && enabledPermCount === 0) {
      return showToast('Permissions Required', 'Select at least one module permission for this user.', 'error');
    }

    setIsSaving(true);
    try {
      const payload = {
        id: editId || undefined,
        name: form.name.trim(),
        email: cleanEmail,
        role: finalRole,
        jobTitle: finalPosition,
        companyId: currentCompanyId,
        companyName: currentCompanyName,
        access: isAdminRow ? `Full Company Admin Portal (${currentCompanyName})` : `${enabledPermCount}/${MODULE_PERMISSIONS.length} Custom Modules`,
        permissions: finalPerms,
        status: isAdminRow ? (existingRow?.status || 'Active') : (form.status || 'Active'),
        lastLogin: existingRow?.lastLogin || 'Never',
      };

      if (form.password?.trim()) {
        payload.password = form.password.trim();
      } else if (existingRow?.password) {
        payload.password = existingRow.password;
      }

      if (editId) {
        await updateDoc(doc(db, 'users', editId), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        await registerAdminUser({ ...payload, id: editId }).catch(() => {});
        showToast('User Updated', `Updated ${payload.name} (${finalPosition}) — ${enabledPermCount} module permissions active.`, 'success');
      } else {
        await registerAdminUser(payload);
        showToast('Company User Created', `${payload.name} (${finalPosition}) added to ${currentCompanyName} with ${enabledPermCount} custom permissions.`, 'success');
      }

      setModal(false);
      setForm(buildEmptyUserForm());
      setEditId(null);
      setEditingCompanyAdminRow(false);
    } catch (e) {
      console.error('Save user error:', e);
      showToast('Save Failed', e.message || 'Failed to save user to Firestore', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const row = data.find((d) => d.id === id);
    if (!row) return;
    if (!canDeleteRow(row)) {
      return showToast('Action Prohibited', 'Company Owner / Admin accounts cannot be deleted from here.', 'warning');
    }
    const confirmed = await showConfirmDelete(
      'Remove Company User?',
      `Are you sure you want to remove ${row.name || row.email} (${row.jobTitle || 'Company User'}) from ${currentCompanyName}?`
    );
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'users', id));
        showToast('User Removed', `Removed ${row.name} from ${currentCompanyName}.`, 'success');
      } catch (e) {
        showToast('Delete Failed', e.message || 'Could not remove user', 'error');
      }
    }
  };

  // KPI metrics from live Firestore company accounts
  const totalUsers = data.length;
  const companyAdminCount = data.filter((d) => isCompanyAdmin(d)).length;
  const customUserCount = data.filter((d) => !isCompanyAdmin(d)).length;
  const activeCount = data.filter((d) => (d.status || 'Active') === 'Active').length;

  // Position breakdown for analytics sidebar
  const positionDistribution = useMemo(() => {
    if (totalUsers === 0) return [];
    const counts = new Map();
    data.forEach((d) => {
      const label = isCompanyAdmin(d) ? 'Company Admin' : (d.jobTitle || 'Company User');
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const palette = ['#1E5ADB', '#0D9488', '#7C3AED', '#F59E0B', '#EC4899', '#10B981'];
    return Array.from(counts.entries()).map(([name, value], idx) => ({
      name,
      value,
      color: palette[idx % palette.length],
      pct: Math.round((value / totalUsers) * 100),
    }));
  }, [data, totalUsers]);

  const accessBarData = useMemo(() => {
    if (totalUsers === 0) return [];
    return [
      { access: 'Company Admin', value: companyAdminCount, color: '#1E5ADB' },
      { access: 'Custom Users', value: customUserCount, color: '#0D9488' },
      { access: 'Active', value: activeCount, color: '#10B981' },
    ];
  }, [totalUsers, companyAdminCount, customUserCount, activeCount]);

  const enabledFormPermCount = Object.values(form.permissions || {}).filter(Boolean).length;

  return (
    <div style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Company Portal Context & Custom Permissions Banner */}
      <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Building2 size={20} color="#1E5ADB" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{currentCompanyName}</span>
              <span style={{
                padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD'
              }}>
                {userIsCompanyAdmin ? 'Company Owner / Admin' : (currentUser?.jobTitle || 'Company User')}
              </span>
              {activeCompany?.plan && (
                <span style={{
                  padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: '#F3E8FF', color: '#6D28D9', border: '1px solid #DDD6FE'
                }}>
                  {activeCompany.plan} Plan
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
              <strong>User &rarr; Position &rarr; Custom Permissions:</strong> Position (e.g., HR, Manager, Supervisor) is a label only. Select exact module permissions for each user based on your company&apos;s workflow.
            </div>
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10,
          background: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: 11, fontWeight: 700, color: '#065F46'
        }}>
          <Lock size={13} color="#059669" />
          Isolated to {currentCompanyName}
        </div>
      </div>

      {/* Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>COMPANY ACCOUNTS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#1E5ADB" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#0F172A', marginTop: '8px' }}>{totalUsers}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>COMPANY ADMINS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#2563EB" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#2563EB', marginTop: '8px' }}>{companyAdminCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>COMPANY USERS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={18} color="#0D9488" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#0D9488', marginTop: '8px' }}>{customUserCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>ACTIVE ACCESS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#10B981', marginTop: '8px' }}>{activeCount}</div>
        </div>
      </div>

      {/* Main Content Layout: Datatable Left + Telemetry Sidebar Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>

        {/* LEFT COLUMN: Search & Filter + Datatable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                placeholder="Search company users by name, email, or position (e.g. HR, Manager)..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
                  display: 'flex', alignItems: 'center', gap: 6, background: '#DC2626', color: 'white',
                  border: 'none', borderRadius: 8, padding: '0 16px', height: 42, fontWeight: 600,
                  fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)'
                }}
              >
                <Trash2 size={15} /> Delete Selected ({selectedIds.length})
              </button>
            )}

            <button
              onClick={openAdd}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white',
                border: 'none', borderRadius: 8, padding: '0 18px', height: 42, fontWeight: 600,
                fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 6px rgba(30, 90, 219, 0.25)'
              }}
            >
              <Plus size={16} /> Add Company User
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
                    {['USER', 'POSITION', 'CUSTOM PERMISSIONS', 'STATUS', 'ACTIONS'].map((h) => (
                      <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '44px 16px', textAlign: 'center', color: '#64748B' }}>
                        Syncing company accounts from Cloud Firestore...
                      </td>
                    </tr>
                  ) : currentPageItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '56px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={22} color="#94A3B8" />
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>
                            {search ? `No user found matching "${search}"` : `No users added yet for ${currentCompanyName}`}
                          </div>
                          <button
                            onClick={openAdd}
                            style={{ marginTop: 6, padding: '8px 16px', background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Add Company User
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentPageItems.map((row) => {
                      const isSelected = selectedIds.includes(row.id);
                      const rowIsAdmin = isCompanyAdmin(row);
                      const allowEdit = canEditRow(row);
                      const allowDelete = canDeleteRow(row);
                      const initial = (row.name || row.email || 'U').charAt(0).toUpperCase();
                      const effPerms = getEffectivePermissions(row);
                      const enabledKeys = MODULE_PERMISSIONS.filter((m) => effPerms[m.key]).map((m) => m.label);

                      return (
                        <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9', background: isSelected ? '#EFF6FF' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              disabled={!allowDelete}
                              checked={isSelected}
                              onChange={() => toggleSelectOne(row.id)}
                              style={{ cursor: allowDelete ? 'pointer' : 'not-allowed', accentColor: '#1E5ADB', width: 15, height: 15, opacity: allowDelete ? 1 : 0.35 }}
                            />
                          </td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: rowIsAdmin ? '#EFF6FF' : '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: rowIsAdmin ? '#1E5ADB' : '#0D9488', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                                {initial}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.name || 'Unnamed User'}</div>
                                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>{row.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {rowIsAdmin ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                                borderRadius: 20, background: '#EFF6FF', color: '#1E5ADB',
                                border: '1px solid #BFDBFE', fontWeight: 700, fontSize: 11
                              }}>
                                <ShieldCheck size={12} /> Company Admin (Owner)
                              </span>
                            ) : (
                              <div>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
                                  borderRadius: 20, background: '#F0FDFA', color: '#0F766E',
                                  border: '1px solid #99F6E4', fontWeight: 700, fontSize: 11
                                }}>
                                  <Briefcase size={11} /> {row.jobTitle || row.role || 'Company User'}
                                </span>
                                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>Custom Permissions User</div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 240 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: rowIsAdmin ? '#1E5ADB' : '#0F766E' }}>
                              {rowIsAdmin ? 'Full Company Access (All Modules)' : `${enabledKeys.length}/${MODULE_PERMISSIONS.length} Modules Enabled`}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }} title={enabledKeys.join(', ')}>
                              {rowIsAdmin
                                ? 'All operational & administration modules'
                                : `${enabledKeys.slice(0, 3).join(', ')}${enabledKeys.length > 3 ? ` +${enabledKeys.length - 3} more` : ''}`}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[row.status]?.background || STATUS_STYLE.Active.background, color: STATUS_STYLE[row.status]?.color || STATUS_STYLE.Active.color, padding: '4px 10px', borderRadius: 20, fontWeight: 700, fontSize: 11 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[row.status]?.dot || STATUS_STYLE.Active.dot }}></div>
                              {row.status || 'Active'}
                            </div>
                          </td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {allowEdit ? (
                                <button
                                  onClick={() => openEdit(row)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px',
                                    height: '28px', borderRadius: '6px', border: '1px solid #DBEAFE',
                                    backgroundColor: '#FFFFFF', color: '#1E5ADB', fontWeight: '700',
                                    fontSize: '11px', cursor: 'pointer'
                                  }}
                                >
                                  <Edit2 size={13} color="#1E5ADB" /> {rowIsAdmin ? 'Edit Profile' : 'Edit Access'}
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Provider Managed</span>
                              )}
                              {allowDelete && (
                                <button
                                  onClick={() => handleDelete(row.id)}
                                  title="Remove company user"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '28px', height: '28px', borderRadius: '6px',
                                    border: '1px solid #FCA5A5', backgroundColor: '#FEF2F2', color: '#DC2626', cursor: 'pointer'
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

            {/* Pagination Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #F1F5F9', background: '#FFFFFF', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                  Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong> entries
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
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
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: safePage <= 1 ? '#F8FAFC' : '#FFFFFF', color: safePage <= 1 ? '#94A3B8' : '#334155', fontSize: 12, fontWeight: 600, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      border: safePage === p ? '1px solid #1E5ADB' : '1px solid #E2E8F0',
                      background: safePage === p ? '#1E5ADB' : '#FFFFFF',
                      color: safePage === p ? '#FFFFFF' : '#334155',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {p}
                  </button>
                ))}
                <button
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: safePage >= totalPages ? '#F8FAFC' : '#FFFFFF', color: safePage >= totalPages ? '#94A3B8' : '#334155', fontSize: 12, fontWeight: 600, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: COMPANY ACCESS TELEMETRY SIDEBAR */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={18} color="#1E5ADB" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Position Breakdown</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>{currentCompanyName}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #6EE7B7', padding: '3px 8px', borderRadius: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>LIVE</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="#1E5ADB" /> Active Positions
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
                    <Pie data={positionDistribution} cx="50%" cy="50%" innerRadius={46} outerRadius={66} paddingAngle={positionDistribution.length > 1 ? 4 : 0} dataKey="value">
                      {positionDistribution.map((entry, index) => (
                        <Cell key={`role-cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', lineHeight: 1 }}>{totalUsers}</div>
                  <div style={{ fontSize: '10px', color: '#1E5ADB', fontWeight: '700', marginTop: 2 }}>USERS</div>
                </div>
              </div>
            )}

            {positionDistribution.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(positionDistribution.length, 2)}, 1fr)`, gap: 8, background: '#F8FAFC', padding: '10px', borderRadius: '10px' }}>
                {positionDistribution.map((item, idx) => (
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={15} color="#0D9488" /> Access Model
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#0D9488' }}>Custom Per User</span>
            </div>
            <div style={{ width: '100%', height: 110 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={accessBarData} margin={{ top: 5, right: 15, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="access" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={92} />
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

      {/* Add / Edit Company User: User -> Position -> Custom Permissions Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px 16px' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 640, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  {editId ? (editingCompanyAdminRow ? 'Edit Company Admin Profile' : 'Edit User & Custom Permissions') : 'Create Company User'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  Company: <strong>{currentCompanyName}</strong> &mdash; set user details, Position label, and exact module permissions.
                </p>
              </div>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Maria Santos"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. maria@abclogistics.com"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                  Position / Title * <span style={{ fontWeight: 500, color: '#64748B' }}>(Label only — does not force fixed permissions)</span>
                </label>
                <input
                  value={form.position}
                  disabled={editingCompanyAdminRow}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  placeholder="e.g. HR, Manager, Supervisor, Operations Lead, Dispatcher"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: editingCompanyAdminRow ? '#F8FAFC' : '#FFFFFF', boxSizing: 'border-box' }}
                />
                {!editingCompanyAdminRow && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {SUGGESTED_POSITIONS.map((pos) => {
                      const active = (form.position || '').trim().toLowerCase() === pos.toLowerCase();
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, position: pos }))}
                          style={{
                            padding: '3px 9px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            border: active ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                            background: active ? '#EFF6FF' : '#F8FAFC',
                            color: active ? '#1E40AF' : '#475569',
                          }}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Company (Locked)</label>
                <input
                  readOnly
                  value={currentCompanyName}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, background: '#F8FAFC', color: '#475569', fontWeight: 600, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Account Status</label>
                <select
                  value={form.status}
                  disabled={editingCompanyAdminRow}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: editingCompanyAdminRow ? '#F8FAFC' : 'white', boxSizing: 'border-box' }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                  {editId ? 'New Password (leave blank to keep current)' : 'Account Login Password *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password || ''}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editId ? 'Leave blank to keep existing password' : 'Min. 6 characters'}
                    style={{ width: '100%', padding: '9px 38px 9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2 }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Module Permissions Matrix */}
            <div style={{ marginTop: 18, background: '#F8FAFC', borderRadius: 12, padding: 14, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#0F172A' }}>
                  <Sliders size={14} color="#1E5ADB" /> Custom Permissions
                  {!editingCompanyAdminRow && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1E5ADB', background: '#EFF6FF', padding: '2px 8px', borderRadius: 12 }}>
                      {enabledFormPermCount} / {MODULE_PERMISSIONS.length} Selected
                    </span>
                  )}
                </div>
                {!editingCompanyAdminRow && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, permissions: buildAllPermissions() }))}
                      style={{ fontSize: 11, fontWeight: 700, color: '#1E5ADB', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, permissions: buildEmptyCustomPermissions() }))}
                      style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Dashboard Only
                    </button>
                  </div>
                )}
              </div>

              {editingCompanyAdminRow ? (
                <div style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
                  Company Owner / Company Admin holds full access to all modules strictly inside <strong>{currentCompanyName}</strong>.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
                    Check the exact modules this user can access. Typing <strong>HR</strong>, <strong>Manager</strong>, or <strong>Supervisor</strong> will never overwrite your custom checkboxes.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 8 }}>
                    {MODULE_PERMISSIONS.map((mod) => {
                      const checked = Boolean(form.permissions?.[mod.key]);
                      return (
                        <label
                          key={mod.key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                            borderRadius: 8, cursor: 'pointer',
                            border: checked ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                            background: checked ? '#EFF6FF' : '#FFFFFF',
                            fontSize: 12, fontWeight: checked ? 700 : 500, color: checked ? '#1E40AF' : '#475569'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleTogglePermission(mod.key)}
                            style={{ accentColor: '#1E5ADB', width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <span>{mod.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
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
                style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#1E5ADB', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: isSaving ? 0.7 : 1 }}
              >
                {isSaving ? 'Saving...' : editId ? 'Save Changes' : 'Create Company User'}
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
