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

import { isPathAllowedForUser } from './utils/roles';
import { CompanyProvider } from './utils/companyContext';
import { db, auth, collection, onSnapshot, query, where, signOut as fbSignOut, ensureAdminAuthSession } from './firebase';

const RoleRoute = ({ path, element, user }) => {
  if (!isPathAllowedForUser(user, path)) {
    return <Navigate to="/" replace />;
  }
  return element;
};

function AppContent() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('subai_admin_user');
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

  // Guarantee active Firebase Auth session on browser refresh & live-sync current user's role/permissions/companyId from Firestore
  useEffect(() => {
    if (!user?.email) return;
    ensureAdminAuthSession().catch(() => {});

    const cleanEmail = user.email.trim().toLowerCase();
    let unsub = () => {};
    try {
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const live = { id: docSnap.id, ...docSnap.data() };
          if (live.status && live.status.toLowerCase() === 'inactive') {
            setUser(null);
            navigate('/login', { replace: true });
            return;
          }
          setUser((prev) => {
            if (!prev) return prev;
            const merged = {
              ...prev,
              id: live.id,
              name: live.name || prev.name,
              displayName: live.name || prev.displayName,
              role: live.role || prev.role,
              jobTitle: live.jobTitle || live.role || prev.jobTitle,
              companyId: live.companyId !== undefined ? live.companyId : prev.companyId,
              companyName: live.companyName || prev.companyName,
              permissions: live.permissions !== undefined ? live.permissions : prev.permissions,
              status: live.status || prev.status,
              avatarPhoto: live.avatarPhoto !== undefined ? live.avatarPhoto : prev.avatarPhoto,
              avatarColor: live.avatarColor || prev.avatarColor,
            };
            if (JSON.stringify(merged) === JSON.stringify(prev)) return prev;
            return merged;
          });
        }
      }, () => {});
    } catch (_) {}

    return () => unsub();
  }, [user?.email]);

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

  // Persist lightweight UI session to localStorage (NOT as database)
  useEffect(() => {
    if (user) {
      localStorage.setItem('subai_admin_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('subai_admin_user');
    }
  }, [user]);

  const handleLogin = (email, _password, extraData = {}) => {
    const userData = {
      email,
      name: extraData.name || email.split('@')[0] || 'Admin',
      role: extraData.role || 'Company User',
      companyId: extraData.companyId !== undefined ? extraData.companyId : null,
      companyName: extraData.companyName || '',
      permissions: extraData.permissions || null,
      jobTitle: extraData.jobTitle || extraData.role || '',
      ...extraData,
    };
    setUser(userData);

    const from = location.state?.from?.pathname || '/';
    navigate(from === '/login' ? '/' : from, { replace: true });
  };

  const handleLogout = async () => {
    try {
      await fbSignOut(auth);
    } catch (_) {}
    setUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <CompanyProvider user={user}>
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
                  <TopNav user={user} onLogout={handleLogout} onMenuToggle={() => setMobileOpen((prev) => !prev)} />
                  <Routes>
                    <Route path="/" element={<RoleRoute path="/" element={<Dashboard />} user={user} />} />
                    <Route path="/tracking" element={<RoleRoute path="/tracking" element={<LiveTracking />} user={user} />} />
                    <Route path="/employees" element={<RoleRoute path="/employees" element={<Employees />} user={user} />} />
                    <Route path="/sites" element={<RoleRoute path="/sites" element={<Sites />} user={user} />} />
                    <Route path="/assignments" element={<RoleRoute path="/assignments" element={<Assignments />} user={user} />} />
                    <Route path="/attendance" element={<RoleRoute path="/attendance" element={<Attendance />} user={user} />} />
                    <Route path="/verifications" element={<RoleRoute path="/verifications" element={<FacialVerificationList />} user={user} />} />
                    <Route path="/anomalies" element={<RoleRoute path="/anomalies" element={<AnomalyList />} user={user} />} />
                    <Route path="/fraud-reports" element={<RoleRoute path="/fraud-reports" element={<FraudReportList />} user={user} />} />
                    <Route path="/delay-reports" element={<RoleRoute path="/delay-reports" element={<DelayReportList />} user={user} />} />
                    <Route path="/reports" element={<RoleRoute path="/reports" element={<ReportsPage />} user={user} />} />
                    <Route path="/notifications" element={<RoleRoute path="/notifications" element={<NotificationsPage />} user={user} />} />
                    <Route path="/settings" element={<RoleRoute path="/settings" element={<Settings />} user={user} />} />
                    <Route path="/users" element={<RoleRoute path="/users" element={<UsersRoles />} user={user} />} />
                    <Route path="/logs" element={<RoleRoute path="/logs" element={<ActivityLogs />} user={user} />} />
                    <Route path="/ai-assistant" element={<RoleRoute path="/ai-assistant" element={<AIAssistant />} user={user} />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
                <FloatingChatButton />
              </div>
            )
          }
        />
      </Routes>
    </CompanyProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
