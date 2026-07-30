import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, Bell, ChevronDown, LogOut, User, Settings, Shield, ScrollText, HelpCircle, Zap, Plus, Users, MapPin, ClipboardList, FileBarChart2, Send, Bot, CheckCircle, AlertTriangle, Clock, Activity, X, Menu, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';
import { MOCK_ACTIVITY_LOGS, MOCK_EMPLOYEES } from '../mockData';

const RECENT_SEARCHES = ['John Cruz', 'Attendance Report', 'Greenfield Mall', 'Assignment 12'];
const QUICK_NAV = [
  { label: 'Dashboard', path: '/' },
  { label: 'Live Tracking', path: '/tracking' },
  { label: 'Employees', path: '/employees' },
  { label: 'Attendance', path: '/attendance' },
  { label: 'Reports', path: '/reports' },
  { label: 'Notifications', path: '/notifications' },
  { label: 'Settings', path: '/settings' },
];

const NOTIFICATIONS = [
  { id: 1, type: 'attendance', user: 'John Cruz', action: 'Checked in to Greenfield Mall', time: '2 min ago', status: 'success', read: false },
  { id: 2, type: 'tracking', user: 'Maria Santos', action: 'Entered Central Station site', time: '5 min ago', status: 'info', read: false },
  { id: 3, type: 'geofence', user: 'Kevin Dela Cruz', action: 'Exited work area boundary', time: '8 min ago', status: 'warning', read: false },
  { id: 4, type: 'assignment', user: 'Anna Lim', action: 'New assignment created', time: '15 min ago', status: 'success', read: true },
  { id: 5, type: 'ai', user: 'AI Assistant', action: 'Generated workforce recommendation', time: '30 min ago', status: 'info', read: true },
  { id: 6, type: 'system', user: 'System', action: 'Backup completed successfully', time: '1 hour ago', status: 'success', read: true },
];

const NOTIF_ICONS = {
  attendance: <User size={14} />,
  tracking: <MapPin size={14} />,
  geofence: <AlertTriangle size={14} />,
  assignment: <ClipboardList size={14} />,
  ai: <Bot size={14} />,
  system: <CheckCircle size={14} />,
};

const NOTIF_COLORS = {
  attendance: '#10B981',
  tracking: '#3B82F6',
  geofence: '#F59E0B',
  assignment: '#8B5CF6',
  ai: '#6366F1',
  system: '#06B6D4',
};

