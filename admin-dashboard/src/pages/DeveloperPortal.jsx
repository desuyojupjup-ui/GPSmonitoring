import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ShieldCheck, Plus, Edit2, Trash2, X, Search,
  CheckCircle2, Users, Eye, EyeOff, KeyRound, Globe, UserPlus,
  CreditCard, Power, PauseCircle, Check, Activity, Briefcase, Upload, Image as ImageIcon, Smartphone, Download, ExternalLink
} from 'lucide-react';
import {
  db, collection, onSnapshot, setDoc, updateDoc, deleteDoc, doc, query, serverTimestamp,
  registerAdminUser, recordSystemActivityLog
} from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import {
  DEVELOPER_ASSIGNABLE_ROLES,
  buildDefaultPermissionsForRole,
  normalizeRoleName,
  isDeveloper,
  isCompanyAdmin,
} from '../utils/roles';
import { useCompany, DEFAULT_COMPANY_ID, SUBSCRIPTION_PLANS } from '../utils/companyContext';

const PROTECTED_EMAILS = new Set(['developer@subai.com']);

const COMPANY_STATUS_STYLE = {
  'Active':    { background: '#D1FAE5', color: '#065F46', dot: '#10B981', border: '#A7F3D0' },
  'Pending':   { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B', border: '#FDE68A' },
  'Suspended': { background: '#FEE2E2', color: '#991B1B', dot: '#EF4444', border: '#FCA5A5' },
  'Inactive':  { background: '#F1F5F9', color: '#475569', dot: '#94A3B8', border: '#CBD5E1' },
};

const USER_STATUS_STYLE = {
  'Active':           { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Pending Approval': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Inactive':         { background: '#F1F5F9', color: '#475569', dot: '#94A3B8' },
};

const PLAN_BADGE_STYLE = {
  'Starter':    { background: '#F1F5F9', color: '#334155', border: '#CBD5E1' },
  'Business':   { background: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'Enterprise': { background: '#F3E8FF', color: '#6D28D9', border: '#DDD6FE' },
};

const cardStyle = {
  backgroundColor: '#FFFFFF',
  padding: '20px',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: '1px solid #E2E8F0',
};

/**
 * Developer / System Provider Portal (/developer)
 *
 * The Developer is the SaaS system provider — completely separate from the Company Admin Portal:
 *  - Manages client companies (ABC Logistics, XYZ Construction, DEF Delivery Services, etc.)
 *  - Manages company subscriptions, plans/packages, company owners, company status & activation
 *  - Provisions & approves Company Admins (who then log in at /login to manage ONLY their own company)
 *  - Monitors live employee & admin totals per company from Firestore
 */
export default function DeveloperPortal() {
  const navigate = useNavigate();
  const { companies, createCompany, updateCompany, deleteCompany, user: currentUser } = useCompany();

  const [allUsers, setAllUsers] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [companySearch, setCompanySearch] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState('All');
  const [adminSearch, setAdminSearch] = useState('');

  // Company Onboarding / Edit Modal State
  const companyLogoInputRef = useRef(null);
  const [companyModal, setCompanyModal] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [showOwnerPass, setShowOwnerPass] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: '',
    industry: '',
    address: '',
    ownerName: '',
    ownerEmail: '',
    plan: 'Business',
    subscriptionStatus: 'Active',
    status: 'Active',
    maxEmployees: 100,
    logoUrl: null,
    createAdminAccount: true,
    adminPassword: '',
  });

  const compressCompanyLogo = (file, maxWidth = 360, maxHeight = 110, mimeType = 'image/png', quality = 0.85) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(mimeType === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL(mimeType, quality));
      };
      img.onerror = () => resolve(null);
      const reader = new FileReader();
      reader.onload = (ev) => { img.src = ev.target.result; };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleDeveloperLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      return showToast('File Too Large', 'Please choose a company logo under 8MB.', 'warning');
    }
    try {
      let optimized = await compressCompanyLogo(file, 360, 110, 'image/png', 0.85);
      if (optimized && optimized.length > 180000) {
        optimized = await compressCompanyLogo(file, 300, 90, 'image/webp', 0.82);
      }
      if (optimized) {
        setCompanyForm((prev) => ({ ...prev, logoUrl: optimized }));
        showToast('Logo Attached', 'Company logo preview updated. Save to apply across the company portal.', 'info');
      }
    } catch (err) {
      showToast('Upload Failed', 'Could not read logo image.', 'error');
    }
  };

  // Provision / Edit Company Admin or Developer Modal State
  const [adminModal, setAdminModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Company Admin',
    jobTitle: 'Company Owner / Admin',
    companyId: DEFAULT_COMPANY_ID,
    status: 'Active',
  });

  // Mobile App APK Release Distribution State (Firestore platform_config/mobile_app)
  const [apkRelease, setApkRelease] = useState(null);
  const [apkModal, setApkModal] = useState(false);
  const [savingApk, setSavingApk] = useState(false);
  const [apkForm, setApkForm] = useState({
    version: 'v2.1.0',
    apkUrl: '',
    releaseNotes: 'Multi-company live branding, facial verification, real-time GPS monitoring, and post-shift Late Checkout.',
  });

  // Live Firestore subscriptions (single source of truth)
  useEffect(() => {
    setLoadingUsers(true);
    const unsubUsers = onSnapshot(
      query(collection(db, 'users')),
      (snap) => {
        setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingUsers(false);
      },
      (err) => {
        console.error('[DeveloperPortal] users listener error:', err);
        setLoadingUsers(false);
      }
    );
    const unsubEmployees = onSnapshot(
      query(collection(db, 'employees')),
      (snap) => {
        setAllEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => {}
    );
    const unsubApk = onSnapshot(
      doc(db, 'platform_config', 'mobile_app'),
      (snap) => {
        if (snap.exists && snap.exists()) {
          setApkRelease(snap.data());
        } else {
          setApkRelease(null);
        }
      },
      () => {}
    );
    return () => {
      unsubUsers();
      unsubEmployees();
      unsubApk();
    };
  }, []);

  const openApkReleaseModal = () => {
    setApkForm({
      version: apkRelease?.version || 'v2.1.0',
      apkUrl: apkRelease?.apkUrl || '',
      releaseNotes: apkRelease?.releaseNotes || 'Multi-company live branding, facial verification, real-time GPS monitoring, and post-shift Late Checkout.',
    });
    setApkModal(true);
  };

  const handleSaveApkRelease = async () => {
    const cleanUrl = (apkForm.apkUrl || '').trim();
    if (!apkForm.version.trim()) {
      return showToast('Validation Error', 'App Version is required (e.g., v2.1.0).', 'error');
    }
    if (cleanUrl && !/^https?:\/\/|^\//i.test(cleanUrl)) {
      return showToast('Invalid URL', 'Enter a valid https:// download link or /downloads/subai-employee.apk path.', 'error');
    }
    setSavingApk(true);
    try {
      await setDoc(doc(db, 'platform_config', 'mobile_app'), {
        version: apkForm.version.trim(),
        apkUrl: cleanUrl,
        releaseNotes: (apkForm.releaseNotes || '').trim(),
        updatedBy: currentUser?.email || 'developer@subai.com',
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      }, { merge: true });

      await recordSystemActivityLog({
        action: `Published Employee Mobile App APK release ${apkForm.version.trim()}`,
        module: 'System',
        status: 'Success',
        user: currentUser?.email || 'developer@subai.com',
        companyId: DEFAULT_COMPANY_ID,
      }).catch(() => {});

      showToast(
        'APK Release Published',
        cleanUrl
          ? `Version ${apkForm.version.trim()} is now downloadable inside every active Company Admin Portal.`
          : 'Mobile app release info updated.',
        'success'
      );
      setApkModal(false);
    } catch (e) {
      showToast('Publish Failed', e.message || 'Could not publish APK release to Firestore.', 'error');
    } finally {
      setSavingApk(false);
    }
  };

  const getCompanyName = (cid) => {
    if (!cid) return 'SUBAI System Provider';
    const match = companies.find((c) => c.id === cid);
    return match?.name || cid;
  };

  // Company Admins & Developers managed by System Provider
  const managedAccounts = useMemo(() => {
    return allUsers.filter((u) => isCompanyAdmin(u) || isDeveloper(u));
  }, [allUsers]);

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return companies.filter((c) => {
      const st = c.status || 'Active';
      if (companyStatusFilter !== 'All' && st !== companyStatusFilter) return false;
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.ownerName || '').toLowerCase().includes(q) ||
        (c.ownerEmail || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.plan || '').toLowerCase().includes(q)
      );
    });
  }, [companies, companySearch, companyStatusFilter]);

  const filteredAdmins = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) return managedAccounts;
    return managedAccounts.filter((u) =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      getCompanyName(u.companyId).toLowerCase().includes(q)
    );
  }, [managedAccounts, adminSearch, companies]);

  const activeCompaniesCount = companies.filter((c) => (c.status || 'Active') === 'Active').length;
  const pendingCompaniesCount = companies.filter((c) => c.status === 'Pending').length;
  const suspendedCompaniesCount = companies.filter((c) => c.status === 'Suspended' || c.status === 'Inactive').length;
  const companyAdminCount = allUsers.filter((u) => isCompanyAdmin(u)).length;
  const pendingAdminApprovals = allUsers.filter((u) => isCompanyAdmin(u) && u.status === 'Pending Approval').length;
  const totalEmployeesCount = allEmployees.length;

  // ── Company CRUD & Activation ───────────────────────────────────────────
  const openAddCompany = () => {
    setEditingCompanyId(null);
    setShowOwnerPass(false);
    if (companyLogoInputRef.current) companyLogoInputRef.current.value = '';
    setCompanyForm({
      name: '',
      industry: '',
      address: '',
      ownerName: '',
      ownerEmail: '',
      plan: 'Business',
      subscriptionStatus: 'Active',
      status: 'Active',
      maxEmployees: 100,
      logoUrl: null,
      createAdminAccount: true,
      adminPassword: '',
    });
    setCompanyModal(true);
  };

  const openEditCompany = (comp) => {
    setEditingCompanyId(comp.id);
    setShowOwnerPass(false);
    if (companyLogoInputRef.current) companyLogoInputRef.current.value = '';
    setCompanyForm({
      name: comp.name || '',
      industry: comp.industry || '',
      address: comp.address || '',
      ownerName: comp.ownerName || '',
      ownerEmail: comp.ownerEmail || '',
      plan: comp.plan || 'Business',
      subscriptionStatus: comp.subscriptionStatus || (comp.status === 'Active' ? 'Active' : comp.status || 'Active'),
      status: comp.status || 'Active',
      maxEmployees: comp.maxEmployees || 100,
      logoUrl: comp.logoUrl || null,
      createAdminAccount: false,
      adminPassword: '',
    });
    setCompanyModal(true);
  };

  const handleSaveCompany = async () => {
    if (!companyForm.name.trim()) {
      return showToast('Validation Error', 'Company Name is required.', 'error');
    }
    const cleanName = companyForm.name.trim().toLowerCase();
    const dup = companies.find(
      (c) => c.id !== editingCompanyId && (c.name || '').trim().toLowerCase() === cleanName
    );
    if (dup) {
      return showToast('Duplicate Company', `"${companyForm.name.trim()}" is already registered.`, 'error');
    }

    const shouldCreateAdmin = !editingCompanyId && companyForm.createAdminAccount;
    const cleanOwnerEmail = (companyForm.ownerEmail || '').trim().toLowerCase();
    if (shouldCreateAdmin) {
      if (!companyForm.ownerName.trim() || !cleanOwnerEmail) {
        return showToast('Owner Details Required', 'Enter Company Owner Name and Owner Email to create their Company Admin login.', 'error');
      }
      if (!/\S+@\S+\.\S+/.test(cleanOwnerEmail)) {
        return showToast('Validation Error', 'Enter a valid Company Owner email address.', 'error');
      }
      if (!companyForm.adminPassword.trim() || companyForm.adminPassword.trim().length < 6) {
        return showToast('Password Required', 'Set an initial Company Admin password (min. 6 characters).', 'error');
      }
      const dupUser = allUsers.find((u) => (u.email || '').trim().toLowerCase() === cleanOwnerEmail);
      if (dupUser) {
        return showToast('Duplicate Email', `Email "${cleanOwnerEmail}" is already registered to another account.`, 'error');
      }
    }

    setSavingCompany(true);
    try {
      const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === companyForm.plan) || SUBSCRIPTION_PLANS[1];
      const payload = {
        name: companyForm.name.trim(),
        industry: companyForm.industry.trim(),
        address: companyForm.address.trim(),
        ownerName: companyForm.ownerName.trim(),
        ownerEmail: cleanOwnerEmail,
        plan: selectedPlan.id,
        maxEmployees: Number(companyForm.maxEmployees) || selectedPlan.maxEmployees,
        subscriptionStatus: companyForm.subscriptionStatus || (companyForm.status === 'Active' ? 'Active' : companyForm.status),
        status: companyForm.status || 'Active',
        logoUrl: companyForm.logoUrl || null,
      };

      if (editingCompanyId) {
        await updateCompany(editingCompanyId, payload);
        await recordSystemActivityLog({
          action: `Updated client company "${payload.name}" (${payload.plan} • ${payload.status})`,
          module: 'System',
          status: 'Success',
          user: currentUser?.email || 'developer@subai.com',
          companyId: editingCompanyId,
        }).catch(() => {});
        showToast('Company Updated', `${payload.name} updated in Firestore.`, 'success');
      } else {
        const created = await createCompany(payload);

        if (shouldCreateAdmin) {
          const initialAdminStatus = payload.status === 'Pending' ? 'Pending Approval' : 'Active';
          await registerAdminUser({
            name: companyForm.ownerName.trim(),
            email: cleanOwnerEmail,
            password: companyForm.adminPassword.trim(),
            role: 'Company Admin',
            jobTitle: 'Company Owner / Admin',
            companyId: created.id,
            companyName: created.name,
            access: `Full Company Admin Portal (${created.name})`,
            permissions: buildDefaultPermissionsForRole('Company Admin'),
            status: initialAdminStatus,
          });
        }

        await recordSystemActivityLog({
          action: `Registered client company "${created.name}" (${payload.plan} • Owner: ${payload.ownerName || 'N/A'})`,
          module: 'System',
          status: 'Success',
          user: currentUser?.email || 'developer@subai.com',
          companyId: created.id,
        }).catch(() => {});

        showToast(
          'Company Registered',
          shouldCreateAdmin
            ? `${created.name} & Company Admin login (${cleanOwnerEmail}) created! They sign in at /login.`
            : `${created.name} registered! Add a Company Admin so they can sign in at /login.`,
          'success'
        );
      }
      setCompanyModal(false);
    } catch (e) {
      showToast('Save Failed', e.message || 'Could not save company.', 'error');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleToggleCompanyStatus = async (comp, nextStatus) => {
    try {
      const nextSubStatus = nextStatus === 'Active' ? 'Active' : nextStatus;
      await updateCompany(comp.id, { status: nextStatus, subscriptionStatus: nextSubStatus });

      // When activating a company, automatically approve any Pending Approval Company Admins for that company
      if (nextStatus === 'Active') {
        const pendingCompAdmins = allUsers.filter(
          (u) => isCompanyAdmin(u) && (u.companyId || DEFAULT_COMPANY_ID) === comp.id && u.status === 'Pending Approval'
        );
        await Promise.all(
          pendingCompAdmins.map((u) =>
            updateDoc(doc(db, 'users', u.id), {
              status: 'Active',
              approvedBy: currentUser?.email || 'developer@subai.com',
              approvedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }).catch(() => {})
          )
        );
      }

      await recordSystemActivityLog({
        action: `${nextStatus === 'Active' ? 'Activated' : 'Suspended'} company "${comp.name}"`,
        module: 'System',
        status: nextStatus === 'Active' ? 'Success' : 'Warning',
        user: currentUser?.email || 'developer@subai.com',
        companyId: comp.id,
      }).catch(() => {});

      showToast(
        nextStatus === 'Active' ? 'Company Activated' : 'Company Suspended',
        nextStatus === 'Active'
          ? `${comp.name} is now Active. Their Company Admin can sign in at /login.`
          : `${comp.name} has been suspended. Company Portal logins are blocked until reactivated.`,
        nextStatus === 'Active' ? 'success' : 'warning'
      );
    } catch (e) {
      showToast('Status Update Failed', e.message || 'Could not update company status.', 'error');
    }
  };

  const handleDeleteCompany = async (comp) => {
    if (comp.id === DEFAULT_COMPANY_ID) {
      return showToast('Protected', 'Default Organization cannot be deleted.', 'warning');
    }
    const ok = await showConfirmDelete(
      `Remove Company "${comp.name}"?`,
      'This removes the company from the customer directory. Existing Firestore records keep their companyId.'
    );
    if (!ok) return;
    try {
      await deleteCompany(comp.id);
      showToast('Company Removed', `${comp.name} removed.`, 'success');
    } catch (e) {
      showToast('Delete Failed', e.message || 'Could not delete company.', 'error');
    }
  };

  // ── Company Admin Provisioning & Approval ───────────────────────────────
  const openProvisionAdmin = (preselectedCompanyId = null) => {
    const targetComp = companies.find((c) => c.id === preselectedCompanyId) || companies[0];
    setEditingUserId(null);
    setShowPassword(false);
    setAdminForm({
      name: targetComp?.ownerName && !allUsers.some((u) => isCompanyAdmin(u) && u.companyId === targetComp.id) ? targetComp.ownerName : '',
      email: targetComp?.ownerEmail && !allUsers.some((u) => isCompanyAdmin(u) && u.companyId === targetComp.id) ? targetComp.ownerEmail : '',
      password: '',
      role: 'Company Admin',
      jobTitle: 'Company Owner / Admin',
      companyId: targetComp?.id || DEFAULT_COMPANY_ID,
      status: 'Active',
    });
    setAdminModal(true);
  };

  const openEditAdmin = (row) => {
    setEditingUserId(row.id);
    setShowPassword(false);
    setAdminForm({
      name: row.name || '',
      email: row.email || '',
      password: '',
      role: normalizeRoleName(row.role),
      jobTitle: row.jobTitle || (isDeveloper(row) ? 'System Provider / Developer' : 'Company Owner / Admin'),
      companyId: isDeveloper(row) ? '' : (row.companyId || DEFAULT_COMPANY_ID),
      status: row.status || 'Active',
    });
    setAdminModal(true);
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.name.trim() || !adminForm.email.trim()) {
      return showToast('Validation Error', 'Full Name and Email Address are required.', 'error');
    }
    const cleanEmail = adminForm.email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      return showToast('Validation Error', 'Please enter a valid email address.', 'error');
    }
    if (!editingUserId && (!adminForm.password.trim() || adminForm.password.trim().length < 6)) {
      return showToast('Validation Error', 'Password must be at least 6 characters.', 'error');
    }
    if (adminForm.password.trim() && adminForm.password.trim().length < 6) {
      return showToast('Validation Error', 'Password must be at least 6 characters.', 'error');
    }

    const dupEmail = allUsers.find(
      (u) => u.id !== editingUserId && (u.email || '').trim().toLowerCase() === cleanEmail
    );
    if (dupEmail) {
      return showToast('Duplicate Email', `Email "${cleanEmail}" is already registered.`, 'error');
    }

    const targetIsDev = isDeveloper({ role: adminForm.role });
    if (!targetIsDev && !adminForm.companyId) {
      return showToast('Company Required', 'Select which company this Company Admin belongs to.', 'error');
    }

    const assignedCompanyId = targetIsDev ? null : adminForm.companyId;
    const assignedCompanyName = targetIsDev ? 'SUBAI System Provider' : getCompanyName(assignedCompanyId);

    setSavingUser(true);
    try {
      const existing = editingUserId ? allUsers.find((u) => u.id === editingUserId) : null;
      const payload = {
        id: editingUserId || undefined,
        name: adminForm.name.trim(),
        email: cleanEmail,
        role: targetIsDev ? 'Developer' : 'Company Admin',
        jobTitle: (adminForm.jobTitle || (targetIsDev ? 'System Provider / Developer' : 'Company Owner / Admin')).trim(),
        companyId: assignedCompanyId,
        companyName: assignedCompanyName,
        access: targetIsDev
          ? 'Developer Portal — Companies, Subscriptions & System Monitoring'
          : `Full Company Admin Portal (${assignedCompanyName})`,
        permissions: buildDefaultPermissionsForRole(targetIsDev ? 'Developer' : 'Company Admin'),
        status: adminForm.status || 'Active',
        lastLogin: existing?.lastLogin || 'Never',
      };

      if (!targetIsDev && payload.status === 'Active') {
        payload.approvedBy = existing?.approvedBy || currentUser?.email || 'developer@subai.com';
        payload.approvedAt = existing?.approvedAt || new Date().toISOString();
      }

      if (adminForm.password.trim()) {
        payload.password = adminForm.password.trim();
      } else if (existing?.password) {
        payload.password = existing.password;
      }

      if (editingUserId) {
        await updateDoc(doc(db, 'users', editingUserId), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        await registerAdminUser({ ...payload, id: editingUserId }).catch(() => {});
        showToast('Account Updated', `Updated ${payload.role} account for ${payload.name}.`, 'success');
      } else {
        await registerAdminUser(payload);
        showToast(
          targetIsDev ? 'Developer Account Added' : 'Company Admin Provisioned',
          targetIsDev
            ? `${payload.name} can now access the Developer Portal (/developer-login).`
            : `${payload.name} is now Company Admin for ${assignedCompanyName} and signs in at the Company Admin Portal (/login).`,
          'success'
        );
      }
      setAdminModal(false);
    } catch (e) {
      showToast('Save Failed', e.message || 'Could not save account.', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleApproveAdmin = async (row) => {
    try {
      await updateDoc(doc(db, 'users', row.id), {
        status: 'Active',
        approvedBy: currentUser?.email || 'developer@subai.com',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await recordSystemActivityLog({
        action: `Approved Company Admin "${row.name}" for ${getCompanyName(row.companyId)}`,
        module: 'Security',
        status: 'Success',
        user: currentUser?.email || 'developer@subai.com',
        companyId: row.companyId || DEFAULT_COMPANY_ID,
      }).catch(() => {});
      showToast('Company Admin Approved', `${row.name} can now sign in at the Company Admin Portal (/login).`, 'success');
    } catch (e) {
      showToast('Approval Failed', e.message || 'Could not approve Company Admin.', 'error');
    }
  };

  const handleDeleteAdmin = async (row) => {
    if (PROTECTED_EMAILS.has((row.email || '').toLowerCase())) {
      return showToast('Protected', 'Primary Developer account cannot be removed.', 'warning');
    }
    const ok = await showConfirmDelete(
      `Remove ${row.role} "${row.name}"?`,
      `This immediately revokes portal access for ${row.email}.`
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'users', row.id));
      showToast('Account Removed', `${row.name} removed from Firestore.`, 'success');
    } catch (e) {
      showToast('Delete Failed', e.message || 'Could not remove account.', 'error');
    }
  };

  return (
    <div style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* System Provider Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
        borderRadius: 16,
        padding: '22px 24px',
        color: '#FFFFFF',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
      }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(56, 189, 248, 0.18)', border: '1px solid rgba(56, 189, 248, 0.45)',
            color: '#7DD3FC', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, marginBottom: 10
          }}>
            <Globe size={12} /> DEVELOPER / SYSTEM PROVIDER PORTAL
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Subscribed Companies, Plans &amp; Company Admin Management
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#CBD5E1', lineHeight: 1.55 }}>
            Register client companies, manage subscription packages, activate or suspend company accounts, and approve each customer&apos;s <strong>Company Owner / Company Admin</strong>. Each customer operates exclusively inside their isolated <strong>Company Admin Portal</strong> (<code>/login</code>).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={openAddCompany}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: '#0EA5E9', color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Register Company
          </button>
          <button
            onClick={() => openProvisionAdmin()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'rgba(255,255,255,0.14)', color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.28)',
              borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}
          >
            <UserPlus size={16} /> Add Company Admin
          </button>
          <button
            onClick={openApkReleaseModal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'rgba(139, 92, 246, 0.25)', color: '#DDD6FE',
              border: '1px solid rgba(167, 139, 250, 0.5)',
              borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}
          >
            <Smartphone size={16} /> Mobile APK Release
          </button>
          <button
            onClick={() => navigate('/developer/monitoring')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'rgba(16, 185, 129, 0.2)', color: '#A7F3D0',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}
          >
            <Activity size={16} /> System Monitoring
          </button>
        </div>
      </div>

      {/* System Provider KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px' }}>SUBSCRIBED COMPANIES</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} color="#0284C7" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginTop: 8 }}>{companies.length}</div>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginTop: 4 }}>
            <span style={{ color: '#059669' }}>{activeCompaniesCount} Active</span> &bull;{' '}
            <span style={{ color: '#D97706' }}>{pendingCompaniesCount} Pending</span> &bull;{' '}
            <span style={{ color: '#DC2626' }}>{suspendedCompaniesCount} Suspended</span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px' }}>COMPANY ADMINS</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#1E5ADB" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1E5ADB', marginTop: 8 }}>{companyAdminCount}</div>
          <div style={{ fontSize: 11, color: pendingAdminApprovals > 0 ? '#D97706' : '#059669', fontWeight: 600, marginTop: 4 }}>
            {pendingAdminApprovals > 0 ? `${pendingAdminApprovals} Pending Approval` : 'All Company Admins Approved'}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px' }}>TOTAL EMPLOYEES (ALL TENANTS)</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#059669" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#065F46', marginTop: 8 }}>{totalEmployeesCount}</div>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 4 }}>Live count across isolated companies</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px' }}>PORTAL ISOLATION</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} color="#7C3AED" />
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#6D28D9', marginTop: 12 }}>Strict Two-Portal SaaS</div>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginTop: 4 }}>Developer Portal &ne; Company Portal</div>
        </div>
      </div>

      {/* SECTION 1: Subscribed Companies, Plans & Activation */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Client Companies &amp; Subscriptions</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
              Each customer has its own isolated database scope, plan package, company owner, and Company Admin login.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {['All', 'Active', 'Pending', 'Suspended'].map((st) => (
              <button
                key={st}
                onClick={() => setCompanyStatusFilter(st)}
                style={{
                  padding: '6px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: companyStatusFilter === st ? '1.5px solid #0284C7' : '1px solid #E2E8F0',
                  background: companyStatusFilter === st ? '#E0F2FE' : '#F8FAFC',
                  color: companyStatusFilter === st ? '#0369A1' : '#475569',
                }}
              >
                {st}
              </button>
            ))}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search company, owner, plan..."
                style={{ paddingLeft: 32, paddingRight: 10, height: 34, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, outline: 'none' }}
              />
            </div>
            <button
              onClick={openAddCompany}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0F172A', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '0 14px', height: 34, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              <Plus size={14} /> Add Company
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>
                <th style={{ padding: '10px 14px' }}>Company</th>
                <th style={{ padding: '10px 14px' }}>Company Owner</th>
                <th style={{ padding: '10px 14px' }}>Plan &amp; Subscription</th>
                <th style={{ padding: '10px 14px' }}>Live Usage</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#64748B' }}>
                    No companies match this filter. Click <strong>Add Company</strong> to onboard a customer (e.g., ABC Logistics).
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((comp) => {
                  const compEmployees = allEmployees.filter((e) => (e.companyId || DEFAULT_COMPANY_ID) === comp.id).length;
                  const compAdmins = allUsers.filter((u) => isCompanyAdmin(u) && (u.companyId || DEFAULT_COMPANY_ID) === comp.id);
                  const compStaff = allUsers.filter((u) => !isDeveloper(u) && !isCompanyAdmin(u) && (u.companyId || DEFAULT_COMPANY_ID) === comp.id).length;
                  const status = comp.status || 'Active';
                  const st = COMPANY_STATUS_STYLE[status] || COMPANY_STATUS_STYLE.Active;
                  const planName = comp.plan || 'Business';
                  const planStyle = PLAN_BADGE_STYLE[planName] || PLAN_BADGE_STYLE.Business;

                  return (
                    <tr key={comp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {comp.logoUrl ? (
                            <div style={{ width: 52, height: 38, borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                              <img
                                src={comp.logoUrl}
                                alt={comp.name}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div style={{ width: 52, height: 38, borderRadius: 8, background: '#EFF6FF', border: '1px solid #DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                              {(comp.name || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{comp.name}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>
                              {comp.industry || 'General Operations'} &bull; <span style={{ fontFamily: 'monospace' }}>{comp.id}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#1E293B', fontSize: 12 }}>
                          {comp.ownerName || compAdmins[0]?.name || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>
                          {comp.ownerEmail || compAdmins[0]?.email || 'No owner email'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20,
                          fontSize: 11, fontWeight: 700, background: planStyle.background, color: planStyle.color,
                          border: `1px solid ${planStyle.border}`
                        }}>
                          <CreditCard size={11} /> {planName}
                        </span>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                          Sub: <strong>{comp.subscriptionStatus || status}</strong> &bull; Max {comp.maxEmployees || 100} emp
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: 12 }}>
                          {compEmployees} {compEmployees === 1 ? 'Employee' : 'Employees'}
                        </div>
                        <div style={{ fontSize: 11, color: '#1E5ADB', fontWeight: 600 }}>
                          {compAdmins.length} Company {compAdmins.length === 1 ? 'Admin' : 'Admins'}
                          {compStaff > 0 ? ` • ${compStaff} Users` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20,
                          fontSize: 11, fontWeight: 700, background: st.background, color: st.color, border: `1px solid ${st.border}`
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {status !== 'Active' ? (
                            <button
                              onClick={() => handleToggleCompanyStatus(comp, 'Active')}
                              title="Activate company account"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                borderRadius: 6, border: '1px solid #6EE7B7', background: '#ECFDF5',
                                color: '#065F46', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              <Power size={12} /> Activate
                            </button>
                          ) : comp.id !== DEFAULT_COMPANY_ID ? (
                            <button
                              onClick={() => handleToggleCompanyStatus(comp, 'Suspended')}
                              title="Suspend company account"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                borderRadius: 6, border: '1px solid #FDE68A', background: '#FFFBEB',
                                color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                              }}
                            >
                              <PauseCircle size={12} /> Suspend
                            </button>
                          ) : null}

                          <button
                            onClick={() => openProvisionAdmin(comp.id)}
                            title="Add Company Admin for this company"
                            style={{
                              padding: '5px 9px', borderRadius: 6, border: '1px solid #BFDBFE',
                              background: '#EFF6FF', color: '#1E40AF', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            + Admin
                          </button>

                          <button
                            onClick={() => openEditCompany(comp)}
                            title="Edit Company & Subscription"
                            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Edit2 size={13} />
                          </button>

                          {comp.id !== DEFAULT_COMPANY_ID && (
                            <button
                              onClick={() => handleDeleteCompany(comp)}
                              title="Delete Company"
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            >
                              <Trash2 size={13} />
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
      </div>

      {/* SECTION 2: Company Admin Approval & Accounts */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Company Admin Approvals &amp; System Accounts</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
              Approve Company Owners / Company Admins for each customer. Company Admins sign in at the <strong>Company Admin Portal</strong> (<code>/login</code>) and cannot access this Developer Portal.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Search company admins..."
                style={{ paddingLeft: 32, paddingRight: 10, height: 34, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, outline: 'none' }}
              />
            </div>
            <button
              onClick={() => openProvisionAdmin()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '0 14px', height: 34, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              <Plus size={14} /> Add Company Admin
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>
                <th style={{ padding: '10px 14px' }}>Owner / Admin</th>
                <th style={{ padding: '10px 14px' }}>Account Role</th>
                <th style={{ padding: '10px 14px' }}>Company</th>
                <th style={{ padding: '10px 14px' }}>Portal Access</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#64748B' }}>Loading accounts from Firestore...</td></tr>
              ) : filteredAdmins.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#64748B' }}>No Company Admins provisioned yet.</td></tr>
              ) : (
                filteredAdmins.map((u) => {
                  const isDev = isDeveloper(u);
                  const isProtected = PROTECTED_EMAILS.has((u.email || '').toLowerCase());
                  const st = USER_STATUS_STYLE[u.status || 'Active'] || USER_STATUS_STYLE.Active;

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: isDev ? '#E0F2FE' : '#EFF6FF',
                          color: isDev ? '#0284C7' : '#1E5ADB',
                          border: `1px solid ${isDev ? '#7DD3FC' : '#BFDBFE'}`,
                        }}>
                          <KeyRound size={11} /> {isDev ? 'Developer' : 'Company Admin'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                        {isDev ? 'SUBAI System Provider' : getCompanyName(u.companyId || DEFAULT_COMPANY_ID)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 11, fontFamily: 'monospace', color: '#475569' }}>
                        {isDev ? 'Developer Portal (/developer-login)' : 'Company Admin Portal (/login)'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.background, color: st.color }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                          {u.status || 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!isDev && u.status === 'Pending Approval' && (
                            <button
                              onClick={() => handleApproveAdmin(u)}
                              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #6EE7B7', background: '#ECFDF5', color: '#065F46', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Check size={12} /> Approve
                            </button>
                          )}
                          <button
                            onClick={() => openEditAdmin(u)}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #DBEAFE', background: '#FFFFFF', color: '#1E5ADB', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          {!isProtected && (
                            <button
                              onClick={() => handleDeleteAdmin(u)}
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            >
                              <Trash2 size={13} />
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
      </div>

      {/* SECTION 3: Universal Employee Mobile App (Android APK) Release Distribution */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Smartphone size={20} color="#7C3AED" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Employee Mobile App (Android APK) Distribution</h3>
                <span style={{
                  padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: apkRelease?.apkUrl ? '#ECFDF5' : '#FEF3C7',
                  color: apkRelease?.apkUrl ? '#065F46' : '#92400E',
                  border: `1px solid ${apkRelease?.apkUrl ? '#A7F3D0' : '#FDE68A'}`
                }}>
                  {apkRelease?.apkUrl ? `${apkRelease.version || 'v2.1.0'} Published` : 'APK Link Not Set'}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
                Publish one universal Android APK download link (EAS Build, GitHub Release, or hosted `.apk`). Every active <strong>Company Admin</strong> can download and share it with their employees — the app automatically displays each company&apos;s own logo after login.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {apkRelease?.apkUrl && (
              <a
                href={apkRelease.apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
              >
                <Download size={14} /> Test APK Link
              </a>
            )}
            <button
              onClick={openApkReleaseModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#FFFFFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              <Upload size={14} /> {apkRelease?.apkUrl ? 'Update APK Release' : 'Publish APK Link'}
            </button>
          </div>
        </div>
        {apkRelease?.apkUrl && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ wordBreak: 'break-all' }}>
              <strong>APK URL:</strong> <span style={{ fontFamily: 'monospace', color: '#1E5ADB' }}>{apkRelease.apkUrl}</span>
            </div>
            {apkRelease.releaseNotes && (
              <div style={{ fontSize: 11, color: '#64748B' }}>{apkRelease.releaseNotes}</div>
            )}
          </div>
        )}
      </div>

      {/* Publish Mobile App APK Modal */}
      {apkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px 16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Publish Employee Mobile App (APK)</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
                  Company Admins will download this APK from their Company Admin Portal to distribute to employees.
                </p>
              </div>
              <button onClick={() => setApkModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>App Version *</label>
                <input
                  value={apkForm.version}
                  onChange={(e) => setApkForm({ ...apkForm, version: e.target.value })}
                  placeholder="e.g. v2.1.0"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Android APK Download URL *</label>
                <input
                  value={apkForm.apkUrl}
                  onChange={(e) => setApkForm({ ...apkForm, apkUrl: e.target.value })}
                  placeholder="https://expo.dev/artifacts/eas/...apk or https://github.com/.../subai.apk"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  Tip: Build via <code>eas build -p android --profile production</code> (or place your built APK in <code>admin-dashboard/public/downloads/subai-employee.apk</code> and enter <code>/downloads/subai-employee.apk</code>).
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Release Notes</label>
                <textarea
                  rows={3}
                  value={apkForm.releaseNotes}
                  onChange={(e) => setApkForm({ ...apkForm, releaseNotes: e.target.value })}
                  placeholder="What's included in this mobile app release..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setApkModal(false)} disabled={savingApk} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSaveApkRelease} disabled={savingApk} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                {savingApk ? 'Publishing...' : 'Publish to Company Portals'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register / Edit Company + Owner & Subscription Modal */}
      {companyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px 16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 560, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
                  {editingCompanyId ? 'Edit Client Company & Subscription' : 'Register New Client Company'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
                  Set up company details, subscription package, owner info, and initial Company Admin credentials.
                </p>
              </div>
              <button onClick={() => setCompanyModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Company Logo Upload & Preview */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  ref={companyLogoInputRef}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={handleDeveloperLogoSelect}
                />
                <div style={{
                  width: 116, height: 50, borderRadius: 10, background: '#FFFFFF',
                  border: '1px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 6, boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0
                }}>
                  {companyForm.logoUrl ? (
                    <img src={companyForm.logoUrl} alt="Company Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
                      <ImageIcon size={14} /> No Logo
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0F172A' }}>Company Logo (Optional)</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Shown in the Developer Portal and in this customer&apos;s Company Admin Portal sidebar &amp; top bar.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => companyLogoInputRef.current?.click()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Upload size={12} /> {companyForm.logoUrl ? 'Change Logo' : 'Upload Logo'}
                    </button>
                    {companyForm.logoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompanyForm((prev) => ({ ...prev, logoUrl: null }));
                          if (companyLogoInputRef.current) companyLogoInputRef.current.value = '';
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Company Name *</label>
                <input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  placeholder="e.g. ABC Logistics"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Industry</label>
                <input
                  value={companyForm.industry}
                  onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                  placeholder="e.g. Logistics, Construction, Delivery"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Headquarters Address</label>
                <input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder="City / Address"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Plan / Package *</label>
                <select
                  value={companyForm.plan}
                  onChange={(e) => {
                    const p = SUBSCRIPTION_PLANS.find((item) => item.id === e.target.value);
                    setCompanyForm({
                      ...companyForm,
                      plan: e.target.value,
                      maxEmployees: p ? p.maxEmployees : companyForm.maxEmployees,
                    });
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', fontWeight: 600, boxSizing: 'border-box' }}
                >
                  {SUBSCRIPTION_PLANS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({p.priceLabel})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Subscription Status</label>
                <select
                  value={companyForm.subscriptionStatus}
                  onChange={(e) => setCompanyForm({ ...companyForm, subscriptionStatus: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                >
                  <option value="Active">Active (Paid)</option>
                  <option value="Trial">Trial</option>
                  <option value="Pending">Pending Payment</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Company Account Status</label>
                <select
                  value={companyForm.status}
                  onChange={(e) => setCompanyForm({ ...companyForm, status: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', fontWeight: 600, boxSizing: 'border-box' }}
                >
                  <option value="Active">Active (Login Enabled)</option>
                  <option value="Pending">Pending Activation</option>
                  <option value="Suspended">Suspended (Login Blocked)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Max Employee Seat Limit</label>
                <input
                  type="number"
                  min={1}
                  value={companyForm.maxEmployees}
                  onChange={(e) => setCompanyForm({ ...companyForm, maxEmployees: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Company Owner Section */}
              <div style={{ gridColumn: '1 / -1', marginTop: 6, padding: 14, borderRadius: 12, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>
                  <Briefcase size={14} color="#0284C7" /> Company Owner &amp; Initial Company Admin
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Company Owner Name</label>
                    <input
                      value={companyForm.ownerName}
                      onChange={(e) => setCompanyForm({ ...companyForm, ownerName: e.target.value })}
                      placeholder="e.g. Juan Dela Cruz"
                      style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Owner / Admin Email</label>
                    <input
                      type="email"
                      value={companyForm.ownerEmail}
                      onChange={(e) => setCompanyForm({ ...companyForm, ownerEmail: e.target.value })}
                      placeholder="e.g. juan@abclogistics.com"
                      style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {!editingCompanyId && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, fontWeight: 700, color: '#1E40AF', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={companyForm.createAdminAccount}
                        onChange={(e) => setCompanyForm({ ...companyForm, createAdminAccount: e.target.checked })}
                        style={{ accentColor: '#1E5ADB', width: 15, height: 15 }}
                      />
                      Also create Company Admin portal login for this Company Owner
                    </label>
                    {companyForm.createAdminAccount && (
                      <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Company Admin Login Password *</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showOwnerPass ? 'text' : 'password'}
                            value={companyForm.adminPassword}
                            onChange={(e) => setCompanyForm({ ...companyForm, adminPassword: e.target.value })}
                            placeholder="Min. 6 characters (for /login)"
                            style={{ width: '100%', padding: '8px 36px 8px 11px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowOwnerPass((p) => !p)}
                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
                          >
                            {showOwnerPass ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setCompanyModal(false)} disabled={savingCompany} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSaveCompany} disabled={savingCompany} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                {savingCompany ? 'Saving...' : editingCompanyId ? 'Save Company Changes' : 'Register Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision / Edit Company Admin or Developer Modal */}
      {adminModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px 16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
                  {editingUserId ? 'Edit Company Admin / Developer' : 'Provision Company Admin'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
                  Company Admins log into the Company Admin Portal (<code>/login</code>) and see ONLY their assigned company.
                </p>
              </div>
              <button onClick={() => setAdminModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Full Name *</label>
                <input
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  placeholder="e.g. Juan Dela Cruz"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Email Address *</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  placeholder="e.g. juan@abclogistics.com"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Account Tier *</label>
                  <select
                    value={adminForm.role}
                    onChange={(e) => setAdminForm({
                      ...adminForm,
                      role: e.target.value,
                      jobTitle: e.target.value === 'Developer' ? 'System Provider / Developer' : 'Company Owner / Admin',
                    })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', fontWeight: 600, boxSizing: 'border-box' }}
                  >
                    {DEVELOPER_ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>{r === 'Company Admin' ? 'Company Owner / Admin' : 'System Developer'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Approval Status</label>
                  <select
                    value={adminForm.status}
                    onChange={(e) => setAdminForm({ ...adminForm, status: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    <option value="Active">Active (Approved)</option>
                    <option value="Pending Approval">Pending Approval</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {!isDeveloper({ role: adminForm.role }) && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Assigned Client Company *</label>
                  <select
                    value={adminForm.companyId || ''}
                    onChange={(e) => setAdminForm({ ...adminForm, companyId: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', fontWeight: 600, boxSizing: 'border-box' }}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.status || 'Active'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                  {editingUserId ? 'New Password (leave blank to keep current)' : 'Portal Login Password *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    placeholder={editingUserId ? 'Leave blank to keep existing password' : 'Min. 6 characters'}
                    style={{ width: '100%', padding: '9px 38px 9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setAdminModal(false)} disabled={savingUser} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSaveAdmin} disabled={savingUser} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#1E5ADB', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                {savingUser ? 'Saving...' : editingUserId ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
