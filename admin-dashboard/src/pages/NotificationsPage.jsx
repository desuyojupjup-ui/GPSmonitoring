import React, { useState } from 'react';
import { Eye, Check, Trash2, Bell, AlertTriangle, CheckCircle } from 'lucide-react';

const INIT_NOTIFS = [
  { id: 1, sender: 'System Admin', sub: 'Admin', title: 'System Update Completed', message: 'The platform has been updated to version 2.4.0 successfully.', date: 'May 23, 2026', time: '7:00 PM', status: 'Unread', type: 'System' },
  { id: 2, sender: 'Geofence Alert', sub: 'Automated', title: 'Employee out of bounds', message: 'David Wilson has exited the Riverside Bldg geofence.', date: 'May 22, 2026', time: '3:15 PM', status: 'Read', type: 'Alert' },
  { id: 3, sender: 'Manager John', sub: 'Manager', title: 'New Schedule Posted', message: 'The field schedule for next week is now available.', date: 'May 20, 2026', time: '9:00 AM', status: 'Read', type: 'Message' },
];

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('All Notifications');
  const [notifs, setNotifs] = useState(INIT_NOTIFS);

  const TABS = ['All Notifications', 'Unread Messages', 'System Alerts'];

  const filtered = notifs.filter(n => {
    if (activeTab === 'Unread Messages') return n.status === 'Unread';
    if (activeTab === 'System Alerts') return n.type === 'Alert' || n.type === 'System';
    return true;
  });

  const markRead = (id) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, status: 'Read' } : n));
  const deleteNotif = (id) => setNotifs(prev => prev.filter(n => n.id !== id));

  return (
    <div className="page-body">
      <div className="widget" style={{ padding: 0, minHeight: 'calc(100vh - 120px)' }}>
        
        {/* Tabs Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', padding: '0 20px', background: '#FFFFFF', borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
          {TABS.map(tab => (
            <div 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              style={{ 
                padding: '16px 20px', 
                fontSize: 14, 
                fontWeight: 600, 
                cursor: 'pointer',
                color: activeTab === tab ? '#1E5ADB' : '#6B7280',
                borderBottom: activeTab === tab ? '2px solid #1E5ADB' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* Table Content */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#FFFFFF' }}>
            <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
              <th style={{ padding: '16px', width: 40, textAlign: 'center' }}><input type="checkbox" /></th>
              {['SENDER','NOTIFICATION DETAIL','DATE & TIME','TYPE','STATUS','ACTION'].map(h => (
                <th key={h} style={{ padding: '16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6', background: row.status === 'Unread' ? '#F8FAFC' : 'white' }}>
                <td style={{ padding: '16px', textAlign: 'center' }}><input type="checkbox" /></td>
                <td style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {row.sender.split(' ').map(n=>n[0]).join('').substring(0,2)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{row.sender}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{row.sub}</div>
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>{row.title}</div>
                  <div style={{ color: '#6B7280', fontSize: 12 }}>{row.message}</div>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ color: '#374151', fontWeight: 500 }}>{row.date}</div>
                  <div style={{ color: '#9CA3AF', fontSize: 11 }}>{row.time}</div>
                </td>
                <td style={{ padding: '16px', color: '#6B7280' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {row.type === 'Alert' ? <AlertTriangle size={14} color="#F59E0B" /> : row.type === 'System' ? <CheckCircle size={14} color="#10B981" /> : <Bell size={14} color="#6B7280" />}
                    {row.type}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ background: row.status === 'Unread' ? '#DBEAFE' : '#F3F4F6', color: row.status === 'Unread' ? '#1E40AF' : '#6B7280', padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                    {row.status}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {row.status === 'Unread' && (
                      <button onClick={() => markRead(row.id)} title="Mark as Read" style={{ border: 'none', background: 'none', color: '#10B981', cursor: 'pointer' }}><Check size={18} /></button>
                    )}
                    <button title="View" style={{ border: 'none', background: 'none', color: '#1E5ADB', cursor: 'pointer' }}><Eye size={18} /></button>
                    <button onClick={() => deleteNotif(row.id)} title="Delete" style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280', fontSize: 14, fontWeight: 500 }}>
            No more notifications to show on this page.
          </div>
        )}

      </div>
    </div>
  );
}
