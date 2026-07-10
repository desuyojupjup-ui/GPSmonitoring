import React, { useState } from 'react';
import { Search, Maximize, Download, Info, AlertCircle, XCircle } from 'lucide-react';
import { MOCK_ACTIVITY_LOGS } from '../mockData';

const STATUS_STYLE = {
  'Success': { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Warning': { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Error':   { background: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  'Info':    { background: '#DBEAFE', color: '#1E40AF', dot: '#3B82F6' },
};

export default function ActivityLogs() {
  const [data] = useState(MOCK_ACTIVITY_LOGS);
  const [search, setSearch] = useState('');

  const filtered = data.filter(d =>
    (d.action || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.user || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.module || '').toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    success: data.filter(d => d.status === 'Success' || d.status === 'Info').length,
    warning: data.filter(d => d.status === 'Warning').length,
    error: data.filter(d => d.status === 'Error').length,
    total: data.length || 1,
  };

  return (
    <>
      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        
        <div className="widget" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: 16, borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
              <Search size={14} color="#9CA3AF" />
              <input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: 13, color: '#374151' }} />
            </div>
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Modules</option>
            </select>
            <select style={{ padding: '9px 12px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: 'white' }}>
              <option>All Events</option>
            </select>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 6, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Maximize size={14} /> Full Screen
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#F9FAFB' }}>
              <tr>
                {['TIMESTAMP','USER/SYSTEM','MODULE','ACTION DETAILS','STATUS'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const style = STATUS_STYLE[row.status] || STATUS_STYLE['Info'];
                const timeStr = row.time || '—';
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 12 }}>{timeStr}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>{row.user || 'System'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background:'#F3F4F6', color:'#374151', padding:'4px 10px', borderRadius:6, fontWeight:500, fontSize:11 }}>{row.module || 'General'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{row.action}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: style.background, color: style.color, padding: '4px 10px', borderRadius: 20, fontWeight: 600, fontSize: 11 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot }}></div>
                        {row.status || 'Info'}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14, fontWeight: 500 }}>
              No logs match your search.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Showing {filtered.length} logs</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>«</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>‹</button>
              <button style={{ border: 'none', background: '#1E5ADB', color: 'white', borderRadius: 4, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>1</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>›</button>
              <button style={{ border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer' }}>»</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="widget" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Log Statistics</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Info / Success', count: stats.success, pct: ((stats.success / stats.total) * 100).toFixed(1) + '%', color: '#10B981', bg: '#D1FAE5', icon: <Info size={14}/> },
                { label: 'Warnings',       count: stats.warning, pct: ((stats.warning / stats.total) * 100).toFixed(1) + '%', color: '#F59E0B', bg: '#FEF3C7', icon: <AlertCircle size={14}/> },
                { label: 'Errors',         count: stats.error, pct: ((stats.error / stats.total) * 100).toFixed(1) + '%', color: '#EF4444', bg: '#FEE2E2', icon: <XCircle size={14}/> },
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
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Export Tools</div>
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#1E5ADB', border: '1px solid #1E5ADB', borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>
              <Download size={16} /> Export Logs (CSV)
            </button>
          </div>
        </div>
      </div>
    </>
  );
}