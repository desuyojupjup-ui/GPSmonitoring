import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp, setActiveTenantScope, backfillLegacyCompanyIds } from '../firebase';
import { isDeveloper } from './roles';

export const DEFAULT_COMPANY_ID = 'company_default';
export const DEFAULT_COMPANY_NAME = 'Default Organization';

export const SUBSCRIPTION_PLANS = [
  { id: 'Starter',    label: 'Starter Plan',    maxEmployees: 25,  priceLabel: 'Up to 25 Employees' },
  { id: 'Business',   label: 'Business Plan',   maxEmployees: 100, priceLabel: 'Up to 100 Employees' },
  { id: 'Enterprise', label: 'Enterprise Plan', maxEmployees: 500, priceLabel: 'Unlimited / 500+ Employees' },
];

const CompanyContext = createContext({
  companies: [],
  activeCompanyId: DEFAULT_COMPANY_ID,
  activeCompanyName: DEFAULT_COMPANY_NAME,
  activeCompany: null,
  setActiveCompanyId: () => {},
  isPlatformUser: false,
  canSwitchCompanies: false,
  user: null,
  matchesCompany: () => true,
  stampCompany: (obj) => obj,
  createCompany: async () => null,
  updateCompany: async () => null,
  updateCompanyLogo: async () => null,
  deleteCompany: async () => null,
  companyLogoUrl: null,
});

/**
 * Check whether a Firestore document belongs to the currently active company scope.
 * - Developer (System Provider) viewing 'ALL' sees platform-wide records for monitoring.
 * - Company Admin / Company Users ONLY match records whose companyId === their companyId.
 * - Legacy records without companyId belong to DEFAULT_COMPANY_ID so existing data is preserved
 *   without leaking into newly onboarded companies (e.g. ABC Logistics, XYZ Construction).
 */
export function recordMatchesCompany(record, activeCompanyId) {
  if (!record) return false;
  if (!activeCompanyId || activeCompanyId === 'ALL') return true;
  const recComp = (record.companyId || DEFAULT_COMPANY_ID).toString().trim();
  return recComp === activeCompanyId;
}

export function stampCompanyFields(payload = {}, activeCompanyId, activeCompanyName = '') {
  const effectiveId = (!activeCompanyId || activeCompanyId === 'ALL') ? DEFAULT_COMPANY_ID : activeCompanyId;
  return {
    ...payload,
    companyId: payload.companyId || effectiveId,
    companyName: payload.companyName || activeCompanyName || (effectiveId === DEFAULT_COMPANY_ID ? DEFAULT_COMPANY_NAME : ''),
  };
}

