import React, { useState } from 'react';
import { Download, FileText, Calendar, TrendingUp, Users, MapPin, Clock, Activity, Search, Map, Filter, ChevronDown, CheckCircle, AlertTriangle, XCircle, Award } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MOCK_EMPLOYEES, MOCK_ATTENDANCE } from '../mockData';

const STATUS_STYLES = {
  'Completed': { bg: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'On Site':   { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Missed':    { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  'In Transit':{ bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'Offline':   { bg: '#F1F5F9', color: '#475569', dot: '#64748B' },
};

export default function ReportsPage() {
  const [employees] = useState(MOCK_EMPLOYEES);
  const [attendance] = useState(MOCK_ATTENDANCE);
  const [search, setSearch] = useState('');

  const totalEmployees = employees.length;
  const activeToday = employees.filter(e => e.status && e.status !== 'Offline').length;
  const completedVisits = attendance.filter(a => a.status === 'Completed').length;
  const attendanceRate = totalEmployees > 0 ? Math.round((activeToday / totalEmployees) * 100) : 0;

  const SUMMARY_METRICS = [
    { title: 'Total Employees', value: totalEmployees, trend: '+0%', isUp: true, color: '#3B82F6', bg: '#EFF6FF', icon: <Users size={20}/> },
    { title: 'Active Today', value: activeToday, trend: '+0%', isUp: true, color: '#10B981', bg: '#D1FAE5', icon: <Activity size={20}/> },
    { title: 'Completed Visits', value: completedVisits, trend: '+0%', isUp: true, color: '#8B5CF6', bg: '#EDE9FF', icon: <CheckCircle size={20}/> },
    { title: 'Attendance Rate', value: `${attendanceRate}%`, trend: '+0%', isUp: true, color: '#F59E0B', bg: '#FEF3C7', icon: <Clock size={20}/> },
    { title: 'Distance Traveled', value: '1,247 km', trend: '+12%', isUp: true, color: '#EF4444', bg: '#FEE2E2', icon: <Map size={20}/> },
  ];

  const filteredReports = attendance.filter(a => 
    (a.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.site_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: 8, color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <Calendar size={16} color="#64748B" /> Today <ChevronDown size={14} />
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: 8, color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <FileText size={16} color="#EF4444" /> Export PDF
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4F46E5', border: 'none', padding: '10px 16px', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(79,70,229,0.3)' }}>
          <Download size={16} /> Export Excel
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {SUMMARY_METRICS.map((m, i) => (
          <div key={i} style={{ background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.icon}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: m.isUp ? '#10B981' : '#EF4444', fontSize: 12, fontWeight: 700, background: m.isUp ? '#D1FAE5' : '#FEE2E2', padding: '4px 8px', borderRadius: 20 }}>
                {m.isUp ? <TrendingUp size={12}/> : <TrendingUp size={12} style={{ transform: 'rotate(180deg)' }}/>} {m.trend}
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{m.value}</div>
            <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500, marginTop: 4 }}>{m.title}</div>
            <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 40, opacity: 0.1, color: m.color }} preserveAspectRatio="none" viewBox="0 0 100 100">
              <path d={m.isUp ? "M0,100 L0,80 L20,60 L40,70 L60,30 L80,40 L100,10 L100,100 Z" : "M0,100 L0,10 L20,40 L40,30 L60,70 L80,60 L100,80 L100,100 Z"} fill="currentColor"/>
            </svg>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
          <Users size={16} color="#94A3B8" />
          <select style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#334155', background: 'transparent', fontWeight: 500 }}><option>All Employees</option></select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
          <MapPin size={16} color="#94A3B8" />
          <select style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#334155', background: 'transparent', fontWeight: 500 }}><option>All Sites & Zones</option></select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
          <Filter size={16} color="#94A3B8" />
          <select style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#334155', background: 'transparent', fontWeight: 500 }}><option>All Statuses</option></select>
        </div>
        <button style={{ background: '#4F46E5', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Generate Report
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Attendance Overview</h3>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Last 7 Days</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 200, gap: 16 }}>
            {[60, 80, 40, 90, 70, 85, attendanceRate].map((h, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: '100%', height: 160, background: '#F1F5F9', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${h}%`, background: '#3B82F6', borderRadius: 6 }}></div>
                </div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{['M','T','W','T','F','S','Today'][i]}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Employee Activity</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}><div style={{width:8,height:8,borderRadius:4,background:'#10B981'}}></div> Check-ins</span>
              <span style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}><div style={{width:8,height:8,borderRadius:4,background:'#8B5CF6'}}></div> Visits</span>
            </div>
          </div>
          <div style={{ height: 200, width: '100%', position: 'relative' }}>
            <svg viewBox="0 0 400 160" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <polyline points="0,140 60,100 120,120 180,60 240,80 300,40 360,90 400,30" fill="none" stroke="#10B981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="0,100 60,130 120,90 180,110 240,50 300,70 360,20 400,60" fill="none" stroke="#8B5CF6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              {['8AM','10AM','12PM','2PM','4PM','6PM'].map(t => <div key={t} style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{t}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', padding: 0, borderRadius: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>GPS Tracking & Heatmap</h3>
          <button style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>View Full Screen Map</button>
        </div>
        <div style={{ height: 400, width: '100%' }}>
          <MapContainer center={[14.605, 120.99]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={true}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            <Polyline positions={[[14.60, 120.98], [14.61, 120.99], [14.62, 120.995]]} color="#4F46E5" weight={4} opacity={0.7} />
            <Polyline positions={[[14.59, 120.98], [14.58, 120.97], [14.57, 121.00]]} color="#10B981" weight={4} opacity={0.7} dashArray="8, 8" />
            <CircleMarker center={[14.62, 120.995]} radius={6} color="white" weight={2} fillColor="#4F46E5" fillOpacity={1} />
            <CircleMarker center={[14.57, 121.00]} radius={6} color="white" weight={2} fillColor="#10B981" fillOpacity={1} />
          </MapContainer>
        </div>
      </div>

      <div style={{ background: 'white', padding: 0, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Detailed Reports Table</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 12px', background: '#F8FAFC' }}>
            <Search size={14} color="#94A3B8" />
            <input placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13 }} />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr>{['EMPLOYEE', 'SITE', 'ARRIVAL', 'DEPARTURE', 'DURATION', 'STATUS', 'DISTANCE'].map(h => (<th key={h} style={{ padding: '14px 24px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>{h}</th>))}</tr>
          </thead>
          <tbody>
            {filteredReports.length === 0 && (<tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>No reports loaded.</td></tr>)}
            {filteredReports.map((row, i) => {
              const statusStyle = STATUS_STYLES[row.status] || STATUS_STYLES['Offline'];
              return (
                <tr key={row.id || i} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.background='#F8FAFC'} onMouseOut={e => e.currentTarget.style.background='white'}>
                  <td style={{ padding: '16px 24px', fontWeight: 600, color: '#0F172A' }}>{row.employee_name}</td>
                  <td style={{ padding: '16px 24px', color: '#475569' }}>{row.site_name || '—'}</td>
                  <td style={{ padding: '16px 24px', color: '#64748B', fontWeight: 500 }}>{row.check_in || '—'}</td>
                  <td style={{ padding: '16px 24px', color: '#64748B', fontWeight: 500 }}>{row.check_out || '—'}</td>
                  <td style={{ padding: '16px 24px', color: '#475569', fontWeight: 600 }}>{row.duration || '—'}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: statusStyle.bg, color: statusStyle.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.dot }}></div>
                      {row.status || 'Offline'}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', color: '#0F172A', fontWeight: 600 }}>{Math.round(Math.random() * 50 + 5)} km</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748B', fontSize: 13 }}>
          <div>Showing {filteredReports.length} entries</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ border: '1px solid #E2E8F0', background: 'white', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }}>Prev</button>
            <button style={{ border: '1px solid #4F46E5', background: '#4F46E5', color: 'white', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>1</button>
            <button style={{ border: '1px solid #E2E8F0', background: 'white', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }}>Next</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        {[
          { title: 'Top Performing Employees', label: 'Completed Visits', items: [{n:'Sarah J.', v:'42'},{n:'David W.', v:'38'},{n:'Emma B.', v:'35'}] },
          { title: 'Most Visited Sites', label: 'Check-ins', items: [{n:'Greenfield Mall', v:'124'},{n:'Central Station', v:'89'},{n:'Riverside', v:'76'}] },
          { title: 'Longest Distance Traveled', label: 'Kilometers', items: [{n:'Robert W.', v:'420 km'},{n:'Mark T.', v:'385 km'},{n:'Lisa R.', v:'312 km'}] },
        ].map((card, idx) => (
          <div key={idx} style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Award size={18} color="#F59E0B" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{card.title}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {card.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: i===0?'#F59E0B':i===1?'#94A3B8':'#B45309' }}>#{i+1}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{it.n}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', background: '#F8FAFC', padding: '2px 8px', borderRadius: 4 }}>{it.v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}