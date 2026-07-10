import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Modal, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, signOut, collection, query, where, onSnapshot, doc, updateDoc, getDocs, orderBy } from '../firebase';
import FloatingChatButton from '../components/FloatingChatButton';

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [employee, setEmployee] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Modals state
  const [activeModal, setActiveModal] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  
  const user = auth.currentUser;
  const email = user?.email || 'employee@email.com';

  useEffect(() => {
    if (!email) return;
    const q = query(collection(db, 'employees'), where('email', '==', email));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setEmployee({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
    });
    return () => unsub();
  }, [email]);

  const fetchModalData = async (type) => {
    if (!employee) return;
    try {
      if (type === 'attendance') {
        const q = query(collection(db, 'Attendance'), where('employeeName', '==', employee.name));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // sort by date descending manually since index might be missing
        data.sort((a,b) => {
          const dA = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
          const dB = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
          return dB - dA;
        });
        setAttendance(data);
      } else if (type === 'history') {
        const q = query(collection(db, 'ActivityLogs'), where('employeeName', '==', employee.name));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a,b) => {
          const dA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
          const dB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
          return dB - dA;
        });
        setHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMenuPress = (title) => {
    if (title === 'My Assignments') {
      navigation.navigate('Tasks');
    } else if (title === 'My Attendance') {
      setActiveModal('attendance');
      fetchModalData('attendance');
    } else if (title === 'Location History') {
      setActiveModal('history');
      fetchModalData('history');
    } else if (title === 'Settings') {
      setActiveModal('settings');
    } else if (title === 'Help & Support') {
      setActiveModal('support');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: async () => await signOut(auth) }
      ],
      { cancelable: true }
    );
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'You need to allow camera roll permissions to upload a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled) {
        setUploading(true);
        const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const empRef = doc(db, 'employees', employee.id);
        await updateDoc(empRef, { profilePic: base64Img });
        setUploading(false);
      }
    } catch (error) {
      Alert.alert('Upload Failed', 'There was an error uploading your profile picture.');
      setUploading(false);
    }
  };

  const menuItems = [
    { icon: 'clipboard-outline',   title: 'My Assignments' },
    { icon: 'time-outline',        title: 'My Attendance' },
    { icon: 'location-outline',    title: 'Location History' },
    { icon: 'settings-outline',    title: 'Settings' },
    { icon: 'help-circle-outline', title: 'Help & Support' },
  ];

  return (
    <View style={[styles.container, isDarkMode && styles.darkContainer]}>
      {/* ── Blue Header ── */}
      <View
        style={[styles.blueHeader, { paddingTop: insets.top + 14 }]}
        onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity>
          <Ionicons name="menu" size={26} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* ── Avatar overlapping the boundary ── */}
      {headerHeight > 0 && (
        <View style={[styles.avatarRow, { top: headerHeight - AVATAR_HALF }]}>
          <TouchableOpacity onPress={handlePickImage} disabled={!employee || uploading}>
            <View style={[styles.avatarCircle, { overflow: 'hidden' }]}>
              {uploading ? (
                <ActivityIndicator color="#4F46E5" />
              ) : employee?.profilePic ? (
                <Image source={{ uri: employee.profilePic }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
              ) : (
                <Ionicons name="person" size={54} color="#9CA3AF" />
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={13} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── White Body ── */}
      <View style={[styles.whiteBody, isDarkMode && styles.darkBody]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Name / Email / Badge */}
          <View style={styles.profileInfo}>
            <Text style={[styles.nameText, isDarkMode && styles.darkText]}>{employee?.name || 'Loading...'}</Text>
            <Text style={[styles.emailText, isDarkMode && styles.darkSubText]}>{email}</Text>
            <View style={[styles.dutyBadge, { backgroundColor: employee?.status === 'On Site' ? '#D1FAE5' : (isDarkMode ? '#374151' : '#F3F4F6'), borderColor: employee?.status === 'On Site' ? '#10B981' : (isDarkMode ? '#4B5563' : '#E5E7EB') }]}>
              <Text style={[styles.dutyBadgeText, { color: employee?.status === 'On Site' ? '#059669' : (isDarkMode ? '#D1D5DB' : '#6B7280') }]}>{employee?.status || 'Offline'}</Text>
            </View>
          </View>

          {/* ── Menu Items ── */}
          <View style={[styles.menuContainer, isDarkMode && styles.darkCard]}>
            {menuItems.map((item, index) => (
              <TouchableOpacity key={index} style={[styles.menuItem, isDarkMode && styles.darkBorder]} onPress={() => handleMenuPress(item.title)}>
                <View style={styles.menuLeft}>
                  <View style={[styles.iconContainer, isDarkMode && styles.darkIconContainer]}>
                    <Ionicons name={item.icon} size={20} color={isDarkMode ? '#818CF8' : '#4F46E5'} />
                  </View>
                  <Text style={[styles.menuText, isDarkMode && styles.darkText]}>{item.title}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ))}

            {/* Logout */}
            <TouchableOpacity style={[styles.menuItem, isDarkMode && styles.darkBorder, { marginTop: 12 }]} onPress={handleLogout}>
              <View style={styles.menuLeft}>
                <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? '#7F1D1D' : '#FEE2E2' }]}>
                  <Ionicons name="log-out-outline" size={20} color={isDarkMode ? '#FCA5A5' : '#EF4444'} />
                </View>
                <Text style={[styles.menuText, { color: isDarkMode ? '#FCA5A5' : '#EF4444' }]}>Logout</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
      
      {/* ── Dynamic Modals ── */}
      <Modal visible={!!activeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveModal(null)}>
        <View style={[styles.modalContainer, isDarkMode && styles.darkModalContainer]}>
          <View style={[styles.modalHeader, isDarkMode && styles.darkModalHeader]}>
            <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>
              {activeModal === 'attendance' && 'My Attendance'}
              {activeModal === 'history' && 'Location History'}
              {activeModal === 'settings' && 'Settings'}
              {activeModal === 'support' && 'Help & Support'}
            </Text>
            <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={isDarkMode ? 'white' : '#374151'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* ATTENDANCE */}
            {activeModal === 'attendance' && (
              <View>
                {attendance.length === 0 ? (
                  <Text style={[styles.emptyText, isDarkMode && styles.darkSubText]}>No attendance records found.</Text>
                ) : (
                  attendance.map((record, i) => (
                    <View key={i} style={[styles.recordCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
                      <View style={styles.recordLeft}>
                        <Ionicons name="calendar" size={20} color={isDarkMode ? '#818CF8' : '#4F46E5'} />
                        <View>
                          <Text style={[styles.recordDate, isDarkMode && styles.darkText]}>
                            {record.date?.toDate ? record.date.toDate().toDateString() : record.date}
                          </Text>
                          <Text style={[styles.recordSub, isDarkMode && styles.darkSubText]}>Site: {record.siteName || 'N/A'}</Text>
                        </View>
                      </View>
                      <View style={styles.recordRight}>
                        <Text style={[styles.timeText, isDarkMode && styles.darkSubText]}>In: {record.timeIn?.toDate ? record.timeIn.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '--:--'}</Text>
                        <Text style={[styles.timeText, isDarkMode && styles.darkSubText]}>Out: {record.timeOut?.toDate ? record.timeOut.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '--:--'}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* HISTORY */}
            {activeModal === 'history' && (
              <View>
                {history.length === 0 ? (
                  <Text style={[styles.emptyText, isDarkMode && styles.darkSubText]}>No recent activity logs.</Text>
                ) : (
                  history.map((log, i) => (
                    <View key={i} style={[styles.recordCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
                      <View style={styles.recordLeft}>
                        <Ionicons name="location" size={20} color={isDarkMode ? '#34D399' : '#059669'} />
                        <View>
                          <Text style={[styles.recordDate, isDarkMode && styles.darkText]}>{log.action}</Text>
                          <Text style={[styles.recordSub, isDarkMode && styles.darkSubText]}>{log.siteName || 'System'}</Text>
                        </View>
                      </View>
                      <Text style={[styles.timeText, isDarkMode && styles.darkSubText]}>
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'N/A'}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* SETTINGS */}
            {activeModal === 'settings' && (
              <View style={[styles.settingsGroup, isDarkMode && styles.darkCard]}>
                <View style={[styles.settingItem, isDarkMode && styles.darkBorder]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="notifications" size={22} color={isDarkMode ? '#9CA3AF' : '#4B5563'} />
                    <Text style={[styles.settingText, isDarkMode && styles.darkText]}>Push Notifications</Text>
                  </View>
                  <Switch value={true} trackColor={{ true: isDarkMode ? '#818CF8' : '#4F46E5' }} />
                </View>
                <View style={[styles.settingItem, isDarkMode && styles.darkBorder]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="location" size={22} color={isDarkMode ? '#9CA3AF' : '#4B5563'} />
                    <Text style={[styles.settingText, isDarkMode && styles.darkText]}>Background Tracking</Text>
                  </View>
                  <Switch value={true} trackColor={{ true: isDarkMode ? '#818CF8' : '#4F46E5' }} />
                </View>
                <View style={[styles.settingItem, isDarkMode && styles.darkBorder]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="moon" size={22} color={isDarkMode ? '#9CA3AF' : '#4B5563'} />
                    <Text style={[styles.settingText, isDarkMode && styles.darkText]}>Dark Mode</Text>
                  </View>
                  <Switch value={isDarkMode} onValueChange={(v) => setIsDarkMode(v)} trackColor={{ true: isDarkMode ? '#818CF8' : '#4F46E5' }} />
                </View>
              </View>
            )}

            {/* SUPPORT */}
            {activeModal === 'support' && (
              <View style={styles.supportContainer}>
                <Ionicons name="help-buoy" size={60} color={isDarkMode ? '#818CF8' : '#4F46E5'} style={{ alignSelf: 'center', marginBottom: 20 }} />
                <Text style={[styles.supportTitle, isDarkMode && styles.darkText]}>How can we help?</Text>
                <Text style={[styles.supportDesc, isDarkMode && styles.darkSubText]}>If you're having issues with tracking, attendance, or the app in general, please contact your admin directly or reach out to our support team.</Text>
                <TouchableOpacity style={[styles.supportBtn, isDarkMode && {backgroundColor: '#818CF8'}]} onPress={() => Alert.alert('Contact', 'Email sent to support@geostride.com')}>
                  <Ionicons name="mail" size={18} color="white" />
                  <Text style={styles.supportBtnText}>Email Support</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <FloatingChatButton />
    </View>
  );
}

const AVATAR_SIZE = 100;
const AVATAR_HALF = AVATAR_SIZE / 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  blueHeader: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '600' },
  avatarRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  avatarCircle: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_HALF,
    backgroundColor: 'white',
    borderWidth: 4, borderColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
  },
  cameraBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: '#4F46E5',
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'white',
  },
  whiteBody: { flex: 1, backgroundColor: '#F3F4F6', marginTop: -20 },
  scrollContent: { paddingTop: AVATAR_HALF + 20, paddingHorizontal: 20 },
  profileInfo: { alignItems: 'center', marginBottom: 30 },
  nameText: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  emailText: { fontSize: 14, color: '#6B7280', marginBottom: 12 },
  dutyBadge: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1,
  },
  dutyBadgeText: { fontSize: 12, fontWeight: '600' },
  menuContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconContainer: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center',
  },
  menuText: { fontSize: 15, fontWeight: '500', color: '#374151' },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 30, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB'
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalCloseBtn: { padding: 4 },
  modalBody: { padding: 20 },
  emptyText: { textAlign: 'center', color: '#6B7280', marginTop: 40 },
  recordCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  recordLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recordDate: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  recordSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  recordRight: { alignItems: 'flex-end' },
  timeText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  settingsGroup: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden' },
  settingItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  supportContainer: { alignItems: 'center', padding: 20, marginTop: 20 },
  supportTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 10 },
  supportDesc: { fontSize: 15, color: '#4B5563', textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#4F46E5', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12,
  },
  supportBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },
  // Dark Mode Styles
  darkContainer: { backgroundColor: '#111827' },
  darkBody: { backgroundColor: '#111827' },
  darkText: { color: '#F9FAFB' },
  darkSubText: { color: '#9CA3AF' },
  darkCard: { backgroundColor: '#1F2937' },
  darkBorder: { borderBottomColor: '#374151', borderColor: '#374151' },
  darkIconContainer: { backgroundColor: '#374151' },
  darkModalContainer: { backgroundColor: '#111827' },
  darkModalHeader: { backgroundColor: '#1F2937', borderBottomColor: '#374151' },
});
