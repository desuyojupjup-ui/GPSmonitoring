import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, Bell, ChevronDown, LogOut, Info, AlertCircle, XCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { MOCK_ACTIVITY_LOGS } from '../mockData';

export default function TopNav({ user, onLogout }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notifCount] = useState(3);
  const [recentLogs] = useState(MOCK_ACTIVITY_LOGS.slice(0, 5));
  
  const location = useLocation();
  const navigate = useNavigate();

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.body.classList.toggle('dark-mode');
  };

  const handleLogout = async () => {
    setShowDropdown(false);
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
    if (result.isConfirmed) {
      if (onLogout) onLogout();
    }
  };

  const displayName = user?.email ? user.email.split('@')[0] : 'System Admin';
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

  return (
    <div className="global-topnav" style={{ justifyContent: 'space-between' }}>
      
      <div className="topnav-left" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-color, #111827)', margin: 0, lineHeight: 1.2 }}>{title}</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6B7280)' }}>{description}</span>
      </div>

      <div className="topnav-right">
        <div className="topnav-search" style={{ marginRight: '10px' }}>
          <Search size={16} color="#9CA3AF" />
          <input placeholder="Search for pages..." style={{ background: 'transparent', color: 'var(--text-color, #111827)' }} />
        </div>

        <div className="theme-toggle" onClick={toggleTheme} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', background: isDarkMode ? '#374151' : '#F3F4F6', borderRadius: 20, padding: 4 }}>
          <div style={{ padding: 4, borderRadius: '50%', background: !isDarkMode ? 'white' : 'transparent', boxShadow: !isDarkMode ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
            <Sun size={14} color={!isDarkMode ? "#F59E0B" : "#9CA3AF"} />
          </div>
          <div style={{ padding: 4, borderRadius: '50%', background: isDarkMode ? '#1F2937' : 'transparent', boxShadow: isDarkMode ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
            <Moon size={14} color={isDarkMode ? "#60A5FA" : "#9CA3AF"} />
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="topnav-icon-btn" onClick={() => { setShowNotifs(!showNotifs); setShowDropdown(false); }} style={{ cursor: 'pointer', position: 'relative' }}>
            <Bell size={18} color="var(--text-color, #4B5563)" />
            {notifCount > 0 && (
              <div style={{ position: 'absolute', top: -4, right: -4, background: '#DC2626', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, border: '2px solid var(--bg-color, white)' }}>
                {notifCount}
              </div>
            )}
          </div>

          {showNotifs && (
            <div style={{ position: 'absolute', top: 50, right: 0, background: 'var(--bg-color, white)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: 320, zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color, #F3F4F6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-color, #111827)' }}>Notifications</span>
                <span style={{ fontSize: 12, color: '#4F46E5', cursor: 'pointer', fontWeight: 600 }}>Mark all read</span>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {recentLogs.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted, #6B7280)', fontSize: 13 }}>No recent notifications.</div>
                ) : (
                  recentLogs.map((log) => (
                    <div key={log.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #F3F4F6)', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.background='var(--background-light, #F8FAFC)'} onMouseOut={e => e.currentTarget.style.background='transparent'}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: log.status === 'Error' ? '#EF4444' : log.status === 'Warning' ? '#F59E0B' : '#10B981', marginTop: 6, flexShrink: 0 }}></div>
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--text-color, #111827)', fontWeight: 500, lineHeight: 1.4 }}>{log.action}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted, #9CA3AF)', marginTop: 4 }}>{log.time || 'Just now'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div onClick={() => { setShowNotifs(false); navigate('/logs'); }} style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color, #F3F4F6)', textAlign: 'center', color: '#4F46E5', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--background-light, #F8FAFC)' }}>
                View All Activity Logs
              </div>
            </div>
          )}
        </div>

        <div className="profile-dropdown" onClick={() => { setShowDropdown(!showDropdown); setShowNotifs(false); }} style={{ position: 'relative', cursor: 'pointer' }}>
          <div className="profile-avatar">{displayInitial}</div>

          {showDropdown && (
            <div style={{ position: 'absolute', top: 50, right: 0, background: 'var(--bg-color, white)', border: '1px solid var(--border-color, #E5E7EB)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: 180, zIndex: 100 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #F3F4F6)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color, #111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.email || 'admin@geostride.com'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6B7280)', marginTop: 2 }}>Admin Account</div>
              </div>
              <div onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', color: '#EF4444', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <LogOut size={16} /> Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}