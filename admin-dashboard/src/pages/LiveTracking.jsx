import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Search, Navigation, Wifi, WifiOff, MapPin, Crosshair, ChevronRight, ChevronLeft, Layers, ShieldAlert, CheckCircle2, Clock, BatteryCharging, Zap, Compass, RotateCcw, X, Phone, UserCheck, Shield, Building2, Truck, Activity, Users, Radio } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { db, collection, onSnapshot, query } from '../firebase';
import { isEmployeeOnSite, resolveEmployeeStatus, isEmployeeOnline, hasEmployeeCheckedOut } from '../utils/statusUtils';

// Google Maps Style Status Palette
const STATUS_COLORS = {
  'On Site':    '#1E8E3E', // Google Green
  'On Duty':    '#1A73E8', // Google Blue
  'Online':     '#0284C7', // Sky Blue
  'In Transit': '#F9AB00', // Google Yellow/Amber
  'Completed':  '#10B981', // Clean Emerald Green
  'Offline':    '#70757A', // Google Gray
};

const STATUS_BG = {
  'On Site':    '#E6F4EA',
  'On Duty':    '#E8F0FE',
  'Online':     '#E0F2FE',
  'In Transit': '#FEF7E0',
  'Completed':  '#ECFDF5',
  'Offline':    '#F1F3F4',
};

// Re-export presence checker for any external consumers
export { isEmployeeOnline };

// Real-time helper: resolve employee duty status with checkout detection
export function getEmployeeStatus(emp, sitesOrNow, attendanceOrNow, assignments = [], customNow) {
  let sites = [];
  let attendance = [];
  let now = Date.now();

  if (typeof sitesOrNow === 'number' && sitesOrNow > 1000000000000) {
    now = sitesOrNow;
  } else if (Array.isArray(sitesOrNow)) {
    sites = sitesOrNow;
  }

  if (typeof attendanceOrNow === 'number' && attendanceOrNow > 1000000000000) {
    now = attendanceOrNow;
  } else if (Array.isArray(attendanceOrNow)) {
    attendance = attendanceOrNow;
  }

  if (typeof customNow === 'number' && customNow > 1000000000000) {
    now = customNow;
  }

  return resolveEmployeeStatus(emp, sites, assignments, attendance, now);
}

// Custom Premium Google-style Teardrop Marker Pin (Vector SVG, NO Emojis)
function createGooglePinIcon(initials, color, profilePic, isSelected = false, workType = 'Fixed Site Employee', isOnline = true) {
  const size = isSelected ? 48 : 40;
  const pinHeight = size + 14;
  const avatarSize = size - 8;
  const isMobile = workType === 'Mobile Field Employee';
  const pinColor = isOnline ? color : '#70757A';

  const avatarHtml = profilePic
    ? `<img src="${profilePic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
    : `<span style="font-size:${isSelected ? 13 : 11}px;font-weight:700;color:white;font-family:'Google Sans',Roboto,sans-serif;">${initials}</span>`;

  // Vector Truck SVG for Mobile Field Employees
  const mobileSvgBadge = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`;

  const badgeHtml = isMobile
    ? `<div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#F9AB00;border:2px solid white;display:flex;align-items:center;justify-content:center;z-index:4;box-shadow:0 2px 4px rgba(0,0,0,0.25);">${mobileSvgBadge}</div>`
    : '';

  const pulseRing = isOnline && pinColor !== '#70757A'
    ? `<div style="position:absolute;top:-4px;left:-4px;width:${size + 8}px;height:${size + 8}px;border-radius:50%;background:${pinColor};opacity:0.35;animation:googlePulse 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;"></div>`
    : '';

  return L.divIcon({
    html: `
      <div style="position:relative;width:${size}px;height:${pinHeight}px;display:flex;flex-direction:column;align-items:center;cursor:pointer;${!isOnline ? 'opacity:0.85;' : ''}">
        ${pulseRing}
        <!-- Google Pin Head -->
        <div style="position:relative;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${pinColor};border:2.5px solid white;box-shadow:0 4px 14px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:2;">
          <div style="transform:rotate(45deg);width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;background:${pinColor};display:flex;align-items:center;justify-content:center;overflow:hidden;border:1.5px solid rgba(255,255,255,0.85);">
            ${avatarHtml}
          </div>
        </div>
        ${badgeHtml}
      </div>
      <style>
        @keyframes googlePulse {
          0% { transform: scale(0.9); opacity: 0.5; }
          70% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      </style>
    `,
    className: '',
    iconSize: [size, pinHeight],
    iconAnchor: [size / 2, pinHeight],
    popupAnchor: [0, -pinHeight + 10],
  });
}

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target?.lat && target?.lng) {
      map.flyTo([target.lat, target.lng], 16, { duration: 1.2, easeLinearity: 0.25 });
    }
  }, [target?.lat, target?.lng, map]);
  return null;
}

