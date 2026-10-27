import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';

import LiveTracking from './pages/LiveTracking';
import Employees from './pages/Employees';
import Sites from './pages/Sites';
import Assignments from './pages/Assignments';
import Attendance from './pages/Attendance';
import FacialVerificationList from './pages/FacialVerificationList';
import AnomalyList from './pages/AnomalyList';
import FraudReportList from './pages/FraudReportList';
import DelayReportList from './pages/DelayReportList';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';
import Settings from './pages/Settings';
import UsersRoles from './pages/UsersRoles';
import ActivityLogs from './pages/ActivityLogs';
import AIAssistant from './pages/AIAssistant';
import Login from './pages/Login';

import TopNav from './components/TopNav';
import FloatingChatButton from './components/FloatingChatButton';

function AppContent() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('subai_admin_user') || localStorage.getItem('geostride_demo_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Listen for real-time administrator profile updates
  useEffect(() => {
    const handleProfileUpdated = (e) => {
      if (e.detail) {
        setUser(e.detail);
      }
    };
    window.addEventListener('subai_admin_profile_updated', handleProfileUpdated);
    return () => window.removeEventListener('subai_admin_profile_updated', handleProfileUpdated);
  }, []);

  // Persist login state to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('subai_admin_user', JSON.stringify(user));
      localStorage.setItem('geostride_demo_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('subai_admin_user');
      localStorage.removeItem('geostride_demo_user');
    }
  }, [user]);

  const handleLogin = (email, password, extraData = {}) => {
    const userData = {
      email,
      name: extraData.name || email.split('@')[0] || 'Admin',
      role: extraData.role || 'Super Admin',
      ...extraData,
    };
    setUser(userData);
    
    // If user arrived at /login from another path, redirect back, else go to /
    const from = location.state?.from?.pathname || '/';
    navigate(from === '/login' ? '/' : from, { replace: true });
  };

  const handleLogout = () => {
    setUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <Routes>
      {/* Explicit Admin Login Page */}
      <Route
        path="/login"
        element={
          <Login
            onLogin={handleLogin}
            currentUser={user}
            onLogout={handleLogout}
          />
        }
      />

      {/* Protected Admin Routes */}
      <Route
        path="/*"
        element={
          !user ? (
            <Navigate to="/login" replace state={{ from: location }} />
          ) : (
            <div className={`app-container ${collapsed ? 'sidebar-collapsed' : ''}`}>
              {/* Mobile Sidebar Overlay */}
              {mobileOpen && (
                <div
                  className="sidebar-overlay open"
                  onClick={() => setMobileOpen(false)}
                />
              )}
              <Sidebar
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                mobileOpen={mobileOpen}
                setMobileOpen={setMobileOpen}
              />
              <main className="main-content">
                <TopNav user={user} onLogout={handleLogout} onMenuToggle={() => setMobileOpen(prev => !prev)} />
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tracking" element={<LiveTracking />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/assignments" element={<Assignments />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/verifications" element={<FacialVerificationList />} />
                  <Route path="/anomalies" element={<AnomalyList />} />
                  <Route path="/fraud-reports" element={<FraudReportList />} />
                  <Route path="/delay-reports" element={<DelayReportList />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/users" element={<UsersRoles />} />
                  <Route path="/logs" element={<ActivityLogs />} />
                  <Route path="/ai-assistant" element={<AIAssistant />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
              <FloatingChatButton />
            </div>
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}