import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { auth, db, doc, getDocs, collection, query, where, onSnapshot, addDoc, updateDoc, serverTimestamp } from '../firebase';
import FloatingChatButton from '../components/FloatingChatButton';
import SecurityWarningModal from '../components/SecurityWarningModal';
import { runPreAttendanceChecks } from '../services/securityService';
import { startMonitoring, stopMonitoring } from '../services/backgroundMonitor';
import { getDeviceId } from '../services/deviceInfo';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [employee, setEmployee] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [site, setSite] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [checking, setChecking] = useState(false);
  const [warning, setWarning] = useState(null); // { failedCheck, reason }
  const hasSetOnline = useRef(false);

  const email = auth.currentUser?.email;

  useEffect(() => {
    if (!email) return;

    // Listen to Employee by Email
    const qEmp = query(collection(db, 'employees'), where('email', '==', email));
    const unsubEmp = onSnapshot(qEmp, (empSnap) => {
      if (empSnap.empty) {
        setLoading(false);
        return;
      }
      const empData = { id: empSnap.docs[0].id, ...empSnap.docs[0].data() };
      setEmployee(empData);

      // Auto-set status to 'On Duty' when the app is opened, only once per session
      if (!hasSetOnline.current) {
        hasSetOnline.current = true;
        if (!empData.status || empData.status === 'Offline') {
          updateDoc(doc(db, 'employees', empData.id), { status: 'On Duty' }).catch(console.error);
        }
      }

      // Listen to current assignment
      const qAssign = query(collection(db, 'Assignments'), where('empName', '==', empData.name), where('status', '==', 'Active'));
      const unsubAssign = onSnapshot(qAssign, (snapshot) => {
        if (!snapshot.empty) {
          const assignData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setAssignment(assignData);
          
          // Fetch site details (query by site name since that's what Assignments stores)
          if (assignData.site) {
            getDocs(query(collection(db, 'Sites'), where('name', '==', assignData.site))).then(siteSnaps => {
              if (!siteSnaps.empty) setSite({ id: siteSnaps.docs[0].id, ...siteSnaps.docs[0].data() });
            });
          }
        } else {
          setAssignment(null);
          setSite(null);
        }
      });

      // Listen to today's attendance
      const qAtt = query(collection(db, 'Attendance'), where('employee_id', '==', empData.id));
      const unsubAtt = onSnapshot(qAtt, (snapshot) => {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const todayRecord = snapshot.docs.find(d => {
          const data = d.data();
          if (!data.date) return false;
          const dDate = data.date.toDate ? data.date.toDate() : new Date(data.date);
          return dDate >= today;
        });

        if (todayRecord) {
          setAttendance({ id: todayRecord.id, ...todayRecord.data() });
        } else {
          setAttendance(null);
        }
        setLoading(false);
      });

      return () => { unsubAssign(); unsubAtt(); };
    });

    return () => unsubEmp();
  }, [email]);

  const handleTimeIn = async () => {
    if (attendance?.timeIn) {
      Alert.alert('Already Timed In', 'You have already timed in today.');
      return;
    }
    if (!employee) return;

    // ── GPS Geofence Check ──
    if (!assignment) {
      Alert.alert('No Assignment', 'You have no active assignment. Please contact your admin.');
      return;
    }
    if ((!site?.lat || !site?.lng) && !site?.polygon) {
      Alert.alert('Site Error', 'Your assigned site has no GPS coordinates set. Please contact your admin.');
      return;
    }

    setChecking(true);
    try {
      // ── Anti-spoofing pipeline (VPN, mock, root, accuracy, geofence, consistency) ──
      const result = await runPreAttendanceChecks({ employee, site, action: 'time_in' });
      if (!result.passed) {
        setWarning({ failedCheck: result.failedCheck, reason: result.reason });
        return;
      }

      const { latitude, longitude } = result.report;

      // Checks passed — record attendance.
      await addDoc(collection(db, 'Attendance'), {
        employee_id: employee.id,
        employeeName: employee.name || 'Unknown',
        date: serverTimestamp(),
        timeIn: serverTimestamp(),
        timeOut: null,
        site_id: site?.id || null,
        siteName: site?.name || null,
        latitude,
        longitude,
        accuracy: result.report.accuracy,
        deviceId: result.report.deviceId,
        verified: true,
        status: 'Present'
      });
      await updateDoc(doc(db, 'employees', employee.id), { status: 'On Site' });

      // Begin continuous background monitoring for the shift.
      const deviceId = await getDeviceId();
      await startMonitoring({ employee, site, deviceId });

      Alert.alert('✅ Timed In!', `Welcome to ${site.name}! All security checks passed.`);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setChecking(false);
    }
  };

  const handleTimeOut = async () => {
    if (!attendance?.id) {
      Alert.alert('Error', 'No active time-in found.');
      return;
    }
    if (attendance.timeOut) {
      Alert.alert('Already Timed Out', 'You have already timed out today.');
      return;
    }
    try {
      await updateDoc(doc(db, 'Attendance', attendance.id), {
        timeOut: serverTimestamp()
      });
      await updateDoc(doc(db, 'employees', employee.id), { status: 'Offline' });
      if (assignment?.id) {
        await updateDoc(doc(db, 'Assignments', assignment.id), { status: 'Completed' });
      }
      // Stop background shift monitoring.
      await stopMonitoring();
      Alert.alert('Success', 'Timed out successfully!');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleUploadPhoto = async () => {
    if (!attendance?.timeIn) {
      Alert.alert('Not Timed In', 'Please time in before uploading a site photo.');
      return;
    }
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to upload a photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled) {
        setUploadingPhoto(true);
        const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
        
        await addDoc(collection(db, 'ActivityLogs'), {
          employee_id: employee.id,
          employeeName: employee.name,
          site_id: site?.id || 'Unknown',
          siteName: site?.name || assignment?.site || 'Unknown',
          action: 'Uploaded Site Photo',
          type: 'Site Update',
          photo: base64Img,
          timestamp: serverTimestamp(),
          status: 'Info'
        });
        
        Alert.alert('Success', 'Photo uploaded and logged successfully!');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  const statusColor = employee?.status === 'On Site' ? '#10B981' : employee?.status === 'On Duty' ? '#3B82F6' : '#9CA3AF';
  const timeInStr = attendance?.timeIn?.toDate ? attendance.timeIn.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
  const timeOutStr = attendance?.timeOut?.toDate ? attendance.timeOut.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 18) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  return (
    <View style={styles.container}>
      {/* Blue Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.name}>{employee?.name || 'Employee'}</Text>
              <Image source={require('../../assets/wave.png')} style={{ width: 22, height: 22, marginLeft: 6, marginTop: 4 }} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('SecurityStatus')}>
              <Ionicons name="shield-checkmark-outline" size={22} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* White Rounded Content Area */}
      <View style={styles.whiteBody}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Today's Assignment */}
          <Text style={styles.sectionTitle}>Today's Assignment</Text>
          {assignment ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.siteName}>{site?.name || assignment.site || 'Loading Site...'}</Text>
                <View style={styles.assignedBadge}>
                  <Text style={styles.assignedBadgeText}>ASSIGNED</Text>
                </View>
              </View>
              <Text style={styles.address}>{site?.address || 'Address not available'}</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Map')}>
                  <Text style={styles.primaryButtonText}>View on Map</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 30 }]}>
              <Ionicons name="calendar-clear-outline" size={40} color="#D1D5DB" />
              <Text style={{ marginTop: 10, color: '#6B7280', fontSize: 14 }}>No active assignments today.</Text>
            </View>
          )}

          {/* Status */}
          <Text style={styles.sectionTitle}>Current Status</Text>
          <View style={[styles.statusBox, { backgroundColor: employee?.status === 'On Site' ? '#ECFDF5' : '#F3F4F6', borderColor: employee?.status === 'On Site' ? '#A7F3D0' : '#E5E7EB' }]}>
            <View style={styles.statusIconWrap}>
              <Ionicons name="location" size={20} color={statusColor} />
            </View>
            <View>
              <Text style={[styles.statusMainText, { color: employee?.status === 'On Site' ? '#065F46' : '#1F2937' }]}>{employee?.status || 'Offline'}</Text>
              {attendance?.timeIn && <Text style={styles.statusSubText}>Since {timeInStr}</Text>}
            </View>
          </View>

          {/* Action Grid */}
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionItem} onPress={handleTimeIn} disabled={!!attendance?.timeIn || checking}>
              {checking ? (
                <ActivityIndicator color="#4F46E5" size="small" style={{ marginBottom: 4 }} />
              ) : (
                <Ionicons name="enter-outline" size={26} color={attendance?.timeIn ? "#D1D5DB" : "#4F46E5"} />
              )}
              <Text style={[styles.actionTitle, attendance?.timeIn && { color: '#9CA3AF' }]}>{checking ? 'Verifying...' : 'Time In'}</Text>
              <Text style={attendance?.timeIn ? styles.actionValueDisabled : styles.actionValue}>{timeInStr}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionItem} onPress={handleTimeOut} disabled={!!attendance?.timeOut || !attendance?.timeIn}>
              <Ionicons name="exit-outline" size={26} color={attendance?.timeOut || !attendance?.timeIn ? "#D1D5DB" : "#EF4444"} />
              <Text style={[styles.actionTitle, (attendance?.timeOut || !attendance?.timeIn) && { color: '#9CA3AF' }]}>Time Out</Text>
              <Text style={attendance?.timeOut ? styles.actionValue : styles.actionValueDisabled}>{timeOutStr}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionItem} onPress={handleUploadPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? (
                <ActivityIndicator color="#4F46E5" size="small" style={{ marginBottom: 4 }} />
              ) : (
                <Ionicons name="camera-outline" size={26} color="#4F46E5" />
              )}
              <Text style={styles.actionTitle}>{uploadingPhoto ? 'Uploading...' : 'Upload Photo'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
      <FloatingChatButton />
      <SecurityWarningModal
        visible={!!warning}
        failedCheck={warning?.failedCheck}
        reason={warning?.reason}
        onClose={() => setWarning(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4F46E5' },
  header: { backgroundColor: '#4F46E5', paddingBottom: 36 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22 },
  greeting: { color: '#C7D2FE', fontSize: 15, fontWeight: '400' },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: 2 },
  notifBtn: { backgroundColor: 'rgba(255,255,255,0.15)', padding: 10, borderRadius: 50 },
  whiteBody: { flex: 1, backgroundColor: '#F8FAFC', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', marginTop: -20 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#4F46E5', marginBottom: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, marginBottom: 20, shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  siteName: { fontSize: 17, fontWeight: '700', color: '#111827' },
  assignedBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  assignedBadgeText: { color: '#4F46E5', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  address: { color: '#6B7280', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, backgroundColor: '#4F46E5', paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  statusBox: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  statusIconWrap: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 12, marginRight: 14 },
  statusMainText: { fontSize: 15, fontWeight: '700' },
  statusSubText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  actionGrid: { flexDirection: 'row', gap: 12 },
  actionItem: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, alignItems: 'center', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2, gap: 6 },
  actionTitle: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },
  actionValue: { fontSize: 12, color: '#4F46E5', fontWeight: '700' },
  actionValueDisabled: { fontSize: 12, color: '#D1D5DB', fontWeight: '600' },
});