function MapFitBounds({ boundsLocations }) {
  const map = useMap();
  const [hasFit, setHasFit] = useState(false);
  useEffect(() => {
    if (boundsLocations.length > 0 && !hasFit) {
      map.fitBounds(L.latLngBounds(boundsLocations.map(l => [l.lat, l.lng])), { padding: [60, 60], maxZoom: 15 });
      setHasFit(true);
    }
  }, [boundsLocations, map, hasFit]);
  return null;
}

export default function LiveTracking() {
  const [employees, setEmployees]     = useState([]);
  const [sites, setSites]             = useState([]);
  const [attendance, setAttendance]   = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapType, setMapType] = useState('googleStandard');
  const [, setTick] = useState(0);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null) {
      setSearch(q);
      setSidebarOpen(true);
    }
  }, [location.search]);

  // Auto-tick every 10s to re-evaluate presence in real time as heartbeats expire
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const unsubEmp = onSnapshot(query(collection(db, 'employees')), (snap) => {
        const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const empMap = new Map();
        rawList.forEach(e => {
          const key = (e.email || e.empEmail || e.id || '').trim().toLowerCase();
          if (!key) return;
          const latVal = e.lat ?? e.latitude;
          const lngVal = e.lng ?? e.longitude;
          const item = { ...e, lat: latVal, lng: lngVal };
          const existing = empMap.get(key);
          if (!existing) {
            empMap.set(key, item);
          } else {
            const canonical = (existing.idNum && existing.idNum !== 'N/A') ? existing : ((item.idNum && item.idNum !== 'N/A') ? item : existing);
            const other = canonical === existing ? item : existing;
            empMap.set(key, {
              ...other,
              ...canonical,
              isOnline: canonical.isOnline !== undefined ? canonical.isOnline : other.isOnline,
              status: canonical.status || other.status,
              attendanceStatus: canonical.attendanceStatus || other.attendanceStatus,
              lastCheckIn: canonical.lastCheckIn || other.lastCheckIn,
              lastCheckOut: canonical.lastCheckOut || other.lastCheckOut,
              lat: canonical.lat ?? other.lat,
              lng: canonical.lng ?? other.lng,
              lastActive: canonical.lastActive || other.lastActive,
            });
          }
        });
        setEmployees(Array.from(empMap.values()));
      });
      const unsubSites = onSnapshot(query(collection(db, 'Sites')), (snap) => {
        setSites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubAtt = onSnapshot(query(collection(db, 'attendance')), (snap) => {
        setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubAsg = onSnapshot(query(collection(db, 'Assignments')), (snap) => {
        setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => { unsubEmp(); unsubSites(); unsubAtt(); unsubAsg(); };
    } catch (e) {
      console.warn('Live tracking error:', e);
    }
  }, []);

  const getStatus = (emp) => getEmployeeStatus(emp, sites, attendance, assignments);

  const filtered = employees.filter(emp => {
    const matchS = emp.name?.toLowerCase().includes(search.toLowerCase()) || emp.idNum?.includes(search);
    const effStatus = getStatus(emp);
    const matchF = filter === 'all' || effStatus.toLowerCase().replace(' ', '') === filter.toLowerCase().replace(' ', '');
    return matchS && matchF;
  });

  const mappable = filtered.map(emp => {
    let lat = emp.lat ?? emp.latitude;
    let lng = emp.lng ?? emp.longitude;
    if ((!lat || !lng) && (emp.assignedSite || emp.assignedSiteId)) {
      const matchedSite = sites.find(s => s.id === emp.assignedSiteId || s.name === emp.assignedSite);
      if (matchedSite && (matchedSite.lat || matchedSite.latitude) && (matchedSite.lng || matchedSite.longitude)) {
        lat = matchedSite.lat ?? matchedSite.latitude;
        lng = matchedSite.lng ?? matchedSite.longitude;
      }
    }
    return { ...emp, lat, lng };
  }).filter(e => e.lat && e.lng);
  const onlineCount = employees.filter(e => isEmployeeOnline(e)).length;
  const filteredOnlineCount = filtered.filter(e => isEmployeeOnline(e)).length;

  // Google Maps Tile Layers
  const tileUrls = {
    googleStandard: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    googleSatellite: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    googleTerrain: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
  };

  const FILTER_OPTIONS = [
    { id: 'all', label: 'All', icon: Users, color: '#1A73E8', count: employees.length },
    { id: 'onsite', label: 'On Site', icon: MapPin, color: '#1E8E3E', count: employees.filter(e => isEmployeeOnSite(e, sites, assignments, attendance)).length },
    { id: 'onduty', label: 'On Duty', icon: Activity, color: '#1A73E8', count: employees.filter(e => getStatus(e) === 'On Duty').length },
    { id: 'online', label: 'Online', icon: Wifi, color: '#0284C7', count: employees.filter(e => getStatus(e) === 'Online').length },
    { id: 'intransit', label: 'In Transit', icon: Truck, color: '#F9AB00', count: employees.filter(e => getStatus(e) === 'In Transit').length },
    { id: 'completed', label: 'Completed', icon: CheckCircle2, color: '#10B981', count: employees.filter(e => getStatus(e) === 'Completed').length },
    { id: 'offline', label: 'Offline', icon: WifiOff, color: '#70757A', count: employees.filter(e => getStatus(e) === 'Offline').length },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 65px)', overflow: 'hidden', fontFamily: "'Google Sans', 'Inter', sans-serif" }}>
      
      {/* 🗺️ LEAFLET MAP CANVAS */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
        <MapContainer center={[14.608, 120.990]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            key={mapType}
            attribution="&copy; Google Maps"
            url={tileUrls[mapType]}
            maxZoom={20}
          />

          {/* Geofence Circles */}
          {sites.map(site => {
            if (!site.lat || !site.lng) return null;
            const r = typeof site.radius === 'string' ? parseInt(site.radius.replace('m', '')) : (site.radius ?? 20);
            const isViolated = employees.some(e => e.assignedSite === site.id && e.geofenceStatus === 'Outside Assigned Site');
            return (
              <Circle
                key={site.id}
                center={[site.lat, site.lng]}
                radius={r}
                pathOptions={{
                  color: isViolated ? '#EA4335' : '#1A73E8',
                  fillColor: isViolated ? '#EA4335' : '#1A73E8',
                  fillOpacity: r <= 30 ? 0.25 : 0.12,
                  dashArray: '5, 5',
                  weight: r <= 30 ? 2.5 : 2
                }}
              >
                <Tooltip direction="top" opacity={0.9} permanent className="google-tooltip">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 12, color: '#202124' }}>
                    <MapPin size={13} color="#1A73E8" /> {site.name} {r <= 30 ? '🏢 (20m Building)' : `(${r}m)`}
                  </div>
                  {isViolated && <div style={{ color: '#EA4335', fontSize: 10, fontWeight: 700, marginTop: 2 }}>⚠️ Geofence Alert</div>}
                </Tooltip>
              </Circle>
            );
          })}

          {selected && <MapFlyTo target={selected} />}
          {!selected && <MapFitBounds boundsLocations={mappable.map(e => ({ lat: e.lat, lng: e.lng }))} />}

          {/* Employee Marker Pins */}
          {mappable.map(emp => {
            const isOnline = isEmployeeOnline(emp);
            const status = getStatus(emp);
            const initials = emp.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
            const color = STATUS_COLORS[status] || STATUS_COLORS.Offline;
            return (
              <Marker
                key={emp.id}
                position={[emp.lat, emp.lng]}
                icon={createGooglePinIcon(initials, color, emp.profilePic, selected?.id === emp.id, emp.workType, isOnline)}
                eventHandlers={{ click: () => setSelected(emp) }}
                zIndexOffset={selected?.id === emp.id ? 1000 : 0}
              >
                <Popup className="google-popup" offset={[0, -25]}>
                  <div style={{ padding: 4, minWidth: 210, fontFamily: "'Google Sans', sans-serif" }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#202124' }}>{emp.name}</div>
                        <div style={{ fontSize: 11, color: '#5F6368' }}>{emp.email || 'Employee'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: STATUS_BG[status] || '#F1F3F4', borderRadius: 8, fontSize: 11, fontWeight: 600, color }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, ...(isOnline ? { boxShadow: `0 0 6px ${color}` } : {}) }} />
                        {status} {isOnline ? '(Online)' : '(Offline)'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#5F6368' }}>
                        {emp.workType === 'Mobile Field Employee' ? <Truck size={12} color="#F9AB00" /> : <Building2 size={12} color="#1A73E8" />}
                        {emp.workType === 'Mobile Field Employee' ? 'Mobile' : 'Fixed'}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelected(emp)}
                      style={{ width: '100%', marginTop: 10, background: '#1A73E8', color: 'white', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Inspect Live Telemetry
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* 🔍 GOOGLE MAPS FLOATING SEARCH & SIDEBAR DRAWER */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 1000,
        width: sidebarOpen ? 380 : 52, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'white', borderRadius: 24,
        boxShadow: '0 4px 24px rgba(60,64,67,0.2), 0 1px 4px rgba(60,64,67,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        maxHeight: 'calc(100vh - 97px)', border: '1px solid rgba(0,0,0,0.06)'
      }}>
        <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        
        {/* Google Maps Search Box Bar */}
        <div style={{
          height: 52, padding: '0 14px', borderBottom: sidebarOpen ? '1px solid #F1F3F4' : 'none',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5F6368', padding: 4 }}
          >
            {sidebarOpen ? <ChevronLeft size={20} /> : <Search size={20} color="#1A73E8" />}
          </button>
          
          {sidebarOpen && (
            <>
              <input
                placeholder="Search employees, sites, or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#202124', fontFamily: 'inherit', background: 'transparent' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5F6368' }}>
                  <X size={16} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Premium Google Filter Chips */}
        {sidebarOpen && (
          <div className="hide-scrollbar" style={{
            display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 14px', borderBottom: '1px solid #F1F3F4',
            background: '#FAFAFA', flexShrink: 0, boxSizing: 'border-box', width: '100%'
          }}>
            {FILTER_OPTIONS.map(chip => {
              const IconComp = chip.icon;
              const isSelected = filter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setFilter(chip.id)}
                  style={{
                    whiteSpace: 'nowrap', flexShrink: 0, padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: isSelected ? `1px solid ${chip.color}` : '1px solid #DADCE0',
                    background: isSelected ? `${chip.color}15` : 'white',
                    color: isSelected ? chip.color : '#3C4043',
                    boxShadow: isSelected ? `0 2px 6px ${chip.color}25` : '0 1px 2px rgba(60,64,67,0.08)',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <IconComp size={13} color={isSelected ? chip.color : chip.color} />
                  <span>{chip.label}</span>
                  <span style={{ background: isSelected ? chip.color : '#F1F3F4', color: isSelected ? 'white' : '#5F6368', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                    {chip.count ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Drawer Results List / Details */}
        {sidebarOpen && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'white' }}>
            
            {selected ? (
              /* Selected Employee Profile Panel */
              (() => {
                const isSelectedOnline = isEmployeeOnline(selected);
                const selectedStatus = getStatus(selected);
                const selectedColor = STATUS_COLORS[selectedStatus] || STATUS_COLORS.Offline;
                return (
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        onClick={() => setSelected(null)}
                        style={{ border: 'none', background: '#F1F3F4', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#3C4043', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <ChevronLeft size={16} /> Back to Directory
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: selectedColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: selectedColor, ...(isSelectedOnline ? { boxShadow: `0 0 6px ${selectedColor}` } : {}) }} />
                        {selectedStatus} {isSelectedOnline ? '(Online)' : '(Offline)'}
                      </span>
                    </div>

                    <div style={{ textAlign: 'center', borderBottom: '1px solid #F1F3F4', paddingBottom: 16 }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 10px',
                        background: selectedColor, padding: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'white', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#5F6368' }}>
                          {selected.profilePic ? <img src={selected.profilePic} alt={selected.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : selected.name?.split(' ').map(n => n[0]).join('')}
                        </div>
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#202124', margin: '0 0 2px' }}>{selected.name}</h3>
                      <div style={{ fontSize: 12, color: '#5F6368' }}>{selected.email || 'Field Staff'}</div>
                      <div style={{ fontSize: 11, color: '#1A73E8', fontWeight: 600, marginTop: 4 }}>ID: {selected.idNum || 'N/A'}</div>
                    </div>

                    {/* Telemetry Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ background: '#F8F9FA', padding: 10, borderRadius: 12, border: '1px solid #F1F3F4' }}>
                        <div style={{ fontSize: 10, color: '#70757A', fontWeight: 600 }}>WORK TYPE</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#202124', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                          {selected.workType === 'Mobile Field Employee' ? <Truck size={14} color="#F9AB00" /> : <Building2 size={14} color="#1A73E8" />}
                          {selected.workType === 'Mobile Field Employee' ? 'Mobile Field' : 'Fixed Site'}
                        </div>
                      </div>
                      <div style={{ background: '#F8F9FA', padding: 10, borderRadius: 12, border: '1px solid #F1F3F4' }}>
                        <div style={{ fontSize: 10, color: '#70757A', fontWeight: 600 }}>GEOFENCE STATUS</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selected.geofenceStatus === 'Outside Assigned Site' ? '#EA4335' : '#1E8E3E', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ShieldAlert size={14} color={selected.geofenceStatus === 'Outside Assigned Site' ? '#EA4335' : '#1E8E3E'} />
                          {selected.geofenceStatus || 'Inside Site'}
                        </div>
                      </div>
                    </div>

                    {isSelectedOnline ? (
                      <div style={{ background: '#E6F4EA', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #CEEAD6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Zap size={16} color="#1E8E3E" />
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1E8E3E' }}>Account Open & Active</div>
                            <div style={{ fontSize: 10, color: '#3C4043' }}>Real-time GPS telemetry streaming</div>
                          </div>
                        </div>
                        <Radio size={18} color="#1E8E3E" />
                      </div>
                    ) : (
                      <div style={{ background: '#F1F3F4', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #DADCE0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <WifiOff size={16} color="#70757A" />
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#70757A' }}>Account Inactive / Offline</div>
                            <div style={{ fontSize: 10, color: '#5F6368' }}>Employee has not opened mobile account</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: '#70757A', fontWeight: 600 }}>Closed</span>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* Directory List */
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#70757A', borderBottom: '1px solid #F1F3F4', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>ACTIVE WORKFORCE ({filtered.length})</span>
                  <span style={{ color: filteredOnlineCount > 0 ? '#1E8E3E' : '#70757A', fontWeight: 700, fontSize: 11 }}>
                    {filteredOnlineCount} ONLINE
                  </span>
                </div>
                {filtered.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#70757A', fontSize: 13 }}>No employees matching query.</div>
                ) : (
                  filtered.map(emp => {
                    const isOnline = isEmployeeOnline(emp);
                    const status = getStatus(emp);
                    const color = STATUS_COLORS[status] || STATUS_COLORS.Offline;
                    const initials = emp.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
                    return (
                      <div
                        key={emp.id}
                        onClick={() => setSelected(emp)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer',
                          borderBottom: '1px solid #F1F3F4', transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8F9FA'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0, overflow: 'hidden', border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                          {emp.profilePic ? <img src={emp.profilePic} alt={emp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, ...(isOnline ? { boxShadow: `0 0 5px ${color}` } : {}) }} />
                            <span style={{ fontSize: 11, color, fontWeight: 600 }}>{status}</span>
                            <span style={{ color: '#BDC1C6', fontSize: 10 }}>•</span>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#70757A', fontWeight: 500 }}>
                              {emp.workType === 'Mobile Field Employee' ? (
                                <><Truck size={11} color="#F9AB00" /> Mobile</>
                              ) : (
                                <><Building2 size={11} color="#1A73E8" /> Fixed</>
                              )}
                            </div>
                          </div>
                        </div>
                        {isOnline ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Wifi size={14} color="#1E8E3E" />
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <WifiOff size={14} color="#BDC1C6" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🗺️ GOOGLE MAP TYPE FLOATING SELECTOR (Top-Right) */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000, display: 'flex', gap: 8 }}>
        <div style={{
          background: 'white', borderRadius: 20, padding: 4, display: 'flex', gap: 4,
          boxShadow: '0 2px 6px rgba(60,64,67,0.15)', border: '1px solid #DADCE0'
        }}>
          {[
            { id: 'googleStandard', label: 'Map' },
            { id: 'googleSatellite', label: 'Satellite' },
            { id: 'googleTerrain', label: 'Terrain' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMapType(m.id)}
              style={{
                border: 'none', padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: mapType === m.id ? '#1A73E8' : 'transparent',
                color: mapType === m.id ? 'white' : '#5F6368',
                transition: 'all 0.15s'
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Live Telemetry Status Badge */}
        <div style={{
          background: 'white', borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 2px 6px rgba(60,64,67,0.15)', border: '1px solid #DADCE0'
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: onlineCount > 0 ? '#1E8E3E' : '#70757A',
            animation: onlineCount > 0 ? 'googlePulse 1.5s infinite' : 'none'
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#202124' }}>{onlineCount} Online</span>
        </div>
      </div>

    </div>
  );
}