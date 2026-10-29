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
  const [employee, setEmployee] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Modals state
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [history, setHistory] = useState([]);
  
  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);
  const formattedEmailName = currentEmail ? currentEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : '';
  const displayName = employee?.name || propUser?.name || route?.params?.user?.name || formattedEmailName || 'Employee';

  // Resolved Employee Credentials
  const empId = employee?.idNum || employee?.employeeId || employee?.empId || (employee?.id ? (employee.id.startsWith('emp_') ? employee.id.replace('emp_', 'EMP-').slice(0, 8).toUpperCase() : `EMP-${employee.id.slice(0, 4).toUpperCase()}`) : 'EMP-0492');
  const empDept = employee?.department || employee?.org || 'Operations';
  const empRole = employee?.role || employee?.type || employee?.jobTitle || employee?.position || 'Field Specialist';
  const empEmail = employee?.email || employee?.empEmail || currentEmail || 'employee@gmail.com';

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
          status: 'Online',
          department: 'Operations',
          role: 'Field Specialist',
          idNum: 'EMP-0492',
          profilePic: null
        };
      }

      const empKey = JSON.stringify({ 
        id: empData.id, 
        name: empData.name, 
        email: empData.email, 
        status: empData.status, 
        department: empData.department || empData.org,
        role: empData.role || empData.type,
        idNum: empData.idNum || empData.employeeId,
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

  // Pre-load attendance and activity history counts for the floating metrics card
  useEffect(() => {
    if (employee || currentEmail) {
      fetchModalData('attendance');
      fetchModalData('history');
    }
  }, [employee?.id, currentEmail]);

  const fetchModalData = async (type) => {
    if (!employee && !currentEmail) return;
    try {
      if (type === 'attendance') {
        const snap = await getDocs(collection(db, 'Attendance'));
        const empIdSearch = (employee?.id || '').toLowerCase();
        const empName = (employee?.name || currentEmail.split('@')[0]).toLowerCase();
        const emailToUse = currentEmail.toLowerCase();

        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => {
          const rId = (r.employee_id || r.employeeId || r.empId || '').toLowerCase();
          const rName = (r.employeeName || r.employee_name || r.name || '').toLowerCase();
          const rEmail = (r.email || r.employeeEmail || '').toLowerCase();

          if (emailToUse && rEmail && rEmail === emailToUse) return true;
          if (empIdSearch && rId && rId === empIdSearch) return true;
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
        const empIdSearch = (employee?.id || '').toLowerCase();
        const empName = (employee?.name || currentEmail.split('@')[0]).toLowerCase();

        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(log => {
          const lId = (log.employee_id || log.employeeId || log.empId || '').toLowerCase();
          const lName = (log.employeeName || log.employee_name || log.name || '').toLowerCase();
          if (empIdSearch && lId && lId === empIdSearch) return true;
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
    } else if (title === 'Anomaly Alerts') {
      navigation.navigate('AnomalyAlerts', { employee, user: propUser });
    } else if (title === 'Report Incident / Delay') {
      setShowDelayModal(true);
    } else if (title === 'Location History') {
      setActiveModal('history');
      fetchModalData('history');
    } else if (title === 'Settings') {
      setActiveModal('settings');
    } else if (title === 'Help & Feedback') {
      setActiveModal('support');
    } else if (title === 'App Version') {
      Alert.alert('App Update', 'GeoStride Mobile V2.0.8 is currently up to date.');
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
            const logoutCallback = onLogout || route?.params?.onLogout;
            if (typeof logoutCallback === 'function') {
              try { logoutCallback(); } catch (_) {}
            }
            try {
              await performGlobalLogout();
            } catch (e) {
              console.warn('Global logout error:', e);
            }
            try {
              presenceService.stopPresence(employee || propUser || { email: currentEmail }).catch(() => {});
            } catch (e) {
              console.warn('Presence stop error:', e);
            }
          } 
        }
      ],
      { cancelable: true }
    );
  };

  // ── Profile Photo Engine ──
  const applyNewProfilePic = async (photoUri) => {
    try {
      setUploading(true);
      setShowPhotoModal(false);
      setShowPresetsModal(false);

      setEmployee(prev => ({ ...(prev || {}), profilePic: photoUri }));

      if (currentEmail) {
        await AsyncStorage.setItem('subai_cached_profile_pic_' + currentEmail, photoUri || '');
      }

      const targetId = employee?.id || auth.currentUser?.uid || 'emp_' + (currentEmail ? currentEmail.replace(/[^a-zA-Z0-9]/g, '_') : Date.now());
      const empRef = doc(db, 'employees', targetId);
      await updateDoc(empRef, { 
        profilePic: photoUri || null,
        email: currentEmail,
        name: displayName
      });

      Alert.alert('Profile Updated', photoUri ? 'Your profile photo has been updated!' : 'Profile photo reset to default.');
    } catch (error) {
      console.error('Failed to apply profile photo:', error);
      Alert.alert('Upload Failed', 'There was an error saving your profile photo.');
    } finally {
      setUploading(false);
    }
  };

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

  const handleRemovePhoto = () => {
    Alert.alert(
      'Remove Photo',
      'Reset your profile picture to default?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => applyNewProfilePic(null) }
      ]
    );
  };

  return (
    <View style={[styles.container, isDarkMode && styles.darkContainer]}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        bounces={false}
      >
        {/* ── 1. Top Vibrant Blue Header (Curved Bottom) ── */}
        <View style={[styles.blueHeader, { paddingTop: insets.top + 8 }]}>
          {/* Top Header Bar: Settings Cog */}
          <View style={styles.topHeaderBar}>
            <View />
            <TouchableOpacity 
              style={styles.settingsHeaderBtn}
              onPress={() => setActiveModal('settings')}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-sharp" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* User Profile Identity Row */}
          <View style={styles.userIdentityRow}>
            {/* Avatar Circle with White Border */}
            <TouchableOpacity 
              onPress={() => setShowPhotoModal(true)} 
              disabled={uploading}
              activeOpacity={0.85}
              style={styles.avatarTouchable}
            >
              <View style={styles.avatarCircle}>
                {uploading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : employee?.profilePic ? (
                  <Image source={{ uri: employee.profilePic }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={38} color="#93C5FD" />
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={11} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Name & Subtitle */}
            <View style={styles.identityDetails}>
              <Text style={styles.userNameText} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.userSubtitleText} numberOfLines={1}>
                Employee ID: {empId}
              </Text>
              <Text style={styles.userEmailText} numberOfLines={1}>
                {empEmail}
              </Text>
            </View>

            {/* QR Code & Chevron */}
            <TouchableOpacity 
              style={styles.qrRowBtn}
              onPress={() => setShowQRModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="qr-code-outline" size={22} color="rgba(255, 255, 255, 0.95)" />
              <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 2. Floating Card (Department & Role / Job) ── */}
        <View style={[styles.floatingCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
          <View style={styles.metricColumn}>
            <Text style={[styles.metricLabel, isDarkMode && styles.darkSubText]}>DEPARTMENT</Text>
            <Text style={[styles.metricValue, isDarkMode && styles.darkText]} numberOfLines={1}>
              {empDept}
            </Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricColumn}>
            <Text style={[styles.metricLabel, isDarkMode && styles.darkSubText]}>ROLE / JOB</Text>
            <Text style={[styles.metricValue, isDarkMode && styles.darkText]} numberOfLines={1}>
              {empRole}
            </Text>
          </View>
        </View>

        {/* ── 3. Menu Group 1: Operations ── */}
        <View style={[styles.menuSectionCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
          {/* Item 1: My Assignments (Blue) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, isDarkMode && styles.darkBorder]} 
            onPress={() => handleMenuPress('My Assignments')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="clipboard" size={18} color="#2563EB" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>My Assignments</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {/* Item 3: My Attendance (Yellow/Amber) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, isDarkMode && styles.darkBorder]} 
            onPress={() => handleMenuPress('My Attendance')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="time" size={18} color="#D97706" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>My Attendance</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {/* Item 4: Location History (Purple/Indigo) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, isDarkMode && styles.darkBorder]} 
            onPress={() => handleMenuPress('Location History')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="location" size={18} color="#7C3AED" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>Location History</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {/* Item 5: Anomaly Alerts (Red) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, { borderBottomWidth: 0 }]} 
            onPress={() => handleMenuPress('Anomaly Alerts')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="shield-alert" size={18} color="#DC2626" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>Anomaly Alerts</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* ── 5. Menu Group 2: Support & Updates (Matches Group 2 in screenshot) ── */}
        <View style={[styles.menuSectionCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
          {/* Item 1: Report Incident / Delay (Coral/Pink) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, isDarkMode && styles.darkBorder]} 
            onPress={() => handleMenuPress('Report Incident / Delay')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#FFE4E6' }]}>
                <Ionicons name="warning" size={18} color="#E11D48" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>Report Incident / Delay</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {/* Item 2: Help & Feedback (Teal) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, isDarkMode && styles.darkBorder]} 
            onPress={() => handleMenuPress('Help & Feedback')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#CCFBF1' }]}>
                <Ionicons name="chatbubble-ellipses" size={18} color="#0D9488" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>Help & Feedback</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {/* Item 3: App Version (Blue with version tag V2.0.8) */}
          <TouchableOpacity 
            style={[styles.menuRowItem, { borderBottomWidth: 0 }]} 
            onPress={() => handleMenuPress('App Version')}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="cloud-download" size={18} color="#2563EB" />
              </View>
              <Text style={[styles.menuItemTitle, isDarkMode && styles.darkText]}>App Update</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.versionTagText, isDarkMode && styles.darkSubText]}>V2.0.8</Text>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 6. Logout Card ── */}
        <TouchableOpacity 
          style={[styles.logoutCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]} 
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.iconBadge, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            </View>
            <Text style={styles.logoutText}>Log Out</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#F87171" />
        </TouchableOpacity>
      </ScrollView>

      {/* ── Digital Employee ID Card & QR Modal ── */}
      <Modal
        visible={showQRModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <TouchableOpacity 
          style={styles.actionSheetBackdrop} 
          activeOpacity={1} 
          onPress={() => setShowQRModal(false)}
        >
          <View style={[styles.qrModalCard, isDarkMode && styles.darkCard]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            
            <View style={styles.qrHeaderRow}>
              <Text style={[styles.qrModalTitle, isDarkMode && styles.darkText]}>Digital Employee ID</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <Ionicons name="close-circle" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Visual Badge Card */}
            <View style={styles.idBadgeContainer}>
              <View style={styles.idBadgeHeader}>
                <Text style={styles.idBadgeBrand}>GEOSTRIDE WORKFORCE</Text>
                <View style={styles.idBadgeTag}>
                  <Text style={styles.idBadgeTagText}>VERIFIED</Text>
                </View>
              </View>

              <View style={styles.idBadgeBody}>
                <View style={styles.idBadgeAvatarCircle}>
                  {employee?.profilePic ? (
                    <Image source={{ uri: employee.profilePic }} style={styles.idBadgeAvatarImg} />
                  ) : (
                    <Ionicons name="person" size={32} color="#93C5FD" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.idBadgeName} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.idBadgeSub} numberOfLines={1}>{empRole} • {empDept}</Text>
                  <Text style={styles.idBadgeCode}>ID: {empId}</Text>
                </View>
              </View>

              {/* Stylized QR Code Graphic */}
              <View style={styles.qrCodeBox}>
                <View style={styles.qrCornerTL} />
                <View style={styles.qrCornerTR} />
                <View style={styles.qrCornerBL} />
                <View style={styles.qrCornerBR} />
                <Ionicons name="qr-code" size={120} color="#0F172A" />
                <View style={styles.qrCenterLogo}>
                  <Ionicons name="shield-checkmark" size={18} color="#2563EB" />
                </View>
              </View>

              <Text style={styles.idBadgeEmailText} numberOfLines={1}>
                {empEmail}
              </Text>
              <Text style={styles.qrInstructionText}>
                Present this QR code for biometric attendance and supervisor authorization
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.sheetCancelBtn} 
              onPress={() => setShowQRModal(false)}
            >
              <Text style={styles.sheetCancelText}>Close Badge</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                  <Text style={[styles.sheetOptionSub, isDarkMode && styles.darkSubText]}>Capture a new headshot with camera</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

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
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

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
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

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
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
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

      {/* ── Avatar Presets Selection Modal ── */}
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
                    <Text style={[styles.presetLabel, isDarkMode && styles.darkText, isSelected && { color: '#2563EB', fontWeight: '700' }]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Sub-Modals (Attendance, History, Settings, Support) ── */}
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
            {activeModal === 'attendance' && (
              <View>
                {attendance.length === 0 ? (
                  <Text style={[styles.emptyText, isDarkMode && styles.darkSubText]}>No attendance records found.</Text>
                ) : (
                  attendance.map((record, i) => (
                    <View key={i} style={[styles.recordCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
                      <View style={styles.recordLeft}>
                        <Ionicons name="calendar" size={20} color={isDarkMode ? '#818CF8' : '#2563EB'} />
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

            {activeModal === 'history' && (
              <View>
                {history.length === 0 ? (
                  <Text style={[styles.emptyText, isDarkMode && styles.darkSubText]}>No recent activity logs.</Text>
                ) : (
                  history.map((log, i) => {
                    const isAnomaly = (log.action || '').toLowerCase().includes('anomaly') || (log.status || '').toLowerCase().includes('anomaly');
                    return (
                      <View key={i} style={[styles.historyCard, isDarkMode && styles.darkCard, isDarkMode && styles.darkBorder]}>
                        <View style={styles.historyCardHeader}>
                          <View style={styles.historyIconTitleRow}>
                            <View style={[
                              styles.historyIconBadge,
                              isAnomaly ? styles.historyIconBadgeAnomaly : styles.historyIconBadgeNormal
                            ]}>
                              <Ionicons
                                name={isAnomaly ? "alert-circle" : "location"}
                                size={16}
                                color={isAnomaly ? "#EF4444" : "#10B981"}
                              />
                            </View>
                            <View style={styles.historyTitleCol}>
                              <Text style={[styles.historyActionTitle, isDarkMode && styles.darkText]} numberOfLines={2}>
                                {log.action || 'Location Activity'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.historyTimeBadge}>
                            <Text style={[styles.historyTimeText, isDarkMode && styles.darkSubText]}>
                              {formatDateTime(log.timestamp || log.time || log.createdAt)}
                            </Text>
                          </View>
                        </View>

                        {log.siteName ? (
                          <View style={styles.historySiteRow}>
                            <Ionicons name="navigate-outline" size={13} color={isDarkMode ? '#94A3B8' : '#64748B'} style={{ marginTop: 1 }} />
                            <Text style={[styles.historySiteText, isDarkMode && styles.darkSubText]} numberOfLines={2}>
                              {log.siteName}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {activeModal === 'settings' && (
              <View style={[styles.settingsGroup, isDarkMode && styles.darkCard]}>
                <View style={[styles.settingItem, isDarkMode && styles.darkBorder]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="notifications" size={22} color={isDarkMode ? '#9CA3AF' : '#4B5563'} />
                    <Text style={[styles.settingText, isDarkMode && styles.darkText]}>Push Notifications</Text>
                  </View>
                  <Switch value={true} trackColor={{ true: '#2563EB' }} />
                </View>
                <View style={[styles.settingItem, isDarkMode && styles.darkBorder]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="location" size={22} color={isDarkMode ? '#9CA3AF' : '#4B5563'} />
                    <Text style={[styles.settingText, isDarkMode && styles.darkText]}>Background Tracking</Text>
                  </View>
                  <Switch value={true} trackColor={{ true: '#2563EB' }} />
                </View>
                <View style={[styles.settingItem, isDarkMode && styles.darkBorder]}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="moon" size={22} color={isDarkMode ? '#9CA3AF' : '#4B5563'} />
                    <Text style={[styles.settingText, isDarkMode && styles.darkText]}>Dark Mode</Text>
                  </View>
                  <Switch value={isDarkMode} onValueChange={(v) => setIsDarkMode(v)} trackColor={{ true: '#2563EB' }} />
                </View>
              </View>
            )}

            {activeModal === 'support' && (
              <View style={styles.supportContainer}>
                <Ionicons name="help-buoy" size={60} color={isDarkMode ? '#818CF8' : '#2563EB'} style={{ alignSelf: 'center', marginBottom: 20 }} />
                <Text style={[styles.supportTitle, isDarkMode && styles.darkText]}>How can we help?</Text>
                <Text style={[styles.supportDesc, isDarkMode && styles.darkSubText]}>If you're having issues with tracking, attendance, or the app in general, please contact your admin directly or reach out to our support team.</Text>
                <TouchableOpacity style={[styles.supportBtn, isDarkMode && {backgroundColor: '#2563EB'}]} onPress={() => Alert.alert('Contact', 'Email sent to support@geostride.com')}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  // ── Blue Header ──
  blueHeader: {
    backgroundColor: '#2563EB',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  topHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  settingsHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1E40AF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1D4ED8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityDetails: {
    flex: 1,
  },
  userNameText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  userSubtitleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 2,
  },
  userEmailText: {
    fontSize: 11.5,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.78)',
    marginTop: 2,
  },
  qrRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 12,
  },

  // ── Floating Dual Metrics Card ──
  floatingCard: {
    marginHorizontal: 16,
    marginTop: -32,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  metricDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },

  // ── Menu Cards Common ──
  menuSectionCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Credential Rows ──
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  credentialTextWrap: {
    flex: 1,
  },
  credentialLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  credentialValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },

  // ── Menu Items ──
  menuRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  versionTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // ── Logout Card ──
  logoutCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  logoutText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#DC2626',
  },

  // ── Modals & Action Sheets ──
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
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
    backgroundColor: 'white', padding: 16, borderRadius: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  recordLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 8 },
  recordDate: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  recordSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  recordRight: { alignItems: 'flex-end', flexShrink: 0 },
  timeText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },

  // Responsive Location History Card styles
  historyCard: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyIconTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minWidth: 0,
  },
  historyIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  historyIconBadgeNormal: {
    backgroundColor: '#ECFDF5',
  },
  historyIconBadgeAnomaly: {
    backgroundColor: '#FEF2F2',
  },
  historyTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  historyActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  historyTimeBadge: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    flexShrink: 0,
    paddingLeft: 4,
    paddingTop: 1,
  },
  historyTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 16,
  },
  historySiteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    paddingLeft: 40,
  },
  historySiteText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
    lineHeight: 16,
  },
  settingsGroup: { backgroundColor: 'white', borderRadius: 14, overflow: 'hidden' },
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
    backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12,
  },
  supportBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },

  // Action Sheet Backdrop
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
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

  // ── QR Modal Styles ──
  qrModalCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  qrHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  idBadgeContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  idBadgeHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
    marginBottom: 14,
  },
  idBadgeBrand: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.8,
  },
  idBadgeTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  idBadgeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.5,
  },
  idBadgeBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  idBadgeAvatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  idBadgeAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  idBadgeName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  idBadgeSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  idBadgeCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  qrCodeBox: {
    width: 170,
    height: 170,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrCenterLogo: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  qrCornerTL: { position: 'absolute', top: 8, left: 8, width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: '#2563EB' },
  qrCornerTR: { position: 'absolute', top: 8, right: 8, width: 14, height: 14, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#2563EB' },
  qrCornerBL: { position: 'absolute', bottom: 8, left: 8, width: 14, height: 14, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: '#2563EB' },
  qrCornerBR: { position: 'absolute', bottom: 8, right: 8, width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#2563EB' },
  idBadgeEmailText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 6,
  },
  qrInstructionText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 15,
  },

  // ── Presets Modal Styles ──
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
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
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
    backgroundColor: '#2563EB',
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
  darkContainer: { backgroundColor: '#0B0F19' },
  darkText: { color: '#F9FAFB' },
  darkSubText: { color: '#94A3B8' },
  darkCard: { backgroundColor: '#1E293B', borderColor: '#334155' },
  darkBorder: { borderBottomColor: '#334155', borderColor: '#334155' },
  darkModalContainer: { backgroundColor: '#0B0F19' },
  darkModalHeader: { backgroundColor: '#1E293B', borderBottomColor: '#334155' },
});
