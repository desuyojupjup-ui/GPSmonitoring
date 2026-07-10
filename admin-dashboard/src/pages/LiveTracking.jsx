import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, LayersControl, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { MOCK_EMPLOYEES, MOCK_SITES, MOCK_LOCATIONS, MOCK_GPS_HISTORY } from '../mockData';
import { Search, Navigation, Wifi, WifiOff, MapPin, Users, Crosshair, Clock, PlayCircle, BarChart3, ChevronRight, LayoutDashboard } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const { BaseLayer, Overlay } = LayersControl;

const STATUS_COLORS = {
  'On Site':    '#10B981',
  'On Duty':    '#3B82F6',
  'In Transit': '#F59E0B',
  'Offline':    '#9CA3AF',
};

const STATUS_BG = {
  'On Site':    '#D1FAE5',
  'On Duty':    '#DBEAFE',
  'In Transit': '#FEF3C7',
  'Offline':    '#F3F4F6',
};

function createIcon(initials, color, profilePic, isSelected = false) {
  const content = profilePic
    ? `<img src="${profilePic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
    : `<span style="font-size:14px;font-weight:800;color:white;letter-spacing:-0.5px;">${initials}</span>`;

  const pinSize   = isSelected ? 56 : 46;
  const imgSize   = isSelected ? 42 : 34;
  const totalH    = pinSize + 16;
  const halfPin   = pinSize / 2;
  const pulse     = color !== '#9CA3AF';

  return L.divIcon({
    html: `
      <div style="position:relative;width:${pinSize}px;height:${totalH}px;display:flex;flex-direction:column;align-items:center;">
        ${pulse ? `<div style="position:absolute;top:0;left:0;width:${pinSize}px;height:${pinSize}px;border-radius:50%;background:${color};opacity:0.3;animation:pinPulse 2s ease-out infinite;"></div>` : ''}
        <div style="position:relative;width:${pinSize}px;height:${pinSize}px;border-radius:50%;background:${color};border:4px solid white;box-shadow:0 4px 16px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:2;">
          <div style="width:${imgSize}px;height:${imgSize}px;border-radius:50%;overflow:hidden;border:2px solid white;display:flex;align-items:center;justify-content:center;background:white;">${content}</div>
        </div>
        <div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:16px solid ${color};filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2));margin-top:-3px;z-index:1;"></div>
      </div>
      <style>@keyframes pinPulse{0%{transform:scale(1);opacity:.3}70%{transform:scale(2);opacity:0}100%{transform:scale(2);opacity:0}}</style>
    `,
    className: '',
    iconSize:   [pinSize, totalH],
    iconAnchor: [halfPin, totalH],
    popupAnchor:[0, -totalH],
  });
}

function MapFlyTo({ target }) {
  const map = useMap();
  const lat = target?.lat;
  const lng = target?.lng;
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 17, { duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

function MapFitBounds({ boundsLocations, focusTrigger }) {
  const map = useMap();
  const [hasFit, setHasFit] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(0);
  useEffect(() => {
    if (boundsLocations.length > 0) {
      if (!hasFit || focusTrigger > lastTrigger) {
        const bounds = L.latLngBounds(boundsLocations.map(loc => [loc.lat, loc.lng]));
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
        setHasFit(true);
        setLastTrigger(focusTrigger);
      }
    }
  }, [boundsLocations, map, hasFit, focusTrigger, lastTrigger]);
  return null;
}

function LocateControl() {
  const map = useMap();
  return (
    <button onClick={() => { map.locate().on('locationfound', function(e) { map.flyTo(e.latlng, 15); }); }}
      title="My Location"
      style={{ position: 'absolute', bottom: 30, right: 20, zIndex: 1000, background: 'white', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', cursor: 'pointer', color: '#1E5ADB' }}>
      <Crosshair size={20} />
    </button>
  );
}

export default function LiveTracking() {
  const [employees] = useState(MOCK_EMPLOYEES);
  const [locations] = useState(MOCK_LOCATIONS);
  const [sites] = useState(MOCK_SITES);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [empRoute] = useState([]);
  const [routeDistance] = useState(0);

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name?.toLowerCase().includes(search.toLowerCase());
    const status = emp.status || 'Offline';
    const matchFilter = filter === 'all' || status.toLowerCase().replace(' ', '') === filter.toLowerCase().replace(' ', '');
    return matchSearch && matchFilter;
  });

  const mappable = filtered.filter(emp => locations[emp.id]?.lat);
  const mappableLocations = mappable.map(emp => locations[emp.id]);
  const selectedWithLoc = selected ? { ...selected, ...(locations[selected.id] || {}) } : null;

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', height: 'calc(100vh - 65px)', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={[14.608, 120.990]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <LayersControl position="topright">
            <BaseLayer checked name="OpenStreetMap">
              <TileLayer attribution='&copy; <a href="https://carto.com/">CartoDB</a>' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            </BaseLayer>
            <BaseLayer name="Satellite View">
              <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </BaseLayer>
            <BaseLayer name="Terrain View">
              <TileLayer attribution='&copy; OpenTopoMap' url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" />
            </BaseLayer>
            <Overlay checked name="Geofences">
              {sites.map(site => {
                const r = typeof site.radius === 'string' ? parseInt(site.radius.replace('m','')) : (site.radius || 300);
                return site.lat && site.lng ? (
                  <Circle key={site.id} center={[site.lat, site.lng]} radius={r}
                    pathOptions={{ color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.1, dashArray: '6 4', weight: 2 }}>
                    <Tooltip direction="top" opacity={0.9} permanent className="glass-tooltip">
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{site.name}</div>
                    </Tooltip>
                  </Circle>
                ) : null;
              })}
            </Overlay>
            <Overlay checked name="Employee Routes">
              {empRoute.length > 1 && (
                <Polyline positions={empRoute} pathOptions={{ color: '#3B82F6', weight: 4, dashArray: '8 8', lineCap: 'round' }} />
              )}
            </Overlay>
          </LayersControl>

          {selectedWithLoc && <MapFlyTo target={selectedWithLoc} />}
          {!selectedWithLoc && <MapFitBounds boundsLocations={mappableLocations} focusTrigger={focusTrigger} />}
          <LocateControl />

          {mappable.map(emp => {
            const loc = locations[emp.id];
            const status = emp.status || 'Offline';
            const initials = emp.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
            return (
              <Marker key={emp.id} position={[loc.lat, loc.lng]} icon={createIcon(initials, STATUS_COLORS[status] || '#9CA3AF', emp.profilePic, selected?.id === emp.id)}
                eventHandlers={{ click: () => setSelected(emp) }} zIndexOffset={selected?.id === emp.id ? 1000 : 0}>
                {selected?.id !== emp.id && (
                  <Tooltip direction="bottom" offset={[0, 10]} opacity={1}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{emp.name}</div>
                  </Tooltip>
                )}
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="glass-panel" style={{ position: 'absolute', top: 20, left: 20, bottom: 20, width: 340, zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <LayoutDashboard size={20} color="#1E5ADB" /> Fleet Overview
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.4)' }}>
            <Search size={16} color="#6B7280" />
            <input placeholder="Search employee or site..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#374151', width: '100%', fontWeight: 500 }} />
          </div>
        </div>

        <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, padding: '16px 20px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          {['all', 'On Site', 'On Duty', 'In Transit', 'Offline'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap',
              background: filter === f ? '#1E5ADB' : 'rgba(255,255,255,0.6)', 
              color: filter === f ? 'white' : '#4B5563',
              boxShadow: filter === f ? '0 4px 10px rgba(30,90,219,0.3)' : 'none'
            }}>{f === 'all' ? `All (${employees.length})` : f}</button>
          ))}
        </div>

        {selected ? (
          <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#1E5ADB', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: 0 }}>
              <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }}/> Back to List
            </button>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 12px', background: STATUS_COLORS[selected.status] || '#9CA3AF', padding: 4, boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
                 <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'white', overflow: 'hidden' }}>
                    {selected.profilePic ? <img src={selected.profilePic} alt={selected.name} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize: 24, fontWeight: 700, color: '#9CA3AF'}}>{selected.name?.split(' ').map(n=>n[0]).join('')}</div>}
                 </div>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{selected.name}</h3>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{selected.email}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: STATUS_BG[selected.status] || '#F3F4F6', color: STATUS_COLORS[selected.status] || '#9CA3AF', padding: '6px 14px', borderRadius: 20, fontWeight: 600, fontSize: 12, marginTop: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[selected.status] || '#9CA3AF' }}></div>
                {selected.status || 'Offline'}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.5)', marginTop: 10 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={16}/> Daily Analytics</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#6B7280' }}>Distance Traveled</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{routeDistance} km</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#6B7280' }}>Last Update</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Just now</span>
              </div>
            </div>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#10B981', color: 'white', border: 'none', padding: '12px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
              <PlayCircle size={18} /> Replay History
            </button>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#374151', border: '1px solid #D1D5DB', padding: '12px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <Navigation size={18} color="#3B82F6" /> Route to Site
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 && (<div style={{ padding: 30, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>No results found.</div>)}
            {filtered.map(emp => {
              const loc = locations[emp.id];
              const status = emp.status || 'Offline';
              const initials = emp.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
              return (
                <div key={emp.id} onClick={() => setSelected(emp)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', transition: 'all 0.15s',
                  borderBottom: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.2)'
                }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.6)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.2)'}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: STATUS_COLORS[status] || '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0, overflow: 'hidden', border: '2px solid white' }}>
                    {emp.profilePic ? <img src={emp.profilePic} alt={emp.name} style={{width: '100%', height: '100%', objectFit: 'cover'}}/> : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[status] || '#9CA3AF' }}></div>
                      <span style={{ fontSize: 11, color: STATUS_COLORS[status] || '#9CA3AF', fontWeight: 600 }}>{status}</span>
                    </div>
                  </div>
                  {loc ? <Wifi size={14} color="#10B981" /> : <WifiOff size={14} color="#D1D5DB" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!selected && (
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000, display: 'flex', gap: 10 }}>
          <div className="glass-panel" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', animation: 'pulse 1.5s infinite' }}></div>
            <div>
              <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>LIVE TRACKING</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{mappable.length} Online</div>
            </div>
          </div>
          <button onClick={() => setFocusTrigger(prev => prev + 1)} className="glass-panel" style={{ padding: '0 20px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1E5ADB', transition: 'all 0.2s' }}>
            <Crosshair size={16} /> Fit Bounds
          </button>
        </div>
      )}

      <style>{`
        .leaflet-top.leaflet-right { top: 80px; right: 20px; }
        .glass-panel {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .leaflet-tooltip.glass-tooltip {
          background: rgba(255,255,255,0.9);
          border: none;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          color: #111827;
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}