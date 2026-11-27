import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Shield, Bell, Key, Globe, Database, Save, CheckCircle2, 
  Lock, Smartphone, Sliders, Cpu, Activity, RefreshCw, Radio, 
  MapPin, ShieldAlert, Check, Eye, EyeOff, Moon, Sun, AlertTriangle,
  Camera, Upload, Trash2, ShieldCheck, Mail, Phone, Building, Briefcase, UserCheck, Download, Copy, QrCode
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { db, doc, onSnapshot, updateCurrentAdminProfile, verifyAndUpdateAdminPassword, safeLocalStorageSet, recordSystemActivityLog } from '../firebase';
import { useCompany } from '../utils/companyContext';
import { isCompanyAdmin, isDeveloper } from '../utils/roles';
import defaultSubaiLogo from '../assets/logo.png';

const DEFAULT_SETTINGS = {
  profile: {
    firstName: 'System',
    lastName: 'Admin',
    email: 'admin@subai.com',
    phone: '+63 917 123 4567',
    role: 'Super Administrator',
    department: 'Command Center Ops',
    avatarColor: '#1E5ADB',
    avatarPhoto: null
  },
  security: {
    twoFactor: true,
    sessionTimeout: '30',
    ipRestriction: false,
    auditLogging: true
  },
  notifications: {
    geofenceBreach: true,
    aiFraudAlerts: true,
    dailyReportPdf: false,
    emailAlerts: true,
    pushNotifications: true,
    soundAlerts: true
  },
  systemConfig: {
    mapCenterLat: '14.5995',
    mapCenterLng: '120.9842',
    defaultGeofenceRadius: '150',
    aiSensitivity: 'Balanced',
    streamRate: '1s (Realtime)',
    maintenanceMode: false,
    darkMode: false
  }
};

