import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy, limit, getCleanEmployeeEmail } from '../firebase';
import { getLiveStatus } from '../services/securityService';
import { getDeviceId } from '../services/deviceInfo';
import { SECURITY, RISK } from '../services/securityConfig';
import { calculateRiskScore } from '../services/securityRiskScorer';

// ─── Event type label map ──────────────────────────────────────────────────
const EVENT_LABELS = {
  FAKE_GPS_DETECTED: { label: 'Fake GPS', icon: 'navigate-circle', color: '#EF4444' },
  VPN_DETECTED: { label: 'VPN Usage', icon: 'shield-half', color: '#8B5CF6' },
  DEVICE_INTEGRITY_VIOLATION: { label: 'Device Integrity', icon: 'phone-portrait', color: '#DC2626' },
  GPS_SPEED_ANOMALY: { label: 'Speed Anomaly', icon: 'speedometer', color: '#F59E0B' },
  GPS_JUMP: { label: 'Location Jump', icon: 'location', color: '#F59E0B' },
  LOCATION_FROZEN: { label: 'Location Frozen', icon: 'pause-circle', color: '#6B7280' },
  GPS_DISABLED: { label: 'GPS Disabled', icon: 'navigate-outline', color: '#94A3B8' },
  UNAUTHORIZED_LOCATION: { label: 'Unauthorized Location', icon: 'warning', color: '#DC2626' },
  REPEATED_FACIAL_VERIFICATION_FAILURE: { label: 'Repeated Facial Failures', icon: 'scan', color: '#EF4444' },
  MULTIPLE_SECURITY_SIGNALS: { label: 'Multiple Signals', icon: 'alert-circle', color: '#7C3AED' },
  UNUSUAL_GPS_ACCURACY: { label: 'Low GPS Accuracy', icon: 'radio', color: '#94A3B8' },
  SUSPICIOUS_MOVEMENT: { label: 'Suspicious Movement', icon: 'walk', color: '#F59E0B' },
};

