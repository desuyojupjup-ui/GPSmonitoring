import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, Users, MapPin, ClipboardList,
  CalendarCheck, FileBarChart2, Bell, Settings, ShieldCheck, ScrollText,
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
    </aside>
  );
}
