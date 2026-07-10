import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, MapPin, ClipboardCheck, WifiOff, ArrowRight, Clock, RefreshCw, Maximize2, Eye, UserCheck, Shield, Truck, Zap, Bot, Activity } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import 'leaflet/dist/leaflet.css';
import { MOCK_EMPLOYEES, MOCK_SITES, MOCK_LOCATIONS, MOCK_ACTIVITY_LOGS, MOCK_ASSIGNMENTS } from '../mockData';
import MapTracking from './MapTracking';

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

function WorkforceInsightCard({ icon: Icon, label, value, subtitle, color, badge, onClick }) {
  return (
    <div className="insight-card" onClick={onClick} style={{ '--accent-a': color }}>
      <div className="insight-card-left">
        <div className="insight-icon-wrapper" style={{ background: color + '15', color }}>
          <Icon size={18} />
        </div>
        <div className="insight-info">
          <div className="insight-label">{label}</div>
          <div className="insight-value">{value}</div>
          <div className="insight-subtitle">{subtitle}</div>
        </div>
      </div>
      {badge && <div className="insight-badge" style={{ background: color + '20', color }}>{badge}</div>}
    </div>
  );
}

function ActivityFeedItem({ avatar, name, action, time, status, color }) {
  return (
    <div className="feed-item">
      <div className="feed-avatar" style={{ background: color || '#3B82F6' }}>
        {avatar || <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{name.charAt(0)}</span>}
      </div>
      <div className="feed-content">
        <div className="feed-name">{name}</div>
        <div className="feed-action">{action}</div>
      </div>
      <div className="feed-right">
        <div className="feed-time">{time}</div>
        <div className={`feed-status ${status === 'check-in' ? 'status-green' : status === 'enter' ? 'status-blue' : status === 'complete' ? 'status-purple' : 'status-red'}`} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [employees] = useState(MOCK_EMPLOYEES);
  const [sites] = useState(MOCK_SITES);
  const [locations] = useState(MOCK_LOCATIONS);
  const [recentLogs] = useState(MOCK_ACTIVITY_LOGS.slice(0, 5));
  const [assignments] = useState(MOCK_ASSIGNMENTS);
  const [fullscreen, setFullscreen] = useState(false);

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

  const attendanceData = [
    { time: '12 AM', onSite: 10, onDuty: 20, offline: 15 },
    { time: '4 AM',  onSite: 8,  onDuty: 18, offline: 18 },
    { time: '8 AM',  onSite: 55, onDuty: 75, offline: 10 },
    { time: '12 PM', onSite: 80, onDuty: 95, offline: 8  },
    { time: '4 PM',  onSite: 65, onDuty: 85, offline: 12 },
    { time: '8 PM',  onSite: 30, onDuty: 45, offline: 20 },
  ];

  const mappableLocations = employees.filter(e => locations[e.id]).map(emp => locations[emp.id]);

  const feedItems = [
    { avatar: null, name: 'John Cruz', action: 'Checked in to Greenfield Mall', time: '1 min ago', status: 'check-in', color: '#10B981' },
    { avatar: null, name: 'Maria Santos', action: 'Entered Central Station site', time: '3 min ago', status: 'enter', color: '#3B82F6' },
    { avatar: null, name: 'David Reyes', action: 'Completed Riverside inspection', time: '5 min ago', status: 'complete', color: '#8B5CF6' },
    { avatar: null, name: 'James Gonzales', action: 'Exited BGC geofence zone', time: '8 min ago', status: 'alert', color: '#EF4444' },
    { avatar: null, name: 'Anna Lim', action: 'Assigned to new site', time: '12 min ago', status: 'enter', color: '#3B82F6' },
  ];

  return (
    <div className="page-body">
      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpis.map((k, i) => <ModernKpiCard key={i} {...k} />)}
      </div>

      {/* Premium Workforce Monitoring + Live Activity Feed (side by side) */}
      <div className="workforce-row">
        {/* Left: Live Workforce Monitoring */}
        <div className="workforce-section">
          <div className="workforce-header">
            <div className="workforce-header-left">
              <h2 className="workforce-title">Live Workforce Monitoring</h2>
              <p className="workforce-subtitle">Real-time employee location and operational insights.</p>
            </div>
            <div className="workforce-header-right">
              <button className="wf-btn wf-btn-ghost" onClick={() => setFullscreen(!fullscreen)}>
                <Maximize2 size={14} />
                <span>Fullscreen</span>
              </button>
              <button className="wf-btn wf-btn-ghost">
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
              <button className="wf-btn wf-btn-primary">
                <Eye size={14} />
                <span>View All Employees</span>
              </button>
            </div>
          </div>

          <div className="workforce-layout">
            {/* Map (70%) */}
            <div className="workforce-map-wrapper">
              <MapTracking employees={employees} sites={sites} locations={locations} onFullscreen={() => setFullscreen(!fullscreen)} />
            </div>

            {/* Workforce Insights Panel (30%) */}
            <div className="workforce-insights">
              <div className="insights-header">
                <h3 className="insights-title">Workforce Insights</h3>
                <span className="insights-live">
                  <span className="live-dot" />
                  Live
                </span>
              </div>
              <div className="insights-list">
                <WorkforceInsightCard
                  icon={UserCheck}
                  label="Active Employees"
                  value="24 Employees"
                  subtitle="Currently working"
                  color="#10B981"
                />
                <WorkforceInsightCard
                  icon={Clock}
                  label="Average Time On Site"
                  value="6h 42m"
                  subtitle="Average duration today"
                  color="#3B82F6"
                />
                <WorkforceInsightCard
                  icon={Truck}
                  label="Employees In Transit"
                  value="5 Employees"
                  subtitle="Travelling to assigned sites"
                  color="#F59E0B"
                />
                <WorkforceInsightCard
                  icon={Shield}
                  label="Geofence Violations"
                  value="2 Alerts"
                  subtitle="Outside assigned work area"
                  color="#EF4444"
                  badge="View"
                  onClick={() => {}}
                />
                <WorkforceInsightCard
                  icon={Bot}
                  label="AI Workforce Insights"
                  value="3 Recommendations"
                  subtitle="Generated by AI Assistant"
                  color="#8B5CF6"
                  badge="View"
                  onClick={() => {}}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Activity Feed */}
        <div className="feed-section-side">
          <div className="feed-header">
            <div className="feed-header-left">
              <Activity size={16} color="#64748B" />
              <h3 className="feed-title">Live Activity Feed</h3>
            </div>
          </div>
          <div className="feed-list">
            {feedItems.map((item, i) => <ActivityFeedItem key={i} {...item} />)}
          </div>
          <button className="wf-btn wf-btn-ghost feed-view-all">
            <span>View All</span>
            <ArrowRight size={14} />
          </button>
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

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}