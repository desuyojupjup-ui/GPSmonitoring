import React, { useState, useCallback } from 'react';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, ClipboardList, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';
import { MOCK_ASSIGNMENTS, MOCK_EMPLOYEES, MOCK_SITES, generateId } from '../mockData';

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'white', borderRadius: 14, padding: '14px 20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
          border: `1.5px solid ${ t.type === 'success' ? '#D1FAE5' : t.type === 'error' ? '#FEE2E2' : '#FEF3C7' }`,
          minWidth: 260, maxWidth: 360,
          animation: 'toastIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275)',
          pointerEvents: 'auto',
        }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.type === 'success' ? '#D1FAE5' : t.type === 'error' ? '#FEE2E2' : '#FEF3C7' }}>
            { t.type === 'success' ? <CheckCircle size={20} color="#10B981" strokeWidth={2.5} /> : t.type === 'error' ? <XCircle size={20} color="#EF4444" strokeWidth={2.5} /> : <AlertTriangle size={20} color="#F59E0B" strokeWidth={2.5} /> }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>{t.title}</div>
            {t.text && <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{t.text}</div>}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((type, title, text = '') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  }, []);
  return { toasts, show };
}

const STATUS_STYLE = {
  'Active':    { background: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'Upcoming':  { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Completed': { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Cancelled': { background: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
};

const PRIORITY_COLOR = {
  'High': '#EF4444',
  'Medium': '#F59E0B',
  'Low': '#10B981'
};

const EMPTY = { empName: '', empId: '', site: '', assignDate: '', shiftStart: '', shiftEnd: '', shift: '', priority: 'Medium', status: 'Upcoming' };

const selStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'Inter, sans-serif' };
const inpStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' };

export default function Assignments() {
  const [data, setData]         = useState(MOCK_ASSIGNMENTS);
  const [employees] = useState(MOCK_EMPLOYEES);
  const [sites]       = useState(MOCK_SITES);
  const [search, setSearch]     = useState('');
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [editId, setEditId]     = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toasts, show }        = useToast();

  const filtered = data.filter(d =>
    d.empName?.toLowerCase().includes(search.toLowerCase()) ||
    d.site?.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm(row); setEditId(row.id); setModal(true); };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Assignment?',
      text: 'Are you sure you want to remove this assignment?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#E5E7EB',
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      customClass: { cancelButton: 'swal-cancel-btn' },
      reverseButtons: true,
    });
    if (result.isConfirmed) {
      setData(prev => prev.filter(d => d.id !== id));
      show('success', 'Deleted!', 'Assignment has been removed.');
    }
  };

  const handleEmpSelect = (e) => {
    const emp = employees.find(em => em.name === e.target.value);
    setForm(prev => ({ ...prev, empName: e.target.value, empId: emp?.idNum || '' }));
  };

  const handleSave = async () => {
    if (!form.empName || !form.site) return show('error', 'Missing Fields', 'Employee and Site are required.');
    setIsSaving(true);
    
    setTimeout(() => {
      if (editId) {
        setData(prev => prev.map(d => d.id === editId ? { ...form, id: editId } : d));
        show('success', 'Updated!', 'Assignment has been updated.');
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newAsg = { ...form, id: generateId('asg'), created: nowStr.replace(', ', '\n') };
        setData(prev => [newAsg, ...prev]);
        show('success', 'Assigned!', 'Assignment created successfully.');
      }
      setModal(false);
      setIsSaving(false);
    }, 500);
  };

  const stats = ['Active','Upcoming','Completed','Cancelled'].map(s => ({
    label: s,
    count: data.filter(d => d.status === s).length,
    pct: data.length ? ((data.filter(d => d.status === s).length / data.length) * 100).toFixed(1) + '%' : '0.0%',
    color: STATUS_STYLE[s].dot,
    bg: STATUS_STYLE[s].background,
    icon: s === 'Active' ? <ClipboardList size={14}/> : s === 'Upcoming' ? <Clock size={14}/> : s === 'Completed' ? <CheckCircle size={14}/> : <XCircle size={14}/>
  }));

  return (
    <>
      <Toast toasts={toasts} />
      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        <div className="widget" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
              <Search size={14} color="#9CA3AF" />
              <input placeholder="Search by employee or site..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#374151' }} />
            </div>
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Priorities</option>
              {['High','Medium','Low'].map(p => <option key={p}>{p}</option>)}
            </select>
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Status</option>
              {['Active','Upcoming','Completed','Cancelled'].map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={14} /> New Assignment
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Maximize size={14} /> Full Screen
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#F9FAFB' }}>
              <tr>
                {['EMPLOYEE','ASSIGNED SITE','SHIFT TIME','PRIORITY','STATUS','ASSIGNED ON','ACTIONS'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', flexShrink: 0 }}>
                      <ClipboardList size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{row.empName}</div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>ID: {row.empId}</div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>{row.site}</td>
                  <td style={{ padding: '12px 16px', color: '#6B7280' }}>{row.shift || '—'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: PRIORITY_COLOR[row.priority] }}>{row.priority}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[row.status]?.background, color: STATUS_STYLE[row.status]?.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[row.status]?.dot }}></div>
                      {row.status}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, whiteSpace: 'pre-line' }}>
                    {row.assignDate && <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>📅 {row.assignDate}</div>}
                    <div style={{ color: '#9CA3AF' }}>{row.created}</div>
                  </td>
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
              No assignments found. Click "New Assignment" to get started.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Showing {filtered.length} of {data.length} assignments</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>«</button>
              <button style={{ border: 'none', background: '#1E5ADB', color: 'white', borderRadius: 4, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>1</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>»</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Assignment Status Overview</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {stats.map(s => (
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
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Management Tools</div>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 8, padding: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Download size={16} /> Export Schedule
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{editId ? 'Edit Assignment' : 'New Assignment'}</h3>
              <button onClick={() => setModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Employee</label>
                <select value={form.empName} onChange={handleEmpSelect} style={selStyle}>
                  <option value="">— Select Employee —</option>
                  {employees.map(e => <option key={e.id} value={e.name}>{e.name} ({e.email})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Employee ID</label>
                <input readOnly value={form.empId || ''} placeholder="Auto-filled from employee" style={{ ...inpStyle, background: '#F9FAFB', color: '#9CA3AF' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Assigned Site</label>
                <select value={form.site} onChange={e => setForm(p => ({ ...p, site: e.target.value }))} style={selStyle}>
                  <option value="">— Select Site —</option>
                  {sites.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Assign Date</label>
                <input type="date" value={form.assignDate || ''} onChange={e => setForm(p => ({ ...p, assignDate: e.target.value }))} style={inpStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Shift Time</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="time" value={form.shiftStart || ''} onChange={e => setForm(p => ({ ...p, shiftStart: e.target.value, shift: `${e.target.value} - ${p.shiftEnd || ''}` }))} style={{ ...inpStyle, flex: 1 }} />
                  <span style={{ color: '#94A3B8', fontWeight: 600, fontSize: 13 }}>to</span>
                  <input type="time" value={form.shiftEnd || ''} onChange={e => setForm(p => ({ ...p, shiftEnd: e.target.value, shift: `${p.shiftStart || ''} - ${e.target.value}` }))} style={{ ...inpStyle, flex: 1 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={selStyle}>
                    {['High','Medium','Low'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={selStyle}>
                    {['Active','Upcoming','Completed','Cancelled'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(false)} disabled={isSaving} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={isSaving} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1E5ADB', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, opacity: isSaving ? 0.7 : 1 }}>
                {isSaving ? 'Saving...' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}