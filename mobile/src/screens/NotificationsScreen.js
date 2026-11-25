import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, collection, doc, updateDoc, onSnapshot, getCleanEmployeeEmail } from '../firebase';

export default function NotificationsScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, route?.params?.employee, auth.currentUser);
  const employee = route?.params?.employee || propUser || route?.params?.user || null;
  const employeeId = employee?.id || employee?.uid || '';
  const employeeName = (employee?.name || '').trim().toLowerCase();
  const companyId = employee?.companyId || 'company_default';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'notifications'), (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const mine = all.filter((n) => {
        // Multi-company isolation
        if ((n.companyId || 'company_default') !== companyId) return false;
        // Include broadcast notifications or notifications specifically for this employee
        const targetRole = String(n.targetRole || n.type || '').toLowerCase();
        if (targetRole === 'admin' || targetRole === 'admin_security_alert') return false;
        if (n.target === 'All Employees' || n.type === 'broadcast') return true;

        const nEmpId = String(n.employeeId || '').trim();
        const nName = String(n.employeeName || '').trim().toLowerCase();
        const nEmail = String(n.employeeEmail || '').trim().toLowerCase();

        if (employeeId && nEmpId && nEmpId === employeeId) return true;
        if (currentEmail && nEmail && nEmail === currentEmail) return true;
        if (employeeName && nName && nName === employeeName) return true;
        return false;
      });

      mine.sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() || a.createdAt?.toMillis?.() || (a.date ? new Date(a.date).getTime() : 0);
        const tb = b.timestamp?.toMillis?.() || b.createdAt?.toMillis?.() || (b.date ? new Date(b.date).getTime() : 0);
        return tb - ta;
      });

      setNotifications(mine);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [employeeId, employeeName, currentEmail, companyId]);

  const markAsRead = async (notif) => {
    if (notif.read || notif.status === 'Read') return;
    try {
      await updateDoc(doc(db, 'notifications', notif.id), { read: true, status: 'Read' });
    } catch (_) {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerIcon} />
      </View>

      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 40 }} />
        ) : notifications.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
            <Text style={{ marginTop: 16, color: '#6B7280', fontSize: 16 }}>No notifications yet.</Text>
          </View>
        ) : (
          notifications.map((notif) => {
            const tsObj = notif.timestamp?.toDate
              ? notif.timestamp.toDate()
              : notif.createdAt?.toDate
                ? notif.createdAt.toDate()
                : null;
            const timeStr = tsObj
              ? tsObj.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : [notif.date, notif.time].filter(Boolean).join(' • ') || 'Recent';

            const sev = String(notif.severity || '').toLowerCase();
            const isHigh = sev === 'high' || sev === 'critical';
            const isMed = sev === 'medium' || sev === 'warning';
            const color = isHigh ? '#EF4444' : isMed ? '#F59E0B' : '#4F46E5';
            const icon = isHigh ? 'alert-circle' : isMed ? 'warning' : 'notifications';
            const isUnread = notif.read !== true && notif.status !== 'Read';

            return (
              <TouchableOpacity
                key={notif.id}
                style={[styles.card, isUnread && styles.unreadCard]}
                onPress={() => markAsRead(notif)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${color}1A` }]}>
                  <Ionicons name={icon} size={22} color={color} />
                </View>
                <View style={styles.textWrap}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.actionText} numberOfLines={1}>{notif.title || notif.action || 'Notification'}</Text>
                    {isUnread && <View style={styles.unreadDot} />}
                  </View>
                  {notif.message ? <Text style={styles.msgText}>{notif.message}</Text> : null}
                  <Text style={styles.timeText}>{timeStr}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4F46E5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20, paddingHorizontal: 16 },
  headerIcon: { padding: 4, width: 32 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  contentContainer: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  card: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 12, alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  unreadCard: { borderLeftWidth: 4, borderLeftColor: '#4F46E5' },
  iconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  textWrap: { flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4F46E5', marginLeft: 8 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 3, flex: 1 },
  msgText: { fontSize: 12.5, color: '#4B5563', lineHeight: 18, marginBottom: 4 },
  timeText: { fontSize: 11, color: '#6B7280' },
});
