import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search, Plus, Edit2, Trash2, X, ShieldCheck, UserCog, Users,
  Lock, KeyRound, Eye, EyeOff, Check, UserCheck, Briefcase, Building2, Sliders
} from 'lucide-react';
import {
  db, collection, onSnapshot, updateDoc, deleteDoc, doc, query,
  registerAdminUser
} from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import {
  ROLE_OPTIONS,
  COMPANY_ASSIGNABLE_ROLES,
  MODULE_PERMISSIONS,
  getRoleConfig,
  buildDefaultPermissionsForRole,
  getEffectivePermissions,
  isPlatformAdmin,
  normalizeRoleName,
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
        <div style={{ color: data.payload.color || '#8B5CF6', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.payload.access}: <strong style={{ color: '#0F172A' }}>{data.value} users</strong>
        </div>
      </div>
    );
  }
  return null;
};

export default function UsersRoles() {
  const {
    companies,
    activeCompanyId,
    setActiveCompanyId,
    activeCompany,
    canSwitchCompanies,
    matchesCompany,
    createCompany,
    updateCompany,
    deleteCompany,
  } = useCompany();

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
    } catch {
      return {};
    }
  }, []);

  const userIsPlatform = isPlatformAdmin(currentUser);
  const assignableRoles = userIsPlatform ? ROLE_OPTIONS : COMPANY_ASSIGNABLE_ROLES;

  const [rawUsers, setRawUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Company Management modal (Platform Admins only)
  const [companyModal, setCompanyModal] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [companyForm, setCompanyForm] = useState({ name: '', industry: '', address: '', status: 'Active' });
  const [savingCompany, setSavingCompany] = useState(false);

  const buildEmptyUserForm = () => {
    const defaultRole = userIsPlatform ? 'Company Admin' : 'Manager';
    const defaultCompanyId = userIsPlatform
      ? (activeCompanyId !== 'ALL' ? activeCompanyId : DEFAULT_COMPANY_ID)
      : (currentUser?.companyId || DEFAULT_COMPANY_ID);
    return {
      name: '',
      email: '',
      password: '',
      role: defaultRole,
      jobTitle: defaultRole,
      companyId: defaultCompanyId,
      access: getRoleConfig(defaultRole).access,
      permissions: buildDefaultPermissionsForRole(defaultRole),
      status: 'Active',
    };
  };

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

  // Real-time Cloud Firestore listener (single source of truth)
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

  // Multi-company isolation: non-platform admins see ONLY their own company's users (never platform admins or other companies)
  const data = useMemo(() => {
    return rawUsers.filter((u) => {
      if (!u) return false;
      const targetIsPlatform = isPlatformAdmin(u);
      if (!userIsPlatform) {
        if (targetIsPlatform) return false;
        return matchesCompany(u);
      }
      if (activeCompanyId === 'ALL') return true;
      if (targetIsPlatform) return true;
      return matchesCompany(u);
    });
  }, [rawUsers, userIsPlatform, activeCompanyId, matchesCompany]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((d) =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q) ||
      (d.role || '').toLowerCase().includes(q) ||
      (d.jobTitle || '').toLowerCase().includes(q) ||
      (d.companyName || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);

  const isAllSelected = currentPageItems.length > 0 && currentPageItems.every((d) => selectedIds.includes(d.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const ids = new Set(currentPageItems.map((i) => i.id));
      setSelectedIds((prev) => prev.filter((id) => !ids.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentPageItems.map((i) => i.id)])));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const getCompanyNameById = (cid) => {
    if (!cid) return 'Platform (All Companies)';
    const match = companies.find((c) => c.id === cid);
    return match?.name || cid;
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const deletableIds = selectedIds.filter((id) => {
      const u = data.find((d) => d.id === id);
      return !u || !PROTECTED_EMAILS.has((u.email || '').toLowerCase());
    });
    if (deletableIds.length === 0) {
      return showToast('Notice', 'Primary Developer / Super Admin accounts are protected from deletion.', 'warning');
    }
    const confirmed = await showConfirmDelete(
      `Delete ${deletableIds.length} Selected Users?`,
      `Are you sure you want to remove ${deletableIds.length} user account(s)? This will revoke their portal access.`
    );
    if (confirmed) {
      try {
        await Promise.all(deletableIds.map((id) => deleteDoc(doc(db, 'users', id))));
        setSelectedIds([]);
        showToast('Users Deleted', `${deletableIds.length} user account(s) removed from Firestore.`, 'success');
      } catch (err) {
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected users.', 'error');
      }
    }
  };

  const openAdd = () => {
    setForm(buildEmptyUserForm());
    setEditId(null);
    setShowPassword(false);
    setModal(true);
  };

  const openEdit = (row) => {
    const normalizedRole = normalizeRoleName(row.role);
    const effectivePerms = getEffectivePermissions(row);
    setForm({
      name: row.name || '',
      email: row.email || '',
      password: '',
      role: normalizedRole,
      jobTitle: row.jobTitle || normalizedRole,
      companyId: isPlatformAdmin(row) ? '' : (row.companyId || DEFAULT_COMPANY_ID),
      access: row.access || getRoleConfig(normalizedRole).access,
      permissions: { ...effectivePerms },
      status: row.status || 'Active',
    });
    setEditId(row.id);
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

    const roleCfg = getRoleConfig(form.role);
    const targetIsPlatform = isPlatformAdmin({ role: roleCfg.role });
    const assignedCompanyId = targetIsPlatform
      ? null
      : (userIsPlatform ? (form.companyId || DEFAULT_COMPANY_ID) : (currentUser?.companyId || DEFAULT_COMPANY_ID));
    const assignedCompanyName = targetIsPlatform
      ? 'Platform (All Companies)'
      : getCompanyNameById(assignedCompanyId);

    const enabledPermCount = Object.values(form.permissions || {}).filter(Boolean).length;
    const accessSummary = targetIsPlatform
      ? roleCfg.access
      : `${enabledPermCount}/${MODULE_PERMISSIONS.length} Modules`;

    setIsSaving(true);
    try {
      const existingRow = editId ? rawUsers.find((u) => u.id === editId) : null;
      const payload = {
        id: editId || undefined,
        name: form.name.trim(),
        email: cleanEmail,
        role: roleCfg.role,
        jobTitle: (form.jobTitle || roleCfg.role).trim(),
        companyId: assignedCompanyId,
        companyName: assignedCompanyName,
        access: accessSummary,
        permissions: targetIsPlatform ? buildDefaultPermissionsForRole(roleCfg.role) : (form.permissions || buildDefaultPermissionsForRole(roleCfg.role)),
        status: form.status || 'Active',
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
        showToast('User Updated', `Updated role, company, and module permissions for ${payload.name}.`, 'success');
      } else {
        await registerAdminUser(payload);
        showToast('Account Created', `Created ${payload.jobTitle} (${payload.role}) account for ${payload.name}.`, 'success');
      }

      setModal(false);
      setForm(buildEmptyUserForm());
      setEditId(null);
    } catch (e) {
      console.error('Save user error:', e);
      showToast('Save Failed', e.message || 'Failed to save user to Firestore', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveUser = async (row) => {
    if (!userIsPlatform) {
      return showToast('Permission Required', 'Only System Super Admin or Developer can approve pending accounts.', 'warning');
    }
    try {
      await updateDoc(doc(db, 'users', row.id), {
        status: 'Active',
        approvedBy: currentUser?.email || currentUser?.name || 'System Super Admin',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showToast('Account Approved', `${row.name} (${row.role}) has been approved and activated.`, 'success');
    } catch (e) {
      showToast('Approval Failed', e.message || 'Could not approve user.', 'error');
    }
  };

  const handleDelete = async (id) => {
    const row = data.find((d) => d.id === id);
    if (!row) return;
    if (PROTECTED_EMAILS.has((row.email || '').toLowerCase())) {
      return showToast('Action Prohibited', 'Primary Developer / Super Administrator accounts cannot be removed.', 'warning');
    }
    const confirmed = await showConfirmDelete(
      'Remove Portal User?',
      `Are you sure you want to remove ${row.name || row.email}? This will revoke their portal access immediately.`
    );
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'users', id));
        showToast('User Removed', `Removed portal account for ${row.name}.`, 'success');
      } catch (e) {
        showToast('Delete Failed', e.message || 'Could not remove user', 'error');
      }
    }
  };

  // Company Management CRUD (Platform Admins only)
  const openAddCompany = () => {
    setEditingCompanyId(null);
    setCompanyForm({ name: '', industry: '', address: '', status: 'Active' });
    setCompanyModal(true);
  };

  const openEditCompany = (comp) => {
    setEditingCompanyId(comp.id);
    setCompanyForm({
      name: comp.name || '',
      industry: comp.industry || '',
      address: comp.address || '',
      status: comp.status || 'Active',
    });
    setCompanyModal(true);
  };

  const handleSaveCompany = async () => {
    if (!companyForm.name.trim()) {
      return showToast('Validation Error', 'Company Name is required.', 'error');
    }
    const cleanName = companyForm.name.trim().toLowerCase();
    const dupComp = companies.find(
      (c) => c.id !== editingCompanyId && (c.name || '').trim().toLowerCase() === cleanName
    );
    if (dupComp) {
      return showToast('Duplicate Company', `A company named "${companyForm.name.trim()}" already exists.`, 'error');
    }

    setSavingCompany(true);
    try {
      if (editingCompanyId) {
        await updateCompany(editingCompanyId, companyForm);
        showToast('Company Updated', `${companyForm.name.trim()} updated in Firestore.`, 'success');
      } else {
        const created = await createCompany(companyForm);
        showToast('Company Created', `${created.name} created and ready for isolated operations.`, 'success');
      }
      setCompanyModal(false);
    } catch (e) {
      showToast('Company Save Failed', e.message || 'Could not save company', 'error');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleDeleteCompany = async (comp) => {
    if (comp.id === DEFAULT_COMPANY_ID) {
      return showToast('Protected', 'Default Organization cannot be deleted.', 'warning');
    }
    const confirmed = await showConfirmDelete(
      `Delete Company "${comp.name}"?`,
      'Deleting this company removes it from the organization directory. Existing records keep their companyId.'
    );
    if (confirmed) {
      try {
        await deleteCompany(comp.id);
        showToast('Company Removed', `${comp.name} deleted.`, 'success');
      } catch (e) {
        showToast('Delete Failed', e.message || 'Could not delete company', 'error');
      }
    }
  };

  // KPI metrics from live Firestore users
  const totalUsers = data.length;
  const platformCount = data.filter((d) => isPlatformAdmin(d)).length;
  const companyAdminCount = data.filter((d) => normalizeRoleName(d.role) === 'Company Admin').length;
  const managerCount = data.filter((d) => normalizeRoleName(d.role) === 'Manager').length;
  const staffCount = data.filter((d) => !isPlatformAdmin(d) && normalizeRoleName(d.role) !== 'Company Admin' && normalizeRoleName(d.role) !== 'Manager').length;

  const rolePieData = useMemo(() => {
    if (totalUsers === 0) return [];
    return [
      { name: 'Platform Admin', value: platformCount, color: '#8B5CF6', pct: Math.round((platformCount / totalUsers) * 100) },
      { name: 'Company Admin', value: companyAdminCount, color: '#2563EB', pct: Math.round((companyAdminCount / totalUsers) * 100) },
      { name: 'Manager', value: managerCount, color: '#1E5ADB', pct: Math.round((managerCount / totalUsers) * 100) },
      { name: 'Staff / Sup / HR', value: staffCount, color: '#10B981', pct: Math.round((staffCount / totalUsers) * 100) },
    ].filter((item) => item.value > 0);
  }, [totalUsers, platformCount, companyAdminCount, managerCount, staffCount]);

  const accessBarData = useMemo(() => {
    if (totalUsers === 0) return [];
    return [
      { access: 'Platform', value: platformCount, color: '#8B5CF6' },
      { access: 'Company Admin', value: companyAdminCount, color: '#2563EB' },
      { access: 'Manager', value: managerCount, color: '#1E5ADB' },
      { access: 'Company Users', value: staffCount, color: '#10B981' },
    ];
  }, [totalUsers, platformCount, companyAdminCount, managerCount, staffCount]);

  return (
    <div style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Multi-Company Directory Bar (Visible to Developer / System Super Admin) */}
      {canSwitchCompanies && (
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={18} color="#1E5ADB" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Registered Companies ({companies.length})</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Each company has isolated employees, worksites, assignments, attendance, anomalies, and reports.</div>
              </div>
            </div>
            <button
              onClick={openAddCompany}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0F172A', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              <Plus size={14} /> Add Company
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveCompanyId('ALL')}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: activeCompanyId === 'ALL' ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                background: activeCompanyId === 'ALL' ? '#EFF6FF' : '#F8FAFC',
                color: activeCompanyId === 'ALL' ? '#1E5ADB' : '#334155',
              }}
            >
              All Companies
            </button>
            {companies.map((comp) => {
              const isSelected = activeCompanyId === comp.id;
              return (
                <div
                  key={comp.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 10,
                    border: isSelected ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                    background: isSelected ? '#EFF6FF' : '#FFFFFF',
                  }}
                >
                  <button
                    onClick={() => setActiveCompanyId(comp.id)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: isSelected ? '#1E5ADB' : '#0F172A', padding: 0 }}
                  >
                    {comp.name}
                  </button>
                  <button
                    onClick={() => openEditCompany(comp)}
                    title="Edit company"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', padding: 2, display: 'flex' }}
                  >
                    <Edit2 size={12} />
                  </button>
                  {comp.id !== DEFAULT_COMPANY_ID && (
                    <button
                      onClick={() => handleDeleteCompany(comp)}
                      title="Delete company"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#DC2626', padding: 2, display: 'flex' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top KPI Cards */}
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
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>COMPANY ADMINS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#2563EB" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#2563EB', marginTop: '8px' }}>{companyAdminCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>MANAGERS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCog size={18} color="#1E5ADB" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#1E5ADB', marginTop: '8px' }}>{managerCount}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>COMPANY STAFF</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={18} color="#10B981" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#10B981', marginTop: '8px' }}>{staffCount}</div>
        </div>

        {userIsPlatform && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '700', letterSpacing: '0.5px' }}>PLATFORM ADMINS</span>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Briefcase size={18} color="#8B5CF6" />
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#8B5CF6', marginTop: '8px' }}>{platformCount}</div>
          </div>
        )}
      </div>

      {/* Main Content Layout: Datatable Left + Telemetry Sidebar Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>

        {/* LEFT COLUMN: Search & Filter + Datatable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                placeholder="Search users by name, email, role, job title, or company..."
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
                    {['USER', 'COMPANY', 'ROLE & TITLE', 'PERMISSIONS', 'STATUS', 'ACTIONS'].map((h) => (
                      <th key={h} style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '44px 16px', textAlign: 'center', color: '#64748B' }}>
                        Syncing user accounts from Cloud Firestore...
                      </td>
                    </tr>
                  ) : currentPageItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '56px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={22} color="#94A3B8" />
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>
                            {search ? `No user found matching "${search}"` : 'No portal users in this scope'}
                          </div>
                          <button
                            onClick={openAdd}
                            style={{ marginTop: 6, padding: '8px 16px', background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Add User
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentPageItems.map((row) => {
                      const isSelected = selectedIds.includes(row.id);
                      const isProtected = PROTECTED_EMAILS.has((row.email || '').toLowerCase());
                      const initial = (row.name || row.email || 'U').charAt(0).toUpperCase();
                      const roleCfg = getRoleConfig(row.role);
                      const effPerms = getEffectivePermissions(row);
                      const enabledKeys = MODULE_PERMISSIONS.filter((m) => effPerms[m.key]).map((m) => m.label);

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
                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{row.name || 'Unnamed User'}</div>
                                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>{row.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: '#334155' }}>
                            {isPlatformAdmin(row) ? (
                              <span style={{ background: '#F3E8FF', color: '#6D28D9', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                All Companies
                              </span>
                            ) : (
                              row.companyName || getCompanyNameById(row.companyId || DEFAULT_COMPANY_ID)
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                              borderRadius: 20, background: roleCfg.bg, color: roleCfg.color,
                              border: `1px solid ${roleCfg.border}`, fontWeight: 700, fontSize: 11
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleCfg.color }} />
                              {roleCfg.role}
                            </span>
                            {row.jobTitle && row.jobTitle !== roleCfg.role && (
                              <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{row.jobTitle}</div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1E5ADB' }}>
                              {enabledKeys.length}/{MODULE_PERMISSIONS.length} Modules
                            </div>
                            <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }} title={enabledKeys.join(', ')}>
                              {enabledKeys.slice(0, 3).join(', ')}{enabledKeys.length > 3 ? ` +${enabledKeys.length - 3} more` : ''}
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
                              {userIsPlatform && row.status === 'Pending Approval' && (
                                <button
                                  onClick={() => handleApproveUser(row)}
                                  title="Approve Company Admin / User"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px',
                                    height: '28px', borderRadius: '6px', border: '1px solid #6EE7B7',
                                    backgroundColor: '#ECFDF5', color: '#065F46', fontWeight: '700',
                                    fontSize: '11px', cursor: 'pointer'
                                  }}
                                >
                                  <Check size={13} color="#059669" /> Approve
                                </button>
                              )}
                              <button
                                onClick={() => openEdit(row)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px',
                                  height: '28px', borderRadius: '6px', border: '1px solid #DBEAFE',
                                  backgroundColor: '#FFFFFF', color: '#1E5ADB', fontWeight: '700',
                                  fontSize: '11px', cursor: 'pointer'
                                }}
                              >
                                <Edit2 size={13} color="#1E5ADB" /> Edit
                              </button>
                              {!isProtected && (
                                <button
                                  onClick={() => handleDelete(row.id)}
                                  title="Remove user"
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

        {/* RIGHT COLUMN: REAL USER TELEMETRY SIDEBAR */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KeyRound size={18} color="#1E5ADB" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Role Distribution</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '500' }}>{activeCompany ? activeCompany.name : 'All Companies'}</span>
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
                <Users size={15} color="#1E5ADB" /> Role Composition
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
                    <Pie data={rolePieData} cx="50%" cy="50%" innerRadius={46} outerRadius={66} paddingAngle={rolePieData.length > 1 ? 4 : 0} dataKey="value">
                      {rolePieData.map((entry, index) => (
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

            {rolePieData.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(rolePieData.length, 2)}, 1fr)`, gap: 8, background: '#F8FAFC', padding: '10px', borderRadius: '10px' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={15} color="#8B5CF6" /> Access Hierarchy
              </span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#8B5CF6' }}>Configurable RBAC</span>
            </div>
            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={accessBarData} margin={{ top: 5, right: 15, left: 35, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="access" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={95} />
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

      {/* Add / Edit User & Configurable Module Permissions Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  {editId ? 'Edit User Account & Permissions' : 'Add Portal User'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  Assign company scope, role, custom job title, and module-level access permissions.
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
                  placeholder="e.g. John Doe"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. john@company.com"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Access Tier *</label>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const r = e.target.value;
                    const cfg = getRoleConfig(r);
                    setForm((prev) => ({
                      ...prev,
                      role: r,
                      jobTitle: prev.jobTitle && prev.jobTitle !== prev.role ? prev.jobTitle : r,
                      access: cfg.access,
                      permissions: buildDefaultPermissionsForRole(r),
                    }));
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white', fontWeight: 600, color: '#0F172A', boxSizing: 'border-box' }}
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Position / Title (Label)</label>
                <input
                  value={form.jobTitle || ''}
                  onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                  placeholder="e.g. HR, Operations Lead, Field Supervisor"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {!isPlatformAdmin({ role: form.role }) && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Assigned Company *</label>
                  {userIsPlatform ? (
                    <select
                      value={form.companyId || DEFAULT_COMPANY_ID}
                      onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white', fontWeight: 600, color: '#0F172A', boxSizing: 'border-box' }}
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      readOnly
                      value={getCompanyNameById(currentUser?.companyId || DEFAULT_COMPANY_ID)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, background: '#F8FAFC', color: '#475569', fontWeight: 600, boxSizing: 'border-box' }}
                    />
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Account Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="Active">Active (Approved)</option>
                  <option value="Pending Approval">Pending Approval</option>
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

            {/* Configurable Per-Module Permissions Matrix */}
            <div style={{ marginTop: 18, background: '#F8FAFC', borderRadius: 12, padding: 14, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#0F172A' }}>
                  <Sliders size={14} color="#1E5ADB" /> Configurable Module Permissions
                </div>
                {!isPlatformAdmin({ role: form.role }) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const all = {};
                        MODULE_PERMISSIONS.forEach((m) => { all[m.key] = true; });
                        setForm((p) => ({ ...p, permissions: all }));
                      }}
                      style={{ fontSize: 11, fontWeight: 700, color: '#1E5ADB', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, permissions: buildDefaultPermissionsForRole(p.role) }))}
                      style={{ fontSize: 11, fontWeight: 700, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Role Defaults
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const none = { dashboard: true };
                        MODULE_PERMISSIONS.forEach((m) => { if (m.key !== 'dashboard') none[m.key] = false; });
                        setForm((p) => ({ ...p, permissions: none }));
                      }}
                      style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {isPlatformAdmin({ role: form.role }) ? (
                <div style={{ fontSize: 12, color: '#6D28D9', fontWeight: 600 }}>
                  {form.role} sits outside individual companies and manages company registration &amp; Company Admin approvals across the platform.
                </div>
              ) : normalizeRoleName(form.role) === 'Company Admin' ? (
                <div style={{ fontSize: 12, color: '#1E40AF', fontWeight: 600 }}>
                  Company Admin holds full management access strictly inside their assigned company (creating users, configuring permissions, worksites, employees, and reports).
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
                    <strong>Position/Title is a label only.</strong> Actual module access is strictly controlled by the checked permissions below — two companies can assign completely different permissions to the same position (e.g., HR, Manager, or Supervisor).
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
                {isSaving ? 'Saving...' : editId ? 'Save User Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Company Modal (Platform Admins only) */}
      {companyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0F172A' }}>
                {editingCompanyId ? 'Edit Company' : 'Create New Company'}
              </h3>
              <button onClick={() => setCompanyModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Company Name *</label>
                <input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  placeholder="e.g. Company B Security Services"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Industry</label>
                <input
                  value={companyForm.industry}
                  onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                  placeholder="e.g. Logistics, Security, Field Maintenance"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Address</label>
                <input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder="Company headquarters address"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Status</label>
                <select
                  value={companyForm.status}
                  onChange={(e) => setCompanyForm({ ...companyForm, status: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setCompanyModal(false)}
                disabled={savingCompany}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCompany}
                disabled={savingCompany}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#1E5ADB', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
              >
                {savingCompany ? 'Saving...' : editingCompanyId ? 'Update Company' : 'Create Company'}
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
