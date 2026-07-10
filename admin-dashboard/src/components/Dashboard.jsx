import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, MapPin, ClipboardCheck, WifiOff, ArrowRight } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import 'leaflet/dist/leaflet.css';
import { MOCK_EMPLOYEES, MOCK_SITES, MOCK_LOCATIONS, MOCK_ACTIVITY_LOGS, MOCK_ASSIGNMENTS } from '../mockData';

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

function GaugeRing({ pct, a, b }) {
  const r = 17, size = 44, cx = size / 2;
  const C = 2 * Math.PI * r;
  const off = (C * (100 - pct) / 100).toFixed(2);
  const gid = "rg" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" style={{ color: 'rgba(15,23,42,0.08)' }} strokeWidth="5" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={C.toFixed(2)} strokeDashoffset={off} className="ring-prog" />
    </svg>
  );
}

function ModernKpiCard({ label, value, delta, trend, icon: Icon, color, pct }) {
  let trendClass = 'trend-flat';
  if (trend === 'up') trendClass = 'trend-up';
  else if (trend === 'down') trendClass = 'trend-down';

  return (
    <div className="kpi-card" style={{ '--accent-a': color, '--accent-glow': color + '55' }}>
      <div className="kpi-card-inner">
        <div className="kpi-ring-section">
          <GaugeRing pct={pct} a={color} b={color} />
          <div className="kpi-ring-icon" style={{ color }}>
            <Icon size={16} />
          </div>
        </div>
        <div className="kpi-info">
          <div className="kpi-label">{label}</div>
          <div className="kpi-value-row">
            <span className="kpi-value">{value}</span>
            <span className={`trend-pill ${trendClass}`}>
              {trend === 'flat' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: trend === 'down' ? 'rotate(180deg)' : 'none' }}>
                  <path d="m5 12 7-7 7 7M12 19V5"/>
                </svg>
              )}
              {delta}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// Auto fit bounds to markers on initial load
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

