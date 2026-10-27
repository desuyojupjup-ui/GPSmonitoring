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

import { isPathAllowedForRole } from './utils/roles';

const RoleRoute = ({ path, element, userRole }) => {
  if (!isPathAllowedForRole(userRole, path)) {
    return <Navigate to="/" replace />;
  }
  return element;
};

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
                user={user}
              />
              <main className="main-content">
                <TopNav user={user} onLogout={handleLogout} onMenuToggle={() => setMobileOpen(prev => !prev)} />
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tracking" element={<RoleRoute path="/tracking" element={<LiveTracking />} userRole={user.role} />} />
                  <Route path="/employees" element={<RoleRoute path="/employees" element={<Employees />} userRole={user.role} />} />
                  <Route path="/sites" element={<RoleRoute path="/sites" element={<Sites />} userRole={user.role} />} />
                  <Route path="/assignments" element={<RoleRoute path="/assignments" element={<Assignments />} userRole={user.role} />} />
                  <Route path="/attendance" element={<RoleRoute path="/attendance" element={<Attendance />} userRole={user.role} />} />
                  <Route path="/verifications" element={<RoleRoute path="/verifications" element={<FacialVerificationList />} userRole={user.role} />} />
                  <Route path="/anomalies" element={<RoleRoute path="/anomalies" element={<AnomalyList />} userRole={user.role} />} />
                  <Route path="/fraud-reports" element={<RoleRoute path="/fraud-reports" element={<FraudReportList />} userRole={user.role} />} />
                  <Route path="/delay-reports" element={<RoleRoute path="/delay-reports" element={<DelayReportList />} userRole={user.role} />} />
                  <Route path="/reports" element={<RoleRoute path="/reports" element={<ReportsPage />} userRole={user.role} />} />
                  <Route path="/notifications" element={<RoleRoute path="/notifications" element={<NotificationsPage />} userRole={user.role} />} />
                  <Route path="/settings" element={<RoleRoute path="/settings" element={<Settings />} userRole={user.role} />} />
                  <Route path="/users" element={<RoleRoute path="/users" element={<UsersRoles />} userRole={user.role} />} />
                  <Route path="/logs" element={<RoleRoute path="/logs" element={<ActivityLogs />} userRole={user.role} />} />
                  <Route path="/ai-assistant" element={<RoleRoute path="/ai-assistant" element={<AIAssistant />} userRole={user.role} />} />
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