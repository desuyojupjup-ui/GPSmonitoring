import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, Building2, Users, ShieldAlert, CheckCircle2, Send,
  Radio, AlertTriangle, Power, PauseCircle, LifeBuoy, X, Clock
} from 'lucide-react';
import {
  db, collection, onSnapshot, addDoc, query, serverTimestamp,
  recordSystemActivityLog
} from '../firebase';
import { showToast } from '../utils/toast';
import { isCompanyAdmin, isDeveloper } from '../utils/roles';
import { useCompany, DEFAULT_COMPANY_ID } from '../utils/companyContext';

const cardStyle = {
  backgroundColor: '#FFFFFF',
  padding: '20px',
  borderRadius: '14px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: '1px solid #E2E8F0',
};

const STATUS_STYLE = {
  'Active':    { background: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  'Pending':   { background: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  'Suspended': { background: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  'Inactive':  { background: '#F1F5F9', color: '#475569', dot: '#94A3B8' },
};

/**
 * Developer Portal — System-Wide Monitoring & Customer Support (/developer/monitoring)
 *
 * Gives the system provider high-level health, tenant seat utilization, online telemetry counts,
 * open alert counters, and system-wide support broadcasts across subscribed companies —
 * without logging into or operating any customer's Company Admin Portal.
 */
export default function DeveloperMonitoring() {
  const { companies, updateCompany, user: currentUser } = useCompany();

  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [delays, setDelays] = useState([]);
  const [loading, setLoading] = useState(true);

  // Support Notice Modal
  const [supportModal, setSupportModal] = useState(false);
  const [sendingSupport, setSendingSupport] = useState(false);
  const [supportForm, setSupportForm] = useState({
    targetCompanyId: 'ALL_ACTIVE',
    title: '',
    message: '',
    priority: 'Info',
  });

  useEffect(() => {
    setLoading(true);
    const unsubEmp = onSnapshot(query(collection(db, 'employees')), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubAnom = onSnapshot(query(collection(db, 'ai_analysis')), (snap) => {
      setAnomalies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {});
    const unsubDelays = onSnapshot(query(collection(db, 'delay_reports')), (snap) => {
      setDelays(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {});

    return () => {
      unsubEmp();
      unsubUsers();
      unsubAnom();
      unsubDelays();
    };
  }, []);

  const onlineEmployeesTotal = useMemo(
    () => employees.filter((e) => e.isOnline === true || e.status === 'Online' || e.status === 'On Duty').length,
    [employees]
  );

  const openAnomaliesTotal = useMemo(
    () => anomalies.filter((a) => !['resolved', 'dismissed'].includes(String(a.status || '').toLowerCase())).length,
    [anomalies]
  );

  const openDelaysTotal = useMemo(
    () => delays.filter((d) => !['resolved', 'closed'].includes(String(d.status || '').toLowerCase())).length,
    [delays]
  );

  const openSupportDialog = (companyId = 'ALL_ACTIVE') => {
    setSupportForm({
      targetCompanyId: companyId,
      title: '',
      message: '',
      priority: 'Info',
    });
    setSupportModal(true);
  };

  const handleSendSupportNotice = async () => {
    if (!supportForm.title.trim() || !supportForm.message.trim()) {
      return showToast('Validation Error', 'Subject and Message are required.', 'error');
    }

    const targets = supportForm.targetCompanyId === 'ALL_ACTIVE'
      ? companies.filter((c) => (c.status || 'Active') === 'Active')
      : companies.filter((c) => c.id === supportForm.targetCompanyId);

    if (targets.length === 0) {
      return showToast('No Target Companies', 'No matching active companies found to receive this support notice.', 'warning');
    }

    setSendingSupport(true);
    try {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const nowDate = new Date().toLocaleDateString();

      await Promise.all(
        targets.map((comp) =>
          addDoc(collection(db, 'notifications'), {
            title: `[SUBAI System Support] ${supportForm.title.trim()}`,
            message: supportForm.message.trim(),
            type: supportForm.priority === 'Urgent' ? 'alert' : 'system',
            category: 'System Support',
            severity: supportForm.priority === 'Urgent' ? 'High' : 'Normal',
            sender: 'SUBAI System Provider',
            companyId: comp.id,
            companyName: comp.name,
            status: 'Unread',
            read: false,
            time: nowTime,
            date: nowDate,
            createdAt: serverTimestamp(),
            timestamp: serverTimestamp(),
          })
        )
      );

      await recordSystemActivityLog({
        action: `Sent system support notice "${supportForm.title.trim()}" to ${targets.length === 1 ? targets[0].name : `${targets.length} active companies`}`,
        module: 'System',
        status: 'Success',
        user: currentUser?.email || 'developer@subai.com',
        companyId: targets.length === 1 ? targets[0].id : DEFAULT_COMPANY_ID,
      }).catch(() => {});

      showToast(
        'Support Notice Dispatched',
        `Delivered to ${targets.length === 1 ? targets[0].name : `${targets.length} active companies`} in real time.`,
        'success'
      );
      setSupportModal(false);
    } catch (e) {
      showToast('Send Failed', e.message || 'Could not dispatch support notice.', 'error');
    } finally {
      setSendingSupport(false);
    }
  };

  const handleQuickStatus = async (comp, nextStatus) => {
    try {
      await updateCompany(comp.id, { status: nextStatus, subscriptionStatus: nextStatus });
      showToast(
        nextStatus === 'Active' ? 'Company Activated' : 'Company Suspended',
        `${comp.name} status updated to ${nextStatus}.`,
        nextStatus === 'Active' ? 'success' : 'warning'
      );
    } catch (e) {
      showToast('Update Failed', e.message || 'Could not update company status.', 'error');
    }
  };

  return (
    <div style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #0C4A6E 100%)',
        borderRadius: 16,
        padding: '20px 24px',
        color: '#FFFFFF',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.45)',
            color: '#6EE7B7', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, marginBottom: 8
          }}>
            <Radio size={12} /> SYSTEM-WIDE MONITORING &amp; SUPPORT
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800 }}>Platform Health &amp; Multi-Tenant Support</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#CBD5E1' }}>
            Real-time aggregate health, seat usage, and direct support messaging across all subscribed SUBAI companies.
          </p>
        </div>
        <button
          onClick={() => openSupportDialog('ALL_ACTIVE')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: '#0EA5E9', color: '#FFFFFF', border: 'none',
            borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer'
          }}
        >
          <LifeBuoy size={16} /> Broadcast Support Notice
        </button>
      </div>

      {/* System-Wide KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>FIREBASE CLOUD STATUS</span>
            <CheckCircle2 size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#065F46', marginTop: 8 }}>Operational</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Real-time Firestore sync live</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>LIVE FIELD DEVICES</span>
            <Activity size={18} color="#0284C7" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginTop: 8 }}>{onlineEmployeesTotal}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>of {employees.length} registered employees</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>OPEN AI ANOMALIES</span>
            <ShieldAlert size={18} color="#DC2626" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: openAnomaliesTotal > 0 ? '#DC2626' : '#0F172A', marginTop: 8 }}>{openAnomaliesTotal}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Aggregate across client companies</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>ACTIVE DELAY REPORTS</span>
            <Clock size={18} color="#D97706" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#D97706', marginTop: 8 }}>{openDelaysTotal}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Field incidents reported today</div>
        </div>
      </div>

      {/* Per-Company Health & Support Table */}
      <div style={cardStyle}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Company Tenant Health &amp; Support Matrix</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
            Monitor subscription seat utilization, online workers, open alerts, and reach company admins directly for system support.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>
                <th style={{ padding: '10px 14px' }}>Company &amp; Plan</th>
                <th style={{ padding: '10px 14px' }}>Seat Utilization</th>
                <th style={{ padding: '10px 14px' }}>Online Now</th>
                <th style={{ padding: '10px 14px' }}>Portal Accounts</th>
                <th style={{ padding: '10px 14px' }}>Open Alerts</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Support Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#64748B' }}>Syncing platform telemetry...</td></tr>
              ) : companies.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#64748B' }}>No companies registered yet.</td></tr>
              ) : (
                companies.map((comp) => {
                  const compEmps = employees.filter((e) => (e.companyId || DEFAULT_COMPANY_ID) === comp.id);
                  const compOnline = compEmps.filter((e) => e.isOnline === true || e.status === 'Online' || e.status === 'On Duty').length;
                  const compAdmins = users.filter((u) => isCompanyAdmin(u) && (u.companyId || DEFAULT_COMPANY_ID) === comp.id).length;
                  const compStaff = users.filter((u) => !isDeveloper(u) && !isCompanyAdmin(u) && (u.companyId || DEFAULT_COMPANY_ID) === comp.id).length;
                  const compAlerts = anomalies.filter(
                    (a) => (a.companyId || DEFAULT_COMPANY_ID) === comp.id && !['resolved', 'dismissed'].includes(String(a.status || '').toLowerCase())
                  ).length;
                  const maxSeats = Number(comp.maxEmployees) || 100;
                  const seatPct = Math.min(100, Math.round((compEmps.length / maxSeats) * 100));
                  const status = comp.status || 'Active';
                  const st = STATUS_STYLE[status] || STATUS_STYLE.Active;

                  return (
                    <tr key={comp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {comp.logoUrl ? (
                            <div style={{ width: 46, height: 34, borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                              <img src={comp.logoUrl} alt={comp.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          ) : (
                            <div style={{ width: 46, height: 34, borderRadius: 8, background: '#EFF6FF', border: '1px solid #DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E5ADB', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                              {(comp.name || 'C').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{comp.name}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{comp.plan || 'Business'} Plan &bull; Owner: {comp.ownerName || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', minWidth: 160 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                          {compEmps.length} / {maxSeats} Employees ({seatPct}%)
                        </div>
                        <div style={{ width: '100%', height: 6, background: '#E2E8F0', borderRadius: 6, marginTop: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${seatPct}%`, height: '100%', background: seatPct >= 90 ? '#DC2626' : '#0EA5E9', borderRadius: 6 }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: compOnline > 0 ? '#059669' : '#64748B' }}>
                        {compOnline} Online
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#334155' }}>
                        <strong>{compAdmins}</strong> Admin{compAdmins === 1 ? '' : 's'} &bull; <strong>{compStaff}</strong> User{compStaff === 1 ? '' : 's'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {compAlerts > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700 }}>
                            <AlertTriangle size={11} /> {compAlerts} Open
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#10B981', fontWeight: 700 }}>Healthy</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.background, color: st.color }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => openSupportDialog(comp.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0369A1', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            <Send size={11} /> Support Notice
                          </button>
                          {status !== 'Active' ? (
                            <button
                              onClick={() => handleQuickStatus(comp, 'Active')}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 6, border: '1px solid #6EE7B7', background: '#ECFDF5', color: '#065F46', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <Power size={11} /> Activate
                            </button>
                          ) : comp.id !== DEFAULT_COMPANY_ID ? (
                            <button
                              onClick={() => handleQuickStatus(comp, 'Suspended')}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 6, border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <PauseCircle size={11} /> Suspend
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send Support Notice Modal */}
      {supportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px 16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Dispatch System Support Notice</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
                  Delivers an official notification directly to the selected company&apos;s Admin Portal.
                </p>
              </div>
              <button onClick={() => setSupportModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Target Customer</label>
                <select
                  value={supportForm.targetCompanyId}
                  onChange={(e) => setSupportForm({ ...supportForm, targetCompanyId: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', fontWeight: 600, boxSizing: 'border-box' }}
                >
                  <option value="ALL_ACTIVE">All Active Subscribed Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.status || 'Active'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Priority</label>
                <select
                  value={supportForm.priority}
                  onChange={(e) => setSupportForm({ ...supportForm, priority: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#FFFFFF', boxSizing: 'border-box' }}
                >
                  <option value="Info">Standard Notice</option>
                  <option value="Urgent">Urgent Maintenance / Account Alert</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Subject *</label>
                <input
                  value={supportForm.title}
                  onChange={(e) => setSupportForm({ ...supportForm, title: e.target.value })}
                  placeholder="e.g. Scheduled Maintenance or Subscription Renewal"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Message *</label>
                <textarea
                  rows={4}
                  value={supportForm.message}
                  onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                  placeholder="Write your system support update for the Company Admin..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setSupportModal(false)} disabled={sendingSupport} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSendSupportNotice} disabled={sendingSupport} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#FFFFFF', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                {sendingSupport ? 'Dispatching...' : 'Send Support Notice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

