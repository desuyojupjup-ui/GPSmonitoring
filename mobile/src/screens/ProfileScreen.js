import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Modal, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, signOut, collection, query, where, onSnapshot, doc, updateDoc, getDocs, getCleanEmployeeEmail, performGlobalLogout } from '../firebase';

import DelayIncidentModal from '../components/DelayIncidentModal';
import presenceService from '../services/presenceService';

const AVATAR_PRESETS = [
  { id: 'av1', label: 'Field Specialist', uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80' },
  { id: 'av2', label: 'Operations Lead', uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80' },
  { id: 'av3', label: 'Site Coordinator', uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80' },
  { id: 'av4', label: 'Project Engineer', uri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80' },
  { id: 'av5', label: 'Safety Supervisor', uri: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80' },
  { id: 'av6', label: 'Fleet Dispatcher', uri: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80' },
  { id: 'av7', label: 'Field Technician', uri: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&auto=format&fit=crop&q=80' },
  { id: 'av8', label: 'Logistics Officer', uri: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=300&auto=format&fit=crop&q=80' },
];

function parseDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts?.toDate === 'function') {
    try { const d = ts.toDate(); if (d instanceof Date && !isNaN(d.getTime())) return d; } catch(e){}
  }
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === 'object' && ts !== null) {
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0));
    }
    if (typeof ts._seconds === 'number') {
      return new Date(ts._seconds * 1000 + (ts._nanoseconds ? Math.floor(ts._nanoseconds / 1e6) : 0));
    }
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function formatTime(val) {
  if (!val) return '--:--';
  if (typeof val === 'string' && /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(val.trim())) {
    return val.trim();
  }
  const d = parseDate(val);
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(val) {
  if (!val) return '—';
  const d = parseDate(val);
  if (!d) return typeof val === 'string' ? val : '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(val) {
  if (!val) return 'N/A';
  const d = parseDate(val);
  if (!d) return typeof val === 'string' ? val : 'N/A';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ProfileScreen({ navigation, route, user: propUser, onLogout }) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [employee, setEmployee] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Photo Picker Modals
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);

  // Modals state
  const [activeModal, setActiveModal] = useState(null);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  
  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);
  const formattedEmailName = currentEmail ? currentEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : '';
  const displayName = employee?.name || propUser?.name || route?.params?.user?.name || formattedEmailName || 'Employee';

  const lastEmpKeyRef = React.useRef('');
  useEffect(() => {
    if (!currentEmail) return;

    // Load locally cached avatar on startup for immediate display
    AsyncStorage.getItem('subai_cached_profile_pic_' + currentEmail).then(cached => {
      if (cached) {
        setEmployee(prev => prev ? ({ ...prev, profilePic: prev.profilePic || cached }) : ({ id: 'cached_' + currentEmail, email: currentEmail, profilePic: cached }));
      }
    }).catch(() => {});

    const unsub = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const authUid = (auth.currentUser?.uid || '').trim().toLowerCase();
      const emailPrefix = currentEmail.split('@')[0];

      let matchingDoc = null;
      if (!snapshot.empty) {
        matchingDoc = snapshot.docs.find(d => {
          const data = d.data();
          const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
          const empUid = (data.uid || data.firebaseUid || d.id || '').toString().trim().toLowerCase();
          if (authUid && empUid && authUid === empUid) return true;
          if (empMail && empMail === currentEmail) return true;
          if (emailPrefix && empMail && empMail.startsWith(emailPrefix + '@')) return true;
          return false;
        });
      }

      let empData = null;
      if (matchingDoc) {
        empData = { id: matchingDoc.id, ...matchingDoc.data() };
      } else {
        empData = {
          id: auth.currentUser?.uid || 'emp_' + currentEmail.replace(/[^a-zA-Z0-9]/g, '_'),
          name: displayName,
          email: currentEmail,
          status: 'On Duty',
          profilePic: null
        };
      }

      const empKey = JSON.stringify({ 
        id: empData.id, 
        name: empData.name, 
        email: empData.email, 
        status: empData.status, 
        assignedSite: empData.assignedSite,
        profilePic: empData.profilePic 
      });
      if (empKey !== lastEmpKeyRef.current) {
        lastEmpKeyRef.current = empKey;
        setEmployee(empData);
      }
    });
    return () => unsub();
  }, [currentEmail]);

  const fetchModalData = async (type) => {
    if (!employee && !currentEmail) return;
    try {
      if (type === 'attendance') {
        const snap = await getDocs(collection(db, 'Attendance'));
        const empId = (employee?.id || '').toLowerCase();
        const empName = (employee?.name || currentEmail.split('@')[0]).toLowerCase();
        const emailToUse = currentEmail.toLowerCase();

        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => {
          const rId = (r.employee_id || r.employeeId || r.empId || '').toLowerCase();
          const rName = (r.employeeName || r.employee_name || r.name || '').toLowerCase();
          const rEmail = (r.email || r.employeeEmail || '').toLowerCase();

          if (emailToUse && rEmail && rEmail === emailToUse) return true;
          if (empId && rId && rId === empId) return true;
          if (empName && rName && (rName === empName || rName.includes(empName) || empName.includes(rName))) return true;
          return false;
        });

        data.sort((a,b) => {
          const tA = parseDate(a.date || a.timeIn || a.createdAt)?.getTime() || 0;
          const tB = parseDate(b.date || b.timeIn || b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
        setAttendance(data);
      } else if (type === 'history') {
        const snap = await getDocs(collection(db, 'ActivityLogs'));
        const empId = (employee?.id || '').toLowerCase();
        const empName = (employee?.name || currentEmail.split('@')[0]).toLowerCase();

        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(log => {
          const lId = (log.employee_id || log.employeeId || log.empId || '').toLowerCase();
          const lName = (log.employeeName || log.employee_name || log.name || '').toLowerCase();
          if (empId && lId && lId === empId) return true;
          if (empName && lName && (lName === empName || lName.includes(empName) || empName.includes(lName))) return true;
          return false;
        });

        data.sort((a,b) => {
          const tA = parseDate(a.timestamp || a.time || a.createdAt)?.getTime() || 0;
          const tB = parseDate(b.timestamp || b.time || b.createdAt)?.getTime() || 0;
          return tB - tA;
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
      navigation.navigate('Attendance');
    } else if (title === 'Report Incident / Delay') {
      setShowDelayModal(true);
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
      'Are you sure you want to log out of your session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await presenceService.stopPresence(employee || propUser || { email: currentEmail });
            } catch (e) {
              console.warn('Presence stop error:', e);
            }
            try {
              await performGlobalLogout();
            } catch (e) {
              console.warn('Global logout error:', e);
            }
            const logoutCallback = onLogout || route?.params?.onLogout;
            if (typeof logoutCallback === 'function') {
              try { logoutCallback(); } catch (_) {}
            }
          } 
        }
      ],
      { cancelable: true }
    );
  };

  // ── Profile Photo Application Engine ──
  const applyNewProfilePic = async (photoUri) => {
    try {
      setUploading(true);
      setShowPhotoModal(false);
      setShowPresetsModal(false);

      // 1. Instant optimistic state update
      setEmployee(prev => ({ ...(prev || {}), profilePic: photoUri }));

      // 2. Cache in persistent AsyncStorage
      if (currentEmail) {
        await AsyncStorage.setItem('subai_cached_profile_pic_' + currentEmail, photoUri || '');
      }

      // 3. Resolve employee ID
      const empId = employee?.id || auth.currentUser?.uid || 'emp_' + (currentEmail ? currentEmail.replace(/[^a-zA-Z0-9]/g, '_') : Date.now());

      // 4. Update Firestore & Local Storage
      const empRef = doc(db, 'employees', empId);
      empRef.email = currentEmail;
      await updateDoc(empRef, { 
        profilePic: photoUri || null,
        email: currentEmail,
        name: displayName
      });

      // 5. Update window localStorage if running in web mode
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem('subai_store_employees');
          if (raw) {
            const emps = JSON.parse(raw);
            if (Array.isArray(emps)) {
              let matched = false;
              const updated = emps.map(e => {
                const eMail = (e.email || e.empEmail || '').trim().toLowerCase();
                if (e.id === empId || (currentEmail && eMail === currentEmail)) {
                  matched = true;
                  return { ...e, profilePic: photoUri || null };
                }
                return e;
              });
              if (!matched && empId) {
                updated.push({
                  id: empId,
                  name: displayName,
                  email: currentEmail,
                  profilePic: photoUri || null,
                  status: 'On Duty'
                });
              }
              window.localStorage.setItem('subai_store_employees', JSON.stringify(updated));
            }
          }
        } catch (e) {}
      }

      Alert.alert('Profile Updated', photoUri ? 'Your profile photo has been updated!' : 'Profile photo reset to default.');
    } catch (error) {
      console.error('Failed to apply profile photo:', error);
      Alert.alert('Upload Failed', 'There was an error saving your profile photo.');
    } finally {
      setUploading(false);
    }
  };

  // Option 1: Capture with Camera
  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission Required', 'Please allow camera access to take a profile photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const photoUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        await applyNewProfilePic(photoUri);
      }
    } catch (error) {
      console.error('Camera capture error:', error);
      Alert.alert('Camera Error', 'Could not open camera on this device.');
    }
  };

  // Option 2: Select from Device Gallery
  const handlePickGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow photo gallery access to select a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const photoUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        await applyNewProfilePic(photoUri);
      }
    } catch (error) {
      console.error('Gallery pick error:', error);
      Alert.alert('Gallery Error', 'Could not open photo gallery.');
    }
  };

  // Option 3: Remove Custom Photo
  const handleRemovePhoto = () => {
    Alert.alert(
      'Remove Photo',
      'Reset your profile picture to default?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive', 
          onPress: () => applyNewProfilePic(null) 
        }
      ]
    );
  };

  const menuItems = [
    { icon: 'clipboard-outline',   title: 'My Assignments' },
    { icon: 'time-outline',        title: 'My Attendance' },
    { icon: 'warning-outline',     title: 'Report Incident / Delay' },
    { icon: 'location-outline',    title: 'Location History' },
    { icon: 'settings-outline',    title: 'Settings' },
    { icon: 'help-circle-outline', title: 'Help & Support' },
  ];

  return (
    <View style={[styles.container, isDarkMode && styles.darkContainer]}>
      {/* ── Blue Header ── */}
      <View
        style={[styles.blueHeader, { paddingTop: insets.top + 14, justifyContent: 'center' }]}
        onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {/* ── Avatar overlapping the boundary ── */}
      {headerHeight > 0 && (
        <View style={[styles.avatarRow, { top: headerHeight - AVATAR_HALF }]}>
          <TouchableOpacity 
            onPress={() => setShowPhotoModal(true)} 
            disabled={uploading}
            activeOpacity={0.85}
          >
            <View style={[styles.avatarCircle, { overflow: 'hidden' }]}>
              {uploading ? (
                <ActivityIndicator color="#4F46E5" size="large" />
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
            <Text style={[styles.nameText, isDarkMode && styles.darkText]}>{displayName}</Text>
            <Text style={[styles.emailText, isDarkMode && styles.darkSubText]}>{currentEmail}</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[styles.dutyBadge, { backgroundColor: employee?.status === 'On Site' ? '#D1FAE5' : (isDarkMode ? '#374151' : '#F3F4F6'), borderColor: employee?.status === 'On Site' ? '#10B981' : (isDarkMode ? '#4B5563' : '#E5E7EB') }]}>
                <Text style={[styles.dutyBadgeText, { color: employee?.status === 'On Site' ? '#059669' : (isDarkMode ? '#D1D5DB' : '#6B7280') }]}>{employee?.status || 'On Duty'}</Text>
              </View>

              <TouchableOpacity 
                style={styles.changePhotoPill}
                onPress={() => setShowPhotoModal(true)}
                disabled={uploading}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={13} color="#4F46E5" />
                <Text style={styles.changePhotoPillText}>Change Photo</Text>
              </TouchableOpacity>
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
                            {formatDate(record.date || record.timeIn || record.checkIn)}
                          </Text>
                          <Text style={[styles.recordSub, isDarkMode && styles.darkSubText]}>Site: {record.siteName || 'N/A'}</Text>
                        </View>
                      </View>
                      <View style={styles.recordRight}>
                        <Text style={[styles.timeText, isDarkMode && styles.darkSubText]}>In: {formatTime(record.timeIn || record.checkIn || record.check_in)}</Text>
                        <Text style={[styles.timeText, isDarkMode && styles.darkSubText]}>Out: {formatTime(record.timeOut || record.checkOut || record.check_out)}</Text>
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
                        {formatDateTime(log.timestamp || log.time || log.createdAt)}
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
                <TouchableOpacity style={[styles.supportBtn, isDarkMode && {backgroundColor: '#818CF8'}]} onPress={() => Alert.alert('Contact', 'Email sent to support@subai.com')}>
                  <Ionicons name="mail" size={18} color="white" />
                  <Text style={styles.supportBtnText}>Email Support</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <DelayIncidentModal
        visible={showDelayModal}
        employee={employee}
        onClose={() => setShowDelayModal(false)}
      />

      {/* ── Profile Photo Action Sheet Modal ── */}
      <Modal
        visible={showPhotoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <TouchableOpacity 
          style={styles.actionSheetBackdrop} 
          activeOpacity={1} 
          onPress={() => setShowPhotoModal(false)}
        >
          <View style={[styles.actionSheetCard, isDarkMode && styles.darkCard]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.actionSheetTitle, isDarkMode && styles.darkText]}>Change Profile Photo</Text>
            <Text style={[styles.actionSheetSubtitle, isDarkMode && styles.darkSubText]}>
              Personalize your field profile appearance
            </Text>

            <View style={styles.sheetOptions}>
              {/* Option 1: Take Photo */}
              <TouchableOpacity 
                style={[styles.sheetOptionBtn, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]} 
                onPress={handleTakePhoto}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconBg, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="camera" size={22} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetOptionTitle, isDarkMode && styles.darkText]}>Take Photo</Text>
                  <Text style={[styles.sheetOptionSub, isDarkMode && styles.darkSubText]}>Capture a new headshot with your camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Option 2: Choose from Gallery */}
              <TouchableOpacity 
                style={[styles.sheetOptionBtn, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]} 
                onPress={handlePickGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconBg, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="images" size={22} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetOptionTitle, isDarkMode && styles.darkText]}>Choose from Gallery</Text>
                  <Text style={[styles.sheetOptionSub, isDarkMode && styles.darkSubText]}>Select an existing picture from your device</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Option 3: Choose Avatar Preset */}
              <TouchableOpacity 
                style={[styles.sheetOptionBtn, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]} 
                onPress={() => {
                  setShowPhotoModal(false);
                  setTimeout(() => setShowPresetsModal(true), 250);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconBg, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="person-circle" size={24} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetOptionTitle, isDarkMode && styles.darkText]}>Choose Avatar Preset</Text>
                  <Text style={[styles.sheetOptionSub, isDarkMode && styles.darkSubText]}>Select from 8 professional workplace avatars</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Option 4: Remove Photo (if present) */}
              {employee?.profilePic && (
                <TouchableOpacity 
                  style={[styles.sheetOptionBtn, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]} 
                  onPress={handleRemovePhoto}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetIconBg, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="trash-outline" size={22} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sheetOptionTitle, { color: '#DC2626' }]}>Remove Photo</Text>
                    <Text style={[styles.sheetOptionSub, isDarkMode && styles.darkSubText]}>Reset back to default employee avatar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity 
              style={[styles.sheetCancelBtn, isDarkMode && { backgroundColor: '#374151' }]} 
              onPress={() => setShowPhotoModal(false)}
            >
              <Text style={[styles.sheetCancelText, isDarkMode && styles.darkText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Preset Avatars Selection Modal ── */}
      <Modal
        visible={showPresetsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPresetsModal(false)}
      >
        <View style={[styles.modalContainer, isDarkMode && styles.darkModalContainer]}>
          <View style={[styles.modalHeader, isDarkMode && styles.darkModalHeader]}>
            <View>
              <Text style={[styles.modalTitle, isDarkMode && styles.darkText]}>Choose an Avatar</Text>
              <Text style={[{ fontSize: 13, color: '#6B7280', marginTop: 2 }, isDarkMode && styles.darkSubText]}>
                Select a professional preset for your profile
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowPresetsModal(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={isDarkMode ? 'white' : '#374151'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 50 }}>
            <View style={styles.presetsGrid}>
              {AVATAR_PRESETS.map((preset) => {
                const isSelected = employee?.profilePic === preset.uri;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[
                      styles.presetCard,
                      isDarkMode && styles.darkCard,
                      isSelected && styles.presetCardSelected
                    ]}
                    onPress={() => applyNewProfilePic(preset.uri)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.presetImageWrapper}>
                      <Image source={{ uri: preset.uri }} style={styles.presetImage} />
                      {isSelected && (
                        <View style={styles.presetCheckmark}>
                          <Ionicons name="checkmark" size={14} color="white" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.presetLabel, isDarkMode && styles.darkText, isSelected && { color: '#4F46E5', fontWeight: '700' }]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  changePhotoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  changePhotoPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
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
  // Action Sheet Styles
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  actionSheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  sheetOptions: {
    gap: 10,
    marginBottom: 16,
  },
  sheetOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  sheetIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  sheetOptionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sheetCancelBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  // Avatar Presets Styles
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  presetCard: {
    width: '47%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  presetCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#F5F3FF',
  },
  presetImageWrapper: {
    width: 76,
    height: 76,
    borderRadius: 38,
    position: 'relative',
    marginBottom: 10,
  },
  presetImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  presetCheckmark: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4F46E5',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
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

