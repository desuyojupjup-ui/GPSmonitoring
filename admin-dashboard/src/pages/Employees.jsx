import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, UserCheck, Clock, AlertTriangle, UserX } from 'lucide-react';
import Swal from 'sweetalert2';
import { MOCK_EMPLOYEES, generateId } from '../mockData';

const INIT_EMPLOYEES = MOCK_EMPLOYEES;

const STATUS_STYLE = {
  'On Site':    { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'On Duty':    { background: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'In Transit': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Offline':    { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

const EMPTY = { name: '', email: '', password: '', idNum: '', org: '', type: '', status: 'Offline', joined: '' };

export default function Employees() {
  const [employees, setEmployees] = useState(INIT_EMPLOYEES);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.idNum.includes(search)
  );

  const openAdd = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (emp) => { setForm(emp); setEditId(emp.id); setModal(true); };
  
  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Employee?',
      text: "Are you sure you want to remove this employee? Their login access will be revoked.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#E5E7EB',
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      customClass: { cancelButton: 'swal-cancel-btn' },
      reverseButtons: true
    });
    
    if (result.isConfirmed) {
      setEmployees(prev => prev.filter(e => e.id !== id));
      Swal.fire({ title: 'Deleted!', text: 'Employee has been removed.', icon: 'success', timer: 1500, showConfirmButton: false });
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return Swal.fire('Error', 'Name and Email are required.', 'error');
    setIsSaving(true);
    
    // Simulate save delay
    setTimeout(() => {
      if (editId) {
        setEmployees(prev => prev.map(e => e.id === editId ? { ...form, id: editId } : e));
        Swal.fire({ title: 'Updated!', icon: 'success', timer: 1500, showConfirmButton: false });
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newEmp = { ...form, id: generateId('emp'), joined: nowStr.replace(', ', '\n'), profilePic: null };
        setEmployees(prev => [newEmp, ...prev]);
        Swal.fire({ title: 'Added!', text: 'Employee account created.', icon: 'success', timer: 1500, showConfirmButton: false });
      }
      setModal(false);
      setIsSaving(false);
    }, 500);
  };

  return (
    <>
      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        
        {/* Left Column: Data Table */}
        <div className="widget" style={{ padding: 0, overflow: 'hidden' }}>
          
          {/* Table Toolbar */}
          <div style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
              <Search size={14} color="#9CA3AF" />
              <input placeholder="Search by name, email, organization, or ID..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#374151' }} />
            </div>
            
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Types</option>
            </select>
            
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Status</option>
            </select>

            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={14} /> Add Employee
            </button>

            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Maximize size={14} /> Full Screen
            </button>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#F9FAFB' }}>
              <tr>
                {['USER','ID NUMBER','DEPARTMENT TYPE','ROLE TYPE','STATUS','DATE REG.','ACTIONS'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', fontWeight: 700, fontSize: 13, flexShrink: 0, overflow: 'hidden' }}>
                      {emp.profilePic ? (
                        <img src={emp.profilePic} alt={emp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        emp.name.split(' ').map(n=>n[0]).join('').substring(0, 2)
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>{emp.email}</div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{emp.idNum}</td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{emp.org}</td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{emp.type}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[emp.status]?.background || STATUS_STYLE.Offline.background, color: STATUS_STYLE[emp.status]?.color || STATUS_STYLE.Offline.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[emp.status]?.dot || STATUS_STYLE.Offline.dot }}></div>
                      {emp.status}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, whiteSpace: 'pre-line' }}>{emp.joined}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => openEdit(emp)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(emp.id)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14, fontWeight: 500 }}>
              No more organization leaders to show on this page.
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Showing 1 to {filtered.length} of {filtered.length} organization leaders</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>«</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>‹</button>
              <button style={{ border: 'none', background: '#1E5ADB', color: 'white', borderRadius: 4, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>1</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>›</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>»</button>
            </div>
          </div>
        </div>

        {/* Right Column: Side Panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Status Overview Card */}
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Employee Status Overview</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'On Site Employees',    count: employees.filter(e => e.status === 'On Site').length, pct: '100.0%', color: '#10B981', bg: '#D1FAE5', icon: <UserCheck size={14}/> },
                { label: 'On Duty Employees',    count: employees.filter(e => e.status === 'On Duty').length, pct: '0.0%',   color: '#F59E0B', bg: '#FEF3C7', icon: <Clock size={14}/> },
                { label: 'In Transit Employees', count: employees.filter(e => e.status === 'In Transit').length, pct: '0.0%',   color: '#EF4444', bg: '#FEE2E2', icon: <AlertTriangle size={14}/> },
                { label: 'Offline Employees',    count: employees.filter(e => e.status === 'Offline').length, pct: '0.0%',   color: '#6B7280', bg: '#F3F4F6', icon: <UserX size={14}/> },
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

          {/* Management Tools Card */}
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Employee Management Tools</div>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Download size={16} /> Export Employee List
            </button>
          </div>

        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'white', borderRadius:16, padding:28, width:480, boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:17, fontWeight:700 }}>{editId ? 'Edit Employee' : 'Add Employee'}</h3>
              <button onClick={() => setModal(false)} style={{ border:'none', background:'none', cursor:'pointer', color:'#6B7280' }}><X size={20} /></button>
            </div>
            {['name','email','password','idNum','org','type'].map(f => {
              const placeholders = {
                name: 'e.g. John Doe',
                email: 'e.g. johndoe@geostride.com',
                password: 'Enter secure password',
                idNum: 'e.g. 12345-6789',
                org: 'e.g. Central Ops',
                type: 'e.g. Field Inspector'
              };
              return (
                <div key={f} style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5, textTransform:'capitalize' }}>
                    {f === 'idNum' ? 'ID Number' : f === 'org' ? 'Department Type' : f === 'type' ? 'Role Type' : f}
                  </label>
                  <input 
                    type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
                    value={form[f] || ''} 
                    onChange={e => setForm(p => ({...p,[f]:e.target.value}))}
                    placeholder={placeholders[f]}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, outline:'none', fontFamily:'Inter,sans-serif' }} />
                </div>
              );
            })}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Status</label>
              <select value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))}
                style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, fontFamily:'Inter,sans-serif' }}>
                {['On Site','On Duty','In Transit','Offline'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setModal(false)} disabled={isSaving} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #E5E7EB', background:'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:13 }}>Cancel</button>
              <button onClick={handleSave} disabled={isSaving} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:'#1E5ADB', color:'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:13, opacity: isSaving ? 0.7 : 1 }}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}