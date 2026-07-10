import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Maximize, ShieldCheck, UserCog, Shield, Download } from 'lucide-react';
import Swal from 'sweetalert2';
import { generateId } from '../mockData';

const STATUS_STYLE = {
  'Active':   { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Inactive': { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

const MOCK_USERS = [
  { id: 'u1', name: 'Admin User', email: 'admin@geostride.com', role: 'Super Admin', access: 'Full Access', status: 'Active', lastLogin: 'Just now' },
  { id: 'u2', name: 'Manager John', email: 'john.manager@geostride.com', role: 'Manager', access: 'Sites, Employees', status: 'Active', lastLogin: '2 hours ago' },
  { id: 'u3', name: 'Dispatcher Mike', email: 'mike.dispatch@geostride.com', role: 'Dispatcher', access: 'Tracking, Reports', status: 'Active', lastLogin: 'Yesterday' },
  { id: 'u4', name: 'Viewer Sarah', email: 'sarah.view@geostride.com', role: 'Manager', access: 'Reports only', status: 'Inactive', lastLogin: '3 days ago' },
];

const EMPTY = { name: '', email: '', role: 'Manager', access: 'Sites, Employees', status: 'Active' };

export default function UsersRoles() {
  const [data, setData] = useState(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = data.filter(d =>
    (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm(row); setEditId(row.id); setModal(true); };

  const handleSave = async () => {
    if (!form.name || !form.email) return Swal.fire('Error', 'Name and Email are required.', 'error');
    setIsSaving(true);
    setTimeout(() => {
      if (editId) {
        setData(prev => prev.map(d => d.id === editId ? { ...form, id: editId } : d));
        Swal.fire({ title: 'Updated!', icon: 'success', timer: 1500, showConfirmButton: false });
      } else {
        const newUser = { ...form, id: generateId('u'), lastLogin: 'Never' };
        setData(prev => [newUser, ...prev]);
        Swal.fire({ title: 'Added!', text: 'Admin user created.', icon: 'success', timer: 1500, showConfirmButton: false });
      }
      setModal(false);
      setIsSaving(false);
    }, 500);
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Remove User?',
      text: 'Are you sure you want to remove this admin account?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      confirmButtonText: 'Yes, remove',
    });
    if (result.isConfirmed) {
      setData(prev => prev.filter(d => d.id !== id));
      Swal.fire({ title: 'Removed!', icon: 'success', timer: 1500, showConfirmButton: false });
    }
  };

  const stats = {
    super: data.filter(d => d.role === 'Super Admin').length,
    manager: data.filter(d => d.role === 'Manager').length,
    dispatch: data.filter(d => d.role === 'Dispatcher').length,
    total: data.length || 1
  };

  return (
    <>
      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        <div className="widget" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
              <Search size={14} color="#9CA3AF" />
              <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#374151' }} />
            </div>
            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={14} /> Add User
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#F9FAFB' }}>
              <tr>
                {['USER','EMAIL','ROLE','ACCESS LEVEL','STATUS','LAST LOGIN','ACTIONS'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {row.name?.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() || '??'}
                    </div>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{row.name}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{row.email}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1E5ADB' }}>{row.role}</td>
                  <td style={{ padding: '12px 16px', color: '#6B7280' }}>{row.access}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[row.status]?.background || STATUS_STYLE['Inactive'].background, color: STATUS_STYLE[row.status]?.color || STATUS_STYLE['Inactive'].color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[row.status]?.dot || STATUS_STYLE['Inactive'].dot }}></div>
                      {row.status || 'Inactive'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11 }}>{row.lastLogin || 'Never'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => openEdit(row)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(row.id)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14, fontWeight: 500 }}>
              No admin users found. Click "Add User" to create one.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Role Overview</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Super Admins', count: stats.super, pct: ((stats.super/stats.total)*100).toFixed(1)+'%', color: '#8B5CF6', bg: '#EDE9FF', icon: <ShieldCheck size={14}/> },
                { label: 'Managers',     count: stats.manager, pct: ((stats.manager/stats.total)*100).toFixed(1)+'%', color: '#3B82F6', bg: '#DBEAFE', icon: <UserCog size={14}/> },
                { label: 'Dispatchers',  count: stats.dispatch, pct: ((stats.dispatch/stats.total)*100).toFixed(1)+'%', color: '#10B981', bg: '#D1FAE5', icon: <Shield size={14}/> },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</div>
                    <span style={{ fontSize: 13, color: '#4B5563', fontWeight: 500 }}>{s.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{s.count}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{s.pct}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{editId ? 'Edit Admin User' : 'New Admin User'}</h3>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Name</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Role</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white' }}>
                  <option>Super Admin</option>
                  <option>Manager</option>
                  <option>Dispatcher</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Access Level</label>
                <input value={form.access} onChange={e => setForm({...form, access: e.target.value})} placeholder="e.g. Full Access, Sites only" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white' }}>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setModal(false)} disabled={isSaving} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={isSaving} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1E5ADB', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: isSaving ? 0.7 : 1 }}>
                {isSaving ? 'Saving...' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}