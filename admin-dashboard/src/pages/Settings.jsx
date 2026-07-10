import React, { useState } from 'react';
import { Save, User, Shield, Bell, Key, Globe, Database } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('General Profile');
  const TABS = ['General Profile', 'Security & Passwords', 'Notification Preferences', 'System Configuration'];

  const [profile, setProfile] = useState({ firstName: 'System', lastName: 'Admin', email: 'admin@geostride.com' });
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [notifications, setNotifications] = useState({ geofence: true, updates: true, reports: false });
  const [config, setConfig] = useState({ mapCenter: '14.5995, 120.9842', timezone: 'Asia/Manila (GMT+8)' });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (sectionKey, dataToSave, successMsg) => {
    setIsSaving(true);
    // Simulate save delay
    setTimeout(() => {
      Swal.fire({ title: 'Saved!', text: successMsg, icon: 'success', timer: 1500, showConfirmButton: false });
      setIsSaving(false);
    }, 500);
  };

  const handlePasswordUpdate = () => {
    if (!passwords.current || !passwords.newPass || !passwords.confirm) {
      return Swal.fire('Error', 'Please fill in all password fields.', 'error');
    }
    if (passwords.newPass !== passwords.confirm) {
      return Swal.fire('Error', 'New passwords do not match.', 'error');
    }
    Swal.fire({ title: 'Updated!', text: 'Password has been changed successfully.', icon: 'success', timer: 1500, showConfirmButton: false });
    setPasswords({ current: '', newPass: '', confirm: '' });
  };

  return (
    <div className="page-body">
      <div className="widget" style={{ padding: 0, minHeight: 'calc(100vh - 120px)' }}>
        
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

        <div style={{ padding: 40, maxWidth: 800 }}>
          
          {activeTab === 'General Profile' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
                <div style={{ width: 40, height: 40, borderRadius: '8px', background: '#EFF6FF', color: '#1E5ADB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={20} /></div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Administrator Profile</h2>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0 0' }}>Update your personal system administrator details.</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>First Name</label>
                  <input type="text" value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Last Name</label>
                  <input type="text" value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Email Address</label>
                  <input type="email" value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <button disabled={isSaving} onClick={() => handleSave('profile', profile, 'Profile updated successfully')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {activeTab === 'Security & Passwords' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
                <div style={{ width: 40, height: 40, borderRadius: '8px', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={20} /></div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Security Settings</h2>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0 0' }}>Manage your password and authentication methods.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Current Password</label>
                  <input type="password" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} placeholder="••••••••" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>New Password</label>
                  <input type="password" value={passwords.newPass} onChange={e => setPasswords({...passwords, newPass: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Confirm New Password</label>
                  <input type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
              </div>
              <button onClick={handlePasswordUpdate} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                <Key size={16} /> Update Password
              </button>
            </div>
          )}

          {activeTab === 'Notification Preferences' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
                <div style={{ width: 40, height: 40, borderRadius: '8px', background: '#FEF3C7', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bell size={20} /></div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Notification Preferences</h2>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0 0' }}>Choose which alerts you want to receive.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Geofence Alerts</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>Notify me when an employee enters or exits a site</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifications.geofence} onChange={e => setNotifications({...notifications, geofence: e.target.checked})} style={{ width: 18, height: 18, accentColor: '#1E5ADB' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>System Updates</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>Important platform maintenance and updates</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifications.updates} onChange={e => setNotifications({...notifications, updates: e.target.checked})} style={{ width: 18, height: 18, accentColor: '#1E5ADB' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Daily Reports</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>Receive automated daily attendance summaries</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifications.reports} onChange={e => setNotifications({...notifications, reports: e.target.checked})} style={{ width: 18, height: 18, accentColor: '#1E5ADB' }} />
                  </label>
                </div>
              </div>
              <button disabled={isSaving} onClick={() => handleSave('notifications', notifications, 'Notification preferences updated')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          )}

          {activeTab === 'System Configuration' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
                <div style={{ width: 40, height: 40, borderRadius: '8px', background: '#F3F4F6', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Database size={20} /></div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>System Configuration</h2>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0 0' }}>Manage global application settings.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Default Map View Center (Lat, Lng)</label>
                  <input type="text" value={config.mapCenter} onChange={e => setConfig({...config, mapCenter: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Timezone</label>
                  <select value={config.timezone} onChange={e => setConfig({...config, timezone: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', background: 'white' }}>
                    <option>Asia/Manila (GMT+8)</option>
                    <option>UTC (GMT+0)</option>
                  </select>
                </div>
              </div>
              <button disabled={isSaving} onClick={() => handleSave('config', config, 'System configuration updated')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                <Globe size={16} /> {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}