export default function TopNav({ user, onLogout }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => document.body.classList.contains('dark-mode'));
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [notifCount] = useState(NOTIFICATIONS.filter(n => !n.read).length);
  const searchRef = useRef(null);
  const userMenuRef = useRef(null);
  const notifRef = useRef(null);
  const themeRef = useRef(null);
  const quickRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
      if (themeRef.current && !themeRef.current.contains(e.target)) setShowThemeMenu(false);
      if (quickRef.current && !quickRef.current.contains(e.target)) setShowQuickActions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
        searchRef.current?.querySelector('input')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = (mode) => {
    setIsDarkMode(mode === 'dark');
    document.body.classList.toggle('dark-mode', mode === 'dark');
    setShowThemeMenu(false);
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    const result = await Swal.fire({
      title: 'Sign Out?',
      text: 'Are you sure you want to sign out of GeoStride Admin Portal?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#4F46E5',
      cancelButtonColor: '#E5E7EB',
      confirmButtonText: 'Yes, Sign Out',
      cancelButtonText: 'Cancel',
      customClass: { cancelButton: 'swal-cancel-btn' },
      reverseButtons: true,
    });
    if (result.isConfirmed && onLogout) onLogout();
  };

  const displayName = user?.email ? user.email.split('@')[0] : 'Admin User';
  const displayInitial = displayName.charAt(0).toUpperCase();

  let title = 'Dashboard';
  let description = 'Overview of your workforce';
  switch (location.pathname) {
    case '/': title = 'Dashboard'; description = 'Overview of your workforce and key metrics'; break;
    case '/tracking': title = 'Live Tracking'; description = 'Monitor real-time employee locations'; break;
    case '/employees': title = 'Employees'; description = 'Manage your workforce directory'; break;
    case '/sites': title = 'Sites'; description = 'Configure geofences and boundaries'; break;
    case '/assignments': title = 'Assignments'; description = 'Assign staff to specific sites'; break;
    case '/attendance': title = 'Attendance Monitoring'; description = 'Track employee check-ins, check-outs, and on-site attendance.'; break;
    case '/reports': title = 'Reports & Analytics'; description = 'Monitor employee performance, attendance, and tracking analytics.'; break;
    case '/notifications': title = 'Notifications'; description = 'View recent alerts and messages'; break;
    case '/settings': title = 'Settings'; description = 'System configurations and preferences'; break;
    case '/users': title = 'Users & Roles'; description = 'Manage admin access levels'; break;
    case '/logs': title = 'Activity Logs'; description = 'Audit trail of system actions'; break;
  }

  const filteredSearch = searchQuery ? QUICK_NAV.filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase())) : QUICK_NAV;

  return (
    <div className="global-topnav">
      <div className="topnav-left">
        <h1 className="topnav-page-title">{title}</h1>
        <span className="topnav-page-desc">{description}</span>
      </div>

      <div className="topnav-right">
        {/* Premium Search */}
        <div className="topnav-search-premium" ref={searchRef}>
          <div className={`search-bar ${showSearch ? 'search-bar-focused' : ''}`} onClick={() => setShowSearch(true)}>
            <Search size={15} className="search-icon" />
            <input
              placeholder="Search employees, sites, attendance, reports..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearch(true)}
            />
            <div className="search-kbd">
              <kbd>⌘</kbd><kbd>K</kbd>
            </div>
          </div>

          {showSearch && (
            <div className="search-dropdown">
              {!searchQuery && (
                <>
                  <div className="search-section">
                    <div className="search-section-title">Recent Searches</div>
                    {RECENT_SEARCHES.map((item, i) => (
                      <div key={i} className="search-item" onClick={() => { setSearchQuery(item); }}>
                        <RefreshCw size={12} className="search-item-icon" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="search-divider" />
                </>
              )}
              <div className="search-section">
                <div className="search-section-title">Quick Navigation</div>
                {filteredSearch.map((item, i) => (
                  <div key={i} className="search-item" onClick={() => { navigate(item.path); setShowSearch(false); setSearchQuery(''); }}>
                    <span className="search-item-nav">{item.label}</span>
                    <span className="search-item-path">{item.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="topnav-action-wrapper" ref={quickRef}>
          <button className="topnav-quick-btn" onClick={() => { setShowQuickActions(!showQuickActions); setShowNotifs(false); setShowUserMenu(false); }}>
            <Zap size={16} />
          </button>
          {showQuickActions && (
            <div className="quick-actions-dropdown">
              <div className="quick-actions-header">Quick Actions</div>
              {[
                { icon: <User size={14} />, label: 'Add Employee', color: '#6366F1' },
                { icon: <MapPin size={14} />, label: 'Assign Site', color: '#10B981' },
                { icon: <ClipboardList size={14} />, label: 'Create Assignment', color: '#3B82F6' },
                { icon: <FileBarChart2 size={14} />, label: 'Generate Report', color: '#F59E0B' },
                { icon: <Send size={14} />, label: 'Send Notification', color: '#8B5CF6' },
                { icon: <Bot size={14} />, label: 'AI Assistant', color: '#06B6D4' },
              ].map((action, i) => (
                <div key={i} className="quick-action-item" style={{ '--action-color': action.color }}>
                  <div className="quick-action-icon" style={{ background: action.color + '15', color: action.color }}>{action.icon}</div>
                  <span>{action.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <div className="topnav-action-wrapper" ref={themeRef}>
          <button className={`topnav-theme-btn ${isDarkMode ? 'dark' : ''}`} onClick={() => setShowThemeMenu(!showThemeMenu)} title="Toggle theme">
            <div className="theme-btn-inner">
              <Sun size={14} className="theme-sun" />
              <Moon size={14} className="theme-moon" />
            </div>
          </button>
          {showThemeMenu && (
            <div className="theme-dropdown">
              <div className="theme-option" onClick={() => toggleTheme('light')}>
                <Sun size={14} /> <span>Light Mode</span>
                {!isDarkMode && <CheckCircle size={14} className="theme-check" />}
              </div>
              <div className="theme-option" onClick={() => toggleTheme('dark')}>
                <Moon size={14} /> <span>Dark Mode</span>
                {isDarkMode && <CheckCircle size={14} className="theme-check" />}
              </div>
              <div className="theme-option" onClick={() => toggleTheme('system')}>
                <RefreshCw size={14} /> <span>System Default</span>
              </div>
            </div>
          )}
        </div>

        {/* Notification Center */}
        <div className="topnav-action-wrapper" ref={notifRef}>
          <button className="topnav-notif-btn" onClick={() => { setShowNotifs(!showNotifs); setShowQuickActions(false); setShowUserMenu(false); }}>
            <Bell size={16} />
            {notifCount > 0 && (
              <div className="notif-badge">
                <span className="notif-badge-pulse" />
                <span>{notifCount}</span>
              </div>
            )}
          </button>

          {showNotifs && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <div className="notif-header-left">
                  <span className="notif-title">Notifications</span>
                  <span className="notif-count">{notifCount} new</span>
                </div>
                <div className="notif-header-actions">
                  <button className="notif-btn-text">Mark all read</button>
                  <button className="notif-btn-text" onClick={() => navigate('/settings')}>Settings</button>
                </div>
              </div>
              <div className="notif-list">
                {NOTIFICATIONS.map((notif) => (
                  <div key={notif.id} className={`notif-item ${!notif.read ? 'notif-unread' : ''}`}>
                    <div className="notif-item-left">
                      <div className="notif-icon" style={{ background: NOTIF_COLORS[notif.type] + '15', color: NOTIF_COLORS[notif.type] }}>
                        {NOTIF_ICONS[notif.type]}
                      </div>
                      <div className="notif-content">
                        <div className="notif-user">{notif.user}</div>
                        <div className="notif-action">{notif.action}</div>
                        <div className="notif-time">{notif.time}</div>
                      </div>
                    </div>
                    <div className="notif-item-right">
                      {!notif.read && <div className="notif-dot" />}
                      <div className="notif-status-badge" style={{ background: NOTIF_COLORS[notif.type] + '15', color: NOTIF_COLORS[notif.type] }}>
                        {notif.type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="notif-footer" onClick={() => { setShowNotifs(false); navigate('/logs'); }}>
                View All Notifications
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="topnav-action-wrapper" ref={userMenuRef}>
          <button className="topnav-profile-btn" onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifs(false); setShowQuickActions(false); }}>
            <div className="profile-avatar-wrapper">
              <div className="profile-avatar">{displayInitial}</div>
              <div className="profile-online-dot" />
            </div>
            <div className="profile-info">
              <div className="profile-name">{displayName}</div>
              <div className="profile-role">Super Admin</div>
            </div>
            <ChevronDown size={14} className={`profile-chevron ${showUserMenu ? 'rotated' : ''}`} />
          </button>

          {showUserMenu && (
            <div className="user-menu-dropdown">
              <div className="user-menu-header">
                <div className="user-menu-avatar">{displayInitial}</div>
                <div>
                  <div className="user-menu-name">{displayName}</div>
                  <div className="user-menu-email">{user?.email || 'admin@geostride.com'}</div>
                </div>
              </div>
              <div className="user-menu-divider" />
              <div className="user-menu-item"><User size={14} /> <span>My Profile</span></div>
              <div className="user-menu-item" onClick={() => navigate('/settings')}><Settings size={14} /> <span>Account Settings</span></div>
              <div className="user-menu-item"><Shield size={14} /> <span>Security</span></div>
              <div className="user-menu-item" onClick={() => navigate('/logs')}><ScrollText size={14} /> <span>Activity Logs</span></div>
              <div className="user-menu-divider" />
              <div className="user-menu-item"><HelpCircle size={14} /> <span>Help Center</span></div>
              <div className="user-menu-divider" />
              <div className="user-menu-item user-menu-logout" onClick={handleLogout}>
                <LogOut size={14} /> <span>Logout</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}