function StatusRow({ icon, label, value, good }) {
  const color = good === null ? '#9CA3AF' : good ? '#10B981' : '#EF4444';
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
        <Text style={[styles.badgeText, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function RiskScoreBar({ score, level }) {
  const width = `${score}%`;
  return (
    <View style={styles.riskBar}>
      <View style={[styles.riskFill, { width, backgroundColor: level.color }]} />
    </View>
  );
}

export default function SecurityStatusScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [employee, setEmployee] = useState(null);
  const [site, setSite] = useState(null);
  const [status, setStatus] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [deviceApproved, setDeviceApproved] = useState(null);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const email = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);

  // Resolve employee + site + live security events
  useEffect(() => {
    let unsubEvents = () => {};
    let unsubDev = () => {};

    (async () => {
      try {
        const empSnap = await getDocs(collection(db, 'employees'));
        const cleanEmail = (email || '').trim().toLowerCase();
        let emp = empSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(e => (e.email || '').trim().toLowerCase() === cleanEmail);

        if (!emp) {
          emp = {
            id: auth.currentUser?.uid || 'emp_fallback',
            name: auth.currentUser?.displayName || 'Jupiter Desuyo',
            email: email || 'jupiter@gmail.com',
            employeeType: 'Field Employee',
          };
        }
        setEmployee(emp);

        // Match assignment
        const assignSnap = await getDocs(collection(db, 'Assignments'));
        const activeAsg = assignSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(a => (a.empName === emp.name || a.employeeEmail === emp.email) && (a.status || '').toLowerCase() === 'active');

        if (activeAsg && activeAsg.site) {
          const siteSnap = await getDocs(collection(db, 'Sites'));
          const s = siteSnap.docs.map(d => ({ id: d.id, ...d.data() })).find(st => st.name === activeAsg.site);
          if (s) setSite(s);
        }

        // Live security anomalies listener from ai_analysis (Allowed by security rules & connected to Admin Anomaly Center)
        unsubEvents = onSnapshot(
          collection(db, 'ai_analysis'),
          (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Match current employee strictly
            const mine = all.filter(e => {
              const eId = (e.employeeId || e.userId || '').toString().trim().toLowerCase();
              const eEmail = (e.employeeEmail || e.email || '').toString().trim().toLowerCase();
              const eName = (e.employeeName || '').toString().trim().toLowerCase();

              const myIds = [emp?.id, emp?.idNum, emp?.empId, emp?.employeeId, auth.currentUser?.uid]
                .filter(x => Boolean(x) && x !== 'emp_fallback').map(x => String(x).trim().toLowerCase());
              const myEmails = [emp?.email, email, auth.currentUser?.email]
                .filter(Boolean).map(x => String(x).trim().toLowerCase());
              const myName = (emp?.name || auth.currentUser?.displayName || '').trim().toLowerCase();

              if (eId && myIds.length > 0) return myIds.includes(eId);
              if (eEmail && myEmails.length > 0) return myEmails.includes(eEmail);
              if (!eId && !eEmail && eName && myName) return eName === myName;
              return false;
            });
            mine.sort((a, b) => {
              const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.timestamp || 0);
              const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.timestamp || 0);
              return tb - ta;
            });
            setSecurityEvents(mine.slice(0, 20));
            setLoading(false);
          },
          (err) => {
            console.warn('[SecurityStatus] ai_analysis listener:', err?.message);
            setLoading(false);
          }
        );

        // Device approval
        const id = await getDeviceId();
        setDeviceId(id);
        unsubDev = onSnapshot(
          collection(db, SECURITY.COLLECTIONS.DEVICE_REGISTRY),
          (snap) => {
            const mine = snap.docs.map(d => d.data()).find(r => r.deviceId === id);
            setDeviceApproved(mine ? mine.status === 'approved' : true);
          },
          () => setDeviceApproved(true)
        );
      } catch (e) {
        console.warn('[SecurityStatusScreen] init error:', e?.message);
        setLoading(false);
      }
    })();

    return () => { unsubEvents(); unsubDev(); };
  }, [email]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const s = await getLiveStatus({ employee, site });
    setStatus(s);
    setRefreshing(false);
  }, [employee, site]);

  // Always refresh live security checks on mount and when employee or site changes
  useEffect(() => {
    refresh();
  }, [employee, site, refresh]);

  // Compute risk score from live security_events
  const { score, level, breakdown, recentCount } = useMemo(
    () => calculateRiskScore(securityEvents, 24),
    [securityEvents]
  );

  const pendingEvents = securityEvents.filter(e => e.status === 'pending_review');
  const criticalEvents = securityEvents.filter(e => e.severity === 'Critical' || e.severity === 'High');

  const parseTs = (ts) => {
    if (!ts) return null;
    if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
    if (typeof ts?.toDate === 'function') {
      try { const d = ts.toDate(); if (d instanceof Date && !isNaN(d.getTime())) return d; } catch(e){}
    }
    if (typeof ts === 'number') { const d = new Date(ts); return isNaN(d.getTime()) ? null : d; }
    if (typeof ts === 'object' && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? null : d; }
    return null;
  };

  const formatTime = (ts) => {
    if (!ts) return '—';
    if (typeof ts === 'string' && /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(ts.trim())) return ts.trim();
    const d = parseTs(ts);
    return d ? d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = parseTs(ts);
    return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Security Status</Text>
          <Text style={styles.headerSub}>Live anti-spoofing monitoring</Text>
        </View>
        <TouchableOpacity onPress={refresh} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#4F46E5" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Risk Score Card */}
        <View style={styles.riskCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Security Risk Score</Text>
            <View style={[styles.riskBadge, { backgroundColor: level.bg }]}>
              <Text style={[styles.riskBadgeText, { color: level.color }]}>{level.label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <Text style={[styles.riskScore, { color: level.color }]}>{score}</Text>
            <Text style={styles.riskOutOf}>/100</Text>
          </View>
          <RiskScoreBar score={score} level={level} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={styles.riskMeta}>{recentCount} events in last 24h</Text>
            <Text style={styles.riskMeta}>{pendingEvents.length} pending review</Text>
          </View>

          {/* Breakdown chips */}
          {Object.keys(breakdown).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {Object.entries(breakdown).map(([type, count]) => {
                const meta = EVENT_LABELS[type] || { label: type, color: '#6B7280' };
                return (
                  <View key={type} style={[styles.chip, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}30` }]}>
                    <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}: {count}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Live Status Checks */}
        {loading ? (
          <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live Detection Status</Text>
            <StatusRow icon="navigate-circle" label="GPS Signal" value={status?.gps || 'Checking…'} good={status?.gps === 'Active'} />
            <StatusRow icon="shield-checkmark" label="GPS Accuracy" value={status?.accuracy ? `±${Math.round(status.accuracy)}m` : '—'} good={status?.accuracy != null && status.accuracy <= SECURITY.MAX_ACCURACY_M} />
            <StatusRow icon="shield-half" label="VPN / Proxy" value={status?.vpn === true ? 'Detected' : status?.vpn === false ? 'Clear' : '—'} good={status?.vpn === false ? true : status?.vpn === true ? false : null} />
            {status?.vpn === true && status?.vpnReason && (
              <View style={styles.alertBanner}>
                <Ionicons name="warning" size={15} color="#DC2626" style={{ marginTop: 1 }} />
                <Text style={styles.alertBannerText}>{status.vpnReason}</Text>
              </View>
            )}
            <StatusRow icon="navigate" label="Mock Location" value={status?.mock === true ? 'Detected' : status?.mock === false ? 'Clear' : '—'} good={status?.mock === false ? true : status?.mock === true ? false : null} />
            {status?.mock === true && status?.mockReason && (
              <View style={styles.alertBanner}>
                <Ionicons name="warning" size={15} color="#DC2626" style={{ marginTop: 1 }} />
                <Text style={styles.alertBannerText}>{status.mockReason}</Text>
              </View>
            )}
            <StatusRow icon="phone-portrait" label="Device Integrity" value={status?.root === true ? 'Compromised' : status?.root === false ? 'Verified' : '—'} good={status?.root === false ? true : status?.root === true ? false : null} />
            {status?.root === true && status?.rootReason && (
              <View style={styles.alertBanner}>
                <Ionicons name="warning" size={15} color="#DC2626" style={{ marginTop: 1 }} />
                <Text style={styles.alertBannerText}>{status.rootReason}</Text>
              </View>
            )}
            <StatusRow icon="checkmark-circle" label="Device Approved" value={deviceApproved === true ? 'Approved' : deviceApproved === false ? 'Not Approved' : '—'} good={deviceApproved} />
            {site && (
              <StatusRow icon="location" label="Geofence" value={status?.geofence?.inside ? 'Inside' : status?.geofence?.inside === false ? `Outside (${Math.round(status.geofence.distanceToBoundary || 0)}m)` : '—'} good={status?.geofence?.inside ?? null} />
            )}
            {status?.error && (
              <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 8, fontStyle: 'italic' }}>{status.error}</Text>
            )}
          </View>
        )}

        {/* Recent Security Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Security Events</Text>
          {securityEvents.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="shield-checkmark" size={36} color="#10B981" />
              <Text style={{ color: '#10B981', fontWeight: '700', marginTop: 8 }}>No security events</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>Your device passed all checks.</Text>
            </View>
          ) : (
            securityEvents.slice(0, 10).map((evt) => {
              const meta = EVENT_LABELS[evt.eventType] || { label: evt.type || evt.eventType || 'Security Anomaly', icon: 'alert-circle', color: '#6B7280' };
              const sevColor = evt.severity === 'Critical' ? '#7C3AED' : evt.severity === 'High' ? '#EF4444' : evt.severity === 'Medium' ? '#F59E0B' : '#3B82F6';
              return (
                <View key={evt.id} style={styles.eventRow}>
                  <View style={[styles.eventIcon, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventLabel}>{meta.label}</Text>
                    <Text style={styles.eventDesc} numberOfLines={1}>{evt.description}</Text>
                    <Text style={styles.eventTime}>{formatDate(evt.createdAt || evt.timestamp)} · {formatTime(evt.createdAt || evt.timestamp)}</Text>
                  </View>
                  <View style={[styles.sevChip, { backgroundColor: `${sevColor}18` }]}>
                    <Text style={[styles.sevText, { color: sevColor }]}>{evt.severity}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Device Info */}
        {deviceId ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Device ID</Text>
              <Text style={styles.infoVal} numberOfLines={1}>{deviceId}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: 'white' },
  headerSub: { fontSize: 12, color: '#C7D2FE', fontWeight: '500' },

  riskCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  riskScore: { fontSize: 42, fontWeight: '900', lineHeight: 48 },
  riskOutOf: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  riskBar: { height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' },
  riskFill: { height: 10, borderRadius: 5 },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  riskBadgeText: { fontSize: 12, fontWeight: '800' },
  riskMeta: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '700' },

  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  eventIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  eventLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  eventDesc: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  eventTime: { fontSize: 11, color: '#94A3B8', marginTop: 2, fontWeight: '500' },
  sevChip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  sevText: { fontSize: 10, fontWeight: '800' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  infoVal: { fontSize: 12, color: '#6B7280', fontFamily: 'monospace', flex: 1, textAlign: 'right' },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
  },
  alertBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
    lineHeight: 16,
  },
});