export default function Settings() {
  const { activeCompany, activeCompanyName, activeCompanyId, companyLogoUrl, updateCompanyLogo, user: ctxUser } = useCompany();
  const [activeTab, setActiveTab] = useState('General Profile');
  const fileInputRef = useRef(null);
  const companyLogoInputRef = useRef(null);

  const currentUser = ctxUser || (() => {
    try { return JSON.parse(localStorage.getItem('subai_admin_user') || '{}'); } catch { return {}; }
  })();
  const canEditCompanyBranding = isCompanyAdmin(currentUser) && !isDeveloper(currentUser);

  const [pendingCompanyLogo, setPendingCompanyLogo] = useState(undefined);
  const [savingLogo, setSavingLogo] = useState(false);
  const [mobileAppRelease, setMobileAppRelease] = useState(null);
  const [showApkQr, setShowApkQr] = useState(false);

  const displayedCompanyLogo = pendingCompanyLogo !== undefined ? pendingCompanyLogo : (companyLogoUrl || activeCompany?.logoUrl || null);

  // Live subscription to official Employee Mobile App (Android APK) release published by System Provider
  useEffect(() => {
    if (isDeveloper(currentUser)) return;
    let unsub = () => {};
    try {
      unsub = onSnapshot(
        doc(db, 'platform_config', 'mobile_app'),
        (snap) => {
          if (snap.exists && snap.exists()) {
            setMobileAppRelease(snap.data());
          } else {
            setMobileAppRelease(null);
          }
        },
        () => {}
      );
    } catch (_) {}
    return () => unsub();
  }, [currentUser?.role]);

  const resolvedApkUrl = (() => {
    const raw = (mobileAppRelease?.apkUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (typeof window !== 'undefined' && raw.startsWith('/')) {
      return `${window.location.origin}${raw}`;
    }
    return raw;
  })();

  const handleCopyApkLink = async () => {
    if (!resolvedApkUrl) return;
    try {
      await navigator.clipboard.writeText(resolvedApkUrl);
      showToast('Install Link Copied', 'Share this Android APK download link with your employees.', 'success');
    } catch {
      showToast('APK Link', resolvedApkUrl, 'info');
    }
  };

  // Load settings prioritizing the currently signed-in user (never showing stale cached user data)
  const [settings, setSettings] = useState(() => {
    try {
      const savedSettings = localStorage.getItem('subai_system_settings');
      const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
      const savedUser = JSON.parse(localStorage.getItem('subai_admin_user') || '{}');
      const sameCachedUser =
        savedUser.email &&
        parsedSettings?.profile?.email &&
        savedUser.email.toLowerCase() === parsedSettings.profile.email.toLowerCase();

      const userFullName = (savedUser.name || savedUser.displayName || '').trim();
      const nameParts = userFullName.split(/\s+/).filter(Boolean);
      const userFirstName = nameParts[0] || 'Company';
      const userLastName = nameParts.slice(1).join(' ') || 'Admin';

      return {
        ...DEFAULT_SETTINGS,
        ...parsedSettings,
        profile: {
          ...DEFAULT_SETTINGS.profile,
          firstName: (sameCachedUser ? parsedSettings.profile.firstName : '') || userFirstName,
          lastName: (sameCachedUser ? parsedSettings.profile.lastName : '') || userLastName,
          email: savedUser.email || parsedSettings?.profile?.email || 'admin@subai.com',
          phone: savedUser.phone || (sameCachedUser ? parsedSettings.profile.phone : '') || '',
          role: savedUser.jobTitle || savedUser.role || 'Company Admin',
          department: savedUser.department || (sameCachedUser ? parsedSettings.profile.department : '') || 'Command Center Ops',
          avatarColor: savedUser.avatarColor || (sameCachedUser ? parsedSettings.profile.avatarColor : '') || '#1E5ADB',
          avatarPhoto: savedUser.avatarPhoto !== undefined ? savedUser.avatarPhoto : (sameCachedUser ? parsedSettings.profile.avatarPhoto : null)
        }
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Keep profile card synchronized whenever the signed-in user changes
  useEffect(() => {
    if (!ctxUser?.email) return;
    const fullName = (ctxUser.name || ctxUser.displayName || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    setSettings((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        firstName: parts[0] || prev.profile.firstName || 'Company',
        lastName: parts.slice(1).join(' ') || (parts.length <= 1 ? '' : prev.profile.lastName),
        email: ctxUser.email,
        role: ctxUser.jobTitle || ctxUser.role || prev.profile.role,
        avatarColor: ctxUser.avatarColor || prev.profile.avatarColor,
        avatarPhoto: ctxUser.avatarPhoto !== undefined ? ctxUser.avatarPhoto : prev.profile.avatarPhoto,
      },
    }));
  }, [ctxUser?.email, ctxUser?.name, ctxUser?.role, ctxUser?.jobTitle]);

  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Client-side image compressor: shrinks avatar to JPEG or preserves PNG transparency for company logos
  const compressImage = (fileOrDataUrl, maxWidth = 160, maxHeight = 160, quality = 0.72, mimeType = 'image/jpeg') => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(mimeType === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL(mimeType, quality));
      };
      img.onerror = () => resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : null);

      if (typeof fileOrDataUrl === 'string') {
        img.src = fileOrDataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(fileOrDataUrl);
      }
    });
  };

  // Company Logo Upload & Firestore Persistence (Company Admin only)
  const handleCompanyLogoFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      return showToast('File Too Large', 'Please choose a company logo smaller than 8MB.', 'warning');
    }
    try {
      // Preserve transparency with PNG for crisp sidebar/header branding
      let optimized = await compressImage(file, 360, 110, 0.85, 'image/png');
      if (optimized && optimized.length > 180000) {
        optimized = await compressImage(file, 300, 90, 0.82, 'image/webp');
      }
      if (optimized) {
        setPendingCompanyLogo(optimized);
        showToast('Logo Ready', 'Preview updated. Click "Save Company Logo" to apply across your company portal.', 'info');
      }
    } catch (err) {
      console.error('Company logo process error:', err);
      showToast('Upload Error', 'Could not process the selected logo image.', 'error');
    }
  };

  const handleSaveCompanyLogo = async () => {
    if (!canEditCompanyBranding) return;
    setSavingLogo(true);
    try {
      const nextLogo = displayedCompanyLogo || null;
      await updateCompanyLogo(nextLogo, activeCompanyId);
      await recordSystemActivityLog({
        action: nextLogo
          ? `Updated company logo for ${activeCompanyName}`
          : `Reset company logo to default for ${activeCompanyName}`,
        module: 'Settings',
        status: 'Success',
        user: currentUser?.email || currentUser?.name || 'Company Admin',
        companyId: activeCompanyId,
      }).catch(() => {});
      setPendingCompanyLogo(undefined);
      if (companyLogoInputRef.current) companyLogoInputRef.current.value = '';
      showToast(
        nextLogo ? 'Company Logo Saved' : 'Default Logo Restored',
        nextLogo
          ? `Custom logo for ${activeCompanyName} is now live across all sessions of your company.`
          : `${activeCompanyName} reverted to the default SUBAI logo.`,
        'success'
      );
    } catch (err) {
      console.error('Save company logo error:', err);
      showToast('Save Failed', err.message || 'Could not update company logo in Firestore.', 'error');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleResetCompanyLogo = async () => {
    if (!canEditCompanyBranding) return;
    setPendingCompanyLogo(null);
    if (companyLogoInputRef.current) companyLogoInputRef.current.value = '';
    setSavingLogo(true);
    try {
      await updateCompanyLogo(null, activeCompanyId);
      setPendingCompanyLogo(undefined);
      showToast('Default Logo Restored', `${activeCompanyName} now uses the default SUBAI logo.`, 'info');
    } catch (err) {
      showToast('Reset Failed', err.message || 'Could not reset company logo.', 'error');
    } finally {
      setSavingLogo(false);
    }
  };

  // Photo upload handler with automatic canvas compression
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      return showToast('File Too Large', 'Please upload an image smaller than 10MB.', 'warning');
    }

    try {
      const compressedDataUrl = await compressImage(file, 160, 160, 0.72);
      if (compressedDataUrl) {
        setSettings(prev => ({
          ...prev,
          profile: {
            ...prev.profile,
            avatarPhoto: compressedDataUrl
          }
        }));
        showToast('Photo Attached', 'Optimized for fast storage. Click "Save Profile Changes" to persist.', 'info');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Could not process photo.', 'error');
    }
  };

  const handlePhotoRemove = () => {
    setSettings(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        avatarPhoto: null
      }
    }));
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('Photo Removed', 'Reverted to accent badge with initials.', 'info');
  };

  // Full Administrator Profile save function
  const handleProfileSave = async (e) => {
    if (e) e.preventDefault();
    const { firstName, lastName, email, phone, role, department, avatarColor, avatarPhoto } = settings.profile;

    if (!firstName?.trim()) {
      return showToast('Validation Error', 'First name is required.', 'error');
    }
    if (!lastName?.trim()) {
      return showToast('Validation Error', 'Last name is required.', 'error');
    }
    if (!email?.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return showToast('Validation Error', 'Please enter a valid email address.', 'error');
    }

    setIsSaving(true);
    try {
      // Ensure avatar photo is lightweight before saving
      let finalPhoto = avatarPhoto;
      if (finalPhoto && finalPhoto.length > 35000) {
        finalPhoto = await compressImage(finalPhoto, 160, 160, 0.7);
      }

      await updateCurrentAdminProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || '',
        role: role || 'Company Admin',
        department: department?.trim() || 'Command Center Ops',
        avatarColor: avatarColor || '#1E5ADB',
        avatarPhoto: finalPhoto || null
      });

      setSettings(prev => ({
        ...prev,
        profile: {
          ...prev.profile,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || '',
          role: role || 'Super Administrator',
          department: department?.trim() || 'Command Center Ops',
          avatarColor: avatarColor || '#1E5ADB',
          avatarPhoto: finalPhoto || null
        }
      }));

      showToast('Profile Saved', 'Administrator profile synchronized across portal & auth systems.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Save Failed', err.message || 'Could not persist administrator profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save other sections (security, notifications, systemConfig)
  const saveSection = (sectionKey, successMsg) => {
    setIsSaving(true);
    setTimeout(() => {
      try {
        safeLocalStorageSet('subai_system_settings', JSON.stringify(settings));
        showToast('Settings Saved', successMsg, 'success');
      } catch (err) {
        showToast('Save Failed', 'Could not persist settings.', 'error');
      } finally {
        setIsSaving(false);
      }
    }, 300);
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (!passwords.current || !passwords.newPass || !passwords.confirm) {
      return showToast('Validation Error', 'Please fill in all password fields.', 'error');
    }
    if (passwords.newPass.length < 6) {
      return showToast('Weak Password', 'New password must be at least 6 characters.', 'error');
    }
    if (passwords.newPass !== passwords.confirm) {
      return showToast('Mismatch Error', 'New passwords do not match.', 'error');
    }

    setIsSaving(true);
    try {
      await verifyAndUpdateAdminPassword(passwords.current, passwords.newPass);
      showToast('Password Updated', 'Your security credentials have been updated successfully.', 'success');
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (err) {
      showToast('Authentication Error', err.message || 'Could not verify current credentials.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('subai_system_settings');
    showToast('Settings Reset', 'Restored default system preferences.', 'info');
  };

  const TABS = [
    { name: 'General Profile', icon: User, desc: 'Personal & Admin Identity' },
    { name: 'Security & Access', icon: Shield, desc: 'Password & Auth Controls' },
    { name: 'Notifications & Alerts', icon: Bell, desc: 'Telemetry & Dispatch Signals' },
    { name: 'System & AI Config', icon: Sliders, desc: 'Map, Geofence & AI Parameters' },
  ];

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Header Card & Quick System Status */}
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
            <Sliders size={24} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>System Settings & Preferences</h1>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>Configure global monitoring rules, administrative access, and telemetry streams.</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={resetToDefaults}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#64748B',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} /> Reset Defaults
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #6EE7B7', padding: '6px 12px', borderRadius: '20px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46' }}>FIRESTORE SYNCED</span>
          </div>
        </div>
      </div>

      {/* Main Grid Layout: Tabs + Active Content | Sidebar Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Navigation Tabs + Settings Form Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Glassmorphic Tab Navigation Header */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.name;
              return (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px 10px',
                    borderRadius: '12px',
                    border: 'none',
                    background: isActive ? '#1E5ADB' : 'transparent',
                    color: isActive ? '#FFFFFF' : '#64748B',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? '0 4px 12px rgba(30, 90, 219, 0.25)' : 'none'
                  }}
                >
                  <Icon size={18} color={isActive ? '#FFFFFF' : '#64748B'} />
                  <span style={{ fontSize: '12px', fontWeight: '700' }}>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: General Profile & Company Branding */}
          {activeTab === 'General Profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Company Logo & Branding Card (Company Owner / Company Admin only) */}
              {canEditCompanyBranding && (
                <div style={cardContainerStyle}>
                  <div style={sectionHeaderStyle}>
                    <div style={{ ...iconBadgeStyle, background: '#EFF6FF', color: '#1E5ADB' }}>
                      <Building size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Company Logo &amp; Branding</h2>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}>
                          {activeCompanyName}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
                        Upload your organization&apos;s custom logo. It appears in the sidebar and top bar exclusively for users in <strong>{activeCompanyName}</strong>.
                      </p>
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={companyLogoInputRef}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={handleCompanyLogoFileSelect}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                    <div style={{
                      width: 176,
                      height: 64,
                      borderRadius: '12px',
                      background: '#FFFFFF',
                      border: '1px dashed #CBD5E1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 12px',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}>
                      <img
                        src={displayedCompanyLogo || defaultSubaiLogo}
                        alt={`${activeCompanyName} Logo`}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                        {displayedCompanyLogo ? 'Custom Company Logo Preview' : 'Using Default SUBAI Logo'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                        Recommended: transparent PNG or horizontal logo (e.g. 320&times;96px). Synced live via Cloud Firestore across your company.
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => companyLogoInputRef.current?.click()}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '7px 13px', borderRadius: 8, border: '1px solid #CBD5E1',
                            background: '#FFFFFF', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          <Upload size={14} /> Upload Company Logo
                        </button>

                        {pendingCompanyLogo !== undefined && (
                          <button
                            type="button"
                            disabled={savingLogo}
                            onClick={handleSaveCompanyLogo}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 14px', borderRadius: 8, border: 'none',
                              background: '#1E5ADB', color: '#FFFFFF', fontSize: 12, fontWeight: 700,
                              cursor: savingLogo ? 'not-allowed' : 'pointer', opacity: savingLogo ? 0.7 : 1
                            }}
                          >
                            <Save size={14} /> {savingLogo ? 'Saving...' : 'Save Company Logo'}
                          </button>
                        )}

                        {(displayedCompanyLogo || companyLogoUrl) && (
                          <button
                            type="button"
                            disabled={savingLogo}
                            onClick={handleResetCompanyLogo}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '7px 12px', borderRadius: 8, border: '1px solid #FCA5A5',
                              background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={14} /> Reset Default
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Employee Mobile App (Android APK) Download & Distribution Card (Company Portal) */}
              {!isDeveloper(currentUser) && (
                <div style={cardContainerStyle} id="mobile-app">
                  <div style={sectionHeaderStyle}>
                    <div style={{ ...iconBadgeStyle, background: '#ECFDF5', color: '#059669' }}>
                      <Smartphone size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
                          Employee Mobile App (Android APK)
                        </h2>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                          background: resolvedApkUrl ? '#ECFDF5' : '#FEF3C7',
                          color: resolvedApkUrl ? '#065F46' : '#92400E',
                          border: `1px solid ${resolvedApkUrl ? '#A7F3D0' : '#FDE68A'}`
                        }}>
                          {resolvedApkUrl ? `${mobileAppRelease?.version || 'v2.1.0'} Ready` : 'Awaiting APK Release'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
                        Download the Android APK here to distribute to your field employees. Once they sign in, the mobile app automatically displays <strong>{activeCompanyName}</strong>&apos;s logo, worksites, and assignments.
                      </p>
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <img
                            src={displayedCompanyLogo || defaultSubaiLogo}
                            alt={activeCompanyName}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{activeCompanyName} Workforce App</div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                            {mobileAppRelease?.releaseNotes || 'Android APK • Real-time GPS tracking, facial verification, geofenced attendance & live company branding'}
                          </div>
                        </div>
                      </div>

                      {resolvedApkUrl ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a
                            href={resolvedApkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '9px 16px', borderRadius: 9, border: 'none',
                              background: '#059669', color: '#FFFFFF', fontSize: 12, fontWeight: 700,
                              textDecoration: 'none', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                            }}
                          >
                            <Download size={15} /> Download Android APK
                          </a>
                          <button
                            type="button"
                            onClick={handleCopyApkLink}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '9px 13px', borderRadius: 9, border: '1px solid #CBD5E1',
                              background: '#FFFFFF', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            <Copy size={14} /> Copy Link
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowApkQr((prev) => !prev)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '9px 13px', borderRadius: 9, border: '1px solid #BFDBFE',
                              background: showApkQr ? '#EFF6FF' : '#FFFFFF', color: '#1E40AF', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            <QrCode size={14} /> {showApkQr ? 'Hide QR' : 'QR Code'}
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontWeight: 600 }}>
                          APK download link has not been published yet in the Developer Portal.
                        </div>
                      )}
                    </div>

                    {showApkQr && resolvedApkUrl && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(resolvedApkUrl)}`}
                          alt="Employee APK QR Code"
                          style={{ width: 128, height: 128, borderRadius: 8, border: '1px solid #E2E8F0' }}
                        />
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Scan with Android Phone to Install</div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>
                            1. Employee scans this QR code (or receives the downloaded `.apk` file).<br />
                            2. Install the app on Android and sign in with their email &amp; password from your <strong>Employees</strong> directory.<br />
                            3. The app automatically loads <strong>{activeCompanyName}</strong>&apos;s logo and isolated company data.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            <div style={cardContainerStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ ...iconBadgeStyle, background: '#EEF2FF', color: '#1E5ADB' }}>
                  <User size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Administrator Profile</h2>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>Manage personal admin details and command center identity.</p>
                </div>
              </div>

              {/* Avatar Accent & Custom Photo Picker */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoUpload}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
                <div style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: settings.profile.avatarPhoto ? 'transparent' : settings.profile.avatarColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: '800',
                  fontSize: '22px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '3px solid #FFFFFF'
                }}>
                  {settings.profile.avatarPhoto ? (
                    <img
                      src={settings.profile.avatarPhoto}
                      alt="Admin"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span>
                      {(settings.profile.firstName?.[0] || 'A').toUpperCase()}
                      {(settings.profile.lastName?.[0] || '').toUpperCase()}
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>Command Identity & Accent</div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Upload your portrait or select an avatar accent color.</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          background: '#FFFFFF',
                          color: '#334155',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <Camera size={14} /> Upload Photo
                      </button>
                      {settings.profile.avatarPhoto && (
                        <button
                          type="button"
                          onClick={handlePhotoRemove}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #FCA5A5',
                            background: '#FEF2F2',
                            color: '#DC2626',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>Accent:</span>
                    {['#1E5ADB', '#8B5CF6', '#10B981', '#F59E0B', '#DC2626', '#06B6D4', '#EC4899', '#0F172A'].map(color => (
                      <div
                        key={color}
                        onClick={() => setSettings({
                          ...settings,
                          profile: { ...settings.profile, avatarColor: color }
                        })}
                        title={color}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: color,
                          cursor: 'pointer',
                          border: settings.profile.avatarColor === color ? '2px solid #0F172A' : '2px solid #FFFFFF',
                          outline: settings.profile.avatarColor === color ? '2px solid ' + color : 'none',
                          transform: settings.profile.avatarColor === color ? 'scale(1.15)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input
                    type="text"
                    required
                    value={settings.profile.firstName || ''}
                    onChange={e => setSettings({
                      ...settings,
                      profile: { ...settings.profile, firstName: e.target.value }
                    })}
                    placeholder="Enter first name"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Last Name *</label>
                  <input
                    type="text"
                    required
                    value={settings.profile.lastName || ''}
                    onChange={e => setSettings({
                      ...settings,
                      profile: { ...settings.profile, lastName: e.target.value }
                    })}
                    placeholder="Enter last name"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email Address *</label>
                  <input
                    type="email"
                    required
                    value={settings.profile.email || ''}
                    onChange={e => setSettings({
                      ...settings,
                      profile: { ...settings.profile, email: e.target.value }
                    })}
                    placeholder="admin@company.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input
                    type="text"
                    value={settings.profile.phone || ''}
                    onChange={e => setSettings({
                      ...settings,
                      profile: { ...settings.profile, phone: e.target.value }
                    })}
                    placeholder="+63 917 123 4567"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Role Designation</label>
                  <input
                    type="text"
                    value={settings.profile.role || 'Super Administrator'}
                    onChange={e => setSettings({
                      ...settings,
                      profile: { ...settings.profile, role: e.target.value }
                    })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <input
                    type="text"
                    value={settings.profile.department || ''}
                    onChange={e => setSettings({
                      ...settings,
                      profile: { ...settings.profile, department: e.target.value }
                    })}
                    placeholder="Command Center Ops"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10B981', fontWeight: '600' }}>
                  <ShieldCheck size={16} /> Identity broadcast enabled across portal
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleProfileSave}
                  style={primaryBtnStyle}
                >
                  <Save size={15} /> {isSaving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </div>
            </div>
          )}

          {/* TAB 2: Security & Access */}
          {activeTab === 'Security & Access' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Password Change Card */}
              <div style={cardContainerStyle}>
                <div style={sectionHeaderStyle}>
                  <div style={{ ...iconBadgeStyle, background: '#FEF2F2', color: '#DC2626' }}>
                    <Key size={20} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Password & Authentication</h2>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>Update your account password and security credentials.</p>
                  </div>
                </div>

                <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Current Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        value={passwords.current}
                        onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                        placeholder="••••••••"
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}
                      >
                        {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>New Password</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          value={passwords.newPass}
                          onChange={e => setPasswords({ ...passwords, newPass: e.target.value })}
                          placeholder="At least 6 chars"
                          style={inputStyle}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}
                        >
                          {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Confirm New Password</label>
                      <input
                        type="password"
                        value={passwords.confirm}
                        onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                        placeholder="Repeat new password"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button type="submit" disabled={isSaving} style={primaryBtnStyle}>
                      <Lock size={15} /> {isSaving ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Security Preferences Toggles */}
              <div style={cardContainerStyle}>
                <div style={sectionHeaderStyle}>
                  <div style={{ ...iconBadgeStyle, background: '#F3E8FF', color: '#8B5CF6' }}>
                    <Shield size={20} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Security Controls & Policy</h2>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>Configure multi-factor authentication and session controls.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <ToggleItem
                    title="Two-Factor Authentication (2FA)"
                    desc="Require SMS/Authenticator code upon admin login"
                    checked={settings.security.twoFactor}
                    onChange={val => setSettings({
                      ...settings,
                      security: { ...settings.security, twoFactor: val }
                    })}
                  />

                  <ToggleItem
                    title="Automated Audit Logging"
                    desc="Record every administrative action & mutation to Cloud Firestore"
                    checked={settings.security.auditLogging}
                    onChange={val => setSettings({
                      ...settings,
                      security: { ...settings.security, auditLogging: val }
                    })}
                  />

                  <ToggleItem
                    title="Strict IP Range Lockout"
                    desc="Restrict command center login strictly to white-listed office IP range"
                    checked={settings.security.ipRestriction}
                    onChange={val => setSettings({
                      ...settings,
                      security: { ...settings.security, ipRestriction: val }
                    })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button onClick={() => saveSection('security', 'Security policies updated.')} style={primaryBtnStyle}>
                    <Save size={15} /> Save Security Policies
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: Notifications & Alerts */}
          {activeTab === 'Notifications & Alerts' && (
            <div style={cardContainerStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ ...iconBadgeStyle, background: '#FEF3C7', color: '#D97706' }}>
                  <Bell size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Telemetry & Dispatch Alerts</h2>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>Choose which live telemetry flags trigger admin alerts.</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <ToggleItem
                  title="Geofence Breach Alerts"
                  desc="Instant notification when employee leaves assigned geofence site"
                  checked={settings.notifications.geofenceBreach}
                  onChange={val => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, geofenceBreach: val }
                  })}
                />

                <ToggleItem
                  title="AI Fraud & Anti-Spoof Flags"
                  desc="Alert on Mock GPS, Rooted device, or facial mismatch detection"
                  checked={settings.notifications.aiFraudAlerts}
                  onChange={val => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, aiFraudAlerts: val }
                  })}
                />

                <ToggleItem
                  title="Realtime Sound Effects"
                  desc="Play audible ping on critical high-severity telemetry events"
                  checked={settings.notifications.soundAlerts}
                  onChange={val => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, soundAlerts: val }
                  })}
                />

                <ToggleItem
                  title="Email Broadcast Digests"
                  desc="Send daily system activity summaries to administrator email"
                  checked={settings.notifications.emailAlerts}
                  onChange={val => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, emailAlerts: val }
                  })}
                />

                <ToggleItem
                  title="Daily Automated PDF Reports"
                  desc="Generate and store EOD PDF attendance logs at 11:59 PM"
                  checked={settings.notifications.dailyReportPdf}
                  onChange={val => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, dailyReportPdf: val }
                  })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button onClick={() => saveSection('notifications', 'Notification preferences saved.')} style={primaryBtnStyle}>
                  <Save size={15} /> Save Notification Settings
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: System & AI Config */}
          {activeTab === 'System & AI Config' && (
            <div style={cardContainerStyle}>
              <div style={sectionHeaderStyle}>
                <div style={{ ...iconBadgeStyle, background: '#ECFDF5', color: '#10B981' }}>
                  <Sliders size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>System & AI Parameters</h2>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>Configure default map location, geofence radius, and AI sensitivity.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Default Map Center Latitude</label>
                  <input
                    type="text"
                    value={settings.systemConfig.mapCenterLat}
                    onChange={e => setSettings({
                      ...settings,
                      systemConfig: { ...settings.systemConfig, mapCenterLat: e.target.value }
                    })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Default Map Center Longitude</label>
                  <input
                    type="text"
                    value={settings.systemConfig.mapCenterLng}
                    onChange={e => setSettings({
                      ...settings,
                      systemConfig: { ...settings.systemConfig, mapCenterLng: e.target.value }
                    })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Default Geofence Radius (Meters)</label>
                  <select
                    value={settings.systemConfig.defaultGeofenceRadius}
                    onChange={e => setSettings({
                      ...settings,
                      systemConfig: { ...settings.systemConfig, defaultGeofenceRadius: e.target.value }
                    })}
                    style={inputStyle}
                  >
                    <option value="20">20 Meters (Building / Tight Indoor Boundary)</option>
                    <option value="50">50 Meters (Tight Perimeter)</option>
                    <option value="100">100 Meters (Standard)</option>
                    <option value="150">150 Meters (Medium Site)</option>
                    <option value="300">300 Meters (Large Campus)</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>AI Anomaly Sensitivity</label>
                  <select
                    value={settings.systemConfig.aiSensitivity}
                    onChange={e => setSettings({
                      ...settings,
                      systemConfig: { ...settings.systemConfig, aiSensitivity: e.target.value }
                    })}
                    style={inputStyle}
                  >
                    <option value="Relaxed">Relaxed (Low Alerts)</option>
                    <option value="Balanced">Balanced (Recommended)</option>
                    <option value="Aggressive">Aggressive (High Security)</option>
                  </select>
                </div>
              </div>

              <div style={{ height: '1px', background: '#F1F5F9', margin: '8px 0' }} />

              <ToggleItem
                title="System Maintenance Mode"
                desc="Temporarily restrict mobile check-ins during server upgrades"
                checked={settings.systemConfig.maintenanceMode}
                onChange={val => setSettings({
                  ...settings,
                  systemConfig: { ...settings.systemConfig, maintenanceMode: val }
                })}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button onClick={() => saveSection('systemConfig', 'System parameters updated.')} style={primaryBtnStyle}>
                  <Save size={15} /> Save System Configuration
                </button>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Command Center Telemetry & System Health Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', sticky: 'top', top: '24px' }}>
          
          {/* Admin Profile Quick Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '20px',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: settings.profile.avatarPhoto ? 'transparent' : (settings.profile.avatarColor || '#1E5ADB'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: '800',
              fontSize: '18px',
              flexShrink: 0,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              {settings.profile.avatarPhoto ? (
                <img
                  src={settings.profile.avatarPhoto}
                  alt="Admin"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>
                  {(settings.profile.firstName?.[0] || 'A').toUpperCase()}
                  {(settings.profile.lastName?.[0] || '').toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {`${settings.profile.firstName || ''} ${settings.profile.lastName || ''}`.trim() || 'Admin User'}
              </div>
              <div style={{ fontSize: '12px', color: '#1E5ADB', fontWeight: '700', marginTop: '2px' }}>
                {settings.profile.role || 'Super Administrator'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {settings.profile.email || 'admin@subai.com'}
              </div>
            </div>
          </div>

          {/* System Health Telemetry Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '20px',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} color="#1E5ADB" />
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A', margin: 0 }}>System Telemetry</h3>
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#10B981', background: '#ECFDF5', padding: '3px 8px', borderRadius: '10px' }}>HEALTHY</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <TelemetryRow label="Database Engine" value="Cloud Firestore" sub="v10.14 Active" color="#1E5ADB" icon={Database} />
              <TelemetryRow label="Encryption Engine" value="AES-256 GCM" sub="Hardware Keyed" color="#8B5CF6" icon={Lock} />
              <TelemetryRow label="AI Anomaly Core" value="Online" sub={`Sensitivity: ${settings.systemConfig.aiSensitivity}`} color="#10B981" icon={Cpu} />
              <TelemetryRow label="Live Stream Rate" value={settings.systemConfig.streamRate} sub="WebSockets Active" color="#D97706" icon={Radio} />
            </div>
          </div>

          {/* Quick Security Tip Card */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            borderRadius: '16px',
            padding: '20px',
            color: 'white',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '10px' }}>
              <ShieldAlert size={20} color="#F59E0B" />
              <h4 style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: 'white' }}>Security Protocol</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.5, margin: 0 }}>
              All configuration changes made in this panel are recorded into the security audit ledger. Ensure 2FA is enabled for high-level dispatch overrides.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}

// Reusable Toggle Switch Component
function ToggleItem({ title, desc, checked, onChange }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '12px',
      transition: 'all 0.15s ease'
    }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{title}</div>
        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{desc}</div>
      </div>
      <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: checked ? '#1E5ADB' : '#CBD5E1',
          borderRadius: 24,
          transition: '0.2s ease',
          boxShadow: checked ? '0 2px 6px rgba(30, 90, 219, 0.3)' : 'none'
        }}>
          <span style={{
            position: 'absolute',
            content: '""',
            height: 18,
            width: 18,
            left: checked ? 22 : 3,
            bottom: 3,
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: '0.2s ease'
          }} />
        </span>
      </label>
    </div>
  );
}

// Reusable Telemetry Metric Row Component
function TelemetryRow({ label, value, sub, color, icon: Icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
      <div style={{ width: 34, height: 34, borderRadius: '8px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>{label}</div>
        <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>{value}</div>
      </div>
      <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>{sub}</div>
    </div>
  );
}

const cardContainerStyle = {
  background: '#FFFFFF',
  borderRadius: '16px',
  border: '1px solid #E2E8F0',
  padding: '24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  borderBottom: '1px solid #F1F5F9',
  paddingBottom: '16px'
};

const iconBadgeStyle = {
  width: 42,
  height: 42,
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
};

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '700',
  color: '#334155',
  marginBottom: '6px'
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  fontSize: '13px',
  fontWeight: '500',
  color: '#0F172A',
  outline: 'none',
  background: '#FFFFFF',
  boxSizing: 'border-box'
};

const primaryBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: '#1E5ADB',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  padding: '10px 20px',
  fontWeight: '700',
  fontSize: '13px',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(30, 90, 219, 0.25)',
  transition: 'all 0.15s ease'
};