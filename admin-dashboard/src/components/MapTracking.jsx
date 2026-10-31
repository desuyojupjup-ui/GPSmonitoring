import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { resolveEmployeeStatus } from '../utils/statusUtils';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS = {
  'On Site': '#10B981',
  'On Duty': '#3B82F6',
  'In Transit': '#F59E0B',
  'Completed': '#10B981',
  'Offline': '#9CA3AF',
};

function createEmojiIcon(initials, color, profilePic) {
  const content = profilePic
    ? `<img src="${profilePic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
    : `<span style="font-size:11px;font-weight:800;color:white;letter-spacing:-0.5px;">${initials}</span>`;

  const pinSize = 40;
  const imgSize = 30;
  const totalH  = pinSize + 12;
  const halfPin = pinSize / 2;
  const pulse   = color !== '#9CA3AF';

  return L.divIcon({
    html: `
      <div style="position:relative;width:${pinSize}px;height:${totalH}px;display:flex;flex-direction:column;align-items:center;">
        ${pulse ? `<div style="position:absolute;top:0;left:0;width:${pinSize}px;height:${pinSize}px;border-radius:50%;background:${color};opacity:0.22;animation:pinPulse 2s ease-out infinite;"></div>` : ''}
        <div style="position:relative;width:${pinSize}px;height:${pinSize}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 4px 14px rgba(0,0,0,0.3),inset 0 -2px 5px rgba(0,0,0,0.12);display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:2;flex-shrink:0;">
          <div style="width:${imgSize}px;height:${imgSize}px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.12);flex-shrink:0;">${content}</div>
        </div>
        <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid ${color};filter:drop-shadow(0 3px 2px rgba(0,0,0,0.18));flex-shrink:0;margin-top:-2px;z-index:1;"></div>
      </div>
      <style>@keyframes pinPulse{0%{transform:scale(1);opacity:.22}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}</style>
    `,
    className: '',
    iconSize:   [pinSize, totalH],
    iconAnchor: [halfPin, totalH],
    popupAnchor:[0, -totalH],
  });
}

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function MapFitBounds({ boundsLocations }) {
  const map = useMap();
  const [hasFit, setHasFit] = useState(false);

  useEffect(() => {
    if (boundsLocations.length > 0 && !hasFit) {
      const bounds = L.latLngBounds(boundsLocations.map(loc => [loc.lat, loc.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      setHasFit(true);
    }
  }, [boundsLocations, map, hasFit]);

  return null;
}

function MapFocusController({ focusedEmployee, locations = {} }) {
  const map = useMap();
  useEffect(() => {
    if (focusedEmployee) {
      const lat = focusedEmployee.lat || locations[focusedEmployee.id]?.lat;
      const lng = focusedEmployee.lng || locations[focusedEmployee.id]?.lng;
      if (lat && lng) {
        map.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
      }
    }
  }, [focusedEmployee, locations, map]);

  return null;
}

export default function MapTracking({ employees = [], sites = [], assignments = [], attendance = [], locations = {}, onFullscreen, focusedEmployee = null, onClearFocus = null }) {
  const mappableEmployees = employees.filter(e => (e.lat && e.lng) || locations[e.id]);
  const mappableLocations = mappableEmployees.map(emp => ({
    lat: emp.lat || locations[emp.id]?.lat,
    lng: emp.lng || locations[emp.id]?.lng
  }));

  return (
    <div className="map-container-premium" style={{ minHeight: '350px', height: '100%', width: '100%' }}>
      <MapContainer center={[14.608, 120.990]} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%', minHeight: '350px' }}>
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          maxZoom={20}
        />
        <MapFitBounds boundsLocations={mappableLocations} />
        <MapFocusController focusedEmployee={focusedEmployee} locations={locations} />
        {sites.map(s => {
          const r = typeof s.radius === 'string' ? parseInt(s.radius.replace('m', '')) : (s.radius || 300);
          return s.lat && s.lng ? (
            <Circle key={s.id} center={[s.lat, s.lng]} radius={r}
              pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.08, weight: 1.5, dashArray: '5 5' }}
            />
          ) : null;
        })}
        {mappableEmployees.map(emp => {
          const lat = emp.lat || locations[emp.id]?.lat;
          const lng = emp.lng || locations[emp.id]?.lng;
          const status = resolveEmployeeStatus(emp, sites, assignments, attendance);
          return (
            <Marker key={emp.id} position={[lat, lng]} icon={createEmojiIcon(getInitials(emp.name), STATUS_COLORS[status] || '#9CA3AF', emp.profilePic)}>
              <Popup>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>{status} • {emp.department || ''}</div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {/* Floating controls */}
      <div className="map-floating-controls">
        {focusedEmployee && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(15, 23, 42, 0.90)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.18)'
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
            <span>Focused: {focusedEmployee.name}</span>
            {onClearFocus && (
              <button
                onClick={onClearFocus}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#FFFFFF',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  padding: 0,
                  marginLeft: 4
                }}
                title="Clear Focus"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <button className="map-ctrl-btn" onClick={onFullscreen} title="Fullscreen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
      {/* Legend */}
      <div className="map-legend-premium">
        {[
          { label: 'On Site',    color: '#10B981' },
          { label: 'On Duty',    color: '#3B82F6' },
          { label: 'In Transit', color: '#F59E0B' },
          { label: 'Completed',  color: '#10B981' },
          { label: 'Offline',    color: '#9CA3AF' },
        ].map(l => (
          <div key={l.label} className="legend-premium-item">
            <div className="legend-premium-dot" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}