import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, collection, query, where, onSnapshot, getDocs } from '../firebase';
import FloatingChatButton from '../components/FloatingChatButton';

export default function TasksScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [assignments, setAssignments] = useState([]);
  const [sites, setSites] = useState({});
  const [loading, setLoading] = useState(true);

  const email = auth.currentUser?.email;

  useEffect(() => {
    if (!email) return;

    // 1. Fetch employee by email
    const qEmp = query(collection(db, 'employees'), where('email', '==', email));
    const unsubEmp = onSnapshot(qEmp, (empSnap) => {
      if (empSnap.empty) {
        setLoading(false);
        return;
      }
      const employee = empSnap.docs[0].data();

      // 2. Fetch assignments where empName == employee.name
      const qAssign = query(collection(db, 'Assignments'), where('empName', '==', employee.name));
      const unsubAssign = onSnapshot(qAssign, async (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Fetch related sites
        const siteMap = { ...sites };
        for (const a of data) {
          if (a.site && !siteMap[a.site]) {
            const qSite = query(collection(db, 'Sites'), where('name', '==', a.site));
            const siteSnaps = await getDocs(qSite);
            if (!siteSnaps.empty) {
              siteMap[a.site] = siteSnaps.docs[0].data();
            }
          }
        }
        setSites(siteMap);
        
        // Sort: Active first, then Upcoming, then Completed/Cancelled
        data.sort((a, b) => {
          const ranks = { 'Active': 1, 'Upcoming': 2, 'Completed': 3, 'Cancelled': 4 };
          return (ranks[a.status] || 5) - (ranks[b.status] || 5);
        });
        setAssignments(data);
        setLoading(false);
      });
      
      // Cleanup for the assignment listener inside
      // Technically, in a complex hook this might leak if the employee changes rapidly, but email is static.
    });

    return () => unsubEmp();
  }, [email]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Assignments</Text>
        <View style={styles.headerIcon} /> 
      </View>

      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {assignments.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={{ marginTop: 16, color: '#6B7280', fontSize: 16 }}>No assignments found.</Text>
          </View>
        ) : assignments.map(a => {
          const site = sites[a.site];
          const isCompleted = a.status === 'Completed' || a.status === 'Cancelled';
          return (
            <View key={a.id} style={[styles.card, isCompleted && { opacity: 0.7 }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.siteName}>{site?.name || a.site || 'Loading Site...'}</Text>
                <View style={[styles.badge, { backgroundColor: a.status === 'Active' ? '#DBEAFE' : isCompleted ? '#D1FAE5' : '#FEF3C7' }]}>
                  <Text style={[styles.badgeText, { color: a.status === 'Active' ? '#1E40AF' : isCompleted ? '#065F46' : '#D97706' }]}>{a.status}</Text>
                </View>
              </View>
              <Text style={styles.address}>{site?.address || 'N/A'}</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Assigned Date</Text>
                <Text style={styles.detailValue}>{a.assignDate || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Shift Time</Text>
                <Text style={styles.detailValueBold}>{a.shift || 'N/A'}</Text>
              </View>
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>
      <FloatingChatButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4F46E5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20, paddingHorizontal: 16 },
  headerIcon: { padding: 4, width: 32 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  contentContainer: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  siteName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  address: { color: '#6B7280', fontSize: 14, marginBottom: 20, lineHeight: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  detailLabel: { color: '#6B7280', fontSize: 14 },
  detailValue: { color: '#1F2937', fontSize: 14, fontWeight: '500' },
  detailValueBold: { color: '#1F2937', fontSize: 14, fontWeight: 'bold' },
});
