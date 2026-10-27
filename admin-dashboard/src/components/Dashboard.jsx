import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CheckCircle, MapPin, ClipboardCheck, WifiOff, ArrowRight,
  Clock, RefreshCw, Maximize2, Eye, UserCheck, Shield, Truck,
  Bot, Activity, Building2, ShieldAlert, X, Search, Navigation,
  ChevronRight, AlertTriangle, Radio
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { db, collection, onSnapshot, query, limit } from '../firebase';
import MapTracking from './MapTracking';
import { resolveAssignmentStatus } from '../pages/Assignments';
import { isEmployeeOnline, resolveEmployeeStatus, resolveEmployeeWorkType } from '../utils/statusUtils';
export { isEmployeeOnline, resolveEmployeeStatus, resolveEmployeeWorkType };

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
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" className="gauge-track" strokeWidth="5" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={C.toFixed(2)} strokeDashoffset={off} className="ring-prog" />
    </svg>
  );
}

function ModernKpiCard({ label, value, delta, trend, icon: Icon, color, pct, onClick, helperText }) {
  let trendClass = 'trend-flat';
  if (trend === 'up') trendClass = 'trend-up';
  else if (trend === 'down') trendClass = 'trend-down';

  return (
    <div
      className="kpi-card"
      onClick={onClick}
      style={{
        '--accent-a': color,
        '--accent-glow': color + '55',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s ease'
      }}
      title={helperText || `Click to inspect ${label}`}
    >
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

const KpiMiniTooltip = ({ active, payload, label, unit = '' }) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div style={{
        background: '#0F172A',
        color: '#FFFFFF',
        padding: '5px 9px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.12)',
        pointerEvents: 'none'
      }}>
        <div style={{ color: '#94A3B8', fontSize: 9, marginBottom: 2 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color || '#3B82F6' }} />
          <span>{item.value} {unit || item.name}</span>
        </div>
      </div>
    );
  }
  return null;
};

