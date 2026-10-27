import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, X, Maximize, Download, MapPin, CheckCircle, AlertTriangle, Archive, Building2, PieChart as PieIcon, BarChart3, Activity, ShieldCheck, Gauge, TrendingUp, Users, Navigation, Building, Target, Crosshair, Compass, Layers } from 'lucide-react';
import { MapContainer, TileLayer, Circle, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';
import { db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from '../firebase';
import { showToast, showConfirmDelete } from '../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 99
      }}>
        <div style={{ color: data.payload.color || '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.color }}></span>
          {data.name}: <strong style={{ color: '#0F172A' }}>{data.value}</strong> ({data.payload.pct}%)
        </div>
      </div>
    );
  }
  return null;
};

const CustomAreaTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 99
      }}>
        <div style={{ color: '#6366F1', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366F1' }}></span>
          {data.payload.name}: <strong style={{ color: '#0F172A' }}>{data.value} site(s)</strong>
        </div>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '10px',
        padding: '8px 12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 99
      }}>
        <div style={{ color: data.payload.fill || '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: data.payload.fill }}></span>
          {data.payload.tier || data.payload.name}: <strong style={{ color: '#0F172A' }}>{data.value}</strong> site(s)
        </div>
      </div>
    );
  }
  return null;
};

const STATUS_STYLE = {
  'Active':   { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Inactive': { background: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
};

const EMPTY = { name: '', company: '', address: '', lat: 14.610, lng: 120.985, radius: 20, status: 'Active', created: '' };

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(parseFloat(e.latlng.lat.toFixed(5)), parseFloat(e.latlng.lng.toFixed(5)));
    },
  });
  return null;
};

