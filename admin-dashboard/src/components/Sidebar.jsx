import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, Users, MapPin, ClipboardList,
  CalendarCheck, FileBarChart2, Bell, Settings, ShieldCheck, ScrollText,
  ScanLine, ShieldAlert, ShieldX, Clock, ChevronsLeft, ChevronsRight, Building2, Activity
} from 'lucide-react';
import { isPathAllowedForUser, getRoleConfig, isDeveloper } from '../utils/roles';
import { useCompany } from '../utils/companyContext';

import logoImage from '../assets/logo.png';

const developerNavItems = [
  { to: '/developer',            icon: Building2,  label: 'Companies & Plans' },
  { to: '/developer/monitoring', icon: Activity,   label: 'System Monitoring' },
  { to: '/developer/logs',       icon: ScrollText, label: 'Platform Logs' },
  { to: '/developer/settings',   icon: Settings,   label: 'Developer Settings' },
];

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

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen, user }) {
  const { activeCompany, activeCompanyName, companyLogoUrl } = useCompany();
  const currentRole = user?.role || 'Company User';
  const roleConfig = getRoleConfig(currentRole);
  const devUser = isDeveloper(user);
  const visibleNavItems = devUser
    ? developerNavItems
    : navItems.filter(item => isPathAllowedForUser(user, item.to));
  const brandLogoSrc = (!devUser && (companyLogoUrl || activeCompany?.logoUrl)) ? (companyLogoUrl || activeCompany?.logoUrl) : logoImage;
  const brandLogoAlt = (!devUser && activeCompanyName) ? `${activeCompanyName} Logo` : 'SubAi Logo';

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
          <img
            src={brandLogoSrc}
            alt={brandLogoAlt}
            onError={(e) => { e.currentTarget.src = logoImage; }}
            style={{ height: 36, maxWidth: 162, width: 'auto', objectFit: 'contain' }}
          />
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

      {/* Role Indicator Badge */}
      {!collapsed ? (
        <div style={{
          padding: '2px 18px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 20,
            background: roleConfig.bg,
            border: `1px solid ${roleConfig.border}`,
            color: roleConfig.color,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.2px'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleConfig.color }} />
            {devUser ? 'Developer Portal' : (roleConfig.role === 'Company Admin' ? 'Company Admin Portal' : `${user?.jobTitle || 'Company User'} Portal`)}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }} title={devUser ? 'Developer Portal' : 'Company Admin Portal'}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: roleConfig.color }} />
        </div>
      )}

      {/* Nav */}
      <nav className="nav-section">
        {visibleNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || to === '/developer'}
            title={collapsed ? label : undefined}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <Icon size={17} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
