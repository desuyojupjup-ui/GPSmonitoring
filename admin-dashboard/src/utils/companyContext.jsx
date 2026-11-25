import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp } from '../firebase';
import { isPlatformAdmin } from './roles';

export const DEFAULT_COMPANY_ID = 'company_default';
export const DEFAULT_COMPANY_NAME = 'Default Organization';

const CompanyContext = createContext({
  companies: [],
  activeCompanyId: DEFAULT_COMPANY_ID,
  activeCompanyName: DEFAULT_COMPANY_NAME,
  setActiveCompanyId: () => {},
  isPlatformUser: false,
  canSwitchCompanies: false,
  user: null,
  matchesCompany: () => true,
  stampCompany: (obj) => obj,
  createCompany: async () => null,
});

/**
 * Check whether a Firestore document belongs to the currently active company scope.
 * - Platform Admins viewing 'ALL' see all companies.
 * - Any specific companyId (e.g. 'company_b') ONLY matches records whose companyId === 'company_b'.
 * - Legacy records without companyId are treated as belonging to DEFAULT_COMPANY_ID
 *   so existing production data is preserved without leaking into Company B / Company C.
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
  const isPlatformUser = isPlatformAdmin(user);
  const userCompanyId = user?.companyId || DEFAULT_COMPANY_ID;

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    if (!isPlatformUser) return userCompanyId;
    try {
      return localStorage.getItem('subai_active_company_id') || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  // Lock non-platform users strictly to their assigned companyId
  useEffect(() => {
    if (!user) return;
    if (!isPlatformUser) {
      setSelectedCompanyId(user.companyId || DEFAULT_COMPANY_ID);
    } else {
      const saved = localStorage.getItem('subai_active_company_id');
      setSelectedCompanyId(saved || 'ALL');
    }
  }, [user?.id, user?.uid, user?.role, user?.companyId, isPlatformUser]);

  // Real-time Firestore listener for 'companies' collection
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, 'companies'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Ensure Default Organization exists in Firestore for backward compatibility with existing records
        if (!list.some((c) => c.id === DEFAULT_COMPANY_ID)) {
          setDoc(
            doc(db, 'companies', DEFAULT_COMPANY_ID),
            {
              name: DEFAULT_COMPANY_NAME,
              code: 'DEFAULT',
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
  }, [user]);

  const activeCompanyId = isPlatformUser ? selectedCompanyId : (user?.companyId || DEFAULT_COMPANY_ID);

  const setActiveCompanyId = (nextId) => {
    if (!isPlatformUser) return; // Non-platform users cannot switch companies
    setSelectedCompanyId(nextId);
    try {
      localStorage.setItem('subai_active_company_id', nextId);
    } catch (_) {}
  };

  const activeCompanyObj = companies.find((c) => c.id === activeCompanyId);
  const activeCompanyName = activeCompanyId === 'ALL'
    ? 'All Companies'
    : (activeCompanyObj?.name || user?.companyName || (activeCompanyId === DEFAULT_COMPANY_ID ? DEFAULT_COMPANY_NAME : activeCompanyId));

  const createCompany = async ({ name, code, industry = '', address = '' }) => {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Company name is required.');
    const cleanCode = (code || cleanName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'COMP').trim().toUpperCase();
    const docRef = await addDoc(collection(db, 'companies'), {
      name: cleanName,
      code: cleanCode,
      industry: (industry || '').trim(),
      address: (address || '').trim(),
      status: 'Active',
      createdBy: user?.email || 'system',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, name: cleanName, code: cleanCode, status: 'Active' };
  };

  const updateCompany = async (id, patch) => {
    await updateDoc(doc(db, 'companies', id), { ...patch, updatedAt: serverTimestamp() });
  };

  const deleteCompany = async (id) => {
    if (id === DEFAULT_COMPANY_ID) throw new Error('Default organization cannot be deleted.');
    await deleteDoc(doc(db, 'companies', id));
  };

  const value = useMemo(() => ({
    companies,
    activeCompanyId,
    activeCompanyName,
    setActiveCompanyId,
    isPlatformUser,
    canSwitchCompanies: isPlatformUser,
    user,
    matchesCompany: (record) => recordMatchesCompany(record, activeCompanyId),
    stampCompany: (payload) => stampCompanyFields(payload, activeCompanyId, activeCompanyName),
    createCompany,
    updateCompany,
    deleteCompany,
  }), [companies, activeCompanyId, activeCompanyName, isPlatformUser, user]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  return useContext(CompanyContext);
}

