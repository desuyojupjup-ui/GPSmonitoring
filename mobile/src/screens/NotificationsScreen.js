import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, collection, query, orderBy, limit, onSnapshot } from '../firebase';

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For this example, we'll fetch system ActivityLogs as notifications
    // In a real app, you might want a separate Notifications collection
    const q = query(collection(db, 'ActivityLogs'), orderBy('timestamp', 'desc'), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(logs);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
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
            <Text style={{ marginTop: 16, color: '#6B7280', fontSize: 16 }}>No recent notifications.</Text>
          </View>
        ) : (
          notifications.map(notif => {
            const timeStr = notif.timestamp?.toDate ? notif.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Just now';
            const isError = notif.status === 'Error';
            const isWarning = notif.status === 'Warning';
            const color = isError ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981';
            const icon = isError ? 'alert-circle' : isWarning ? 'warning' : 'checkmark-circle';

            return (
              <View key={notif.id} style={styles.card}>
                <View style={[styles.iconWrap, { backgroundColor: `${color}1A` }]}>
                  <Ionicons name={icon} size={24} color={color} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.actionText}>{notif.action}</Text>
                  <Text style={styles.timeText}>{timeStr} • {notif.type}</Text>
                </View>
              </View>
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
  card: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  textWrap: { flex: 1 },
  actionText: { fontSize: 14, fontWeight: '600', color: '#1F2937', marginBottom: 4 },
  timeText: { fontSize: 12, color: '#6B7280' },
});
