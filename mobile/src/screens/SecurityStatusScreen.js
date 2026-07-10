import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot } from '../firebase';
import { getLiveStatus } from '../services/securityService';
import { getDeviceId } from '../services/deviceInfo';
import { SECURITY, RISK } from '../services/securityConfig';

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

export default function SecurityStatusScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [employee, setEmployee] = useState(null);
  const [site, setSite] = useState(null);
  const [status, setStatus] = useState(null);
  const [risk, setRisk] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [deviceApproved, setDeviceApproved] = useState(null);
  const [loading, setLoading] = useState(true);
  const email = auth.currentUser?.email;

  // Resolve employee + active site (mirrors HomeScreen).
  useEffect(() => {
    if (!email) return;
    let unsubRisk = () => {};
    let unsubDev = () => {};
    (async () => {
      const empSnap = await getDocs(query(collection(db, 'employees'), where('email', '==', email)));
      if (empSnap.empty) { setLoading(false); return; }
      const emp = { id: empSnap.docs[0].id, ...empSnap.docs[0].data() };
      setEmployee(emp);

      const assignSnap = await getDocs(
        query(collection(db, 'Assignments'), where('empName', '==', emp.name), where('status', '==', 'Active'))
      );
      if (!assignSnap.empty) {
        const a = assignSnap.docs[0].data();
        if (a.site) {
          const siteSnap = await getDocs(query(collection(db, 'Sites'), where('name', '==', a.site)));
          if (!siteSnap.empty) setSite({ id: siteSnap.docs[0].id, ...siteSnap.docs[0].data() });
        }
      }

      // Live latest AI risk score.
      unsubRisk = onSnapshot(
        query(collection(db, SECURITY.COLLECTIONS.AI_ANALYSIS), where('employee_id', '==', emp.id)),
        (snap) => {
          const docs = snap.docs.map((d) => d.data());
          docs.sort((x, y) => (y.timestamp?.seconds || 0) - (x.timestamp?.seconds || 0));
          if (docs[0]) setRisk(docs[0]);
        }
      );

      // Device approval state.
      const id = await getDeviceId();
      setDeviceId(id);
      unsubDev = onSnapshot(
        query(collection(db, SECURITY.COLLECTIONS.DEVICE_REGISTRY), where('employee_id', '==', emp.id)),
        (snap) => {
          const mine = snap.docs.map((d) => d.data()).find((r) => r.deviceId === id);
          setDeviceApproved(mine ? mine.status === 'approved' : null);
        }
      );
    })();
    return () => { unsubRisk(); unsubDev(); };
  }, [email]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await getLiveStatus({ employee, site });
    setStatus(s);
    setLoading(false);
  }, [employee, site]);

  useEffect(() => { if (employee !== null) refresh(); }, [employee, site, refresh]);

  const riskMeta = RISK.level(risk?.riskScore ?? 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security Status</Text>
        <TouchableOpacity onPress={refresh}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        {/* Risk banner */}
        <View style={[styles.riskCard, { borderColor: riskMeta.color }]}>
          <View style={[styles.riskCircle, { backgroundColor: `${riskMeta.color}1A` }]}>
            <Text style={[styles.riskScore, { color: riskMeta.color }]}>{risk?.riskScore ?? '—'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.riskLabel}>Current Risk Level</Text>
            <Text style={[styles.riskValue, { color: riskMeta.color }]}>{riskMeta.label}</Text>
            {risk?.explanation ? <Text style={styles.riskExp} numberOfLines={3}>{risk.explanation}</Text> : null}
          </View>
        </View>

        {loading && !status ? (
          <ActivityIndicator color="#4F46E5" style={{ marginTop: 30 }} />
        ) : status ? (
          <View style={styles.group}>
            <StatusRow icon="locate" label="GPS Signal" value={status.gps} good={status.gps === 'Active'} />
            <StatusRow
              icon="aperture"
              label="GPS Accuracy"
              value={status.accuracy != null ? `±${Math.round(status.accuracy)}m` : 'N/A'}
              good={status.accuracy != null ? status.accuracy <= SECURITY.MAX_ACCURACY_M : null}
            />
            <StatusRow icon="globe" label="VPN" value={status.vpn ? 'Detected' : 'Clear'} good={status.vpn === null ? null : !status.vpn} />
            <StatusRow icon="navigate" label="Mock GPS" value={status.mock ? 'Detected' : 'Clear'} good={status.mock === null ? null : !status.mock} />
            <StatusRow icon="shield-checkmark" label="Device Integrity" value={status.root ? 'Compromised' : 'Verified'} good={status.root === null ? null : !status.root} />
            <StatusRow icon="phone-portrait" label="Device Verification" value={deviceApproved === null ? 'Unknown' : deviceApproved ? 'Approved' : 'Pending'} good={deviceApproved} />
            <StatusRow
              icon="pin"
              label="Geofence"
              value={status.geofence ? (status.geofence.inside ? 'Inside' : `${Math.round(status.geofence.distanceToBoundary)}m out`) : 'No site'}
              good={status.geofence ? status.geofence.inside : null}
            />
          </View>
        ) : (
          <Text style={styles.empty}>{status?.error || 'Pull to refresh your security status.'}</Text>
        )}

        {risk?.recommendations?.length ? (
          <View style={styles.recCard}>
            <Text style={styles.recTitle}>Recommendations</Text>
            {risk.recommendations.map((r, i) => (
              <View key={i} style={styles.recRow}>
                <Ionicons name="ellipse" size={6} color="#4F46E5" style={{ marginTop: 6 }} />
                <Text style={styles.recText}>{r}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.device}>Device ID: {deviceId || '—'}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#4F46E5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 18 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 60 },
  riskCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#fff', borderRadius: 18, padding: 18, borderLeftWidth: 5, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  riskCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  riskScore: { fontSize: 24, fontWeight: '800' },
  riskLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  riskValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  riskExp: { fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 17 },
  group: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 30 },
  recCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 18 },
  recTitle: { fontSize: 13, fontWeight: '700', color: '#4F46E5', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  recRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  recText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 19 },
  device: { textAlign: 'center', color: '#9CA3AF', fontSize: 11, marginTop: 24 },
});
