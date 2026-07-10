import React, { useState } from 'react';
import { Download, FileText, Calendar, Users, MapPin, CheckCircle, Search, Filter, ChevronDown } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MOCK_EMPLOYEES, MOCK_SITES, MOCK_LOCATIONS, MOCK_ATTENDANCE, MOCK_ACTIVITY_LOGS } from '../mockData';

const STATUS_STYLES = {
  'Completed': { bg: '#F3E8FF', color: '#7E22CE', dot: '#A855F7' },
  'On Site':   { bg: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Checked In':{ bg: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
  'Late':      { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Absent':    { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  'Offline':   { bg: '#F1F5F9', color: '#475569', dot: '#64748B' },
};

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function MapFitBounds({ boundsLocations }) {
  const map = useMap();
  const [hasFit, setHasFit] = useState(false);
  useEffect(() => {
    if (boundsLocations.length > 0 && !hasFit) {
      try {
        const bounds = L.latLngBounds(boundsLocations.map(loc => [loc.lat, loc.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch (e) {
        console.warn('MapFitBounds:', e);
      }
      setHasFit(true);
    }
  }, [boundsLocations, map, hasFit]);
  return null;
}

export default function Attendance() {
  const [attendance] = useState(MOCK_ATTENDANCE);
  const [employees] = useState(MOCK_EMPLOYEES);
  const [sites] = useState(MOCK_SITES);
  const [locations] = useState(MOCK_LOCATIONS);
  const [logs] = useState(MOCK_ACTIVITY_LOGS.slice(0, 10));
  const [search, setSearch] = useState('');

  const filteredAtt = attendance.filter(a => 
    (a.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.site_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const presentCount = employees.filter(e => e.status !== 'Offline').length;
  const lateCount = attendance.filter(a => a.status === 'Late').length;
  const absentCount = employees.filter(e => e.status === 'Offline').length;
  const onSiteCount = employees.filter(e => e.status === 'On Site').length;
  const checkedOutCount = attendance.filter(a => a.status === 'Completed').length;

  const SUMMARY_METRICS = [
    { title: 'Present', value: presentCount, trend: '+0%', isUp: true, color: '#10B981', bg: '#D1FAE5', icon: <CheckCircle size={20}/> },
    { title: 'Late', value: lateCount, trend: '0%', isUp: false, color: '#F59E0B', bg: '#FEF3C7', icon: <Clock size={20}/> },
    { title: 'Absent', value: absentCount, trend: '0%', isUp: null, color: '#EF4444', bg: '#FEE2E2', icon: <XCircle size={20}/> },
    { title: 'On Site', value: onSiteCount, trend: '+0%', isUp: true, color: '#3B82F6', bg: '#DBEAFE', icon: <MapPin size={20}/> },
    { title: 'Checked Out', value: checkedOutCount, trend: '+0%', isUp: true, color: '#64748B', bg: '#F1F5F9', icon: <StopCircle size={20}/> },
  ];

  const totalEmps = employees.length || 1;
  const presentRate = Math.round((presentCount / totalEmps) * 100);
  const mappableLocations = employees.filter(e => locations[e.id]).map(emp => locations[emp.id]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: 8, color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Calendar size={16} color="#64748B" /> Today <ChevronDown size={14} />
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: 8, color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <FileText size={16} color="#EF4444" /> Export PDF
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: 8, color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Download size={16} color="#10B981" /> Export Excel
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4F46E5', border: 'none', padding: '10px 16px', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <RefreshCw size={16} /> Generate Report
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {SUMMARY_METRICS.map((m, i) => (
          <div key={i} style={{ background: 'white', padding: '16px 20px', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{m.icon}</div>
            <div>
              <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, marginBottom: 2 }}>{m.title}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{m.value}</div>
              <div style={{ color: m.isUp === true ? '#10B981' : m.isUp === false ? '#EF4444' : '#64748B', fontSize: 11, fontWeight: 600, marginTop: 4 }}>
                {m.isUp === true ? '↑' : m.isUp === false ? '↓' : ''} {m.trend} <span style={{ color: '#94A3B8', fontWeight: 500 }}>vs yesterday</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24 }}>
        <div style={{ background: 'white', padding: 0, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Live Status</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#10B981', fontWeight: 600, background: '#D1FAE5', padding: '4px 10px', borderRadius: 20 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}></div> Live
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 340 }}>
            {employees.filter(e => e.status !== 'Offline').length === 0 ? (
               <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No employees currently active.</div>
            ) : employees.filter(e => e.status !== 'Offline').map(emp => {
              const statusStyle = STATUS_STYLES[emp.status] || STATUS_STYLES['Offline'];
              return (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderBottom: '1px solid #F8FAFC' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: statusStyle.dot, border: '3px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {emp.profilePic ? (<img src={emp.profilePic} alt={emp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : (<span style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>{getInitials(emp.name)}</span>)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{emp.name}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{emp.department || 'Field Employee'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: statusStyle.color, background: statusStyle.bg, padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 4 }}>{emp.status}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>Live</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', overflow: 'hidden', height: '100%', minHeight: 400, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 400, background: 'white', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>Live Field Map</div>
          <MapContainer center={[14.605, 120.99]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            <MapFitBounds boundsLocations={mappableLocations} />
            {sites.map(s => {
              const r = typeof s.radius === 'string' ? parseInt(s.radius.replace('m', '')) : (s.radius || 300);
              return s.lat && s.lng ? (<Circle key={s.id} center={[s.lat, s.lng]} radius={r} pathOptions={{ color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.1, weight: 1.5 }} />) : null;
            })}
            {employees.filter(e => locations[e.id]).map(emp => {
              const loc = locations[emp.id];
              const color = (STATUS_STYLES[emp.status] || STATUS_STYLES['Offline']).dot;
              return (
                <CircleMarker key={emp.id} center={[loc.lat, loc.lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }} />
              );
            })}
          </MapContainer>
        </div>
      </div>

      <div style={{ background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[{ label: 'Employee', icon: <Users size={16}/> }, { label: 'Department', icon: <Users size={16}/> }, { label: 'Site', icon: <MapPin size={16}/> }, { label: 'Status', icon: <Filter size={16}/> }, { label: 'Date Range', icon: <Calendar size={16}/> }].map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 150, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
            <span style={{ color: '#94A3B8' }}>{f.icon}</span>
            <select style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#334155', background: 'transparent', fontWeight: 500 }}><option>{f.label} ▼</option></select>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ background: 'white', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Reset</button>
          <button style={{ background: '#4F46E5', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Apply Filter</button>
        </div>
      </div>

      <div style={{ background: 'white', padding: 0, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Attendance Records</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 12px', background: '#F8FAFC' }}>
            <Search size={14} color="#94A3B8" />
            <input placeholder="Search attendance..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13 }} />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr>{['EMPLOYEE', 'SITE', 'CHECK IN', 'CHECK OUT', 'DURATION', 'STATUS', 'VERIFICATION'].map(h => (<th key={h} style={{ padding: '14px 24px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>{h}</th>))}</tr>
          </thead>
          <tbody>
            {filteredAtt.length === 0 && (<tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>No attendance records loaded.</td></tr>)}
            {filteredAtt.map((row, i) => {
              const statusStyle = STATUS_STYLES[row.status] || STATUS_STYLES['Offline'];
              return (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
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
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: row.verification === 'Verified' ? '#10B981' : '#F59E0B', fontWeight: 600, fontSize: 12 }}>
                      {row.verification === 'Verified' && <CheckCircle size={14}/>} {row.verification || 'System'}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748B', fontSize: 13 }}>
          <div>Showing {filteredAtt.length} entries</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ border: '1px solid #E2E8F0', background: 'white', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }}>Prev</button>
            <button style={{ border: '1px solid #4F46E5', background: '#4F46E5', color: 'white', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>1</button>
            <button style={{ border: '1px solid #E2E8F0', background: 'white', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }}>Next</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 24 }}>
        <div style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 24px 0' }}>Attendance Distribution</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 180, gap: 16 }}>
            {[
              { label: 'Present', val: presentRate || 80, col: '#10B981' },
              { label: 'Late', val: Math.round((lateCount/totalEmps)*100) || 10, col: '#F59E0B' },
              { label: 'Absent', val: Math.round((absentCount/totalEmps)*100) || 10, col: '#EF4444' },
            ].map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: '100%', height: 140, background: '#F1F5F9', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${b.val}%`, background: b.col, borderRadius: 6 }}></div>
                </div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 24px 0', alignSelf: 'flex-start' }}>Overall Attendance</h3>
          <div style={{ position: 'relative', width: 160, height: 160, borderRadius: '50%', background: `conic-gradient(#10B981 0% ${presentRate}%, #F1F5F9 ${presentRate}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 120, height: 120, background: 'white', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A' }}>{presentRate}%</div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Rate Today</div>
            </div>
          </div>
        </div>
        <div style={{ background: 'white', padding: 24, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9', overflow: 'hidden' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 24px 0' }}>Recent Logs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', maxHeight: 180, overflowY: 'auto' }}>
            <div style={{ position: 'absolute', left: 4, top: 10, bottom: 10, width: 2, background: '#E2E8F0' }}></div>
            {logs.length === 0 && <div style={{ color: '#94A3B8', fontSize: 13, marginLeft: 16 }}>No recent logs.</div>}
            {logs.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3B82F6', border: '2px solid white', marginTop: 4, outline: '2px solid #F8FAFC' }}></div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{log.user} - {log.action}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{log.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}