function WorkTypeGraphKpiCard({
  title,
  value,
  subValue,
  unit = 'Staff',
  icon: Icon,
  color = '#4F46E5',
  gradientId,
  chartData = [],
  dataKey = 'value',
  chartType = 'area',
  statusBadge,
  footerStats = [],
  onClick
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="work-type-card"
      style={{
        borderColor: hovered ? color + '60' : undefined,
        transform: hovered ? 'translateY(-3px)' : 'none',
        cursor: onClick ? 'pointer' : 'default'
      }}
      title={onClick ? `Click to inspect ${title} details` : undefined}
    >
      {/* Top ambient color bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3.5,
        background: `linear-gradient(90deg, ${color}, ${color}55)`
      }} />

      {/* Top Header Row */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `${color}14`,
              color: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon size={16} />
            </div>
            <span className="work-type-title">
              {title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {statusBadge && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 20,
                background: statusBadge.bg,
                color: statusBadge.color,
                border: `1px solid ${statusBadge.border || 'transparent'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                {statusBadge.dot && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusBadge.color }} />
                )}
                {statusBadge.text}
              </span>
            )}
            {onClick && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: color,
                opacity: hovered ? 1 : 0.45,
                transition: 'opacity 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                ↗
              </span>
            )}
          </div>
        </div>

        {/* Big Metric Row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, marginBottom: 6 }}>
          <span className="work-type-value">
            {value}
          </span>
          <span className="work-type-unit">
            {unit}
          </span>
          {subValue && (
            <span className="work-type-subvalue">
              {subValue}
            </span>
          )}
        </div>
      </div>

      {/* Embedded Chart Graphic */}
      <div style={{ width: '100%', height: 62, margin: '2px 0 6px' }}>
        {chartType === 'donut' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', padding: '0 4px' }}>
            {/* Donut with Center Percentage */}
            <div style={{ position: 'relative', width: 68, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ResponsiveContainer width={68} height={62}>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={18}
                    outerRadius={28}
                    paddingAngle={chartData.length > 1 && chartData.every(d => d.value > 0) ? 4 : 0}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, idx) => (
                      <Cell key={`cell-kpi-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<KpiMiniTooltip unit={unit} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute',
                textAlign: 'center',
                pointerEvents: 'none',
                lineHeight: 1
              }}>
                <div className="donut-val-text" style={{ color: statusBadge?.color }}>
                  {statusBadge?.text?.split(' ')[0] || '100%'}
                </div>
              </div>
            </div>

            {/* Right-side proportional status bars */}
            <div style={{ flex: 1, marginLeft: 14, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              {chartData.map((d, i) => {
                const totalVals = chartData.reduce((acc, curr) => acc + (curr.value || 0), 0) || 1;
                const barPct = Math.round((d.value / totalVals) * 100);
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, marginBottom: 2 }}>
                      <span className="donut-label-text">
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color }} />
                        {d.name}
                      </span>
                      <span style={{ color: d.color }}>{d.value} <span style={{ color: '#94A3B8', fontWeight: 500 }}>({barPct}%)</span></span>
                    </div>
                    <div className="donut-track">
                      <div style={{
                        width: `${barPct}%`,
                        height: '100%',
                        borderRadius: 2,
                        background: d.color,
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <Tooltip content={<KpiMiniTooltip unit={unit} />} cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }} />
              <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.38} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Tooltip content={<KpiMiniTooltip unit={unit} />} />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Micro-stats Bar */}
      <div className="work-type-footer" style={{ gridTemplateColumns: `repeat(${footerStats.length}, 1fr)` }}>
        {footerStats.map((stat, sIdx) => (
          <div key={sIdx} className="work-type-footer-item">
            <span style={{ color: '#94A3B8', fontWeight: 500 }}>{stat.label}: </span>
            <strong className="work-type-footer-val" style={{ color: stat.highlight }}>{stat.value}</strong>
          </div>
        ))}
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
        {avatar || <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{(name || 'E').charAt(0)}</span>}
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

// ── Full-featured Interactive Drilldown Modal ──
// ── Full-featured Interactive Drilldown Modal ──
function DashboardDrilldownModal({
  type,
  onClose,
  employees = [],
  sites = [],
  assignments = [],
  attendance = [],
  anomalies = [],
  onFocusEmployee
}) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [tabFilter, setTabFilter] = useState('All');

  if (!type) return null;

  // Configuration based on modal type
  const config = {
    fixed_site: {
      title: 'Fixed Site Employees Intelligence',
      subtitle: 'Live workforce occupancy, assigned fixed job sites, and perimeter compliance.',
      icon: Building2,
      color: '#7C3AED',
      items: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Fixed Site Employee'),
      pills: [
        { label: 'Fixed Staff', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Fixed Site Employee').length },
        { label: 'On Site', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Fixed Site Employee' && resolveEmployeeStatus(e) === 'On Site').length, color: '#10B981' },
        { label: 'On Duty', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Fixed Site Employee' && ['On Duty', 'On Site'].includes(resolveEmployeeStatus(e))).length, color: '#3B82F6' },
        { label: 'Assigned Sites', value: sites.length, color: '#6366F1' }
      ]
    },
    mobile_field: {
      title: 'Mobile Field Workforce Intelligence',
      subtitle: 'Real-time route telemetry, destination tracking, and field fleet sync.',
      icon: Truck,
      color: '#D97706',
      items: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Mobile Field Employee'),
      pills: [
        { label: 'Field Staff', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Mobile Field Employee').length },
        { label: 'In Transit', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Mobile Field Employee' && resolveEmployeeStatus(e) === 'In Transit').length, color: '#F59E0B' },
        { label: 'Completed Tasks', value: assignments.filter(a => resolveAssignmentStatus(a, attendance) === 'Completed').length, color: '#10B981' },
        { label: 'Fleet Sync', value: '100%', color: '#059669' }
      ]
    },
    geofence: {
      title: 'Geofence & Perimeter Intelligence',
      subtitle: 'Active perimeter status, geofence radius compliance, and breach detection.',
      icon: ShieldAlert,
      color: '#10B981',
      items: employees,
      pills: [
        { label: 'Inside Safe', value: employees.filter(e => e.geofenceStatus !== 'Outside Assigned Site').length, color: '#10B981' },
        { label: 'Active Breaches', value: employees.filter(e => e.geofenceStatus === 'Outside Assigned Site').length, color: '#DC2626' },
        { label: 'Monitored Sites', value: sites.length, color: '#6366F1' },
        { label: 'Precision Fit', value: '20m Bldg', color: '#7C3AED' }
      ]
    },
    ai_anomalies: {
      title: 'AI Anomaly Detection Center',
      subtitle: 'Real-time machine learning fraud flags, geofence breaches, velocity spikes, and attendance anomalies.',
      icon: ShieldAlert,
      color: '#EF4444',
      items: anomalies,
      isAnomalyList: true,
      pills: [
        { label: 'Total Anomalies', value: anomalies.length, color: '#EF4444' },
        { label: 'Active Flags', value: anomalies.filter(a => a.status === 'Active' || a.status === 'Open' || !a.status).length, color: '#DC2626' },
        { label: 'High Severity', value: anomalies.filter(a => a.severity === 'High' || a.severity === 'Critical').length, color: '#F43F5E' },
        { label: 'Resolved', value: anomalies.filter(a => a.status === 'Resolved' || a.status === 'Dismissed').length, color: '#10B981' }
      ]
    },
    on_duty: {
      title: 'Active On-Duty Personnel Roster',
      subtitle: 'Workforce currently clocked in, verified on duty, on site, or in operational transit.',
      icon: CheckCircle,
      color: '#10B981',
      items: employees.filter(e => ['On Duty', 'On Site', 'In Transit'].includes(resolveEmployeeStatus(e))),
      pills: [
        { label: 'Total On Duty', value: employees.filter(e => ['On Duty', 'On Site', 'In Transit'].includes(resolveEmployeeStatus(e))).length, color: '#10B981' },
        { label: 'On Site', value: employees.filter(e => resolveEmployeeStatus(e) === 'On Site').length, color: '#3B82F6' },
        { label: 'In Transit', value: employees.filter(e => resolveEmployeeStatus(e) === 'In Transit').length, color: '#F59E0B' },
        { label: 'Active Ratio', value: `${employees.length > 0 ? Math.round((employees.filter(e => ['On Duty', 'On Site', 'In Transit'].includes(resolveEmployeeStatus(e))).length / employees.length) * 100) : 0}%`, color: '#6366F1' }
      ]
    },
    offline: {
      title: 'Offline Personnel Roster',
      subtitle: 'Workforce currently off-duty, offline, or awaiting shift activation.',
      icon: WifiOff,
      color: '#F43F5E',
      items: employees.filter(e => resolveEmployeeStatus(e) === 'Offline'),
      pills: [
        { label: 'Offline Personnel', value: employees.filter(e => resolveEmployeeStatus(e) === 'Offline').length, color: '#F43F5E' },
        { label: 'Total Roster', value: employees.length, color: '#64748B' },
        { label: 'Offline Ratio', value: `${employees.length > 0 ? Math.round((employees.filter(e => resolveEmployeeStatus(e) === 'Offline').length / employees.length) * 100) : 0}%`, color: '#F43F5E' }
      ]
    },
    all_employees: {
      title: 'Complete Workforce Directory',
      subtitle: 'Overview of all enrolled employees, live operational statuses, and assigned work types.',
      icon: Users,
      color: '#6366F1',
      items: employees,
      pills: [
        { label: 'Total Enrolled', value: employees.length, color: '#6366F1' },
        { label: 'Fixed Site', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Fixed Site Employee').length, color: '#7C3AED' },
        { label: 'Mobile Field', value: employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Mobile Field Employee').length, color: '#D97706' },
        { label: 'On Duty', value: employees.filter(e => ['On Duty', 'On Site', 'In Transit'].includes(resolveEmployeeStatus(e))).length, color: '#10B981' }
      ]
    },
    on_site: {
      title: 'Personnel Verified On Site',
      subtitle: 'Employees currently present and confirmed inside their assigned facility perimeter.',
      icon: MapPin,
      color: '#F59E0B',
      items: employees.filter(e => resolveEmployeeStatus(e) === 'On Site' || (resolveEmployeeStatus(e) === 'On Duty' && e.geofenceStatus === 'Inside Assigned Site')),
      pills: [
        { label: 'On Site Verified', value: employees.filter(e => resolveEmployeeStatus(e) === 'On Site' || (resolveEmployeeStatus(e) === 'On Duty' && e.geofenceStatus === 'Inside Assigned Site')).length, color: '#F59E0B' },
        { label: 'Active Facilities', value: sites.length, color: '#3B82F6' }
      ]
    },
    completed: {
      title: 'Completed Assignments & Tasks',
      subtitle: 'Historical record of completed site assignments and shifts.',
      icon: ClipboardCheck,
      color: '#06B6D4',
      items: assignments.filter(a => resolveAssignmentStatus(a, attendance) === 'Completed'),
      isAssignmentList: true,
      pills: [
        { label: 'Completed Tasks', value: assignments.filter(a => resolveAssignmentStatus(a, attendance) === 'Completed').length, color: '#06B6D4' },
        { label: 'Total Assignments', value: assignments.length, color: '#64748B' }
      ]
    }
  }[type] || {
    title: 'Workforce Details',
    subtitle: 'Detailed view',
    icon: Users,
    color: '#3B82F6',
    items: employees,
    pills: []
  };

  const Icon = config.icon;

  // Filter items by search & tab
  const filteredList = config.items.filter(item => {
    if (config.isAnomalyList) {
      const matchSearch = !searchTerm ||
        (item.type || item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.severity || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (tabFilter === 'High') return matchSearch && (item.severity === 'High' || item.severity === 'Critical');
      if (tabFilter === 'Active') return matchSearch && item.status !== 'Resolved' && item.status !== 'Dismissed';
      if (tabFilter === 'Resolved') return matchSearch && (item.status === 'Resolved' || item.status === 'Dismissed');
      return matchSearch;
    }

    if (config.isAssignmentList) {
      const matchSearch = !searchTerm ||
        (item.siteName || item.site || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    }

    const name = (item.name || '').toLowerCase();
    const idNum = (item.idNum || '').toLowerCase();
    const email = (item.email || '').toLowerCase();
    const site = (item.assignedSite || '').toLowerCase();
    const matchesSearch = !searchTerm || name.includes(searchTerm.toLowerCase()) || idNum.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase()) || site.includes(searchTerm.toLowerCase());

    const status = resolveEmployeeStatus(item);
    if (tabFilter === 'On Duty') return matchesSearch && (status === 'On Duty' || status === 'On Site');
    if (tabFilter === 'Offline') return matchesSearch && status === 'Offline';
    if (tabFilter === 'Safe') return matchesSearch && item.geofenceStatus !== 'Outside Assigned Site';
    if (tabFilter === 'Breach') return matchesSearch && item.geofenceStatus === 'Outside Assigned Site';

    return matchesSearch;
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      animation: 'fadeIn 0.2s ease'
    }}>
      <div className="drilldown-modal-content" style={{
        borderRadius: 16,
        width: '100%',
        maxWidth: 820,
        maxHeight: '90vh',
        boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div className="drilldown-modal-header" style={{
          padding: '20px 24px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `${config.color}15`,
              color: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon size={22} />
            </div>
            <div>
              <h2 className="drilldown-modal-title" style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                {config.title}
              </h2>
              <p className="drilldown-modal-subtitle" style={{ fontSize: 13, margin: '4px 0 0 0' }}>
                {config.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="drilldown-modal-close"
            style={{
              border: 'none',
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick KPI Stat Strip */}
        {config.pills && config.pills.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 12,
            padding: '12px 24px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            overflowX: 'auto'
          }}>
            {config.pills.map((pill, idx) => (
              <div
                key={idx}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '6px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12
                }}
              >
                <span style={{ color: '#64748B', fontWeight: 600 }}>{pill.label}:</span>
                <strong style={{ color: pill.color || '#0F172A', fontWeight: 800, fontSize: 13 }}>
                  {pill.value}
                </strong>
              </div>
            ))}
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div style={{
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid #F1F5F9',
          background: '#FFFFFF'
        }}>
          <div style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            alignItems: 'center'
          }}>
            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 12 }} />
            <input
              type="text"
              placeholder="Search by name, ID, or assigned site..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                outline: 'none',
                color: '#0F172A'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                ✕
              </button>
            )}
          </div>

          {config.isAnomalyList ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'Active', 'High', 'Resolved'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setTabFilter(tab)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: tabFilter === tab ? config.color : '#F1F5F9',
                    color: tabFilter === tab ? '#FFFFFF' : '#475569',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          ) : !config.isAssignmentList ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'On Duty', 'Offline'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setTabFilter(tab)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: tabFilter === tab ? config.color : '#F1F5F9',
                    color: tabFilter === tab ? '#FFFFFF' : '#475569',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Scrollable Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {filteredList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#475569' }}>No matching records found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try refining your search or filters.</div>
            </div>
          ) : config.isAnomalyList ? (
            /* AI Anomalies List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredList.map((anom, i) => {
                const isHigh = anom.severity === 'High' || anom.severity === 'Critical';
                const isMed = anom.severity === 'Medium';
                const sevColor = isHigh ? '#EF4444' : isMed ? '#F59E0B' : '#3B82F6';
                const sevBg = isHigh ? '#FEF2F2' : isMed ? '#FFFBEB' : '#EFF6FF';
                const isResolved = anom.status === 'Resolved' || anom.status === 'Dismissed';

                return (
                  <div
                    key={anom.id || i}
                    style={{
                      background: isHigh && !isResolved ? '#FFF5F5' : '#FFFFFF',
                      border: `1px solid ${isHigh && !isResolved ? '#FECACA' : '#E2E8F0'}`,
                      borderRadius: 12,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: sevBg,
                        color: sevColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <ShieldAlert size={20} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                            {anom.type || anom.title || 'Security Anomaly'}
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 10,
                            background: sevBg,
                            color: sevColor,
                            border: `1px solid ${sevColor}33`
                          }}>
                            {anom.severity || 'Medium'} Risk
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 10,
                            background: isResolved ? '#ECFDF5' : '#FEF2F2',
                            color: isResolved ? '#059669' : '#DC2626'
                          }}>
                            {isResolved ? 'Resolved' : 'Active'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                          Employee: <strong style={{ color: '#0F172A' }}>{anom.employeeName || 'Staff Member'}</strong> • {anom.description || 'Outlier telemetry detected'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onClose();
                        navigate('/anomalies');
                      }}
                      style={{
                        background: '#0F172A',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#EF4444'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#0F172A'; }}
                    >
                      Inspect <ArrowRight size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : config.isAssignmentList ? (
            /* Assignment List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredList.map((asg, i) => (
                <div
                  key={asg.id || i}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
                      {asg.siteName || asg.site || 'Site Assignment'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      Assigned to: <strong>{asg.employeeName || 'Staff Member'}</strong> • Status: <span style={{ color: '#059669', fontWeight: 700 }}>Completed</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
                    {asg.completedAt || asg.date || 'Recorded'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            /* Employee List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredList.map((emp) => {
                const status = resolveEmployeeStatus(emp);
                const workType = resolveEmployeeWorkType(emp, assignments);
                const isFixed = workType === 'Fixed Site Employee';
                const hasBreach = emp.geofenceStatus === 'Outside Assigned Site';

                return (
                  <div
                    key={emp.id}
                    style={{
                      background: hasBreach ? '#FEF2F2' : '#FFFFFF',
                      border: `1px solid ${hasBreach ? '#FECACA' : '#E2E8F0'}`,
                      borderRadius: 12,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: isFixed ? '#EDE9FE' : '#FEF3C7',
                        color: isFixed ? '#7C3AED' : '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 14,
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {emp.profilePic ? (
                          <img src={emp.profilePic} alt={emp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          getInitials(emp.name)
                        )}
                      </div>

                      {/* Info */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>
                            {emp.name || 'Unnamed Staff'}
                          </span>
                          {emp.idNum && (
                            <span style={{ fontSize: 11, background: '#F1F5F9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              {emp.idNum}
                            </span>
                          )}
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 10,
                            background: isFixed ? '#F5F3FF' : '#FFFBEB',
                            color: isFixed ? '#7C3AED' : '#D97706',
                            border: `1px solid ${isFixed ? '#DDD6FE' : '#FDE68A'}`
                          }}>
                            {isFixed ? '🏢 Fixed Site' : '🚚 Mobile Field'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: '#64748B' }}>
                          <span>
                            {isFixed ? (
                              <>Site: <strong style={{ color: '#0F172A' }}>{emp.assignedSite || 'Not assigned'}</strong> {emp.geofenceRadius ? `(${emp.geofenceRadius}m)` : ''}</>
                            ) : (
                              <>Route: <strong style={{ color: '#0F172A' }}>{emp.assignedRoute || 'Field Telemetry'}</strong></>
                            )}
                          </span>
                          <span>•</span>
                          <span>Dept: {emp.org || emp.department || 'Operations'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right side status & action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Geofence Status Badge */}
                      {isFixed && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: hasBreach ? '#FEE2E2' : '#D1FAE5',
                          color: hasBreach ? '#991B1B' : '#065F46',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasBreach ? '#EF4444' : '#10B981' }} />
                          {hasBreach ? 'Outside Perimeter' : 'Inside Safe'}
                        </span>
                      )}

                      {/* Duty Status Badge */}
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: 6,
                        background: status === 'On Site' ? '#ECFDF5' : status === 'On Duty' ? '#EFF6FF' : status === 'In Transit' ? '#FFFBEB' : '#F1F5F9',
                        color: status === 'On Site' ? '#059669' : status === 'On Duty' ? '#1D4ED8' : status === 'In Transit' ? '#D97706' : '#64748B',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: status === 'On Site' ? '#10B981' : status === 'On Duty' ? '#3B82F6' : status === 'In Transit' ? '#F59E0B' : '#94A3B8'
                        }} />
                        {status}
                      </span>

                      {/* Action Button: Locate on Map */}
                      {(emp.lat && emp.lng) && (
                        <button
                          onClick={() => onFocusEmployee(emp)}
                          style={{
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: 8,
                            padding: '5px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#1E293B',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#0F172A';
                            e.currentTarget.style.color = '#FFFFFF';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#F8FAFC';
                            e.currentTarget.style.color = '#1E293B';
                          }}
                          title="Locate live on map"
                        >
                          <Navigation size={13} />
                          Map
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid #F1F5F9',
          background: '#F8FAFC',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: '#64748B'
        }}>
          <div>
            Showing <strong>{filteredList.length}</strong> of <strong>{config.items.length}</strong> records
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#0F172A',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  // Drilldown modal state
  const [drilldownType, setDrilldownType] = useState(null);
  const [focusedEmployee, setFocusedEmployee] = useState(null);

  // Periodic ticker to re-evaluate presence/heartbeat every 10 seconds
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const unsubEmp = onSnapshot(query(collection(db, 'employees')), (snap) => {
        setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubSites = onSnapshot(query(collection(db, 'Sites')), (snap) => {
        setSites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubAsg = onSnapshot(query(collection(db, 'Assignments')), (snap) => {
        setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubAtt = onSnapshot(query(collection(db, 'attendance')), (snap) => {
        setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubLogs = onSnapshot(query(collection(db, 'tracking_logs'), limit(10)), (snap) => {
        setRecentLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      const unsubAi = onSnapshot(query(collection(db, 'ai_analysis')), (snap) => {
        setAnomalies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => { unsubEmp(); unsubSites(); unsubAsg(); unsubAtt(); unsubLogs(); unsubAi(); };
    } catch (e) {
      console.warn('Dashboard subscription error:', e);
    }
  }, []);

  // Compute Active Stats
  const totalEmp = employees.length;

  // On Duty includes On Duty, On Site, and In Transit (working workforce)
  const onDutyEmployees = useMemo(() => {
    return employees.filter(e => {
      const s = resolveEmployeeStatus(e);
      return s === 'On Duty' || s === 'On Site' || s === 'In Transit';
    });
  }, [employees, tick]);
  const onDutyCount = onDutyEmployees.length;

  const onSiteEmployees = useMemo(() => {
    return employees.filter(e => {
      const s = resolveEmployeeStatus(e);
      return s === 'On Site' || (s === 'On Duty' && (e.geofenceStatus === 'Inside Assigned Site' || e.geofenceStatus === 'Inside'));
    });
  }, [employees, tick]);
  const onSiteCount = onSiteEmployees.length;

  const offlineEmployees = useMemo(() => {
    return employees.filter(e => resolveEmployeeStatus(e) === 'Offline');
  }, [employees, tick]);
  const offlineCount = offlineEmployees.length;

  const inTransitCount = employees.filter(e => resolveEmployeeStatus(e) === 'In Transit').length;
  const completedAssignments = assignments.filter(a => resolveAssignmentStatus(a, attendance) === 'Completed').length;
  
  // Geofence violations should only count online/active employees
  const outsideEmployees = employees.filter(e => isEmployeeOnline(e) && e.geofenceStatus === 'Outside Assigned Site');
  const outsideCount = outsideEmployees.length;
  const geofenceViolations = outsideCount;

  // Active AI Anomaly Flags
  const activeAnomalies = useMemo(() => {
    return anomalies.filter(a => a.status === 'Active' || a.status === 'Open' || (!a.status && a.status !== 'Resolved' && a.status !== 'Dismissed'));
  }, [anomalies]);
  const activeAnomalyCount = activeAnomalies.length;

  // Top KPI Metric Cards
  const kpis = [
    {
      label: 'Total Employees',
      value: totalEmp,
      delta: '0',
      trend: 'flat',
      icon: Users,
      color: '#6366f1',
      pct: totalEmp ? 100 : 0,
      onClick: () => setDrilldownType('all_employees'),
      helperText: 'Click to view workforce directory'
    },
    {
      label: 'On Duty',
      value: onDutyCount,
      delta: totalEmp ? `${Math.round((onDutyCount / totalEmp) * 100)}%` : '0%',
      trend: onDutyCount > 0 ? 'up' : 'flat',
      icon: CheckCircle,
      color: onDutyCount > 0 ? '#10b981' : '#94A3B8',
      pct: totalEmp ? Math.round(onDutyCount / totalEmp * 100) : 0,
      onClick: () => setDrilldownType('on_duty'),
      helperText: 'Click to view active on-duty personnel'
    },
    {
      label: 'On Site',
      value: onSiteCount,
      delta: totalEmp ? `${Math.round((onSiteCount / totalEmp) * 100)}%` : '0%',
      trend: onSiteCount > 0 ? 'up' : 'flat',
      icon: MapPin,
      color: onSiteCount > 0 ? '#f59e0b' : '#94A3B8',
      pct: totalEmp ? Math.round(onSiteCount / totalEmp * 100) : 0,
      onClick: () => setDrilldownType('on_site'),
      helperText: 'Click to view personnel on site'
    },
    {
      label: 'Completed',
      value: completedAssignments,
      delta: assignments.length ? `${Math.round(completedAssignments / assignments.length * 100)}%` : '0',
      trend: completedAssignments > 0 ? 'up' : 'flat',
      icon: ClipboardCheck,
      color: '#06b6d4',
      pct: assignments.length ? Math.round(completedAssignments / assignments.length * 100) : 0,
      onClick: () => setDrilldownType('completed'),
      helperText: 'Click to view completed assignments'
    },
    {
      label: 'Offline',
      value: offlineCount,
      delta: totalEmp ? `${Math.round((offlineCount / totalEmp) * 100)}%` : '0%',
      trend: offlineCount > 0 ? 'flat' : 'flat',
      icon: WifiOff,
      color: offlineCount > 0 ? '#f43f5e' : '#94A3B8',
      pct: totalEmp ? Math.round(offlineCount / totalEmp * 100) : 0,
      onClick: () => setDrilldownType('offline'),
      helperText: 'Click to view offline personnel roster'
    },
  ];

  // Work Type & Geofence Intelligence Calculations
  const fixedEmployees = useMemo(() => {
    return employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Fixed Site Employee');
  }, [employees, assignments]);
  const fixedCount = fixedEmployees.length;

  const mobileEmployees = useMemo(() => {
    return employees.filter(e => resolveEmployeeWorkType(e, assignments) === 'Mobile Field Employee');
  }, [employees, assignments]);
  const mobileCount = mobileEmployees.length;

  const fixedActiveEmployees = useMemo(() => {
    return fixedEmployees.filter(e => isEmployeeOnline(e));
  }, [fixedEmployees, tick]);
  const fixedActiveCount = fixedActiveEmployees.length;

  const mobileActiveEmployees = useMemo(() => {
    return mobileEmployees.filter(e => isEmployeeOnline(e));
  }, [mobileEmployees, tick]);
  const mobileActiveCount = mobileActiveEmployees.length;

  const fixedOnSite = fixedEmployees.filter(e => {
    const s = resolveEmployeeStatus(e);
    return s === 'On Site' || (s === 'On Duty' && e.geofenceStatus === 'Inside Assigned Site');
  }).length;

  const buildingSitesCount = sites.filter(s => {
    const r = typeof s.radius === 'number' ? s.radius : (parseInt(s.radius) || 100);
    return r <= 50;
  }).length || sites.length;

  const mobileInTransit = mobileEmployees.filter(e => resolveEmployeeStatus(e) === 'In Transit').length;

  const activeWorkforceCount = onDutyCount;
  const insideSafeCount = Math.max(0, activeWorkforceCount - outsideCount);
  const safePerimeterPct = activeWorkforceCount > 0 ? Math.round((insideSafeCount / activeWorkforceCount) * 100) : 100;

  // Dynamic 7-Point Shift/Timeline Graphs (Flat when inactive/offline)
  const fixedChartData = useMemo(() => {
    if (fixedActiveCount === 0) {
      return [
        { time: '06:00', value: 0 },
        { time: '08:00', value: 0 },
        { time: '10:00', value: 0 },
        { time: '12:00', value: 0 },
        { time: '14:00', value: 0 },
        { time: '16:00', value: 0 },
        { time: '18:00', value: 0 }
      ];
    }
    return [
      { time: '06:00', value: Math.max(1, Math.round(fixedActiveCount * 0.35)) },
      { time: '08:00', value: Math.max(1, Math.round(fixedActiveCount * 0.85)) },
      { time: '10:00', value: fixedActiveCount },
      { time: '12:00', value: Math.max(1, Math.round(fixedActiveCount * 0.80)) },
      { time: '14:00', value: fixedActiveCount },
      { time: '16:00', value: Math.max(1, Math.round(fixedActiveCount * 0.85)) },
      { time: '18:00', value: Math.max(0, Math.round(fixedActiveCount * 0.40)) }
    ];
  }, [fixedActiveCount]);

  const mobileChartData = useMemo(() => {
    if (mobileActiveCount === 0) {
      return [
        { time: '06:00', value: 0 },
        { time: '08:00', value: 0 },
        { time: '10:00', value: 0 },
        { time: '12:00', value: 0 },
        { time: '14:00', value: 0 },
        { time: '16:00', value: 0 },
        { time: '18:00', value: 0 }
      ];
    }
    return [
      { time: '06:00', value: Math.round(mobileActiveCount * 0.20) },
      { time: '08:00', value: Math.round(mobileActiveCount * 0.70) },
      { time: '10:00', value: mobileActiveCount },
      { time: '12:00', value: Math.max(1, Math.round(mobileActiveCount * 0.85)) },
      { time: '14:00', value: mobileActiveCount },
      { time: '16:00', value: Math.round(mobileActiveCount * 0.75) },
      { time: '18:00', value: Math.round(mobileActiveCount * 0.30) }
    ];
  }, [mobileActiveCount]);

  const geofenceDonutData = useMemo(() => {
    if (activeWorkforceCount === 0) {
      return [
        { name: 'All Offline', value: totalEmp > 0 ? totalEmp : 1, color: '#CBD5E1' }
      ];
    }
    return [
      { name: 'Inside Safe', value: insideSafeCount, color: '#10B981' },
      { name: 'Breaches', value: outsideCount, color: '#EF4444' }
    ].filter(d => d.value > 0);
  }, [activeWorkforceCount, insideSafeCount, outsideCount, totalEmp]);

  const statusData = [
    { name: 'On Site', value: onSiteCount, color: '#10B981' },
    { name: 'On Duty', value: Math.max(0, onDutyCount - onSiteCount), color: '#3B82F6' },
    { name: 'In Transit', value: inTransitCount, color: '#F59E0B' },
    { name: 'Offline', value: offlineCount, color: '#9CA3AF' },
  ].filter(s => s.value > 0);

  const attendanceData = [
    { time: '12 AM', onSite: Math.max(0, onSiteCount - 2), onDuty: onDutyCount, offline: offlineCount },
    { time: '4 AM',  onSite: Math.max(0, onSiteCount - 1), onDuty: onDutyCount, offline: offlineCount },
    { time: '8 AM',  onSite: onSiteCount, onDuty: onDutyCount, offline: offlineCount },
    { time: '12 PM', onSite: onSiteCount, onDuty: onDutyCount, offline: offlineCount },
    { time: '4 PM',  onSite: onSiteCount, onDuty: onDutyCount, offline: offlineCount },
    { time: '8 PM',  onSite: Math.max(0, onSiteCount - 1), onDuty: onDutyCount, offline: offlineCount },
  ];

  const feedItems = recentLogs.slice(0, 5).map(log => ({
    avatar: null,
    name: log.empName || log.employeeName || log.user || 'Field Employee',
    action: log.action || log.event || log.reason || 'GPS Telemetry Logged',
    time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
    status: log.status || (log.event === 'Exit' ? 'breach' : 'check-in'),
    color: log.event === 'Exit' ? '#EF4444' : '#3B82F6'
  }));

  // Handle focusing an employee on map
  const handleFocusEmployee = (emp) => {
    setDrilldownType(null);
    setFocusedEmployee(emp);
    const mapEl = document.getElementById('live-workforce-monitoring-section');
    if (mapEl) {
      mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="page-body">
      {/* Top Metric KPI Cards (Clickable & Fully Functional) */}
      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <ModernKpiCard
            key={i}
            {...k}
          />
        ))}
      </div>

      {/* ── Work Type & Geofence Intelligence (Fully Functional Cards with Visual Charts) ── */}
      <div style={{ marginTop: 16, marginBottom: 20 }}>
        <div className="work-type-section-header">
          <Shield size={15} color="#4F46E5" /> Work Type & Geofence Intelligence
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {/* Card 1: Fixed Site Employees (Style: Smooth Area Wave Chart) */}
          <WorkTypeGraphKpiCard
            title="Fixed Site Employees"
            value={fixedCount}
            subValue={fixedActiveCount > 0 ? "Shift Occupancy" : "All Offline"}
            unit="Staff"
            icon={Building2}
            color="#7C3AED"
            gradientId="fixedGradKpi"
            chartData={fixedChartData}
            dataKey="value"
            chartType="area"
            onClick={() => setDrilldownType('fixed_site')}
            statusBadge={{
              text: fixedActiveCount > 0 ? `${fixedCount ? Math.round((fixedActiveCount / fixedCount) * 100) : 0}% Shift Active` : '0% Active (Offline)',
              bg: fixedActiveCount > 0 ? '#F5F3FF' : '#F1F5F9',
              color: fixedActiveCount > 0 ? '#7C3AED' : '#64748B',
              border: fixedActiveCount > 0 ? '#DDD6FE' : '#E2E8F0'
            }}
            footerStats={[
              { label: 'On Site', value: fixedOnSite, highlight: fixedOnSite > 0 ? '#10B981' : undefined },
              { label: 'Sites', value: sites.length },
              { label: '20m Bldg', value: buildingSitesCount, highlight: '#7C3AED' }
            ]}
          />

          {/* Card 2: Mobile Field Employees (Style: Segmented Vertical Bar Chart) */}
          <WorkTypeGraphKpiCard
            title="Mobile Field Employees"
            value={mobileCount}
            subValue={mobileActiveCount > 0 ? "Route Telemetry" : "Fleet Offline"}
            unit="Staff"
            icon={Truck}
            color="#D97706"
            gradientId="mobileGradKpi"
            chartData={mobileChartData}
            dataKey="value"
            chartType="bar"
            onClick={() => setDrilldownType('mobile_field')}
            statusBadge={{
              text: mobileActiveCount > 0 ? `${mobileCount ? Math.round((mobileActiveCount / mobileCount) * 100) : 0}% Field Active` : '0% Field Active (Offline)',
              bg: mobileActiveCount > 0 ? '#FFFBEB' : '#F1F5F9',
              color: mobileActiveCount > 0 ? '#D97706' : '#64748B',
              border: mobileActiveCount > 0 ? '#FDE68A' : '#E2E8F0'
            }}
            footerStats={[
              { label: 'In Transit', value: mobileInTransit, highlight: mobileInTransit > 0 ? '#F59E0B' : undefined },
              { label: 'Completed', value: completedAssignments, highlight: completedAssignments > 0 ? '#10B981' : undefined },
              { label: 'Fleet Sync', value: mobileActiveCount > 0 ? '100%' : 'Standby' }
            ]}
          />

          {/* Card 3: Geofence Intelligence (Style: High-Tech Perimeter Donut Gauge) */}
          <WorkTypeGraphKpiCard
            title="Geofence Intelligence"
            value={outsideCount}
            subValue={activeWorkforceCount > 0 ? "Perimeter Status" : "Perimeter Clear"}
            unit="Alerts"
            icon={ShieldAlert}
            color={outsideCount > 0 ? '#DC2626' : (activeWorkforceCount > 0 ? '#10B981' : '#64748B')}
            gradientId="geoGradKpi"
            chartData={geofenceDonutData}
            dataKey="value"
            chartType="donut"
            onClick={() => setDrilldownType('geofence')}
            statusBadge={{
              text: activeWorkforceCount === 0
                ? 'Perimeter Inactive (All Offline)'
                : (outsideCount === 0 ? `${safePerimeterPct}% In Perimeter` : `${outsideCount} Active Alert${outsideCount > 1 ? 's' : ''}`),
              bg: activeWorkforceCount === 0 ? '#F1F5F9' : (outsideCount === 0 ? '#ECFDF5' : '#FEF2F2'),
              color: activeWorkforceCount === 0 ? '#64748B' : (outsideCount === 0 ? '#059669' : '#DC2626'),
              border: activeWorkforceCount === 0 ? '#E2E8F0' : (outsideCount === 0 ? '#A7F3D0' : '#FECACA'),
              dot: activeWorkforceCount > 0
            }}
            footerStats={[
              { label: 'Inside Safe', value: insideSafeCount, highlight: insideSafeCount > 0 ? '#10B981' : undefined },
              { label: 'Breaches', value: outsideCount, highlight: outsideCount > 0 ? '#DC2626' : '#64748B' },
              { label: 'Precision', value: '20m Fit' }
            ]}
          />
        </div>
      </div>

      {/* Premium Workforce Monitoring + Live Activity Feed (side by side) */}
      <div id="live-workforce-monitoring-section" className="workforce-row">
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
              <button className="wf-btn wf-btn-ghost" onClick={() => setTick(t => t + 1)}>
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
              <button className="wf-btn wf-btn-primary" onClick={() => setDrilldownType('all_employees')}>
                <Eye size={14} />
                <span>View All Employees</span>
              </button>
            </div>
          </div>

          <div className="workforce-layout">
            {/* Map (70%) */}
            <div className="workforce-map-wrapper">
              <MapTracking
                employees={employees}
                sites={sites}
                onFullscreen={() => setFullscreen(!fullscreen)}
                focusedEmployee={focusedEmployee}
                onClearFocus={() => setFocusedEmployee(null)}
              />
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
                  label="ACTIVE EMPLOYEES"
                  value={`${onDutyCount} Employees`}
                  subtitle={onDutyCount > 0 ? "Currently active on shift" : "No active employees on shift"}
                  color={onDutyCount > 0 ? "#10B981" : "#94A3B8"}
                  onClick={() => setDrilldownType('on_duty')}
                />
                <WorkforceInsightCard
                  icon={Clock}
                  label="EMPLOYEES ON SITE"
                  value={`${onSiteCount} Employees`}
                  subtitle={onSiteCount > 0 ? "Present on site" : "No employees on site"}
                  color={onSiteCount > 0 ? "#3B82F6" : "#94A3B8"}
                  onClick={() => setDrilldownType('on_site')}
                />
                <WorkforceInsightCard
                  icon={Truck}
                  label="EMPLOYEES IN TRANSIT"
                  value={`${inTransitCount} Employees`}
                  subtitle={inTransitCount > 0 ? "Travelling to assigned sites" : "No employees in transit"}
                  color={inTransitCount > 0 ? "#F59E0B" : "#94A3B8"}
                  onClick={() => setDrilldownType('mobile_field')}
                />
                <WorkforceInsightCard
                  icon={Shield}
                  label="GEOFENCE VIOLATIONS"
                  value={`${geofenceViolations} Alerts`}
                  subtitle={geofenceViolations > 0 ? "Outside assigned work area" : (activeWorkforceCount > 0 ? "All within designated perimeter" : "Perimeter Clear (All Offline)")}
                  color={geofenceViolations > 0 ? '#EF4444' : '#10B981'}
                  badge="View"
                  onClick={() => setDrilldownType('geofence')}
                />
                <WorkforceInsightCard
                  icon={Bot}
                  label="AI ANOMALY ALERT"
                  value={activeAnomalyCount > 0 ? `${activeAnomalyCount} Alert${activeAnomalyCount > 1 ? 's' : ''}` : "System Normal"}
                  subtitle={
                    activeAnomalyCount > 0
                      ? (activeAnomalies[0].type || activeAnomalies[0].title || `${activeAnomalyCount} anomalies detected`)
                      : (geofenceViolations > 0
                          ? "Perimeter breach flagged by AI"
                          : (activeWorkforceCount > 0 ? "AI monitoring active • Zero anomalies" : "All personnel offline • System clean"))
                  }
                  color={activeAnomalyCount > 0 ? "#EF4444" : geofenceViolations > 0 ? "#F59E0B" : (activeWorkforceCount > 0 ? "#8B5CF6" : "#10B981")}
                  badge="Inspect"
                  onClick={() => {
                    if (activeAnomalyCount > 0 || anomalies.length > 0) {
                      setDrilldownType('ai_anomalies');
                    } else {
                      navigate('/anomalies');
                    }
                  }}
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
            {feedItems.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No live activity logs recorded yet.</div>
            ) : feedItems.map((item, i) => <ActivityFeedItem key={i} {...item} />)}
          </div>
          <button className="wf-btn wf-btn-ghost feed-view-all" onClick={() => setDrilldownType('all_employees')}>
            <span>View All</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Bottom 3-column Grid */}
      <div className="bottom-grid">

        {/* Recent Location Logs */}
        <div className="widget">
          <div className="widget-header">
            <div className="widget-title">Recent Location Logs</div>
          </div>
          <div className="activity-list">
            {recentLogs.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No recent activity.</div>
            ) : recentLogs.slice(0, 5).map((a, i) => {
              const empName = a.empName || a.employeeName || a.user || 'Unknown';
              const timeStr = a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
              return (
                <div key={i} className="activity-item">
                  <div className="activity-avatar" style={{ background: '#3B82F6', overflow: 'hidden' }}>
                    {getInitials(empName)}
                  </div>
                  <div className="activity-info">
                    <div className="activity-name">{empName}</div>
                    <div className="activity-action" style={{ color: '#6B7280', fontSize: 11 }}>{a.action || a.event || a.reason || 'Location Logged'}</div>
                  </div>
                  <div className="activity-time">{timeStr}</div>
                </div>
              );
            })}
          </div>
          <button className="view-all-btn" onClick={() => setDrilldownType('all_employees')}>
            View All Activity <ArrowRight size={14} />
          </button>
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
              <Pie data={statusData.length > 0 ? statusData : [{ name: 'Offline', value: 1, color: '#E5E7EB' }]} cx={86} cy={86} innerRadius={55} outerRadius={82}
                dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                {(statusData.length > 0 ? statusData : [{ name: 'Offline', value: 1, color: '#E5E7EB' }]).map((entry, index) => (
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

      {/* Render Drilldown Modal when a KPI or Work Type Card is clicked */}
      <DashboardDrilldownModal
        type={drilldownType}
        onClose={() => setDrilldownType(null)}
        employees={employees}
        sites={sites}
        assignments={assignments}
        attendance={attendance}
        anomalies={anomalies}
        onFocusEmployee={handleFocusEmployee}
      />
    </div>
  );
}

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}