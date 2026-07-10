import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';

import LiveTracking from './pages/LiveTracking';
import Employees from './pages/Employees';
import Sites from './pages/Sites';
import Assignments from './pages/Assignments';
import Attendance from './pages/Attendance';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';
import Settings from './pages/Settings';
import UsersRoles from './pages/UsersRoles';
import ActivityLogs from './pages/ActivityLogs';
import AIAssistant from './pages/AIAssistant';
import Login from './pages/Login';

import TopNav from './components/TopNav';
import FloatingChatButton from './components/FloatingChatButton';

function App() {
  const [user, setUser] = useState(() => {
    // Restore login session from localStorage on reload
    const saved = localStorage.getItem('geostride_demo_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Persist login state to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('geostride_demo_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('geostride_demo_user');
    }
  }, [user]);

  // Demo login: accepts any credentials
  const handleLogin = (email, password) => {
    setUser({ email, name: email.split('@')[0] || 'Admin' });
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login onLogin={handleLogin} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <TopNav user={user} onLogout={handleLogout} />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tracking" element={<LiveTracking />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<UsersRoles />} />
            <Route path="/logs" element={<ActivityLogs />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
          </Routes>
        </main>
        <FloatingChatButton />
      </div>
    </BrowserRouter>
  );
}

export default App;