export default function Dashboard() {
  const [employees] = useState(MOCK_EMPLOYEES);
  const [sites] = useState(MOCK_SITES);
  const [locations] = useState(MOCK_LOCATIONS);
  const [recentLogs] = useState(MOCK_ACTIVITY_LOGS.slice(0, 5));
  const [assignments] = useState(MOCK_ASSIGNMENTS);

  // Compute Stats
  const totalEmp = employees.length;
  const onDutyCount = employees.filter(e => e.status === 'On Duty').length;
  const onSiteCount = employees.filter(e => e.status === 'On Site').length;
  const offlineCount = employees.filter(e => !e.status || e.status === 'Offline').length;
  const inTransitCount = employees.filter(e => e.status === 'In Transit').length;
  const completedAssignments = assignments.filter(a => a.status === 'Completed').length;

  const kpis = [
    { label: 'Total Employees', value: totalEmp, delta: '+2', trend: 'up', icon: Users, color: '#6366f1', pct: 87 },
    { label: 'On Duty', value: onDutyCount, delta: '+1', trend: 'up', icon: CheckCircle, color: '#10b981', pct: 31 },
    { label: 'On Site', value: onSiteCount, delta: '0', trend: 'flat', icon: MapPin, color: '#f59e0b', pct: 31 },
    { label: 'Completed', value: completedAssignments, delta: '+1', trend: 'up', icon: ClipboardCheck, color: '#06b6d4', pct: 20 },
    { label: 'Offline', value: offlineCount, delta: '-1', trend: 'down', icon: WifiOff, color: '#f43f5e', pct: 15 },
  ];

  const statusData = [
    { name: 'On Site', value: onSiteCount, color: '#10B981' },
    { name: 'On Duty', value: onDutyCount, color: '#3B82F6' },
    { name: 'In Transit', value: inTransitCount, color: '#F59E0B' },
    { name: 'Offline', value: offlineCount, color: '#E5E7EB' },
  ].filter(s => s.value > 0);

  // Dummy attendance data for visual filler
  const attendanceData = [
    { time: '12 AM', onSite: 10, onDuty: 20, offline: 15 },
    { time: '4 AM',  onSite: 8,  onDuty: 18, offline: 18 },
    { time: '8 AM',  onSite: 55, onDuty: 75, offline: 10 },
    { time: '12 PM', onSite: 80, onDuty: 95, offline: 8  },
    { time: '4 PM',  onSite: 65, onDuty: 85, offline: 12 },
    { time: '8 PM',  onSite: 30, onDuty: 45, offline: 20 },
  ];

  const mappableLocations = employees.filter(e => locations[e.id]).map(emp => locations[emp.id]);

  return (
    <div className="page-body">
      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpis.map((k, i) => <ModernKpiCard key={i} {...k} />)}
      </div>

      {/* Live Tracking Map */}
      <div className="map-section">
        <div className="map-section-header">
          <div className="map-section-title">Live Employee Tracking</div>
        </div>
        <div className="map-wrapper">
          <div className="map-box">
            <MapContainer center={[14.608, 120.990]} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              <MapFitBounds boundsLocations={mappableLocations} />
              {sites.map(s => {
                const r = typeof s.radius === 'string' ? parseInt(s.radius.replace('m', '')) : (s.radius || 300);
                return s.lat && s.lng ? (
                  <Circle key={s.id} center={[s.lat, s.lng]} radius={r}
                    pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.12, weight: 1.5 }}
                  />
                ) : null;
              })}
              {employees.filter(e => locations[e.id]).map(emp => {
                const loc = locations[emp.id];
                const status = emp.status || 'Offline';
                return (
                  <Marker key={emp.id} position={[loc.lat, loc.lng]} icon={createEmojiIcon(getInitials(emp.name), STATUS_COLORS[status] || '#9CA3AF', emp.profilePic)}>
                    <Popup>{emp.name}</Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
          {/* Legend */}
          <div className="map-legend">
            {[
              { label: 'On Site',    color: '#10B981' },
              { label: 'On Duty',    color: '#3B82F6' },
              { label: 'In Transit', color: '#F59E0B' },
              { label: 'Offline',    color: '#9CA3AF' },
              { label: 'Geofence',   color: '#3B82F6' },
            ].map(l => (
              <div key={l.label} className="legend-item">
                <div className="legend-dot" style={{ background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom 3-column Grid */}
      <div className="bottom-grid">

        {/* Recent Activity */}
        <div className="widget">
          <div className="widget-header">
            <div className="widget-title">Recent Location Logs</div>
          </div>
          <div className="activity-list">
            {recentLogs.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No recent activity.</div>
            ) : recentLogs.map((a, i) => {
              const emp = employees.find(e => e.name === a.user) || { name: 'Unknown' };
              const timeStr = a.time || 'Just now';
              return (
                <div key={i} className="activity-item">
                  <div className="activity-avatar" style={{ background: '#3B82F6', overflow: 'hidden' }}>
                    {emp.profilePic ? (
                      <img src={emp.profilePic} alt={emp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getInitials(emp.name)
                    )}
                  </div>
                  <div className="activity-info">
                    <div className="activity-name">{a.user}</div>
                    <div className="activity-action" style={{ color: '#6B7280', fontSize: 11 }}>{a.action}</div>
                  </div>
                  <div className="activity-time">{timeStr}</div>
                </div>
              )
            })}
          </div>
          <button className="view-all-btn">View All Activity <ArrowRight size={14} /></button>
        </div>

        {/* Attendance Overview Chart */}
        <div className="widget">
          <div className="widget-header">
            <div className="widget-title">Attendance Overview</div>
            <select className="widget-select"><option>Today</option><option>Week</option></select>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={attendanceData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gOnSite" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOnDuty" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOffline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="onSite"  stroke="#10B981" fill="url(#gOnSite)"  strokeWidth={2} dot={false} name="On Site" />
              <Area type="monotone" dataKey="onDuty"  stroke="#3B82F6" fill="url(#gOnDuty)"  strokeWidth={2} dot={false} name="On Duty" />
              <Area type="monotone" dataKey="offline" stroke="#EF4444" fill="url(#gOffline)" strokeWidth={2} dot={false} name="Offline" />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
            {[{ c: '#10B981', l: 'On Site' }, { c: '#3B82F6', l: 'On Duty' }, { c: '#EF4444', l: 'Offline' }].map(i => (
              <div key={i.l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
                <div style={{ width: 10, height: 3, borderRadius: 2, background: i.c }} />
                {i.l}
              </div>
            ))}
          </div>
        </div>

        {/* Status Overview Donut */}
        <div className="widget">
          <div className="widget-header">
            <div className="widget-title">Status Overview</div>
          </div>
          <div className="donut-wrapper">
            <PieChart width={180} height={180}>
              <Pie data={statusData} cx={86} cy={86} innerRadius={55} outerRadius={82}
                dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                {statusData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
            <div className="donut-center">
              <div className="donut-total">{totalEmp}</div>
              <div className="donut-label">Total</div>
            </div>
          </div>
          <div className="status-legend">
            {statusData.map(s => (
              <div key={s.name} className="status-legend-item">
                <div className="status-legend-left">
                  <div className="status-legend-dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                </div>
                <span className="status-legend-count">
                  {s.value} ({totalEmp ? Math.round(s.value / totalEmp * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}