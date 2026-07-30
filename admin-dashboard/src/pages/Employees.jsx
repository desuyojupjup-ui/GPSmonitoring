import React, { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, UserCheck, Clock, AlertTriangle, UserX, MapPin, Navigation, Building2, Truck, ShieldAlert } from 'lucide-react';
import Swal from 'sweetalert2';
import { MOCK_EMPLOYEES, MOCK_SITES, generateId } from '../mockData';

const INIT_EMPLOYEES = MOCK_EMPLOYEES;

const STATUS_STYLE = {
  'On Site':    { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'On Duty':    { background: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'In Transit': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Offline':    { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

const WORK_TYPE_STYLE = {
  'Fixed Site Employee':   { bg: '#EDE9FE', color: '#5B21B6', icon: Building2 },
  'Mobile Field Employee': { bg: '#FEF3C7', color: '#92400E', icon: Truck },
};

const GEOFENCE_STATUS_STYLE = {
  'Inside Assigned Site':  { bg: '#D1FAE5', color: '#065F46' },
  'Outside Assigned Site': { bg: '#FEE2E2', color: '#991B1B' },
};

const EMPTY = {
  name: '', email: '', password: '', idNum: '', org: '', type: '', status: 'Offline', joined: '',
  workType: 'Fixed Site Employee',
  assignedSite: '',
  geofenceRadius: 100,
  assignedRoute: '',
  assignedDestinations: [],
};

export default function Employees() {
  const [employees, setEmployees] = useState(INIT_EMPLOYEES);
  const [search, setSearch]     = useState('');
  const [wtFilter, setWtFilter] = useState('All');
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [editId, setEditId]     = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const fixedCount  = employees.filter(e => e.workType === 'Fixed Site Employee').length;
  const mobileCount = employees.filter(e => e.workType === 'Mobile Field Employee').length;
  const outsideCount= employees.filter(e => e.geofenceStatus === 'Outside Assigned Site').length;
  const inTransitCount = employees.filter(e => e.status === 'In Transit' && e.workType === 'Mobile Field Employee').length;

  const filtered = employees.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.idNum.includes(search);
    const matchWt = wtFilter === 'All' || e.workType === wtFilter;
    return matchSearch && matchWt;
  });

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (emp) => { setForm({ ...EMPTY, ...emp }); setEditId(emp.id); setModal(true); };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Employee?',
      text: "Are you sure you want to remove this employee? Their login access will be revoked.",
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#DC2626', cancelButtonColor: '#E5E7EB',
      confirmButtonText: 'Yes, delete', cancelButtonText: 'Cancel',
      customClass: { cancelButton: 'swal-cancel-btn' }, reverseButtons: true
    });
    if (result.isConfirmed) {
      setEmployees(prev => prev.filter(e => e.id !== id));
      Swal.fire({ title: 'Deleted!', text: 'Employee has been removed.', icon: 'success', timer: 1500, showConfirmButton: false });
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return Swal.fire('Error', 'Name and Email are required.', 'error');
    if (form.workType === 'Fixed Site Employee' && form.geofenceRadius < 50) return Swal.fire('Error', 'Minimum geofence radius is 50m.', 'error');
    setIsSaving(true);
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

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, outline:'none', fontFamily:'Inter,sans-serif', boxSizing:'border-box' };
  const labelStyle = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5, textTransform:'capitalize' };

  return (
    <>
      <div className="page-body">

        {/* ── Work Type KPI Cards ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
          {[
            { label:'Fixed Site Employees',     value: fixedCount,    color:'#5B21B6', bg:'#EDE9FE', icon: Building2 },
            { label:'Mobile Field Employees',    value: mobileCount,   color:'#92400E', bg:'#FEF3C7', icon: Truck },
            { label:'Employees Outside Geofence',value: outsideCount,  color:'#991B1B', bg:'#FEE2E2', icon: ShieldAlert },
            { label:'Employees In Transit',      value: inTransitCount,color:'#1E40AF', bg:'#DBEAFE', icon: Navigation },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} style={{ background:'white', border:`1.5px solid ${bg}`, borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon size={18} color={color} />
              </div>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:'#111827', lineHeight:1 }}>{value}</div>
                <div style={{ fontSize:11, color:'#6B7280', fontWeight:500, marginTop:3 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'flex-start' }}>

          {/* Left: Data Table */}
          <div className="widget" style={{ padding:0, overflow:'hidden' }}>

            {/* Toolbar */}
            <div style={{ display:'flex', gap:10, padding:16, borderBottom:'1px solid #F3F4F6', alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, border:'1px solid #E5E7EB', borderRadius:6, padding:'8px 12px', minWidth:200 }}>
                <Search size={14} color="#9CA3AF" />
                <input placeholder="Search name or ID..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ border:'none', outline:'none', width:'100%', fontSize:13, color:'#374151' }} />
              </div>
              <select value={wtFilter} onChange={e => setWtFilter(e.target.value)}
                style={{ padding:'9px 12px', border:'1px solid #E5E7EB', borderRadius:6, fontSize:13, color:'#374151', outline:'none', background:'white' }}>
                <option value="All">All Types</option>
                <option value="Fixed Site Employee">Fixed Site</option>
                <option value="Mobile Field Employee">Mobile Field</option>
              </select>
              <button onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6, background:'#1E5ADB', color:'white', border:'none', borderRadius:6, padding:'9px 16px', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                <Plus size={14} /> Add Employee
              </button>
              <button style={{ display:'flex', alignItems:'center', gap:6, background:'white', color:'#1E5ADB', border:'1px solid #1E5ADB', borderRadius:6, padding:'9px 16px', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                <Download size={14} /> Export
              </button>
            </div>

            {/* Table */}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead style={{ background:'#F9FAFB' }}>
                  <tr>
                    {['USER','ID NUMBER','DEPT / TYPE','WORK TYPE','GEOFENCE STATUS','STATUS','DATE REG.','ACTIONS'].map(h => (
                      <th key={h} style={{ padding:'12px 14px', textAlign:'left', color:'#6B7280', fontWeight:700, fontSize:10, letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(emp => {
                    const wtStyle = WORK_TYPE_STYLE[emp.workType] || WORK_TYPE_STYLE['Fixed Site Employee'];
                    const WTIcon  = wtStyle.icon;
                    const gfStyle = emp.geofenceStatus ? (GEOFENCE_STATUS_STYLE[emp.geofenceStatus] || {}) : null;
                    return (
                      <tr key={emp.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                        {/* Avatar + name */}
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:'50%', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', color:'#1E5ADB', fontWeight:700, fontSize:12, flexShrink:0, overflow:'hidden' }}>
                              {emp.profilePic ? <img src={emp.profilePic} alt={emp.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : emp.name.split(' ').map(n=>n[0]).join('').substring(0,2)}
                            </div>
                            <div>
                              <div style={{ fontWeight:600, color:'#111827' }}>{emp.name}</div>
                              <div style={{ fontSize:11, color:'#6B7280' }}>{emp.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px', color:'#374151', fontWeight:500 }}>{emp.idNum}</td>
                        <td style={{ padding:'12px 14px', color:'#374151' }}>
                          <div>{emp.org}</div>
                          <div style={{ fontSize:11, color:'#6B7280' }}>{emp.type}</div>
                        </td>
                        {/* Work Type Badge */}
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:wtStyle.bg, color:wtStyle.color, padding:'4px 8px', borderRadius:6, fontWeight:600, fontSize:10, whiteSpace:'nowrap' }}>
                            <WTIcon size={11} />
                            {emp.workType === 'Fixed Site Employee' ? 'Fixed Site' : 'Mobile Field'}
                          </div>
                        </td>
                        {/* Geofence Status */}
                        <td style={{ padding:'12px 14px' }}>
                          {emp.workType === 'Fixed Site Employee' && emp.geofenceStatus ? (
                            <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:gfStyle.bg, color:gfStyle.color, padding:'4px 8px', borderRadius:6, fontWeight:600, fontSize:10, whiteSpace:'nowrap' }}>
                              {emp.geofenceStatus === 'Outside Assigned Site' && <ShieldAlert size={11} />}
                              {emp.geofenceStatus}
                            </div>
                          ) : emp.workType === 'Mobile Field Employee' ? (
                            <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#FEF3C7', color:'#92400E', padding:'4px 8px', borderRadius:6, fontWeight:600, fontSize:10 }}>
                              <Navigation size={11} /> En Route
                            </div>
                          ) : (
                            <span style={{ color:'#D1D5DB', fontSize:12 }}>—</span>
                          )}
                        </td>
                        {/* Status */}
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:STATUS_STYLE[emp.status]?.background || STATUS_STYLE.Offline.background, color:STATUS_STYLE[emp.status]?.color || STATUS_STYLE.Offline.color, padding:'4px 9px', borderRadius:20, fontWeight:600, fontSize:11 }}>
                            <div style={{ width:5, height:5, borderRadius:'50%', background:STATUS_STYLE[emp.status]?.dot || STATUS_STYLE.Offline.dot }} />
                            {emp.status}
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px', color:'#6B7280', fontSize:11, whiteSpace:'pre-line' }}>{emp.joined}</td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', gap:10 }}>
                            <button onClick={() => openEdit(emp)} style={{ border:'none', background:'none', color:'#9CA3AF', cursor:'pointer' }}><Edit2 size={15} /></button>
                            <button onClick={() => handleDelete(emp.id)} style={{ border:'none', background:'none', color:'#9CA3AF', cursor:'pointer' }}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div style={{ padding:40, textAlign:'center', color:'#6B7280', fontSize:14, fontWeight:500 }}>No employees match your search.</div>
            )}

            {/* Pagination stub */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', borderTop:'1px solid #F3F4F6' }}>
              <div style={{ fontSize:13, color:'#6B7280' }}>Showing {filtered.length} of {employees.length} employees</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button style={{ border:'none', background:'none', color:'#9CA3AF', cursor:'pointer' }}>«</button>
                <button style={{ border:'none', background:'none', color:'#9CA3AF', cursor:'pointer' }}>‹</button>
                <button style={{ border:'none', background:'#1E5ADB', color:'white', borderRadius:4, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, fontSize:13 }}>1</button>
                <button style={{ border:'none', background:'none', color:'#9CA3AF', cursor:'pointer' }}>›</button>
                <button style={{ border:'none', background:'none', color:'#9CA3AF', cursor:'pointer' }}>»</button>
              </div>
            </div>
          </div>

          {/* Right: Side Panels */}
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

            {/* Status Overview */}
            <div className="widget" style={{ padding:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:14 }}>Employee Status Overview</div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { label:'On Site',    count:employees.filter(e=>e.status==='On Site').length,    color:'#10B981', bg:'#D1FAE5', icon:<UserCheck size={14}/> },
                  { label:'On Duty',    count:employees.filter(e=>e.status==='On Duty').length,    color:'#F59E0B', bg:'#FEF3C7', icon:<Clock size={14}/> },
                  { label:'In Transit', count:employees.filter(e=>e.status==='In Transit').length, color:'#EF4444', bg:'#FEE2E2', icon:<AlertTriangle size={14}/> },
                  { label:'Offline',    count:employees.filter(e=>e.status==='Offline').length,    color:'#6B7280', bg:'#F3F4F6', icon:<UserX size={14}/> },
                ].map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:6, background:s.bg, color:s.color, display:'flex', alignItems:'center', justifyContent:'center' }}>{s.icon}</div>
                      <span style={{ fontSize:12, color:'#4B5563', fontWeight:500 }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize:14, fontWeight:700, color:'#111827' }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Geofence Alerts */}
            {outsideCount > 0 && (
              <div className="widget" style={{ padding:18, border:'1.5px solid #FEE2E2' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
                  <ShieldAlert size={15} color="#EF4444" />
                  <div style={{ fontSize:13, fontWeight:700, color:'#991B1B' }}>Geofence Alerts</div>
                </div>
                {employees.filter(e => e.geofenceStatus === 'Outside Assigned Site').map(emp => (
                  <div key={emp.id} style={{ fontSize:12, color:'#374151', marginBottom:8, padding:'8px 10px', background:'#FEF2F2', borderRadius:6 }}>
                    <div style={{ fontWeight:600 }}>{emp.name}</div>
                    <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>Outside {MOCK_SITES.find(s=>s.id===emp.assignedSite)?.name || 'assigned site'}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Management Tools */}
            <div className="widget" style={{ padding:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:14 }}>Employee Management Tools</div>
              <button style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'white', color:'#1E5ADB', border:'1px solid #1E5ADB', borderRadius:8, padding:'10px', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                <Download size={16} /> Export Employee List
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:28, width:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:17, fontWeight:700, margin:0 }}>{editId ? 'Edit Employee' : 'Add Employee'}</h3>
              <button onClick={() => setModal(false)} style={{ border:'none', background:'none', cursor:'pointer', color:'#6B7280' }}><X size={20} /></button>
            </div>

            {/* Basic Fields */}
            {[
              { key:'name', label:'Full Name', placeholder:'e.g. John Doe', type:'text' },
              { key:'email', label:'Email', placeholder:'e.g. johndoe@geostride.com', type:'email' },
              { key:'password', label:'Password', placeholder:'Enter secure password', type:'password' },
              { key:'idNum', label:'ID Number', placeholder:'e.g. EMP-1001', type:'text' },
              { key:'org', label:'Department', placeholder:'e.g. Field Operations', type:'text' },
              { key:'type', label:'Role / Job Title', placeholder:'e.g. Security Guard', type:'text' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({...p, [key]: e.target.value}))}
                  placeholder={placeholder} style={inputStyle} />
              </div>
            ))}

            {/* Status */}
            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))} style={inputStyle}>
                {['On Site','On Duty','In Transit','Offline'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* ─ Work Type ─ */}
            <div style={{ background:'#F8FAFC', borderRadius:10, padding:16, marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1E40AF', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                <MapPin size={14} /> Employee Work Type
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Work Type</label>
                <select value={form.workType || 'Fixed Site Employee'} onChange={e => setForm(p => ({ ...p, workType: e.target.value, assignedSite:'', geofenceRadius:100, assignedRoute:'', assignedDestinations:[] }))} style={inputStyle}>
                  <option value="Fixed Site Employee">Fixed Site Employee</option>
                  <option value="Mobile Field Employee">Mobile Field Employee</option>
                </select>
                <div style={{ marginTop:6, fontSize:11, color:'#6B7280', lineHeight:1.5 }}>
                  {form.workType === 'Fixed Site Employee'
                    ? '🏢 Fixed: Assigned to one site. Geofence monitoring enabled.'
                    : '🚚 Mobile: Travels between multiple assigned destinations.'}
                </div>
              </div>

              {/* Fixed Site Fields */}
              {form.workType === 'Fixed Site Employee' && (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label style={labelStyle}>Assigned Site</label>
                    <select value={form.assignedSite || ''} onChange={e => setForm(p=>({...p,assignedSite:e.target.value}))} style={inputStyle}>
                      <option value="">— Select a Site —</option>
                      {MOCK_SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom:4 }}>
                    <label style={labelStyle}>Geofence Radius (meters)</label>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <input type="range" min={50} max={1000} step={50}
                        value={form.geofenceRadius || 100}
                        onChange={e => setForm(p=>({...p, geofenceRadius:parseInt(e.target.value)}))}
                        style={{ flex:1 }} />
                      <div style={{ fontWeight:700, fontSize:14, color:'#1E5ADB', minWidth:48, textAlign:'right' }}>{form.geofenceRadius || 100}m</div>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#9CA3AF', marginTop:2 }}>
                      <span>50m (min)</span><span>1000m (max)</span>
                    </div>
                  </div>
                </>
              )}

              {/* Mobile Field Fields */}
              {form.workType === 'Mobile Field Employee' && (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label style={labelStyle}>Starting Location (Warehouse/Pickup)</label>
                    <input type="text" value={form.assignedRoute || ''} onChange={e => setForm(p=>({...p,assignedRoute:e.target.value}))}
                      placeholder="e.g. Main Warehouse, North Depot" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom:4 }}>
                    <label style={labelStyle}>Assigned Destinations (comma-separated)</label>
                    <textarea
                      value={Array.isArray(form.assignedDestinations) ? form.assignedDestinations.join(', ') : ''}
                      onChange={e => setForm(p=>({...p, assignedDestinations: e.target.value.split(',').map(d=>d.trim()).filter(Boolean)}))}
                      placeholder="e.g. Makati Hub, BGC Delivery Point, QC Center"
                      rows={3}
                      style={{ ...inputStyle, resize:'vertical' }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Save / Cancel */}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => setModal(false)} disabled={isSaving} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #E5E7EB', background:'white', cursor:isSaving?'not-allowed':'pointer', fontWeight:600, fontSize:13 }}>Cancel</button>
              <button onClick={handleSave} disabled={isSaving} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:'#1E5ADB', color:'white', cursor:isSaving?'not-allowed':'pointer', fontWeight:600, fontSize:13, opacity:isSaving?0.7:1 }}>
                {isSaving ? 'Saving...' : 'Save Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}