export function CompanyProvider({ user, children }) {
  // Strictly Developer sits in the System Provider Portal; Company Admin & Users are locked to their company
  const isPlatformUser = isDeveloper(user);
  const userCompanyId = user?.companyId || DEFAULT_COMPANY_ID;

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => (isPlatformUser ? 'ALL' : userCompanyId));

  // Lock Company Admin / Company Users strictly to their assigned companyId & sync Firestore query scope
  useEffect(() => {
    if (!user) return;
    if (!isPlatformUser) {
      const cid = user.companyId || DEFAULT_COMPANY_ID;
      setSelectedCompanyId(cid);
      setActiveTenantScope({ companyId: cid, isPlatform: false });
    } else {
      setSelectedCompanyId('ALL');
      setActiveTenantScope({ companyId: null, isPlatform: true });
      backfillLegacyCompanyIds();
    }
  }, [user?.id, user?.uid, user?.role, user?.companyId, isPlatformUser]);

  // Real-time Firestore listener for 'companies' collection (Developer lists all; Company Portal reads own company doc only)
  useEffect(() => {
    if (!user) return;
    if (!isPlatformUser) {
      const cid = user.companyId || DEFAULT_COMPANY_ID;
      const unsubOwn = onSnapshot(
        doc(db, 'companies', cid),
        (snap) => {
          if (snap.exists && snap.exists()) {
            setCompanies([{ id: snap.id, ...snap.data() }]);
          } else {
            setCompanies([{
              id: cid,
              name: user.companyName || (cid === DEFAULT_COMPANY_ID ? DEFAULT_COMPANY_NAME : cid),
              status: 'Active',
              plan: 'Enterprise',
              subscriptionStatus: 'Active',
            }]);
          }
        },
        () => {}
      );
      return () => unsubOwn();
    }

    const unsub = onSnapshot(
      collection(db, 'companies'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!list.some((c) => c.id === DEFAULT_COMPANY_ID)) {
          setDoc(
            doc(db, 'companies', DEFAULT_COMPANY_ID),
            {
              name: DEFAULT_COMPANY_NAME,
              code: 'DEFAULT',
              ownerName: 'Company Owner',
              ownerEmail: 'admin@subai.com',
              plan: 'Enterprise',
              subscriptionStatus: 'Active',
              status: 'Active',
              isDefault: true,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          ).catch(() => {});
        }
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setCompanies(list);
      },
      (err) => {
        console.warn('[CompanyContext] companies listener error:', err?.message);
      }
    );
    return () => unsub();
  }, [user, isPlatformUser]);

  const activeCompanyId = isPlatformUser ? selectedCompanyId : (user?.companyId || DEFAULT_COMPANY_ID);

  const setActiveCompanyId = (nextId) => {
    if (!isPlatformUser) return;
    setSelectedCompanyId(nextId);
  };

  const activeCompanyObj = companies.find((c) => c.id === activeCompanyId) || null;
  const activeCompanyName = activeCompanyId === 'ALL'
    ? 'All Subscribed Companies'
    : (activeCompanyObj?.name || user?.companyName || (activeCompanyId === DEFAULT_COMPANY_ID ? DEFAULT_COMPANY_NAME : activeCompanyId));

  const createCompany = async ({
    name,
    code,
    industry = '',
    address = '',
    ownerName = '',
    ownerEmail = '',
    plan = 'Business',
    subscriptionStatus = 'Active',
    status = 'Active',
    maxEmployees = 100,
    logoUrl = null,
  }) => {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Company name is required.');
    const cleanCode = (code || cleanName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'COMP').trim().toUpperCase();
    const record = {
      name: cleanName,
      code: cleanCode,
      industry: (industry || '').trim(),
      address: (address || '').trim(),
      ownerName: (ownerName || '').trim(),
      ownerEmail: (ownerEmail || '').trim().toLowerCase(),
      plan: plan || 'Business',
      subscriptionStatus: subscriptionStatus || (status === 'Active' ? 'Active' : status),
      status: status || 'Active',
      maxEmployees: Number(maxEmployees) || 100,
      logoUrl: logoUrl || null,
      createdBy: user?.email || 'developer@subai.com',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, 'companies'), record);
    return { id: docRef.id, ...record };
  };

  const updateCompany = async (id, patch) => {
    await updateDoc(doc(db, 'companies', id), { ...patch, updatedAt: serverTimestamp() });
  };

  const updateCompanyLogo = async (logoUrl, targetCompanyId = null) => {
    const cid = targetCompanyId || (activeCompanyId && activeCompanyId !== 'ALL' ? activeCompanyId : user?.companyId || DEFAULT_COMPANY_ID);
    if (!cid) throw new Error('No active company found.');
    const ref = doc(db, 'companies', cid);
    try {
      await updateDoc(ref, {
        logoUrl: logoUrl || null,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (err?.code === 'not-found' || String(err?.message || '').toLowerCase().includes('no document to update')) {
        await setDoc(ref, {
          name: activeCompanyName || DEFAULT_COMPANY_NAME,
          code: cid === DEFAULT_COMPANY_ID ? 'DEFAULT' : cid.slice(0, 8).toUpperCase(),
          status: 'Active',
          plan: 'Enterprise',
          subscriptionStatus: 'Active',
          logoUrl: logoUrl || null,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        throw err;
      }
    }
    return logoUrl || null;
  };

  const deleteCompany = async (id) => {
    if (id === DEFAULT_COMPANY_ID) throw new Error('Default organization cannot be deleted.');
    await deleteDoc(doc(db, 'companies', id));
  };

  const companyLogoUrl = activeCompanyObj?.logoUrl || null;

  const value = useMemo(() => ({
    companies,
    activeCompanyId,
    activeCompanyName,
    activeCompany: activeCompanyObj,
    companyLogoUrl,
    setActiveCompanyId,
    isPlatformUser,
    canSwitchCompanies: false, // Company Portal NEVER switches companies; Developer Portal has its own dedicated UI
    user,
    matchesCompany: (record) => recordMatchesCompany(record, activeCompanyId),
    stampCompany: (payload) => stampCompanyFields(payload, activeCompanyId, activeCompanyName),
    createCompany,
    updateCompany,
    updateCompanyLogo,
    deleteCompany,
  }), [companies, activeCompanyId, activeCompanyName, activeCompanyObj, companyLogoUrl, isPlatformUser, user]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  return useContext(CompanyContext);
}
