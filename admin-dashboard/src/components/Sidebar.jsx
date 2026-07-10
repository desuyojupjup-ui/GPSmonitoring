import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, Users, MapPin, ClipboardList,
  CalendarCheck, FileBarChart2, Bell, Settings, ShieldCheck, ScrollText, ChevronRight
} from 'lucide-react';

import logoImage from '../assets/logo.png';

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tracking',   icon: Map,              label: 'Live Tracking' },
  { to: '/employees',  icon: Users,            label: 'Employees' },
  { to: '/sites',      icon: MapPin,           label: 'Sites' },
  { to: '/assignments',icon: ClipboardList,    label: 'Assignments' },
  { to: '/attendance', icon: CalendarCheck,    label: 'Attendance' },
  { to: '/reports',    icon: FileBarChart2,    label: 'Reports' },
  { to: '/notifications',icon: Bell,           label: 'Notifications' },
  { to: '/settings',   icon: Settings,         label: 'Settings' },
  { to: '/users',      icon: ShieldCheck,      label: 'Users & Roles' },
  { to: '/logs',       icon: ScrollText,       label: 'Activity Logs' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <img src={logoImage} alt="TrackForce Logo" style={{ width: 45, height: 45, objectFit: 'contain' }} />
        <div>
          <div className="logo-name">GeoStride</div>
          <div className="logo-sub">Workforce Monitoring</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="nav-section">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="footer-avatar">A</div>
        <div style={{ flex: 1 }}>
          <div className="footer-name">Admin User</div>
          <div className="footer-role">Super Admin</div>
        </div>
        <ChevronRight size={14} color="#8A9BB0" />
      </div>
    </aside>
  );
}
