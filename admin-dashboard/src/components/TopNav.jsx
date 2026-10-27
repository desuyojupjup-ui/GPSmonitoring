import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Search, Sun, Moon, Bell, ChevronDown, LogOut, User, Settings, Shield, 
  ScrollText, HelpCircle, Zap, Plus, Users, MapPin, ClipboardList, 
  FileBarChart2, Send, Bot, CheckCircle, AlertTriangle, Clock, Activity, 
  X, Menu, RefreshCw, Radio, Building2, Check, ArrowRight, Sparkles 
} from 'lucide-react';
import { showToast, showConfirmLogout } from '../utils/toast';
import { db, collection, onSnapshot, query, doc, updateDoc, safeLocalStorageSet } from '../firebase';

const RECENT_SEARCHES = ['John Cruz', 'Maria Santos', 'Attendance', 'Greenfield Mall', 'Site Guard Duty'];

const SEARCH_PAGES = [
  { label: 'Dashboard', desc: 'Workforce overview, attendance & live stats', path: '/', category: 'Page', icon: <Activity size={14} /> },
  { label: 'Live Tracking', desc: 'Real-time GPS tracking map & breadcrumbs', path: '/tracking', category: 'Page', icon: <MapPin size={14} /> },
  { label: 'Employees Directory', desc: 'Manage workforce personnel, profiles & work types', path: '/employees', category: 'Page', icon: <Users size={14} /> },
  { label: 'Sites & Geofences', desc: 'Circular perimeter boundaries & addresses', path: '/sites', category: 'Page', icon: <Building2 size={14} /> },
  { label: 'Duty Assignments', desc: 'Schedule staff to geofenced sites & routes', path: '/assignments', category: 'Page', icon: <ClipboardList size={14} /> },
  { label: 'Attendance Monitoring', desc: 'Daily punch-ins, clock-outs & timesheets', path: '/attendance', category: 'Page', icon: <Clock size={14} /> },
  { label: 'Facial Verifications', desc: 'Mobile biometric face recognition check logs', path: '/verifications', category: 'Page', icon: <CheckCircle size={14} /> },
  { label: 'AI Anomaly Center', desc: 'Machine learning fraud & outlier flags', path: '/anomalies', category: 'Page', icon: <Shield size={14} /> },
  { label: 'Anti-Spoofing & Fraud', desc: 'Mock GPS, VPN and device breach detection', path: '/fraud-reports', category: 'Page', icon: <AlertTriangle size={14} /> },
  { label: 'Delay & Incidents', desc: 'Field delay notices (traffic, breakdown, weather)', path: '/delay-reports', category: 'Page', icon: <AlertTriangle size={14} /> },
  { label: 'Reports & Analytics', desc: 'Export attendance & performance CSV reports', path: '/reports', category: 'Page', icon: <FileBarChart2 size={14} /> },
  { label: 'Notifications Center', desc: 'Broadcast center & real-time system alerts', path: '/notifications', category: 'Page', icon: <Bell size={14} /> },
  { label: 'System Settings', desc: 'System configuration, profile & preferences', path: '/settings', category: 'Page', icon: <Settings size={14} /> },
  { label: 'Users & Roles', desc: 'Manage administrator accounts & permissions', path: '/users', category: 'Page', icon: <User size={14} /> },
  { label: 'Activity Logs', desc: 'Audit trail of administrative actions', path: '/logs', category: 'Page', icon: <ScrollText size={14} /> },
  { label: 'AI Assistant', desc: 'Ask questions about database & workforce', path: '/ai-assistant', category: 'Page', icon: <Bot size={14} /> },
];

const NOTIF_ICONS = {
  attendance: <User size={14} />,
  tracking: <MapPin size={14} />,
  geofence: <AlertTriangle size={14} />,
  assignment: <ClipboardList size={14} />,
  ai: <Bot size={14} />,
  system: <CheckCircle size={14} />,
  alert: <AlertTriangle size={14} />,
  message: <Bell size={14} />
};

const NOTIF_COLORS = {
  attendance: '#10B981',
  tracking: '#3B82F6',
  geofence: '#F59E0B',
  assignment: '#8B5CF6',
  ai: '#6366F1',
  system: '#06B6D4',
  alert: '#EF4444',
  message: '#3B82F6'
};

