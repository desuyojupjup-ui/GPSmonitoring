import React, { useState, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, MapPin, CheckCircle, AlertTriangle, Archive } from 'lucide-react';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { MOCK_SITES, generateId } from '../mockData';

const INIT_SITES = MOCK_SITES;

const STATUS_STYLE = {
  'Active':   { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Inactive': { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

const EMPTY = { name: '', company: '', address: '', lat: 14.610, lng: 120.985, radius: 300, status: 'Active', created: '' };

export default function Sites() {
  const [sites, setSites] = useState(INIT_SITES);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Nominatim address search with debounce
  const handleAddressChange = (value) => {
    setForm(prev => ({ ...prev, address: value }));
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 3) return;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=8&addressdetails=1&namedetails=1&extratags=1`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'GeoStride-App' } }
        );
        const data = await res.json();
        setSuggestions(data);
      } catch (e) {
        console.error('Nominatim error:', e);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const selectSuggestion = (place) => {
    setForm(prev => ({
      ...prev,
      address: place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
    }));
    setSuggestions([]);
  };

  const filtered = sites.filter(s => {
    const q = search.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.company || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q)
    );
  });

  const openAdd = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (s) => { 
    const rad = typeof s.radius === 'string' ? parseInt(s.radius.replace('m','')) : s.radius;
    setForm({...s, radius: rad}); 
    setEditId(s.id); 
    setModal(true); 
  };
  
  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Site?',
      text: "Are you sure you want to remove this site? Associated geofence logic will be removed.",
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
      setSites(prev => prev.filter(s => s.id !== id));
      Swal.fire({ title: 'Deleted!', text: 'Site has been removed.', icon: 'success', timer: 1500, showConfirmButton: false });
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.address) return Swal.fire('Error', 'Name and Address are required.', 'error');
    setIsSaving(true);
    
    setTimeout(() => {
      const finalForm = { ...form, radius: form.radius + 'm' };
      
      if (editId) {
        setSites(prev => prev.map(s => s.id === editId ? { ...finalForm, id: editId } : s));
        Swal.fire({ title: 'Updated!', icon: 'success', timer: 1500, showConfirmButton: false });
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newSite = { ...finalForm, id: generateId('site'), created: nowStr.replace(', ', '\n') };
        setSites(prev => [newSite, ...prev]);
        Swal.fire({ title: 'Added!', text: 'Site created successfully.', icon: 'success', timer: 1500, showConfirmButton: false });
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
              <input placeholder="Search by site name or address..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#374151' }} />
            </div>
            
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Zones</option>
            </select>
            
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Status</option>
            </select>

            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={14} /> Add Site
            </button>

            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Maximize size={14} /> Full Screen
            </button>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#F9FAFB' }}>
              <tr>
                {['SITE NAME','ADDRESS','COORDINATES','RADIUS','STATUS','DATE CREATED','ACTIONS'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(site => (
                <tr key={site.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', flexShrink: 0 }}>
                      <MapPin size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{site.name}</div>
                      {site.company && <div style={{ fontSize: 11, color: '#1E5ADB', fontWeight: 500 }}>{site.company}</div>}
                      <div style={{ fontSize: 11, color: '#6B7280' }}>ID: {site.id}</div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{site.address}</td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, fontFamily: 'monospace' }}>
                    {site.lat?.toFixed(4)}, {site.lng?.toFixed(4)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>{site.radius}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[site.status]?.background, color: STATUS_STYLE[site.status]?.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[site.status]?.dot }}></div>
                      {site.status}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, whiteSpace: 'pre-line' }}>{site.created}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => openEdit(site)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(site.id)} style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14, fontWeight: 500 }}>
              No more sites to show on this page.
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Showing 1 to {filtered.length} of {filtered.length} sites</div>
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
          
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Site Status Overview</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Active Sites',   count: sites.filter(s => s.status === 'Active').length, pct: '66.6%', color: '#10B981', bg: '#D1FAE5', icon: <CheckCircle size={14}/> },
                { label: 'Warning Sites',  count: 0, pct: '0.0%',  color: '#F59E0B', bg: '#FEF3C7', icon: <AlertTriangle size={14}/> },
                { label: 'Inactive Sites', count: sites.filter(s => s.status === 'Inactive').length, pct: '33.3%', color: '#6B7280', bg: '#F3F4F6', icon: <Archive size={14}/> },
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

          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Site Management Tools</div>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>
              <Download size={16} /> Export Site List
            </button>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <MapPin size={16} /> View Global Map
            </button>
          </div>

        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
          <div style={{ background:'white', borderRadius:16, width:800, display:'flex', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            
            <div style={{ flex: 1, padding: 28 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <h3 style={{ fontSize:17, fontWeight:700 }}>{editId ? 'Edit Site' : 'Add New Site'}</h3>
                <button onClick={() => setModal(false)} style={{ border:'none', background:'none', cursor:'pointer', color:'#6B7280' }}><X size={20} /></button>
              </div>
              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                <div><label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Site Name</label>
                <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13 }}/></div>
                <div><label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Company Name <span style={{color:'#9CA3AF', fontWeight:400}}>(optional)</span></label>
                <input value={form.company || ''} placeholder="e.g. ABC Corporation" onChange={e => setForm(p=>({...p,company:e.target.value}))} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13 }}/></div>
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Address</label>
                  <input 
                    value={form.address} 
                    onChange={e => handleAddressChange(e.target.value)}
                    placeholder="Search address or company name (e.g. SM Mall, Jollibee)..."
                    autoComplete="off"
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13 }}/>
                  {searching && (
                    <div style={{ position:'absolute', top: 42, left: 0, right: 0, background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#94A3B8', zIndex: 1000 }}>Searching...</div>
                  )}
                  {suggestions.length > 0 && (
                    <div style={{ position:'absolute', top: 42, left: 0, right: 0, background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: 200, overflowY: 'auto' }}>
                      {suggestions.map((s, i) => (
                        <div key={i} onClick={() => selectSuggestion(s)}
                          style={{ padding: '10px 14px', fontSize: 12, color: '#374151', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'flex-start', gap: 8 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F0F9FF'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                          <span style={{ fontSize: 14, marginTop: 1 }}>📍</span>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827', marginBottom: 2 }}>{(s.namedetails && s.namedetails.name) ? s.namedetails.name : (s.name || s.display_name.split(',')[0])}</div>
                            <div style={{ color: '#94A3B8', fontSize: 11 }}>{s.display_name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}><label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Latitude</label>
                  <input type="number" step="0.0001" value={form.lat} onChange={e => setForm(p=>({...p,lat:parseFloat(e.target.value)}))} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13 }}/></div>
                  <div style={{ flex: 1 }}><label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Longitude</label>
                  <input type="number" step="0.0001" value={form.lng} onChange={e => setForm(p=>({...p,lng:parseFloat(e.target.value)}))} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13 }}/></div>
                </div>
                <div><label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Geofence Radius (meters)</label>
                <input type="number" value={form.radius} onChange={e => setForm(p=>({...p,radius:parseInt(e.target.value)}))} style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13 }}/></div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setModal(false)} disabled={isSaving} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #E5E7EB', background:'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:13 }}>Cancel</button>
                <button onClick={handleSave} disabled={isSaving} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:'#1E5ADB', color:'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:13, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? 'Saving...' : 'Save Site'}
                </button>
              </div>
            </div>

            {/* Map Preview */}
            <div style={{ flex: 1, background: '#F9FAFB', borderLeft: '1px solid #F3F4F6', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 400, background: 'white', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Map Preview</div>
              <MapContainer key={`${form.lat}-${form.lng}`} center={[form.lat, form.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Circle center={[form.lat, form.lng]} radius={form.radius || 100} pathOptions={{ color: '#1E5ADB', fillColor: '#1E5ADB', fillOpacity: 0.2 }} />
              </MapContainer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}