export default function Sites() {
  const [sites, setSites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [mapTileType, setMapTileType] = useState('google-roadmap'); // 'google-roadmap' | 'google-hybrid' | 'google-terrain' | 'carto-light'
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Pagination state
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Bulk Selection state
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    setLoading(true);
    try {
      const qSites = query(collection(db, 'Sites'));
      const unsubSites = onSnapshot(qSites, (snapshot) => {
        const liveData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const uniqueSites = Array.from(new Map(liveData.map(item => [item.id, item])).values());
        setSites(uniqueSites);
        setLoading(false);
      }, () => setLoading(false));

      const qEmps = query(collection(db, 'employees'));
      const unsubEmps = onSnapshot(qEmps, (snapshot) => {
        const liveEmps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setEmployees(liveEmps);
      });

      return () => {
        unsubSites();
        unsubEmps();
      };
    } catch (e) {
      setLoading(false);
    }
  }, []);

  const totalSites = sites.length || 1;
  const activeSitesCount = sites.filter(s => s.status === 'Active' || !s.status).length;
  const inactiveSitesCount = sites.filter(s => s.status === 'Inactive').length;

  // Chart 1: Semi-Circle Speedometer Gauge (Active Efficiency Ratio)
  const activeRatioPct = totalSites > 0 ? Math.round((activeSitesCount / totalSites) * 100) : 0;
  const gaugeData = [
    { name: 'Active', value: activeSitesCount, color: '#10B981', pct: activeRatioPct },
    { name: 'Inactive', value: inactiveSitesCount, color: '#E2E8F0', pct: 100 - activeRatioPct }
  ];

  // Chart 2: Smooth Glowing Area Curve (Geofence Radius Profile)
  const parseRadius = (r) => typeof r === 'number' ? r : parseInt(r) || 300;
  const smallZoneCount = sites.filter(s => parseRadius(s.radius) <= 200).length;
  const standardZoneCount = sites.filter(s => parseRadius(s.radius) > 200 && parseRadius(s.radius) <= 500).length;
  const expandedZoneCount = sites.filter(s => parseRadius(s.radius) > 500 && parseRadius(s.radius) <= 1000).length;
  const largeZoneCount = sites.filter(s => parseRadius(s.radius) > 1000).length;

  const radiusAreaData = [
    { name: '≤200m', sites: smallZoneCount },
    { name: '200-500m', sites: standardZoneCount },
    { name: '500-1km', sites: expandedZoneCount },
    { name: '>1km', sites: largeZoneCount }
  ];

  // Chart 3: Horizontal Staff Density Bars (Layout Vertical)
  const highStaffSites = sites.filter(s => employees.filter(e => e.assignedSite === s.name || e.assignedSite === s.id).length >= 5).length;
  const medStaffSites  = sites.filter(s => {
    const count = employees.filter(e => e.assignedSite === s.name || e.assignedSite === s.id).length;
    return count >= 1 && count < 5;
  }).length;
  const zeroStaffSites = sites.filter(s => employees.filter(e => e.assignedSite === s.name || e.assignedSite === s.id).length === 0).length;

  const staffingBarData = [
    { tier: 'High (5+)', count: highStaffSites, fill: '#10B981' },
    { tier: 'Med (1-4)', count: medStaffSites, fill: '#3B82F6' },
    { tier: 'Unstaffed', count: zeroStaffSites, fill: '#F59E0B' }
  ];

  const filtered = sites.filter(s => {
    const q = search.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.company || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q)
    );
  });

  // Pagination metrics
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentPageItems = filtered.slice(startIndex, startIndex + pageSize);
  const emptyRowsCount = loading ? 0 : Math.max(0, Math.min(pageSize, 8) - currentPageItems.length);

  // Bulk Selection Logic
  const isAllSelected = currentPageItems.length > 0 && currentPageItems.every(s => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const currentItemIds = new Set(currentPageItems.map(item => item.id));
      setSelectedIds(prev => prev.filter(id => !currentItemIds.has(id)));
    } else {
      const currentItemIds = currentPageItems.map(item => item.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentItemIds])));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDelete(
      `Delete ${selectedIds.length} Selected Sites?`,
      `Are you sure you want to delete ${selectedIds.length} site(s)? Associated geofences will be deleted.`
    );
    if (confirmed) {
      try {
        await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'Sites', id))));
        showToast('Bulk Delete Successful', `${selectedIds.length} site(s) removed from backend.`, 'success');
        setSelectedIds([]);
      } catch (err) {
        console.error('Bulk delete error:', err);
        showToast('Bulk Delete Failed', err.message || 'Error deleting selected sites.', 'error');
      }
    }
  };

  const location = useLocation();

  const openAdd = () => { setForm(EMPTY); setEditId(null); setSuggestions([]); setSearching(false); setModal(true); };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearch(q);
    }
    if (params.get('action') === 'add') {
      openAdd();
    }
  }, [location.search]);

  useEffect(() => {
    const handleOpenAdd = () => openAdd();
    window.addEventListener('subai_open_add_site', handleOpenAdd);
    return () => window.removeEventListener('subai_open_add_site', handleOpenAdd);
  }, []);
  const openEdit = (s) => { 
    const rad = typeof s.radius === 'string' ? parseInt(s.radius.replace('m','')) : s.radius;
    setForm({...s, radius: rad}); 
    setEditId(s.id); 
    setSuggestions([]);
    setSearching(false);
    setModal(true); 
  };

  const handleAddressChange = (text) => {
    setForm(p => ({ ...p, address: text }));
    if (!text || text.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data || []);
        }
      } catch (err) {
        console.warn('Address geocode search error:', err);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const selectSuggestion = (s) => {
    const addressText = s.display_name || s.name || form.address;
    const latVal = parseFloat(parseFloat(s.lat).toFixed(6)) || form.lat || 10.3157;
    const lngVal = parseFloat(parseFloat(s.lon).toFixed(6)) || form.lng || 123.8854;

    setForm(p => ({
      ...p,
      address: addressText,
      lat: latVal,
      lng: lngVal,
    }));
    setSuggestions([]);
  };
  
  const handleDelete = async (id) => {
    const confirmed = await showConfirmDelete(
      'Delete Site?',
      'Are you sure you want to remove this site? Associated geofences will be deleted.'
    );
    
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'Sites', id));
        showToast('Site Removed', 'Site deleted from records.', 'success');
      } catch (e) {
        console.warn('Delete site error:', e);
        showToast('Delete Failed', e.message || 'Could not delete site', 'error');
      }
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.address) return showToast('Validation Error', 'Name and Address are required.', 'error');
    setIsSaving(true);
    
    try {
      const finalForm = { ...form, radius: (form.radius || 100) + 'm' };
      if (editId) {
        await updateDoc(doc(db, 'Sites', editId), finalForm);
        showToast('Site Updated', 'Site details saved successfully.', 'success');
      } else {
        const nowStr = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
        const newSite = { ...finalForm, created: nowStr.replace(', ', '\n') };
        await addDoc(collection(db, 'Sites'), newSite);
        showToast('Site Created', 'New site added to database.', 'success');
      }
      setModal(false);
    } catch (e) {
      console.warn('Save site error:', e);
      showToast('Save Failed', e.message || 'Failed to save site', 'error');
    } finally {
      setIsSaving(false);
    }
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

            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '9px 14px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Trash2 size={14} /> Delete Selected ({selectedIds.length})
              </button>
            )}
            
            <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1E5ADB', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={14} /> Add Site
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <th style={{ width: 40, padding: '12px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                    />
                  </th>
                  {['SITE NAME','ADDRESS','COORDINATES','RADIUS','STATUS','DATE CREATED','ACTIONS'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentPageItems.map(site => {
                  const isSelected = selectedIds.includes(site.id);
                  const radStr = typeof site.radius === 'number' ? `${site.radius}m` : site.radius || '300m';
                  return (
                    <tr key={site.id} style={{ borderBottom: '1px solid #F3F4F6', background: isSelected ? '#EFF6FF' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(site.id)}
                          style={{ cursor: 'pointer', accentColor: '#1E5ADB', width: 15, height: 15 }}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', flexShrink: 0 }}>
                            <MapPin size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{site.name}</div>
                            {site.company && <div style={{ fontSize: 11, color: '#1E5ADB', fontWeight: 500 }}>{site.company}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151', minWidth: 200 }}>{site.address}</td>
                      <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {site.lat?.toFixed(4)}, {site.lng?.toFixed(4)}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span>{radStr}</span>
                          {parseRadius(site.radius) <= 30 && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: '#EFF6FF',
                              color: '#1E5ADB',
                              border: '1px solid #BFDBFE',
                              padding: '2px 6px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}>
                              🏢 Building
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_STYLE[site.status]?.background || '#F3F4F6', color: STATUS_STYLE[site.status]?.color || '#374151', padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_STYLE[site.status]?.dot || '#9CA3AF' }}></div>
                          {site.status || 'Active'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 11, whiteSpace: 'nowrap' }}>{site.created}</td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => openEdit(site)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #DBEAFE',
                              backgroundColor: '#FFFFFF',
                              color: '#1E5ADB',
                              fontWeight: '700',
                              fontSize: '11px',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Edit2 size={13} color="#1E5ADB" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(site.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #FCA5A5',
                              backgroundColor: '#FEF2F2',
                              color: '#DC2626',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Trash2 size={13} color="#DC2626" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Empty Filler Rows */}
                {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                  <tr key={`empty-row-${idx}`} style={{ height: 38, borderBottom: '1px dashed #F8FAFC' }}>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11, textAlign: 'center' }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                    <td style={{ padding: '8px 16px', color: '#E2E8F0', fontSize: 11 }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>Loading sites...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: '#6B7280' }}>
              <MapPin size={36} color="#94A3B8" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>No Sites Created</div>
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Click <strong>Add Site</strong> to configure your first monitoring location.</p>
            </div>
          ) : null}

          {/* Premium Datatable Pagination Header/Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            borderTop: '1px solid #F1F5F9',
            background: '#FFFFFF',
            flexWrap: 'wrap',
            gap: 12
          }}>
            {/* Left: Info & Rows per page selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                Showing <strong style={{ color: '#0F172A' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong style={{ color: '#0F172A' }}>{Math.min(startIndex + pageSize, totalItems)}</strong> of <strong style={{ color: '#0F172A' }}>{totalItems}</strong> entries
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{
                    padding: '5px 10px',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#0F172A',
                    background: '#F8FAFC',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>
            </div>

            {/* Right: Page Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: safePage <= 1 ? '#F8FAFC' : '#FFFFFF',
                  color: safePage <= 1 ? '#94A3B8' : '#334155',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: pNum === safePage ? 'none' : '1px solid #E2E8F0',
                    background: pNum === safePage ? '#1E5ADB' : '#FFFFFF',
                    color: pNum === safePage ? '#FFFFFF' : '#334155',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: pNum === safePage ? '0 2px 6px rgba(30, 90, 219, 0.3)' : 'none'
                  }}
                >
                  {pNum}
                </button>
              ))}

              <button
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: safePage >= totalPages ? '#F8FAFC' : '#FFFFFF',
                  color: safePage >= totalPages ? '#94A3B8' : '#334155',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Single Unified Card with 3 Unique Site Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="widget" style={{ padding: 20 }}>
            
            {/* Main Card Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #F1F5F9', paddingBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={18} color="#1E5ADB" /> Site Intelligence
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Operational status & geofence telemetry</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#EFF6FF', color: '#1E5ADB', padding: '4px 10px', borderRadius: 12 }}>
                3 Charts
              </span>
            </div>

            {/* CHART 1: Semi-Circle Speedometer Gauge (Active Efficiency Ratio) */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Gauge size={14} color="#10B981" /> 1. Active Site Efficiency
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: 10 }}>
                  {activeRatioPct}% Active
                </span>
              </div>

              {/* Semi-Circle Gauge Container */}
              <div style={{ position: 'relative', width: '100%', height: 110, display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={gaugeData}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {gaugeData.map((entry, index) => (
                        <Cell key={`cell-gauge-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Gauge Stats */}
                <div style={{
                  position: 'absolute',
                  bottom: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  pointerEvents: 'none'
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{activeRatioPct}%</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginTop: 2 }}>Active Ratio</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '6px 10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}></span> Active
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                    {activeSitesCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#10B981' }}>({activeRatioPct}%)</span>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '6px 10px', border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8' }}></span> Inactive
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                    {inactiveSitesCount} <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B' }}>({100 - activeRatioPct}%)</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />

            {/* CHART 2: Smooth Glowing Area Curve (Geofence Radius Profile) */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} color="#6366F1" /> 2. Radius Profile Curve
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#6366F1' }}>Zone Spread</span>
              </div>

              <div style={{ width: '100%', height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={radiusAreaData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="siteAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94A3B8' }} />
                    <Tooltip content={<CustomAreaTooltip />} cursor={{ stroke: '#6366F1', strokeDasharray: '3 3' }} />
                    <Area type="monotone" dataKey="sites" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#siteAreaGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                {radiusAreaData.map(r => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '5px 8px', borderRadius: 6 }}>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{r.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#6366F1' }}>{r.sites} site(s)</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: '#F1F5F9', margin: '14px 0' }} />

            {/* CHART 3: Horizontal Staff Density Bars (Layout Vertical) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={14} color="#1E5ADB" /> 3. Staff Assignment Density
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#1E5ADB', padding: '2px 7px', borderRadius: 10 }}>
                  Staff Tiers
                </span>
              </div>

              <div style={{ width: '100%', height: 125 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={staffingBarData} margin={{ top: 5, right: 15, left: 25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94A3B8' }} />
                    <YAxis type="category" dataKey="tier" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#334155', fontWeight: 600 }} />
                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                      {staffingBarData.map((entry, index) => (
                        <Cell key={`bar-cell-staff-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
                {staffingBarData.map(s => (
                  <div key={s.tier} style={{ background: '#F8FAFC', padding: '6px 8px', borderRadius: 6, textAlign: 'center', border: '1px solid #F1F5F9' }}>
                    <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600 }}>{s.tier.split(' ')[0]}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: s.fill, marginTop: 1 }}>{s.count}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Modern Add/Edit Site Modal ── */}
      {modal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 24,
            width: 920,
            maxWidth: '95vw',
            boxShadow: '0 25px 60px -15px rgba(30, 90, 219, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>

            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #EFF6FF 0%, #EEF2FF 50%, #F5F3FF 100%)',
              padding: '20px 28px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: '#FFFFFF',
                  color: '#1E5ADB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 16px rgba(30, 90, 219, 0.15)'
                }}>
                  <Building2 size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editId ? 'Edit Site Configuration' : 'Add New Site Location'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: 500 }}>
                    Geofence Coordinates & Boundary Telemetry Setup
                  </div>
                </div>
              </div>

              <button
                onClick={() => setModal(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Split Form & Map Layout */}
            <div style={{ display: 'flex', height: 480 }}>

              {/* Form Controls Column */}
              <div style={{ width: 440, padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, borderRight: '1px solid #F1F5F9' }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Site Name *</label>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input
                      value={form.name || ''}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Headquarters / Site A"
                      style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Company / Client Name</label>
                  <div style={{ position: 'relative' }}>
                    <Building size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input
                      value={form.company || ''}
                      onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                      placeholder="e.g. ABC Corporation"
                      style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                    />
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Address Search *</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input
                      value={form.address || ''}
                      onChange={e => handleAddressChange(e.target.value)}
                      placeholder="Search address or landmark..."
                      autoComplete="off"
                      style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 500 }}
                    />
                  </div>

                  {searching && (
                    <div style={{ position: 'absolute', top: 68, left: 0, right: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#64748B', zIndex: 1000, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                      Searching coordinates...
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: 68, left: 0, right: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 15px 35px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: 180, overflowY: 'auto' }}>
                      {suggestions.map((s, i) => (
                        <div
                          key={i}
                          onClick={() => selectSuggestion(s)}
                          style={{ padding: '10px 14px', fontSize: 12, color: '#334155', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'flex-start', gap: 8, transition: 'background 0.15s ease' }}
                        >
                          <MapPin size={14} color="#1E5ADB" style={{ marginTop: 2, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{(s.namedetails && s.namedetails.name) ? s.namedetails.name : (s.name || s.display_name.split(',')[0])}</div>
                            <div style={{ color: '#64748B', fontSize: 11, lineHeight: 1.3 }}>{s.display_name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Latitude</label>
                    <div style={{ position: 'relative' }}>
                      <Navigation size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: 11 }} />
                      <input
                        type="number"
                        step="0.0001"
                        value={form.lat || ''}
                        onChange={e => setForm(p => ({ ...p, lat: parseFloat(e.target.value) || 0 }))}
                        style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 12, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 600 }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>Longitude</label>
                    <div style={{ position: 'relative' }}>
                      <Navigation size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: 11 }} />
                      <input
                        type="number"
                        step="0.0001"
                        value={form.lng || ''}
                        onChange={e => setForm(p => ({ ...p, lng: parseFloat(e.target.value) || 0 }))}
                        style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 12, outline: 'none', background: '#FFFFFF', boxSizing: 'border-box', color: '#0F172A', fontWeight: 600 }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Geofence Radius (meters)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min={20}
                        max={3000}
                        step={5}
                        value={form.radius || 20}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          setForm(p => ({ ...p, radius: isNaN(val) ? '' : Math.max(20, val) }));
                        }}
                        style={{
                          width: 68,
                          padding: '2px 6px',
                          borderRadius: 6,
                          border: '1.5px solid #1E5ADB',
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#1E5ADB',
                          background: '#EFF6FF',
                          textAlign: 'right',
                          outline: 'none'
                        }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1E5ADB' }}>m</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={1500}
                    step={5}
                    value={form.radius || 20}
                    onChange={e => setForm(p => ({ ...p, radius: parseInt(e.target.value) || 20 }))}
                    style={{ width: '100%', accentColor: '#1E5ADB', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 6 }}>
                    {[
                      { r: 20, label: '20m (Bldg)' },
                      { r: 50, label: '50m' },
                      { r: 100, label: '100m' },
                      { r: 300, label: '300m' },
                      { r: 500, label: '500m' },
                      { r: 1000, label: '1km' }
                    ].map(item => (
                      <button
                        key={item.r}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, radius: item.r }))}
                        style={{
                          padding: '5px 2px',
                          borderRadius: 6,
                          border: (form.radius || 20) === item.r ? '1.5px solid #1E5ADB' : '1px solid #E2E8F0',
                          background: (form.radius || 20) === item.r ? '#EFF6FF' : '#FFFFFF',
                          color: (form.radius || 20) === item.r ? '#1E5ADB' : '#64748B',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {(form.radius || 20) <= 30 && (
                    <div style={{
                      marginTop: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: '#1E40AF',
                      fontWeight: 600
                    }}>
                      <Building2 size={14} color="#1D4ED8" style={{ flexShrink: 0 }} />
                      <span><strong>20m Building Fit:</strong> High-precision perimeter tailored for single building structures & indoor office areas.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Google Maps Styled Preview Column */}
              <div style={{ flex: 1, background: '#F8FAFC', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                
                {/* Floating Google Maps Overlay Controls Header */}
                <div style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  right: 14,
                  zIndex: 400,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pointerEvents: 'none'
                }}>
                  <div style={{
                    pointerEvents: 'auto',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    padding: '6px 14px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#0F172A',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.1), 0 0 0 1px rgba(226, 232, 240, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <Target size={14} color="#1A73E8" />
                    <span>Google Maps Telemetry</span>
                    <span style={{ fontSize: 9, color: '#16A34A', background: '#DCFCE7', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>LIVE</span>
                  </div>

                  {/* Map Layer Style Pills (Roadmap / Satellite / Terrain / Light) */}
                  <div style={{
                    pointerEvents: 'auto',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    padding: 3,
                    borderRadius: 12,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.1), 0 0 0 1px rgba(226, 232, 240, 0.8)',
                    display: 'flex',
                    gap: 2
                  }}>
                    {[
                      { id: 'google-roadmap', label: 'Map' },
                      { id: 'google-hybrid', label: 'Satellite' },
                      { id: 'google-terrain', label: 'Terrain' },
                      { id: 'carto-light', label: 'Minimal' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setMapTileType(t.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 9,
                          border: 'none',
                          background: mapTileType === t.id ? '#1A73E8' : 'transparent',
                          color: mapTileType === t.id ? '#FFFFFF' : '#475569',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leaflet Map with Google Maps Tile Provider */}
                <MapContainer
                  key={`${form.lat}-${form.lng}-${mapTileType}-${(form.radius || 20) <= 30 ? 'building' : 'wide'}`}
                  center={[form.lat, form.lng]}
                  zoom={(form.radius || 20) <= 30 ? 18 : (form.radius || 20) <= 100 ? 17 : 15}
                  style={{ height: '100%', width: '100%', background: '#E5E3DF' }}
                >
                  <TileLayer
                    url={
                      mapTileType === 'google-hybrid'
                        ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
                        : mapTileType === 'google-terrain'
                        ? 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
                        : mapTileType === 'carto-light'
                        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                        : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
                    }
                    maxZoom={20}
                    subdomains={mapTileType === 'carto-light' ? 'abcd' : []}
                  />

                  {/* Click to reposition lat/lng on map */}
                  <MapClickHandler onMapClick={(newLat, newLng) => setForm(p => ({ ...p, lat: newLat, lng: newLng }))} />

                  {/* Google Blue Geofence Radius Perimeter */}
                  <Circle
                    center={[form.lat, form.lng]}
                    radius={form.radius || 20}
                    pathOptions={{
                      color: (form.radius || 20) <= 30 ? '#2563EB' : '#1A73E8',
                      fillColor: (form.radius || 20) <= 30 ? '#3B82F6' : '#1A73E8',
                      fillOpacity: (form.radius || 20) <= 30 ? 0.30 : 0.22,
                      weight: (form.radius || 20) <= 30 ? 3 : 2.5,
                      dashArray: '6, 6'
                    }}
                  />
                </MapContainer>

                {/* Bottom Helper Hint */}
                <div style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 14,
                  zIndex: 400,
                  background: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(6px)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 10,
                  color: '#FFFFFF',
                  fontWeight: 600
                }}>
                  💡 Click anywhere on the map to set location coordinates
                </div>
              </div>

            </div>

            {/* Modal Bottom Action Bar */}
            <div style={{
              padding: '16px 28px 20px 28px',
              borderTop: '1px solid #F1F5F9',
              background: '#FAFAFA',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>
                * Position address or coordinates to update map geofence
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setModal(false)}
                  disabled={isSaving}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 12,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    padding: '9px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #1E5ADB 0%, #1E40AF 100%)',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(30, 90, 219, 0.35)',
                    opacity: isSaving ? 0.7 : 1
                  }}
                >
                  {isSaving ? 'Saving Site...' : 'Save Site Location'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}