export default function TopNav({ user, onLogout, onMenuToggle }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);

  // Live collections for universal search
  const [employeesList, setEmployeesList] = useState([]);
  const [sitesList, setSitesList] = useState([]);
  const [assignmentsList, setAssignmentsList] = useState([]);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('subai_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      if (saved === 'system') return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {}
    return document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark-mode');
  });
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const userMenuRef = useRef(null);
  const notifRef = useRef(null);
  const themeRef = useRef(null);
  const quickRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Load and subscribe to real-time employees, sites, assignments for universal search
  useEffect(() => {
    // 1. Employees
    const loadEmployees = () => {
      try {
        const raw = localStorage.getItem('subai_store_employees');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {}
      return [];
    };
    setEmployeesList(loadEmployees());
    let unsubEmp = () => {};
    try {
      unsubEmp = onSnapshot(query(collection(db, 'employees')), (snap) => {
        setEmployeesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
    } catch(e) {}

    // 2. Sites
    const loadSites = () => {
      try {
        const raw = localStorage.getItem('subai_store_Sites');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {}
      return [];
    };
    setSitesList(loadSites());
    let unsubSites = () => {};
    try {
      unsubSites = onSnapshot(query(collection(db, 'Sites')), (snap) => {
        setSitesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
    } catch(e) {}

    // 3. Assignments
    const loadAssignments = () => {
      try {
        const raw = localStorage.getItem('subai_store_Assignments');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {}
      return [];
    };
    setAssignmentsList(loadAssignments());
    let unsubAssignments = () => {};
    try {
      unsubAssignments = onSnapshot(query(collection(db, 'Assignments')), (snap) => {
        setAssignmentsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
    } catch(e) {}

    return () => {
      unsubEmp();
      unsubSites();
      unsubAssignments();
    };
  }, []);

  // Synchronize theme on load
  useEffect(() => {
    try {
      const saved = localStorage.getItem('subai_theme') || 'light';
      let dark = false;
      if (saved === 'dark') dark = true;
      else if (saved === 'system') {
        dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      setIsDarkMode(dark);
      document.body.classList.toggle('dark-mode', dark);
      document.documentElement.classList.toggle('dark-mode', dark);
    } catch(e) {}
  }, []);

  // Load and subscribe to real-time notifications
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const raw = localStorage.getItem('subai_store_notifications');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) return list;
        }
      } catch (e) {}
      return [];
    };

    let unsub = () => {};
    try {
      unsub = onSnapshot(query(collection(db, 'notifications')), (snap) => {
        const live = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setNotifications(live);
        safeLocalStorageSet('subai_store_notifications', JSON.stringify(live));
      }, () => {
        setNotifications(loadFromStorage());
      });
    } catch(e) {
      setNotifications(loadFromStorage());
    }

    const handleUpdate = () => {
      setNotifications(loadFromStorage());
    };

    window.addEventListener('subai_notifications_updated', handleUpdate);
    window.addEventListener('storage', (e) => {
      if (e.key === 'subai_store_notifications') handleUpdate();
    });

    return () => {
      unsub();
      window.removeEventListener('subai_notifications_updated', handleUpdate);
    };
  }, []);

  const notifCount = notifications.filter(n => n.status === 'Unread' || n.read === false).length;

  const handleMarkAllRead = async () => {
    const updated = notifications.map(n => ({ ...n, status: 'Read', read: true }));
    setNotifications(updated);
    safeLocalStorageSet('subai_store_notifications', JSON.stringify(updated));
    try {
      await Promise.all(notifications.filter(n => n.status === 'Unread' || n.read === false).map(n => 
        updateDoc(doc(db, 'notifications', String(n.id)), { status: 'Read', read: true }).catch(() => {})
      ));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    showToast('Notifications Read', 'All notifications marked as read.', 'info');
  };

  const handleNotificationClick = async (notif) => {
    if (notif.status === 'Unread' || notif.read === false) {
      const updated = notifications.map(n => String(n.id) === String(notif.id) ? { ...n, status: 'Read', read: true } : n);
      setNotifications(updated);
      safeLocalStorageSet('subai_store_notifications', JSON.stringify(updated));
      try {
        await updateDoc(doc(db, 'notifications', String(notif.id)), { status: 'Read', read: true }).catch(() => {});
      } catch (e) {}
      window.dispatchEvent(new CustomEvent('subai_notifications_updated'));
    }
    setShowNotifs(false);
    
    // Contextual routing based on notification content
    const text = `${notif.type || ''} ${notif.title || ''} ${notif.sender || ''} ${notif.message || ''}`.toLowerCase();
    if (text.includes('tracking') || text.includes('gps') || text.includes('speed') || text.includes('location')) {
      navigate('/tracking');
    } else if (text.includes('attendance') || text.includes('check-in') || text.includes('late')) {
      navigate('/attendance');
    } else if (text.includes('geofence') || text.includes('site') || text.includes('perimeter')) {
      navigate('/sites');
    } else if (text.includes('assign') || text.includes('schedule')) {
      navigate('/assignments');
    } else if (text.includes('verif') || text.includes('facial')) {
      navigate('/verifications');
    } else if (text.includes('fraud') || text.includes('spoof') || text.includes('mock') || text.includes('vpn')) {
      navigate('/fraud-reports');
    } else if (text.includes('delay') || text.includes('traffic') || text.includes('incident')) {
      navigate('/delay-reports');
    } else {
      navigate('/notifications');
    }
  };

  // Close dropdowns on outside click
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

  // Keyboard shortcut: Cmd/Ctrl + K to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Theme Toggle System ─────────────────────────────────────
  const toggleTheme = (mode) => {
    let isDark = false;
    if (mode === 'system') {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      try { localStorage.setItem('subai_theme', 'system'); } catch(e) {}
    } else {
      isDark = mode === 'dark';
      try { localStorage.setItem('subai_theme', mode); } catch(e) {}
    }
    setIsDarkMode(isDark);
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.classList.toggle('dark-mode', isDark);
    setShowThemeMenu(false);
    window.dispatchEvent(new CustomEvent('subai_theme_changed', { detail: { theme: mode, isDark } }));
    showToast('Theme Mode', `Switched to ${isDark ? 'Dark Mode 🌙' : 'Light Mode ☀️'}.`, 'info');
  };

  // Direct toggle on click: Sun -> Moon -> Sun
  const handleDirectThemeToggle = () => {
    const nextMode = isDarkMode ? 'light' : 'dark';
    toggleTheme(nextMode);
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    const confirmed = await showConfirmLogout(
      'Sign Out?',
      'Are you sure you want to sign out of SubAi Admin Portal?'
    );
    if (confirmed) {
      showToast('Signed Out', 'You have successfully signed out.', 'info');
      if (onLogout) onLogout();
      navigate('/login');
    }
  };

  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('subai_admin_user');
      return saved ? JSON.parse(saved) : (user || {});
    } catch {
      return user || {};
    }
  });

  useEffect(() => {
    if (user) setProfile(user);
  }, [user]);

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) setProfile(e.detail);
    };
    window.addEventListener('subai_admin_profile_updated', handleUpdate);
    return () => window.removeEventListener('subai_admin_profile_updated', handleUpdate);
  }, []);

  const displayName = profile.displayName || profile.name || (profile.email ? profile.email.split('@')[0] : 'Admin User');
  const displayRole = profile.role || 'Super Admin';
  const displayEmail = profile.email || 'admin@subai.com';
  const avatarColor = profile.avatarColor || '#1E5ADB';
  const avatarPhoto = profile.avatarPhoto || null;
  const displayInitial = (displayName.charAt(0) || 'A').toUpperCase();

  let title = 'Dashboard';
  let description = 'Overview of your workforce';
  switch (location.pathname) {
    case '/': title = 'Dashboard'; description = 'Overview of your workforce and key metrics'; break;
    case '/tracking': title = 'Live Tracking'; description = 'Monitor real-time employee locations'; break;
    case '/employees': title = 'Employees'; description = 'Manage your workforce directory'; break;
    case '/sites': title = 'Sites'; description = 'Configure geofences and boundaries'; break;
    case '/assignments': title = 'Assignments'; description = 'Assign staff to specific sites'; break;
    case '/attendance': title = 'Attendance Monitoring'; description = 'Track employee check-ins, check-outs, and on-site attendance.'; break;
    case '/verifications': title = 'Facial Verification Monitoring'; description = 'Live facial verification check logs received from Mobile devices.'; break;
    case '/anomalies': title = 'AI Anomaly Detection Center'; description = 'Real-time machine learning flags connected to Cloud Firestore live stream.'; break;
    case '/fraud-reports': title = 'Anti-Spoofing & Security Fraud Reports'; description = 'Log of mock GPS detection, jailbreak/root attempts, and device integrity breaches streamed live from Firestore.'; break;
    case '/delay-reports': title = 'Delay & Incident Management'; description = 'Review field delay notifications (traffic, breakdown, weather) streamed live from Cloud Firestore.'; break;
    case '/reports': title = 'Reports & Analytics'; description = 'Monitor employee performance, attendance, and tracking analytics.'; break;
    case '/notifications': title = 'Notifications'; description = 'View recent alerts and messages'; break;
    case '/settings': title = 'Settings'; description = 'System configurations and preferences'; break;
    case '/users': title = 'Users & Roles'; description = 'Manage admin access levels'; break;
    case '/logs': title = 'Activity Logs'; description = 'Audit trail of system actions'; break;
    case '/ai-assistant': title = 'AI Assistant'; description = 'Interactive AI database intelligence'; break;
  }

  // ─── Quick Actions System ────────────────────────────────────
  const QUICK_ACTIONS = [
    {
      id: 'add-employee',
      icon: <User size={15} />,
      label: 'Add Employee',
      subtitle: 'Register new personnel record',
      color: '#6366F1',
      handler: () => {
        setShowQuickActions(false);
        navigate('/employees?action=add');
        setTimeout(() => window.dispatchEvent(new CustomEvent('subai_open_add_employee')), 40);
        showToast('Employee Directory', 'Opening Add Employee registration modal...', 'info');
      }
    },
    {
      id: 'assign-site',
      icon: <MapPin size={15} />,
      label: 'Assign Site',
      subtitle: 'Create site geofence boundary',
      color: '#10B981',
      handler: () => {
        setShowQuickActions(false);
        navigate('/sites?action=add');
        setTimeout(() => window.dispatchEvent(new CustomEvent('subai_open_add_site')), 40);
        showToast('Site Geofence', 'Opening Site Geofence creator...', 'info');
      }
    },
    {
      id: 'create-assignment',
      icon: <ClipboardList size={15} />,
      label: 'Create Assignment',
      subtitle: 'Schedule employee shift / duty',
      color: '#3B82F6',
      handler: () => {
        setShowQuickActions(false);
        navigate('/assignments?action=add');
        setTimeout(() => window.dispatchEvent(new CustomEvent('subai_open_add_assignment')), 40);
        showToast('Duty Assignments', 'Opening Assignment Scheduler...', 'info');
      }
    },
    {
      id: 'generate-report',
      icon: <FileBarChart2 size={15} />,
      label: 'Generate Report',
      subtitle: 'Export attendance CSV analytics',
      color: '#F59E0B',
      handler: () => {
        setShowQuickActions(false);
        navigate('/reports?action=export');
        setTimeout(() => window.dispatchEvent(new CustomEvent('subai_export_reports')), 40);
        showToast('Reports & Analytics', 'Generating and exporting attendance report...', 'info');
      }
    },
    {
      id: 'send-notification',
      icon: <Send size={15} />,
      label: 'Send Notification',
      subtitle: 'Broadcast alert to mobile devices',
      color: '#8B5CF6',
      handler: () => {
        setShowQuickActions(false);
        navigate('/notifications?action=send');
        setTimeout(() => window.dispatchEvent(new CustomEvent('subai_open_broadcast')), 40);
        showToast('Notification Center', 'Opening Broadcast Notification composer...', 'info');
      }
    },
    {
      id: 'ai-assistant',
      icon: <Bot size={15} />,
      label: 'AI Assistant',
      subtitle: 'Ask GeoStride AI questions',
      color: '#06B6D4',
      handler: () => {
        setShowQuickActions(false);
        window.dispatchEvent(new CustomEvent('subai_open_chat'));
        navigate('/ai-assistant');
        showToast('AI Assistant', 'Opening GeoStride AI Assistant...', 'info');
      }
    },
  ];

  // ─── Universal Search Filtering ──────────────────────────────
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    // 1. Matched Pages
    const pages = SEARCH_PAGES.filter(p => 
      p.label.toLowerCase().includes(q) || 
      p.desc.toLowerCase().includes(q) || 
      p.path.toLowerCase().includes(q)
    ).slice(0, 4);

    // 2. Matched Employees
    const employees = employeesList.filter(emp => {
      const name = (emp.name || '').toLowerCase();
      const idNum = (emp.idNum || emp.id || '').toLowerCase();
      const dept = (emp.department || emp.org || '').toLowerCase();
      const role = (emp.type || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      return name.includes(q) || idNum.includes(q) || dept.includes(q) || role.includes(q) || email.includes(q);
    }).slice(0, 4);

    // 3. Matched Sites
    const sites = sitesList.filter(s => {
      const name = (s.name || '').toLowerCase();
      const addr = (s.address || '').toLowerCase();
      return name.includes(q) || addr.includes(q);
    }).slice(0, 3);

    // 4. Matched Assignments
    const assignments = assignmentsList.filter(a => {
      const title = (a.title || a.name || '').toLowerCase();
      const emp = (a.empName || a.employeeName || '').toLowerCase();
      const site = (a.site || a.site_name || '').toLowerCase();
      return title.includes(q) || emp.includes(q) || site.includes(q);
    }).slice(0, 3);

    // 5. Matched Quick Actions
    const actions = QUICK_ACTIONS.filter(act => 
      act.label.toLowerCase().includes(q) || 
      act.subtitle.toLowerCase().includes(q)
    ).slice(0, 3);

    const totalCount = pages.length + employees.length + sites.length + assignments.length + actions.length;
    return { pages, employees, sites, assignments, actions, totalCount };
  }, [searchQuery, employeesList, sitesList, assignmentsList]);

  // Flattened items for keyboard arrow-key selection
  const flatSearchItems = useMemo(() => {
    if (!searchResults) return [];
    const items = [];
    searchResults.pages.forEach(p => items.push({ type: 'page', data: p }));
    searchResults.employees.forEach(e => items.push({ type: 'employee', data: e }));
    searchResults.sites.forEach(s => items.push({ type: 'site', data: s }));
    searchResults.assignments.forEach(a => items.push({ type: 'assignment', data: a }));
    searchResults.actions.forEach(a => items.push({ type: 'action', data: a }));
    return items;
  }, [searchResults]);

  const executeSearchItem = (item) => {
    setShowSearch(false);
    setSearchQuery('');
    setSelectedResultIndex(-1);

    if (item.type === 'page') {
      navigate(item.data.path);
    } else if (item.type === 'employee') {
      navigate(`/employees?search=${encodeURIComponent(item.data.name || item.data.idNum || '')}`);
      showToast('Employee Selected', `Navigated to ${item.data.name || 'employee'} in Directory.`, 'info');
    } else if (item.type === 'site') {
      navigate(`/sites?search=${encodeURIComponent(item.data.name || '')}`);
      showToast('Site Selected', `Navigated to ${item.data.name} in Sites.`, 'info');
    } else if (item.type === 'assignment') {
      const query = item.data.title || item.data.empName || item.data.site || '';
      navigate(`/assignments?search=${encodeURIComponent(query)}`);
      showToast('Assignment Selected', `Navigated to assignment in Duty Scheduler.`, 'info');
    } else if (item.type === 'action') {
      item.data.handler();
    }
  };

  const handleSearchKeyDown = (e) => {
    if (!showSearch) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex(prev => (prev + 1 < flatSearchItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex(prev => (prev - 1 >= 0 ? prev - 1 : flatSearchItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatSearchItems.length > 0) {
        const item = selectedResultIndex >= 0 ? flatSearchItems[selectedResultIndex] : flatSearchItems[0];
        executeSearchItem(item);
      } else if (searchQuery.trim()) {
        // Fallback: search employees directly
        navigate(`/employees?search=${encodeURIComponent(searchQuery.trim())}`);
        setShowSearch(false);
        setSearchQuery('');
      }
    } else if (e.key === 'Escape') {
      setShowSearch(false);
      setSelectedResultIndex(-1);
    }
  };

  return (
    <div className="global-topnav">
      {/* Hamburger button - visible only on mobile */}
      <button
        className="topnav-hamburger"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
        id="mobile-menu-toggle"
      >
        <Menu size={20} />
      </button>

      <div className="topnav-left">
        <h1 className="topnav-page-title">{title}</h1>
        <span className="topnav-page-desc">{description}</span>
      </div>

      <div className="topnav-right">
        {/* Universal Search Bar */}
        <div className="topnav-search-premium" ref={searchRef}>
          <div className={`search-bar ${showSearch ? 'search-bar-focused' : ''}`} onClick={() => { setShowSearch(true); searchInputRef.current?.focus(); }}>
            <Search size={15} className="search-icon" />
            <input
              ref={searchInputRef}
              placeholder="Search employees, sites, attendance, reports..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setShowSearch(true);
                setSelectedResultIndex(-1);
              }}
              onFocus={() => setShowSearch(true)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            ) : (
              <div className="search-kbd">
                <kbd>⌘</kbd><kbd>K</kbd>
              </div>
            )}
          </div>

          {showSearch && (
            <div className="search-dropdown">
              {/* Default State: Recent Searches & Quick Pages */}
              {!searchQuery.trim() ? (
                <>
                  <div className="search-section">
                    <div className="search-section-title">Recent Searches</div>
                    {RECENT_SEARCHES.map((item, i) => (
                      <div 
                        key={i} 
                        className="search-item" 
                        onClick={() => {
                          setSearchQuery(item);
                          searchInputRef.current?.focus();
                        }}
                      >
                        <RefreshCw size={13} className="search-item-icon" />
                        <span className="search-item-nav">{item}</span>
                        <span className="search-item-path">Click to search</span>
                      </div>
                    ))}
                  </div>

                  <div className="search-divider" />

                  <div className="search-section">
                    <div className="search-section-title">Primary Navigation</div>
                    {SEARCH_PAGES.slice(0, 6).map((item, i) => (
                      <div 
                        key={i} 
                        className="search-item" 
                        onClick={() => { 
                          navigate(item.path); 
                          setShowSearch(false); 
                          setSearchQuery(''); 
                        }}
                      >
                        <div className="search-item-icon">{item.icon}</div>
                        <div className="search-item-content">
                          <span className="search-item-nav">{item.label}</span>
                          <span className="search-item-sub">{item.desc}</span>
                        </div>
                        <span className="search-item-path">{item.path}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : searchResults && searchResults.totalCount === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                  No matches found for <strong style={{ color: '#64748B' }}>"{searchQuery}"</strong>.
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => {
                        navigate(`/employees?search=${encodeURIComponent(searchQuery)}`);
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                      style={{
                        padding: '6px 12px',
                        background: '#1E5ADB',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Search in Employees Directory
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Matching Employees */}
                  {searchResults.employees.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Employees ({searchResults.employees.length})</div>
                      {searchResults.employees.map((emp) => {
                        const isOnline = emp.status === 'Online' || emp.status === 'On Duty' || emp.isOnline === true;
                        return (
                          <div
                            key={emp.id || emp.idNum}
                            className="search-item"
                            onClick={() => executeSearchItem({ type: 'employee', data: emp })}
                          >
                            <div className="search-item-icon">
                              <User size={15} color="#1E5ADB" />
                            </div>
                            <div className="search-item-content">
                              <span className="search-item-nav">{emp.name || 'Unnamed Employee'}</span>
                              <span className="search-item-sub">
                                {emp.idNum || 'No ID'} • {emp.department || emp.org || emp.type || 'Staff'} • {emp.workType || 'Fixed Site'}
                              </span>
                            </div>
                            <span className={`search-badge ${isOnline ? 'search-badge-online' : 'search-badge-offline'}`}>
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Matching Sites */}
                  {searchResults.sites.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Sites & Geofences ({searchResults.sites.length})</div>
                      {searchResults.sites.map((site) => (
                        <div
                          key={site.id || site.name}
                          className="search-item"
                          onClick={() => executeSearchItem({ type: 'site', data: site })}
                        >
                          <div className="search-item-icon">
                            <MapPin size={15} color="#10B981" />
                          </div>
                          <div className="search-item-content">
                            <span className="search-item-nav">{site.name}</span>
                            <span className="search-item-sub">{site.address || 'Registered Location'} • {site.radius || '150'}m perimeter</span>
                          </div>
                          <span className="search-badge search-badge-site">Geofence</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Matching Assignments */}
                  {searchResults.assignments.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Assignments ({searchResults.assignments.length})</div>
                      {searchResults.assignments.map((asg) => (
                        <div
                          key={asg.id}
                          className="search-item"
                          onClick={() => executeSearchItem({ type: 'assignment', data: asg })}
                        >
                          <div className="search-item-icon">
                            <ClipboardList size={15} color="#3B82F6" />
                          </div>
                          <div className="search-item-content">
                            <span className="search-item-nav">{asg.title || asg.name || 'Site Assignment'}</span>
                            <span className="search-item-sub">Assigned: {asg.empName || asg.employeeName || 'Staff'} @ {asg.site || asg.site_name || 'Site'}</span>
                          </div>
                          <span className="search-badge search-badge-site">Shift</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Matching Pages */}
                  {searchResults.pages.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Pages & Sections ({searchResults.pages.length})</div>
                      {searchResults.pages.map((p) => (
                        <div
                          key={p.path}
                          className="search-item"
                          onClick={() => executeSearchItem({ type: 'page', data: p })}
                        >
                          <div className="search-item-icon">{p.icon}</div>
                          <div className="search-item-content">
                            <span className="search-item-nav">{p.label}</span>
                            <span className="search-item-sub">{p.desc}</span>
                          </div>
                          <span className="search-item-path">{p.path}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Matching Quick Actions */}
                  {searchResults.actions.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Actions ({searchResults.actions.length})</div>
                      {searchResults.actions.map((act) => (
                        <div
                          key={act.id}
                          className="search-item"
                          onClick={() => executeSearchItem({ type: 'action', data: act })}
                        >
                          <div className="search-item-icon" style={{ color: act.color }}>{act.icon}</div>
                          <div className="search-item-content">
                            <span className="search-item-nav">{act.label}</span>
                            <span className="search-item-sub">{act.subtitle}</span>
                          </div>
                          <span className="search-badge search-badge-action">Execute</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions Dropdown Button */}
        <div className="topnav-action-wrapper" ref={quickRef}>
          <button 
            className="topnav-quick-btn" 
            onClick={() => { 
              setShowQuickActions(!showQuickActions); 
              setShowNotifs(false); 
              setShowUserMenu(false); 
              setShowThemeMenu(false);
            }}
            title="Quick Actions (Add Employee, Assign Site, Reports, Notifications)"
            aria-label="Quick Actions"
          >
            <Zap size={16} />
          </button>
          
          {showQuickActions && (
            <div className="quick-actions-dropdown">
              <div className="quick-actions-header">Quick Actions</div>
              {QUICK_ACTIONS.map((action) => (
                <div 
                  key={action.id} 
                  className="quick-action-item" 
                  onClick={action.handler}
                  title={action.subtitle}
                >
                  <div 
                    className="quick-action-icon" 
                    style={{ background: action.color + '18', color: action.color }}
                  >
                    {action.icon}
                  </div>
                  <div className="quick-action-text">
                    <span className="quick-action-title">{action.label}</span>
                    <span className="quick-action-subtitle">{action.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <div className="topnav-action-wrapper" ref={themeRef}>
          <button 
            className={`topnav-theme-btn ${isDarkMode ? 'dark' : ''}`} 
            onClick={handleDirectThemeToggle}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowThemeMenu(prev => !prev);
            }}
            title={`Current Theme: ${isDarkMode ? 'Dark' : 'Light'}. Click to toggle mode, or right click for options.`}
            aria-label="Toggle Theme"
          >
            <div className="theme-btn-inner">
              <Sun size={15} className="theme-sun" />
              <Moon size={15} className="theme-moon" />
            </div>
          </button>

          {showThemeMenu && (
            <div className="theme-dropdown">
              <div className="theme-option" onClick={() => toggleTheme('light')}>
                <Sun size={14} /> <span>Light Mode</span>
                {!isDarkMode && <Check size={14} className="theme-check" color="#10B981" />}
              </div>
              <div className="theme-option" onClick={() => toggleTheme('dark')}>
                <Moon size={14} /> <span>Dark Mode</span>
                {isDarkMode && <Check size={14} className="theme-check" color="#10B981" />}
              </div>
              <div className="theme-option" onClick={() => toggleTheme('system')}>
                <RefreshCw size={14} /> <span>System Default</span>
              </div>
            </div>
          )}
        </div>

        {/* Notification Center */}
        <div className="topnav-action-wrapper" ref={notifRef}>
          <button 
            className="topnav-notif-btn" 
            onClick={() => { 
              setShowNotifs(!showNotifs); 
              setShowQuickActions(false); 
              setShowUserMenu(false); 
              setShowThemeMenu(false);
            }}
            title="Notifications"
            aria-label="Notifications"
          >
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
                  {notifCount > 0 && (
                    <button className="notif-btn-text" onClick={handleMarkAllRead}>Mark all read</button>
                  )}
                  <button className="notif-btn-text" onClick={() => { setShowNotifs(false); navigate('/notifications'); }}>View All</button>
                </div>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                    No notifications right now
                  </div>
                ) : (
                  notifications.slice(0, 7).map((notif) => {
                    const isUnread = notif.status === 'Unread' || notif.read === false;
                    const typeKey = (notif.type || notif.category || 'system').toLowerCase();
                    const iconColor = NOTIF_COLORS[typeKey] || '#1E5ADB';
                    const icon = NOTIF_ICONS[typeKey] || <Bell size={14} />;

                    return (
                      <div
                        key={notif.id}
                        className={`notif-item ${isUnread ? 'notif-unread' : ''}`}
                        onClick={() => handleNotificationClick(notif)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="notif-item-left">
                          <div className="notif-icon" style={{ background: iconColor + '15', color: iconColor }}>
                            {icon}
                          </div>
                          <div className="notif-content">
                            <div className="notif-user">{notif.title || notif.sender || notif.user || 'System Alert'}</div>
                            <div className="notif-action">{notif.message || notif.action || 'Check event detail'}</div>
                            <div className="notif-time">{notif.time || notif.date || 'Recent'}</div>
                          </div>
                        </div>
                        <div className="notif-item-right">
                          {isUnread && <div className="notif-dot" />}
                          <div className="notif-status-badge" style={{ background: iconColor + '15', color: iconColor }}>
                            {notif.type || 'Alert'}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="notif-footer" onClick={() => { setShowNotifs(false); navigate('/notifications'); }}>
                View All Notifications ({notifications.length})
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="topnav-action-wrapper" ref={userMenuRef}>
          <button 
            className="topnav-profile-btn" 
            onClick={() => { 
              setShowUserMenu(!showUserMenu); 
              setShowNotifs(false); 
              setShowQuickActions(false); 
              setShowThemeMenu(false);
            }}
            aria-label="User Profile Menu"
          >
            <div className="profile-avatar-wrapper">
              <div
                className="profile-avatar"
                style={{
                  background: avatarPhoto ? 'transparent' : avatarColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  color: 'white',
                  fontWeight: '700'
                }}
              >
                {avatarPhoto ? (
                  <img src={avatarPhoto} alt="Admin" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  displayInitial
                )}
              </div>
              <div className="profile-online-dot" />
            </div>
            <div className="profile-info">
              <div className="profile-name">{displayName}</div>
              <div className="profile-role">{displayRole}</div>
            </div>
            <ChevronDown size={14} className={`profile-chevron ${showUserMenu ? 'rotated' : ''}`} />
          </button>

          {showUserMenu && (
            <div className="user-menu-dropdown">
              <div className="user-menu-header">
                <div
                  className="user-menu-avatar"
                  style={{
                    background: avatarPhoto ? 'transparent' : avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    color: 'white',
                    fontWeight: '700'
                  }}
                >
                  {avatarPhoto ? (
                    <img src={avatarPhoto} alt="Admin" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    displayInitial
                  )}
                </div>
                <div>
                  <div className="user-menu-name">{displayName}</div>
                  <div className="user-menu-email">{displayEmail}</div>
                </div>
              </div>
              <div className="user-menu-divider" />
              <div className="user-menu-item" onClick={() => { setShowUserMenu(false); navigate('/settings'); }}><User size={14} /> <span>My Profile</span></div>
              <div className="user-menu-item" onClick={() => { setShowUserMenu(false); navigate('/settings'); }}><Settings size={14} /> <span>Account Settings</span></div>
              <div className="user-menu-item" onClick={() => { setShowUserMenu(false); navigate('/settings'); }}><Shield size={14} /> <span>Security & Access</span></div>
              <div className="user-menu-item" onClick={() => { setShowUserMenu(false); navigate('/logs'); }}><ScrollText size={14} /> <span>Activity Logs</span></div>
              <div className="user-menu-divider" />
              <div className="user-menu-item" onClick={() => { setShowUserMenu(false); navigate('/notifications'); }}><HelpCircle size={14} /> <span>Alerts & Notifications</span></div>
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