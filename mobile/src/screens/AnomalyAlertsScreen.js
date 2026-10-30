import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  auth,
  db,
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  ensureAuthenticatedSession,
  getCleanEmployeeEmail,
} from '../firebase';
import {
  personalizeAnomalyDescription,
  personalizeAnomalyTitle,
} from '../utils/assignmentUtils';

const GENERAL_PRESET_REASONS = [
  'Network / Cellular Connection Drop',
  'Indoor GPS Signal Drift',
  'Attending to Urgent Field Task',
  'Temporary Camera / App Glitch',
  'Traffic Delay en route to Worksite',
];

const GEOFENCE_PRESET_REASONS = [
  'Assigned to temporary task at adjacent client building',
  'Indoor GPS signal drift / cellular degradation',
  'Authorized break / errand outside worksite perimeter',
  'Worksite boundary coordinates offset by supervisor',
  'Device battery saver / location accuracy degradation',
];

const SHIFT_PRESET_REASONS = [
  'Severe traffic congestion on transit to worksite',
  'Sudden medical emergency / sickness reported to supervisor',
  'Emergency client field dispatch before shift start',
  'Mobile app login / network cellular failure',
  'Shift schedule change / rescheduling requested with supervisor',
];

export default function AnomalyAlertsScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'pending' | 'responded' | 'resolved'
  const [employeeRecord, setEmployeeRecord] = useState(route?.params?.employee || propUser || null);

  // Response Modal State
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [responsePhoto, setResponsePhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const empParam = route?.params?.employee || employeeRecord || propUser || {};

  const cleanAuthEmail = (auth.currentUser?.email || '').toLowerCase().trim();
  const rawEmpEmail = (empParam?.email || route?.params?.user?.email || propUser?.email || '').toLowerCase().trim();
  const currentEmail = rawEmpEmail || (cleanAuthEmail && !cleanAuthEmail.includes('admin@') ? cleanAuthEmail : (cleanAuthEmail || ''));

  const empEmails = Array.from(new Set([
    currentEmail,
    cleanAuthEmail,
    employeeRecord?.email,
    employeeRecord?.workEmail,
    empParam?.email,
    route?.params?.user?.email,
    propUser?.email,
  ].filter(x => Boolean(x) && String(x).trim() !== '').map(e => String(e).trim().toLowerCase())));

  const empIds = Array.from(new Set([
    employeeRecord?.id,
    employeeRecord?.idNum,
    employeeRecord?.empId,
    employeeRecord?.employeeId,
    employeeRecord?.uid,
    empParam?.id,
    empParam?.idNum,
    empParam?.empId,
    empParam?.employeeId,
    empParam?.uid,
    route?.params?.user?.id,
    route?.params?.user?.uid,
    route?.params?.user?.empId,
    propUser?.id,
    propUser?.uid,
    propUser?.empId,
    auth.currentUser?.uid,
  ].filter(x => x !== undefined && x !== null && String(x).trim() !== '' && String(x).trim() !== 'emp_fallback')
   .map(x => String(x).trim().toLowerCase())));

  const genericNameWords = [
    'employee', 'user', 'guard', 'staff', 'admin', 'officer',
    'field employee', 'fixed employee', 'fixed site employee', 'mobile employee', 'mobile field employee',
    'personnel', 'security', 'unassigned', 'unknown', 'system', 'test', 'demo'
  ];

  const empNames = Array.from(new Set([
    employeeRecord?.name,
    employeeRecord?.displayName,
    employeeRecord?.fullName,
    empParam?.name,
    empParam?.displayName,
    route?.params?.user?.name,
    propUser?.name,
    auth.currentUser?.displayName,
  ].filter(x => Boolean(x) && String(x).trim() !== '')
   .map(n => String(n).trim().toLowerCase())
   .filter(n => n.length >= 2 && !genericNameWords.includes(n) && !n.includes('employee'))));

  const currentUserName = empNames[0] || '';

  const emailPrefixes = empEmails
    .map(e => e.split('@')[0].trim().toLowerCase())
    .filter(Boolean);

  // ── Sync Employee Work Type (Fixed Site vs Mobile Field) ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
      const emailLower = (currentEmail || '').toLowerCase();
      const uid = (auth.currentUser?.uid || '').toLowerCase();
      snap.forEach((d) => {
        const data = d.data();
        const dEmail = (data.email || '').toLowerCase();
        const dId = (d.id || '').toLowerCase();
        if (dId === uid || empIds.includes(dId) || (dEmail && (dEmail === emailLower || emailPrefixes.includes(dEmail.split('@')[0])))) {
          setEmployeeRecord({ id: d.id, ...data });
        }
      });
    }, () => {});
    return () => unsub();
  }, [currentEmail, empIds.join(',')]);

  const empWorkType = (employeeRecord?.workType || employeeRecord?.employeeType || employeeRecord?.type || empParam?.workType || '').toString().toLowerCase();
  const isFieldEmployee = empWorkType.includes('mobile') || empWorkType.includes('field');

  // Helper: detect outside geofence alerts
  const isOutsideGeofenceAlert = (item) => {
    if (!item) return false;
    const t = (item.type || item.eventType || item.title || item.action || '').toString().toLowerCase();
    const desc = (item.description || item.reason || '').toString().toLowerCase();
    const cat = (item.category || '').toString().toLowerCase();
    return (
      item.eventType === 'UNAUTHORIZED_LOCATION' ||
      cat.includes('geofence') ||
      t.includes('geofence') ||
      t.includes('unauthorized location') ||
      desc.includes('geofence') ||
      desc.includes('outside the assigned geofence') ||
      desc.includes('outside assigned site') ||
      desc.includes('outside your assigned site radius')
    );
  };

  // Helper: Normalize alert status so only explicitly resolved items show resolved
  const normalizeAlertStatus = (rawStatus, hasEmployeeResponse) => {
    const s = String(rawStatus || '').trim().toLowerCase();
    if (s === 'resolved' || s === 'dismissed' || s === 'approved' || s === 'closed') {
      return 'Resolved';
    }
    if (hasEmployeeResponse || s === 'responded' || s === 'under review' || s === 'under_review') {
      return 'Responded';
    }
    return 'Pending Response';
  };

  // ── Real-Time Listener for Employee Anomaly Alerts ──
  useEffect(() => {
    ensureAuthenticatedSession();

    let aiDocs = [];
    let logDocs = [];
    let facialDocs = [];

    // Strictly match anomaly records that belong to THIS employee only
    const matchesEmployee = (item) => {
      if (!item) return false;

      // 1. Gather all candidate IDs from the item (including nested employee object)
      const itemIds = [
        item.employeeId,
        item.employee_id,
        item.employeeUid,
        item.empId,
        item.userId,
        item.userUid,
        item.guardId,
        item.uid,
        item.employee?.id,
        item.employee?.employeeId,
        item.employee?.uid,
        item.user?.id,
        item.user?.uid,
        item.guard?.id,
      ].filter(x => x !== undefined && x !== null && String(x).trim() !== '' && String(x).trim() !== 'emp_fallback')
       .map(x => String(x).trim().toLowerCase());

      // 2. Gather all candidate emails from the item (including nested employee object)
      const itemEmails = [
        item.employeeEmail,
        item.email,
        item.empEmail,
        item.userEmail,
        item.employee?.email,
        item.user?.email,
      ].filter(x => Boolean(x) && String(x).trim() !== '')
       .map(e => String(e).trim().toLowerCase());

      // 3. Gather candidate employee names (excluding generic terms like 'Fixed Site Employee')
      const itemNames = [
        item.employeeName,
        item.empName,
        item.userName,
        item.employee?.name,
        item.user?.name,
        item.employeeName ? null : item.name,
      ].filter(x => Boolean(x) && String(x).trim() !== '')
       .map(n => String(n).trim().toLowerCase())
       .filter(n => !genericNameWords.includes(n) && !n.includes('verification') && !n.includes('anomaly') && !n.includes('attendance') && !n.includes('telemetry') && !n.includes('employee'));

      // ── STRICT RULE 1: ID Matching & Conflict Rejection ──
      // If the alert record explicitly specifies an employee ID:
      if (itemIds.length > 0) {
        if (empIds.length > 0 && itemIds.some(id => empIds.includes(id))) {
          return true;
        }
        // ID Conflict: the alert explicitly belongs to another employee ID!
        return false;
      }

      // ── STRICT RULE 2: Email Matching & Conflict Rejection ──
      // If the alert record explicitly specifies an employee Email:
      if (itemEmails.length > 0) {
        if (empEmails.length > 0 && itemEmails.some(ie => empEmails.includes(ie))) {
          return true;
        }
        // Email Conflict: the alert explicitly belongs to another employee Email!
        return false;
      }

      // ── STRICT RULE 3: Exact Full Name Matching (Fallback only when item lacks both ID and Email) ──
      if (empNames.length > 0 && itemNames.length > 0) {
        for (const iName of itemNames) {
          for (const myName of empNames) {
            if (iName === myName) return true;
            const parts = myName.split(/\s+/);
            if (parts.length > 1) {
              const reversed = parts.slice().reverse().join(' ');
              if (iName === reversed) return true;
            }
          }
        }
      }

      // No reliable match to this employee: reject so other employees' alerts never appear
      return false;
    };

    const mergeAndProcess = () => {
      const map = new Map();

      // 1. Process ai_analysis documents
      aiDocs.forEach((d) => {
        if (!matchesEmployee(d)) return;
        if (isFieldEmployee && isOutsideGeofenceAlert(d)) return;

        const id = d.id;
        const rawType = d.type || d.eventType || d.title || 'Security Anomaly';
        const type = personalizeAnomalyTitle(rawType, empNames);
        const severity = d.severity === 'Critical' ? 'High' : (d.severity || 'Medium');
        const status = normalizeAlertStatus(d.status, Boolean(d.employeeResponse));

        map.set(id, {
          id,
          title: personalizeAnomalyTitle(d.title || type, empNames),
          type,
          category: categorizeAnomaly(rawType),
          severity,
          status,
          description: personalizeAnomalyDescription(d.description || d.reason || 'Unusual system telemetry detected during your shift.', empNames),
          location: d.location || d.siteName || 'Assigned Worksite',
          timestamp: d.timestamp || d.createdAt,
          employeeResponse: d.employeeResponse || null,
          respondedAt: d.respondedAt || null,
          responsePhoto: d.responsePhoto || null,
          read: d.read || d.viewedByEmployee || false,
          viewedByEmployee: d.viewedByEmployee || d.read || false,
          sourceCollection: 'ai_analysis',
        });
      });

      // 2. Process ActivityLogs with anomaly status or security types
      logDocs.forEach((d) => {
        if (!matchesEmployee(d)) return;
        if (isFieldEmployee && isOutsideGeofenceAlert(d)) return;

        const isAnomaly = d.type === 'Security Anomaly' || d.type === 'Anomaly' || d.status === 'Warning' || d.status === 'Error' || (d.action && (d.action.includes('Anomaly') || d.action.includes('Failed') || d.action.includes('Flagged')));
        if (!isAnomaly) return;

        // Skip if directly linked to an existing ai_analysis alert
        if (d.anomalyId && map.has(d.anomalyId)) return;

        const id = d.anomalyId || d.id;
        if (map.has(id)) return;

        // Deduplicate early departure / checkout logs if an early departure alert already exists in map
        const isEarlyDepartureLog = (d.action && (d.action.includes('Early Departure') || d.action.includes('Early Check-Out'))) ||
                                    (d.title && (d.title.includes('Early Departure') || d.title.includes('Early Check-Out')));
        if (isEarlyDepartureLog) {
          const logTs = getTsMillis(d.timestamp || d.createdAt);
          const alreadyHasEarlyAlert = Array.from(map.values()).some((existing) => {
            const isEarlyAnomaly = (existing.type && (existing.type.includes('Early') || existing.type.includes('Departure'))) ||
                                   (existing.title && (existing.title.includes('Early') || existing.title.includes('Departure')));
            if (!isEarlyAnomaly) return false;
            const exTs = getTsMillis(existing.timestamp);
            return Math.abs(exTs - logTs) < 30 * 60 * 1000;
          });

          if (alreadyHasEarlyAlert) {
            // Skip redundant check-out log so employee only sees the primary actionable alert
            return;
          }
        }

        const rawType = d.title || d.action || 'Telemetry Discrepancy';
        const type = personalizeAnomalyTitle(rawType, empNames);
        const status = normalizeAlertStatus(d.status, Boolean(d.employeeResponse));
        map.set(id, {
          id,
          title: personalizeAnomalyTitle(d.title || d.action || 'Security Anomaly', empNames),
          type,
          category: categorizeAnomaly(rawType),
          severity: d.severity || 'Medium',
          status,
          description: personalizeAnomalyDescription(d.description || d.action || 'Unusual activity flagged by monitoring service for your shift.', empNames),
          location: d.siteName || d.location || 'Assigned Worksite',
          timestamp: d.timestamp || d.createdAt,
          employeeResponse: d.employeeResponse || null,
          respondedAt: d.respondedAt || null,
          responsePhoto: d.responsePhoto || null,
          read: d.read || d.viewedByEmployee || false,
          viewedByEmployee: d.viewedByEmployee || d.read || false,
          sourceCollection: 'ActivityLogs',
        });
      });

      // 3. Process facial_verifications for missed or failed verification
      facialDocs.forEach((d) => {
        if (!matchesEmployee(d)) return;
        if (isFieldEmployee && isOutsideGeofenceAlert(d)) return;
        const isProblem = d.verificationResult === 'missed' || d.verificationResult === 'failed' || d.verificationStatus === 'missed';
        if (!isProblem) return;

        const id = d.id || d.verificationId;
        if (!map.has(id)) {
          const isMissed = d.verificationResult === 'missed' || d.verificationStatus === 'missed';
          const title = isMissed ? 'Missed Selfie Verification' : 'Selfie Verification Discrepancy';
          const status = normalizeAlertStatus(d.status, Boolean(d.employeeResponse));

          map.set(id, {
            id,
            title,
            type: title,
            category: 'Missed Selfie Verification',
            severity: isMissed ? 'High' : 'Medium',
            status,
            description: personalizeAnomalyDescription(isMissed 
              ? 'A scheduled 30-minute random selfie verification prompt expired without your response.' 
              : 'Facial verification confidence fell below threshold or could not be validated.', empNames),
            location: d.siteName || 'Worksite Post',
            timestamp: d.timestamp || d.submittedAt,
            employeeResponse: d.employeeResponse || null,
            respondedAt: d.respondedAt || null,
            responsePhoto: d.responsePhoto || null,
            read: d.read || d.viewedByEmployee || false,
            viewedByEmployee: d.viewedByEmployee || d.read || false,
            sourceCollection: 'facial_verifications',
          });
        }
      });

      const list = Array.from(map.values());
      list.sort((a, b) => getTsMillis(b.timestamp) - getTsMillis(a.timestamp));
      setAlerts(list);
      setLoading(false);
      setRefreshing(false);
    };

    const unsubAi = onSnapshot(collection(db, 'ai_analysis'), (snap) => {
      aiDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndProcess();
    }, () => {});

    const unsubLogs = onSnapshot(collection(db, 'ActivityLogs'), (snap) => {
      logDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndProcess();
    }, () => {});

    const unsubFacial = onSnapshot(collection(db, 'facial_verifications'), (snap) => {
      facialDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndProcess();
    }, () => {});

    return () => {
      unsubAi();
      unsubLogs();
      unsubFacial();
    };
  }, [currentEmail, empEmails.join(','), empIds.join(','), empNames.join(','), isFieldEmployee, employeeRecord]);

  // ── Record view timestamp so unread badge is cleared while preserving all alert data ──
  useEffect(() => {
    if (currentEmail) {
      AsyncStorage.setItem('last_viewed_anomaly_time_' + currentEmail, String(Date.now())).catch(() => {});
    }
  }, [currentEmail]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // ── Open Response Modal ──
  const handleOpenResponseModal = (alertItem) => {
    setSelectedAlert(alertItem);
    setResponseText(alertItem.employeeResponse || '');
    setResponsePhoto(alertItem.responsePhoto || null);
    if (currentEmail) {
      AsyncStorage.setItem('last_viewed_anomaly_time_' + currentEmail, String(Date.now())).catch(() => {});
    }
  };

  // ── Attach Photo from Camera ──
  const handlePickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to attach proof.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        const photoData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setResponsePhoto(photoData);
      }
    } catch (e) {
      console.warn('Camera error:', e);
    }
  };

  // ── Submit Direct Response ──
  const handleSubmitResponse = async () => {
    if (!responseText.trim()) {
      Alert.alert('Response Required', 'Please enter your explanation before submitting.');
      return;
    }

    if (!selectedAlert) return;
    setSubmitting(true);

    try {
      await ensureAuthenticatedSession();
      const alertId = selectedAlert.id;
      const coll = selectedAlert.sourceCollection || 'ai_analysis';

      const updatePayload = {
        employeeResponse: responseText.trim(),
        respondedAt: serverTimestamp(),
        responsePhoto: responsePhoto || null,
        status: 'Responded',
      };

      // 1. Update source collection doc
      try {
        await updateDoc(doc(db, coll, alertId), updatePayload);
      } catch (err) {
        console.warn(`Update to ${coll} warning:`, err?.message);
      }

      // 2. Also log in dedicated anomaly_responses collection
      await addDoc(collection(db, 'anomaly_responses'), {
        anomalyId: alertId,
        anomalyTitle: selectedAlert.title,
        anomalyType: selectedAlert.type,
        employeeEmail: currentEmail,
        employeeName: empParam?.name || empParam?.displayName || currentUserName || auth.currentUser?.displayName || 'Employee',
        employeeId: empParam?.id || empParam?.idNum || auth.currentUser?.uid || 'emp_user',
        explanation: responseText.trim(),
        photo: responsePhoto || null,
        timestamp: serverTimestamp(),
        sourceCollection: coll,
      }).catch(() => {});

      // 3. Notify Admin in real-time
      await addDoc(collection(db, 'notifications'), {
        type: 'admin',
        title: 'Employee Responded to Anomaly Alert',
        message: `${empParam?.name || auth.currentUser?.displayName || 'Employee'} responded to "${selectedAlert.title}": "${responseText.trim().slice(0, 80)}"`,
        anomalyId: alertId,
        employeeEmail: currentEmail,
        employeeName: empParam?.name || empParam?.displayName || auth.currentUser?.displayName || 'Employee',
        timestamp: serverTimestamp(),
        read: false,
      }).catch(() => {});

      Alert.alert(
        'Response Submitted',
        'Your explanation has been recorded and submitted directly to your supervisor for review.',
        [{ text: 'OK', onPress: () => setSelectedAlert(null) }]
      );
    } catch (err) {
      console.error('Response submit error:', err);
      Alert.alert('Error', 'Could not save your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered Alerts ──
  const applicableAlerts = useMemo(() => {
    return alerts;
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    if (activeFilter === 'pending') {
      return applicableAlerts.filter((a) => a.status === 'Pending Response' || a.status === 'Active');
    }
    if (activeFilter === 'responded') {
      return applicableAlerts.filter((a) => a.status === 'Responded');
    }
    if (activeFilter === 'resolved') {
      return applicableAlerts.filter((a) => a.status === 'Resolved' || a.status === 'Dismissed');
    }
    return applicableAlerts;
  }, [applicableAlerts, activeFilter]);

  const pendingCount = applicableAlerts.filter((a) => a.status === 'Pending Response' || a.status === 'Active').length;
  const respondedCount = applicableAlerts.filter((a) => a.status === 'Responded').length;
  const resolvedCount = applicableAlerts.filter((a) => a.status === 'Resolved' || a.status === 'Dismissed').length;

  return (
    <View style={styles.container}>
      {/* ── Fixed Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.headerTitle}>Anomaly Alerts</Text>
              {isFieldEmployee ? (
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.22)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Mobile Field</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.22)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Fixed Site</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerSub}>
              {isFieldEmployee
                ? 'Review travel, attendance & biometric alerts'
                : 'Review geofence boundary, attendance & selfie alerts'}
            </Text>
          </View>
        </View>

        {/* ── Top Metric Overview Badges ── */}
        <View style={styles.overviewRow}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewNum}>{applicableAlerts.length}</Text>
            <Text style={styles.overviewLabel}>Total Alerts</Text>
          </View>
          <View style={[styles.overviewCard, pendingCount > 0 && styles.overviewCardAlert]}>
            <Text style={[styles.overviewNum, pendingCount > 0 && { color: '#EF4444' }]}>{pendingCount}</Text>
            <Text style={styles.overviewLabel}>Needs Response</Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={[styles.overviewNum, { color: '#10B981' }]}>{resolvedCount + respondedCount}</Text>
            <Text style={styles.overviewLabel}>Addressed</Text>
          </View>
        </View>
      </View>

      {/* ── Filter Tabs ── */}
      <View style={styles.filterBar}>
        {[
          { key: 'all', label: `All (${applicableAlerts.length})` },
          { key: 'pending', label: `Needs Response (${pendingCount})` },
          { key: 'responded', label: `Responded (${respondedCount})` },
          { key: 'resolved', label: `Resolved (${resolvedCount})` },
        ].map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Alerts List ── */}
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 13 }}>Loading anomaly alerts...</Text>
          </View>
        ) : filteredAlerts.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="shield-checkmark" size={42} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>No Anomaly Alerts</Text>
            <Text style={styles.emptySub}>
              {activeFilter === 'pending'
                ? 'Great job! You have no pending anomaly alerts requiring response.'
                : 'No unusual activity detected for your account.'}
            </Text>
          </View>
        ) : (
          filteredAlerts.map((item) => {
            const isResolved = item.status === 'Resolved' || item.status === 'Dismissed';
            const isResponded = item.status === 'Responded';
            const isPending = !isResolved && !isResponded;

            const severityColor = item.severity === 'High' ? '#EF4444' : (item.severity === 'Medium' ? '#F59E0B' : '#3B82F6');
            const categoryMeta = getCategoryMeta(item.category);

            return (
              <View key={item.id} style={styles.alertCard}>
                {/* Header Row */}
                <View style={styles.alertHeaderRow}>
                  <View style={[styles.categoryIconWrap, { backgroundColor: `${categoryMeta.color}15` }]}>
                    <Ionicons name={categoryMeta.icon} size={20} color={categoryMeta.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.alertTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      <Text style={styles.alertCategory}>{item.category}</Text>
                      {item.category === 'Fixed Geofence Boundary Breach' && (
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, borderWidth: 0.5, borderColor: '#FDE68A' }}>
                          <Text style={{ color: '#92400E', fontSize: 10, fontWeight: '700' }}>Fixed Site Policy</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={[styles.severityBadge, { borderColor: severityColor }]}>
                    <Text style={[styles.severityBadgeText, { color: severityColor }]}>{item.severity}</Text>
                  </View>
                </View>

                {/* Description Body */}
                <Text style={styles.alertDesc}>{item.description}</Text>

                {/* Info Metadata */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={14} color="#6B7280" />
                    <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color="#6B7280" />
                    <Text style={styles.metaText}>{formatDate(item.timestamp)}</Text>
                  </View>
                </View>

                {/* Status Indicator Banner */}
                <View style={[
                  styles.statusBanner,
                  isResolved ? styles.statusBannerResolved : (isResponded ? styles.statusBannerResponded : styles.statusBannerPending)
                ]}>
                  <Ionicons
                    name={isResolved ? 'checkmark-circle' : (isResponded ? 'chatbubble-ellipses' : 'alert-circle')}
                    size={16}
                    color={isResolved ? '#10B981' : (isResponded ? '#4F46E5' : '#EF4444')}
                  />
                  <Text style={[
                    styles.statusBannerText,
                    { color: isResolved ? '#047857' : (isResponded ? '#4338CA' : '#B91C1C') }
                  ]}>
                    {isResolved ? 'Alert Resolved' : (isResponded ? 'Response Submitted: Under Review' : 'Action Needed: Explanation required')}
                  </Text>
                </View>

                {/* Display Existing Employee Response */}
                {item.employeeResponse && (
                  <View style={styles.existingResponseBox}>
                    <Text style={styles.existingResponseLabel}>Your Submitted Explanation:</Text>
                    <Text style={styles.existingResponseText}>"{item.employeeResponse}"</Text>
                    {item.respondedAt && (
                      <Text style={styles.existingResponseDate}>
                        Submitted {formatDate(item.respondedAt)}
                      </Text>
                    )}
                  </View>
                )}

                {/* Action Button */}
                <TouchableOpacity
                  style={[styles.respondBtn, isPending ? styles.respondBtnActive : styles.respondBtnMuted]}
                  onPress={() => handleOpenResponseModal(item)}
                >
                  <Ionicons name="create-outline" size={16} color={isPending ? '#FFFFFF' : '#4F46E5'} />
                  <Text style={[styles.respondBtnText, isPending ? { color: '#FFFFFF' } : { color: '#4F46E5' }]}>
                    {item.employeeResponse ? 'Update Explanation' : 'Respond to Alert'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Response Modal ── */}
      <Modal visible={!!selectedAlert} animationType="slide" transparent onRequestClose={() => setSelectedAlert(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Respond to Anomaly Alert</Text>
                <Text style={styles.modalSub}>{selectedAlert?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedAlert(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Alert Details Card */}
              <View style={styles.modalAlertContext}>
                <Text style={styles.modalContextLabel}>Detected Activity:</Text>
                <Text style={styles.modalContextText}>{selectedAlert?.description}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="location-outline" size={12} color="#6B7280" />
                  <Text style={{ fontSize: 11, color: '#6B7280' }}>{selectedAlert?.location} • {formatDate(selectedAlert?.timestamp)}</Text>
                </View>
              </View>

              {/* Preset Reasons */}
              <Text style={styles.inputSectionLabel}>Select or Tap a Quick Reason:</Text>
              <View style={styles.presetChipWrap}>
                {(
                  selectedAlert?.category === 'Fixed Geofence Boundary Breach'
                    ? GEOFENCE_PRESET_REASONS
                    : (selectedAlert?.category === 'Shift & Attendance Anomaly'
                        ? SHIFT_PRESET_REASONS
                        : GENERAL_PRESET_REASONS)
                ).map((reason, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.presetChip}
                    onPress={() => setResponseText((prev) => (prev ? `${prev}. ${reason}` : reason))}
                  >
                    <Text style={styles.presetChipText}>{reason}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Multi-line Explanation Input */}
              <Text style={styles.inputSectionLabel}>Your Detailed Explanation:</Text>
              <TextInput
                style={styles.textInputArea}
                placeholder="Explain the circumstances (e.g., GPS signal lost inside basement, stepped out to assist delivery, app froze during verification prompt)..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                value={responseText}
                onChangeText={setResponseText}
              />

              {/* Optional Photo Attachment */}
              <View style={styles.photoSection}>
                <TouchableOpacity style={styles.attachPhotoBtn} onPress={handlePickPhoto}>
                  <Ionicons name="camera-outline" size={18} color="#4F46E5" />
                  <Text style={styles.attachPhotoBtnText}>
                    {responsePhoto ? 'Retake Proof Photo' : 'Attach Photo Proof (Optional)'}
                  </Text>
                </TouchableOpacity>

                {responsePhoto && (
                  <View style={styles.attachedPhotoWrap}>
                    <Image source={{ uri: responsePhoto }} style={styles.attachedPhotoThumb} />
                    <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setResponsePhoto(null)}>
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Modal Buttons */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSelectedAlert(null)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSubmitResponse}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitBtnText}>Submit Response</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Helpers ──
function categorizeAnomaly(type = '') {
  const t = type.toLowerCase();
  if (t.includes('selfie') || t.includes('facial') || t.includes('verification')) return 'Missed Selfie Verification';
  if (t.includes('missed shift') || t.includes('missing check-out') || t.includes('no shift check-in') || t.includes('check-in') || t.includes('check in') || t.includes('attendance') || t.includes('shift') || t.includes('time') || t.includes('clock')) return 'Shift & Attendance Anomaly';
  if (t.includes('geofence') || t.includes('unauthorized') || t.includes('boundary') || t.includes('perimeter')) return 'Fixed Geofence Boundary Breach';
  if (t.includes('location') || t.includes('jump') || t.includes('mock') || t.includes('spoof')) return 'Location Discrepancy';
  if (t.includes('vpn') || t.includes('proxy') || t.includes('root') || t.includes('jailbreak')) return 'Device Security Alert';
  return 'Security Telemetry Signal';
}

function getCategoryMeta(category = '') {
  switch (category) {
    case 'Missed Selfie Verification':
      return { icon: 'scan-circle', color: '#EF4444' };
    case 'Shift & Attendance Anomaly':
      return { icon: 'time', color: '#DC2626' };
    case 'Fixed Geofence Boundary Breach':
      return { icon: 'business', color: '#D97706' };
    case 'Location Discrepancy':
      return { icon: 'location', color: '#F59E0B' };
    case 'Device Security Alert':
      return { icon: 'shield-half', color: '#DC2626' };
    default:
      return { icon: 'shield-alert', color: '#4F46E5' };
  }
}

function formatDate(ts) {
  if (!ts) return 'Recent';
  if (ts?.toDate && typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts?.seconds === 'number') {
    return new Date(ts.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 'Recent' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getTsMillis(ts) {
  if (!ts) return 0;
  if (ts?.toDate && typeof ts.toDate === 'function') {
    return ts.toDate().getTime();
  }
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#C7D2FE',
    marginTop: 2,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  overviewCardAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  overviewNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  overviewLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E0E7FF',
    marginTop: 2,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterTabActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    marginTop: 30,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  alertCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  alertDesc: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  metaText: {
    fontSize: 11,
    color: '#64748B',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusBannerPending: {
    backgroundColor: '#FEF2F2',
  },
  statusBannerResponded: {
    backgroundColor: '#EEF2FF',
  },
  statusBannerResolved: {
    backgroundColor: '#ECFDF5',
  },
  statusBannerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  existingResponseBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  existingResponseLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  existingResponseText: {
    fontSize: 12,
    color: '#1E293B',
    fontStyle: 'italic',
    marginTop: 2,
  },
  existingResponseDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  respondBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  respondBtnActive: {
    backgroundColor: '#4F46E5',
  },
  respondBtnMuted: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  respondBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalAlertContext: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  modalContextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  modalContextText: {
    fontSize: 12,
    color: '#1E293B',
    marginTop: 2,
    lineHeight: 16,
  },
  inputSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  presetChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  presetChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  textInputArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  photoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  attachPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  attachPhotoBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  attachedPhotoWrap: {
    position: 'relative',
  },
  attachedPhotoThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
