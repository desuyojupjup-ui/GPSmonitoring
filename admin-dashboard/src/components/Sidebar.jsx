import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Map, Users, MapPin, ClipboardList,
  CalendarCheck, FileBarChart2, Bell, Settings, ShieldCheck, ScrollText, ChevronRight,
  ScanLine, ShieldAlert, ShieldX, Clock, ChevronsLeft, ChevronsRight
} from 'lucide-react';

import logoImage from '../assets/logo.png';

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tracking',    icon: Map,              label: 'Live Tracking' },
  { to: '/employees',   icon: Users,            label: 'Employees' },
  { to: '/sites',       icon: MapPin,           label: 'Sites' },
  { to: '/assignments', icon: ClipboardList,    label: 'Assignments' },
  { to: '/attendance',  icon: CalendarCheck,    label: 'Attendance' },
  { to: '/verifications', icon: ScanLine,      label: 'Facial Verifications' },
  { to: '/anomalies',   icon: ShieldAlert,      label: 'AI Anomalies' },
  { to: '/fraud-reports', icon: ShieldX,        label: 'Fraud & Security' },
  { to: '/delay-reports', icon: Clock,          label: 'Delays & Incidents' },
  { to: '/reports',     icon: FileBarChart2,    label: 'Reports' },
  { to: '/notifications', icon: Bell,           label: 'Notifications' },
  { to: '/settings',    icon: Settings,         label: 'Settings' },
  { to: '/users',       icon: ShieldCheck,      label: 'Users & Roles' },
  { to: '/logs',        icon: ScrollText,       label: 'Activity Logs' },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('subai_admin_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleProfileUpdated = (e) => {
      if (e.detail) {
        setProfile(e.detail);
      }
    };
    window.addEventListener('subai_admin_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('subai_admin_profile_updated', handleProfileUpdated);
  }, []);
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Logo & Collapse Button Header */}
      <div className="sidebar-logo" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '16px 8px' : '16px 14px 16px 20px',
        height: 60,
        position: 'relative'
      }}>
        {!collapsed && (
          <img src={logoImage} alt="SubAi Logo" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-toggle-btn"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(30, 90, 219, 0.08)',
            color: '#1E5ADB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="nav-section">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <Icon size={17} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="sidebar-footer"
        onClick={() => navigate('/settings')}
        style={{ cursor: 'pointer' }}
        title={collapsed ? `${profile?.name || 'Admin User'} (${profile?.role || 'Super Admin'})` : 'Account Settings'}
      >
        <div
          className="footer-avatar"
          style={{
            background: profile?.avatarPhoto ? 'transparent' : (profile?.avatarColor || '#1E5ADB'),
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '700'
          }}
        >
          {profile?.avatarPhoto ? (
            <img
              src={profile.avatarPhoto}
              alt="Avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            (profile?.name?.charAt(0) || 'A').toUpperCase()
          )}
        </div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="footer-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.name || 'Admin User'}
              </div>
              <div className="footer-role">{profile?.role || 'Super Admin'}</div>
            </div>
            <ChevronRight size={14} color="#8A9BB0" />
          </>
        )}
      </div>
    </aside>
  );
}
