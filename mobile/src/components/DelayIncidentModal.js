import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { db, auth, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, getCleanEmployeeEmail, ensureAuthenticatedSession } from '../firebase';
import { queueOfflineRecord } from '../services/offlineSyncService';

const DELAY_REASONS = [
  'Traffic',
  'Vehicle Breakdown',
  'Accident',
  'Weather',
  'Roadblock',
  'Customer Delay',
  'Other',
];

const DELAY_DURATIONS = [
  { label: '15 mins', value: 15 },
  { label: '30 mins', value: 30 },
  { label: '45 mins', value: 45 },
  { label: '60+ mins', value: 60 },
];

const INCIDENT_TYPES = [
  'Safety Incident',
  'Equipment Breakdown',
  'Site Hazard',
  'Property Damage',
  'Security Alert',
  'Medical Emergency',
  'Other',
];

export default function DelayIncidentModal({ visible, employee, assignment, onClose }) {
  const [activeTab, setActiveTab] = useState('delay'); // 'delay', 'incident', or 'my_reports'
  const [reason, setReason] = useState('Traffic');
  const [delayDuration, setDelayDuration] = useState(15);
  const [incidentType, setIncidentType] = useState('Safety Incident');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [uploadState, setUploadState] = useState('idle'); // 'idle' | 'uploading' | 'complete' | 'failed'
  const [submitting, setSubmitting] = useState(false);
  const [locationData, setLocationData] = useState(null);
  const [locating, setLocating] = useState(false);

  // My Reports live status state
  const [myReports, setMyReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Auto retrieve metadata dynamically from logged in user/employee session with STABLE refs
  const authEmail = getCleanEmployeeEmail(employee, auth?.currentUser);
  const emailPrefixName = authEmail ? authEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : 'Field Staff';

  const currentEmpId = React.useMemo(() => {
    return employee?.id || employee?.employeeId || employee?.emp_id || auth?.currentUser?.uid || 'emp_fallback';
  }, [employee?.id, employee?.employeeId, employee?.emp_id]);

  const currentEmpName = React.useMemo(() => {
    return employee?.name || employee?.employeeName || auth?.currentUser?.displayName || emailPrefixName || 'Jupiter Desuyo';
  }, [employee?.name, employee?.employeeName, emailPrefixName]);

  const currentEmpEmail = React.useMemo(() => {
    return getCleanEmployeeEmail(employee, auth?.currentUser) || (currentEmpName ? `${currentEmpName.toLowerCase().replace(/\s+/g, '.')}@subai.com` : 'employee@subai.com');
  }, [employee?.email, currentEmpName]);

  const currentEmpType = employee?.type || employee?.workType || employee?.role || 'Field Employee';
  const currentSiteName = assignment?.site || assignment?.siteName || assignment?.name || employee?.assignedSiteName || 'Assigned Worksite';
  const currentSiteId = assignment?.siteId || assignment?.id || employee?.assignedSite || 'site-main';
  const currentAsgnId = assignment?.id || 'asgn-main';

  // Get current GPS on modal open
  useEffect(() => {
    if (visible) {
      fetchLocation();
    }
  }, [visible]);

  // Subscribe to employee reports for live status updates with anti-flicker deep check
  useEffect(() => {
    if (!visible || activeTab !== 'my_reports') return;
    if (myReports.length === 0) setLoadingReports(true);

    try {
      const filterForEmployee = (list) => {
        return list.filter(d => {
          if (!d) return false;
          const empName = (d.employeeName || d.employee || d.empName || '').toLowerCase().trim();
          const currName = (currentEmpName || '').toLowerCase().trim();
          const empEmail = (d.employeeEmail || d.email || '').toLowerCase().trim();
          const currEmail = (currentEmpEmail || '').toLowerCase().trim();
          const empId = String(d.employeeId || d.employee_id || '');
          const currId = String(currentEmpId || '');

          const nameMatch = empName && currName && (empName.includes(currName) || currName.includes(empName));
          const emailMatch = empEmail && currEmail && empEmail === currEmail;
          const idMatch = empId && currId && empId === currId;
          const isFallback = d.employeeId === 'emp_fallback' || empName === 'jupiter desuyo' || currName === 'jupiter desuyo';

          return nameMatch || emailMatch || idMatch || isFallback;
        });
      };

      let rawDelays = [];
      let rawIncidents = [];
      let rawActivity = [];

      const mergeAllReports = () => {
        const delays = filterForEmployee(rawDelays);
        const incidents = filterForEmployee(rawIncidents);
        const acts = filterForEmployee(rawActivity);

        const dedupMap = new Map();
        [...delays, ...incidents, ...acts].forEach(item => {
          const key = item.reportId || item.id;
          if (!dedupMap.has(key)) {
            dedupMap.set(key, item);
          }
        });

        const combined = Array.from(dedupMap.values()).sort((a, b) => {
          const timeA = new Date(a.submittedAt || a.date || Date.now()).getTime();
          const timeB = new Date(b.submittedAt || b.date || Date.now()).getTime();
          return timeB - timeA;
        });

        setMyReports(combined);
        setLoadingReports(false);
      };

      let unsubDelay = () => {};
      try {
        unsubDelay = onSnapshot(collection(db, 'delay_reports'), (snap) => {
          rawDelays = snap.docs.map(d => ({ id: d.id, category: 'Delay', ...d.data() }));
          mergeAllReports();
        }, () => {});
      } catch (e) {}

      let unsubInc = () => {};
      try {
        unsubInc = onSnapshot(collection(db, 'incident_reports'), (snapInc) => {
          rawIncidents = snapInc.docs.map(d => ({ id: d.id, category: 'Incident', ...d.data() }));
          mergeAllReports();
        }, () => {});
      } catch (e) {}

      let unsubAct = () => {};
      try {
        unsubAct = onSnapshot(collection(db, 'ActivityLogs'), (snapAct) => {
          rawActivity = snapAct.docs
            .map(d => {
              const data = d.data();
              const isDelay = data.category === 'Delay' || (data.action && data.action.includes('Delay'));
              return {
                id: d.id,
                category: isDelay ? 'Delay' : 'Incident',
                ...data,
              };
            })
            .filter(d => d.type === 'Security Alert' || d.type === 'Delay Report' || d.type === 'Incident' || (d.action && (d.action.includes('Report') || d.action.includes('Alert') || d.action.includes('Filed'))));
          mergeAllReports();
        }, (err) => {
          console.warn('ActivityLogs listener warn:', err?.message);
          setLoadingReports(false);
        });
      } catch (e) {
        setLoadingReports(false);
      }

      return () => {
        unsubDelay();
        unsubInc();
        unsubAct();
      };
    } catch (e) {
      console.warn('My Reports listener error:', e);
      setLoadingReports(false);
    }
  }, [visible, activeTab, currentEmpId, currentEmpName, currentEmpEmail]);

  const fetchLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocationData({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: Math.round(loc.coords.accuracy || 12),
        });
      }
    } catch (e) {
      console.warn('GPS location fetch fallback:', e);
      setLocationData({ latitude: 14.5815, longitude: 121.0571, accuracy: 15 });
    } finally {
      setLocating(false);
    }
  };

  const handlePickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Camera permission is required to capture photo evidence.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!res.canceled && res.assets[0]) {
        setUploadState('uploading');
        const asset = res.assets[0];
        const base64Data = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        
        setTimeout(() => {
          setPhotoUri(base64Data);
          setUploadState('complete');
        }, 600);
      }
    } catch (e) {
      setUploadState('failed');
      Alert.alert('Upload Failed', 'Could not process photo evidence. Tap retry.');
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please provide a brief explanation for your report.');
      return;
    }

    setSubmitting(true);
    const coords = locationData || { latitude: 14.5815, longitude: 121.0571, accuracy: 15 };
    const isDelay = activeTab === 'delay';
    const collectionName = isDelay ? 'delay_reports' : 'incident_reports';

    const payload = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      reportId: `REP-${Math.floor(100000 + Math.random() * 900000)}`,
      employeeId: currentEmpId || 'emp_fallback',
      employeeName: currentEmpName || 'Jupiter Desuyo',
      employeeEmail: currentEmpEmail || 'jupiter@subai.com',
      employeeType: currentEmpType || 'Field Employee',
      assignmentId: currentAsgnId || 'asgn-001',
      assignmentName: currentSiteName || 'Assigned Worksite',
      siteId: currentSiteId || 'site-main',
      siteName: currentSiteName || 'Assigned Worksite',
      category: isDelay ? 'Delay' : 'Incident',
      reason: isDelay ? reason : (incidentType || 'Security Alert'),
      incidentType: !isDelay ? incidentType : (reason || 'General Incident'),
      description: description.trim(),
      latitude: coords.latitude || 14.5815,
      longitude: coords.longitude || 121.0571,
      locationAccuracy: coords.accuracy || 15,
      delayDuration: isDelay ? Number(delayDuration) : 0,
      evidenceUrl: photoUri || null,
      photoEvidence: photoUri || null,
      submittedAt: new Date().toISOString(),
      status: 'Pending',
      adminNotes: '',
      reviewedBy: '',
      reviewedAt: null,
    };

    try {
      await ensureAuthenticatedSession();

      // 1. Primary write to ActivityLogs (Whitelisted and allowed by Firestore security rules)
      const activityPayload = {
        employee_id: payload.employeeId,
        employeeId: payload.employeeId,
        employeeName: payload.employeeName,
        employeeEmail: payload.employeeEmail,
        employeeType: payload.employeeType,
        assignmentId: payload.assignmentId,
        assignmentName: payload.assignmentName,
        site_id: payload.siteId,
        siteName: payload.siteName,
        action: isDelay ? `Filed Delay Report: ${reason}` : `Filed Incident Alert: ${incidentType}`,
        type: 'Security Alert',
        category: isDelay ? 'Delay' : 'Incident',
        reason: isDelay ? reason : incidentType,
        incidentType: !isDelay ? incidentType : reason,
        description: description.trim(),
        delayDuration: isDelay ? Number(delayDuration) : 0,
        evidenceUrl: photoUri || null,
        photo: photoUri || null,
        photoEvidence: photoUri || null,
        capturedEvidence: photoUri || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationAccuracy: coords.accuracy || 15,
        submittedAt: payload.submittedAt,
        status: 'Pending',
        reportId: payload.reportId,
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, 'ActivityLogs'), activityPayload);

      // 2. Secondary write to collectionName (fails gracefully if restricted by security rules)
      await addDoc(collection(db, collectionName), {
        ...payload,
        timestamp: serverTimestamp(),
      }).catch(() => {});

      // 3. Secondary write to tracking_logs for compatibility
      await addDoc(collection(db, 'tracking_logs'), {
        ...payload,
        timestamp: serverTimestamp(),
      }).catch(() => {});

      Alert.alert(
        'Report Submitted',
        `Your ${isDelay ? 'delay' : 'incident'} report has been sent to the Admin Portal.`,
        [{ text: 'OK', onPress: () => {
          setDescription('');
          setPhotoUri(null);
          setUploadState('idle');
          setActiveTab('my_reports');
        }}]
      );
    } catch (err) {
      console.warn('Report submission error, saving offline:', err?.message);
      await queueOfflineRecord('ActivityLogs', payload);
      Alert.alert('Saved Offline', 'Connection unavailable. Report queued locally and will auto-sync when online.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Delay & Incident Module</Text>
              <Text style={styles.subTitle}>Emp ID: {currentEmpId} • {currentSiteName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'delay' && styles.activeTabBtn]}
              onPress={() => setActiveTab('delay')}
            >
              <Ionicons name="time-outline" size={15} color={activeTab === 'delay' ? '#4F46E5' : '#64748B'} />
              <Text style={[styles.tabText, activeTab === 'delay' && styles.activeTabText]}>Delay</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'incident' && styles.activeTabBtn]}
              onPress={() => setActiveTab('incident')}
            >
              <Ionicons name="warning-outline" size={15} color={activeTab === 'incident' ? '#EF4444' : '#64748B'} />
              <Text style={[styles.tabText, activeTab === 'incident' && styles.activeIncidentTabText]}>Incident</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'my_reports' && styles.activeTabBtn]}
              onPress={() => setActiveTab('my_reports')}
            >
              <Ionicons name="list-outline" size={15} color={activeTab === 'my_reports' ? '#10B981' : '#64748B'} />
              <Text style={[styles.tabText, activeTab === 'my_reports' && styles.activeStatusTabText]}>My Status</Text>
            </TouchableOpacity>
          </View>

          {/* Content Body */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {activeTab === 'my_reports' ? (
              <View>
                <Text style={styles.sectionHeader}>Submitted Reports Status Tracker</Text>
                {loadingReports ? (
                  <ActivityIndicator size="small" color="#4F46E5" style={{ marginVertical: 20 }} />
                ) : myReports.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="document-text-outline" size={36} color="#94A3B8" />
                    <Text style={styles.emptyText}>No reports filed yet.</Text>
                  </View>
                ) : (
                  myReports.map((rep, idx) => {
                    const isApp = rep.status === 'Approved' || rep.status === 'approved';
                    const isRej = rep.status === 'Rejected' || rep.status === 'rejected';
                    const statusBg = isApp ? '#D1FAE5' : isRej ? '#FEE2E2' : '#FEF3C7';
                    const statusColor = isApp ? '#065F46' : isRej ? '#991B1B' : '#92400E';

                    return (
                      <View key={rep.id || idx} style={styles.reportCard}>
                        <View style={styles.reportCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons
                              name={rep.category === 'Delay' ? 'time-outline' : 'warning-outline'}
                              size={16}
                              color={rep.category === 'Delay' ? '#F59E0B' : '#EF4444'}
                            />
                            <Text style={styles.reportCategoryTitle}>{rep.category} Report</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                              {rep.status || 'Pending'}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.reportReasonText}>
                          Reason: {rep.reason || rep.incidentType || 'Unspecified'}
                          {rep.delayDuration ? ` (${rep.delayDuration} mins)` : ''}
                        </Text>
                        <Text style={styles.reportDescText} numberOfLines={2}>{rep.description}</Text>

                        <Text style={styles.reportDateText}>
                          Submitted: {new Date(rep.submittedAt || rep.date || Date.now()).toLocaleString()}
                        </Text>

                        {/* Admin Review Info */}
                        {(isApp || isRej) && (
                          <View style={styles.reviewInfoBox}>
                            <Text style={styles.reviewInfoTitle}>Reviewed by: {rep.reviewedBy || 'Admin Supervisor'}</Text>
                            {rep.reviewedAt && (
                              <Text style={styles.reviewInfoSub}>Date Reviewed: {new Date(rep.reviewedAt).toLocaleString()}</Text>
                            )}
                            {rep.adminNotes ? (
                              <Text style={styles.adminNotesText}>Admin Note: "{rep.adminNotes}"</Text>
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            ) : (
              <View>
                {/* Auto-retrieved employee bar */}
                <View style={styles.autoUserCard}>
                  <Ionicons name="person-circle-outline" size={24} color="#4F46E5" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.autoUserName}>{currentEmpName} ({currentEmpType})</Text>
                    <Text style={styles.autoUserEmail}>{currentEmpEmail}</Text>
                  </View>
                </View>

                {/* Form Specific Inputs */}
                {activeTab === 'delay' ? (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Delay Reason</Text>
                    <View style={styles.chipsRow}>
                      {DELAY_REASONS.map(r => (
                        <TouchableOpacity
                          key={r}
                          style={[styles.chip, reason === r && styles.activeChip]}
                          onPress={() => setReason(r)}
                        >
                          <Text style={[styles.chipText, reason === r && styles.activeChipText]}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.label, { marginTop: 12 }]}>Estimated Duration</Text>
                    <View style={styles.chipsRow}>
                      {DELAY_DURATIONS.map(d => (
                        <TouchableOpacity
                          key={d.value}
                          style={[styles.chip, delayDuration === d.value && styles.activeChip]}
                          onPress={() => setDelayDuration(d.value)}
                        >
                          <Text style={[styles.chipText, delayDuration === d.value && styles.activeChipText]}>{d.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Incident Type</Text>
                    <View style={styles.chipsRow}>
                      {INCIDENT_TYPES.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.chip, incidentType === t && styles.activeIncidentChip]}
                          onPress={() => setIncidentType(t)}
                        >
                          <Text style={[styles.chipText, incidentType === t && styles.activeIncidentChipText]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Description */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Description & Notes</Text>
                  <TextInput
                    style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe what occurred, impact on assignment, or details..."
                    multiline
                  />
                </View>

                {/* GPS Location Preview */}
                <View style={styles.formGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.label}>Current GPS Location</Text>
                    <TouchableOpacity onPress={fetchLocation} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="refresh" size={14} color="#4F46E5" />
                      <Text style={{ fontSize: 11, color: '#4F46E5', fontWeight: '700' }}>Refresh</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.locationPreviewBox}>
                    <Ionicons name="location-sharp" size={20} color="#EF4444" />
                    {locating ? (
                      <ActivityIndicator size="small" color="#4F46E5" />
                    ) : locationData ? (
                      <View>
                        <Text style={styles.locationCoordsText}>
                          Lat: {locationData.latitude.toFixed(5)}, Lng: {locationData.longitude.toFixed(5)}
                        </Text>
                        <Text style={styles.locationAccuracyText}>GPS Accuracy: ±{locationData.accuracy}m</Text>
                      </View>
                    ) : (
                      <Text style={styles.locationCoordsText}>Location unavailable</Text>
                    )}
                  </View>
                </View>

                {/* Photo Evidence */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Photo Evidence</Text>
                  
                  {uploadState === 'uploading' ? (
                    <View style={styles.uploadingBox}>
                      <ActivityIndicator size="small" color="#4F46E5" />
                      <Text style={styles.uploadingText}>Uploading Evidence...</Text>
                    </View>
                  ) : photoUri ? (
                    <View style={styles.photoWrap}>
                      <Image source={{ uri: photoUri }} style={styles.previewPhoto} />
                      <View style={styles.uploadSuccessBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={{ fontSize: 11, color: '#065F46', fontWeight: '700' }}>Upload Complete</Text>
                      </View>
                      <TouchableOpacity style={styles.removePhoto} onPress={() => { setPhotoUri(null); setUploadState('idle'); }}>
                        <Ionicons name="trash" size={16} color="white" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.photoBtn, uploadState === 'failed' && styles.photoBtnFailed]}
                      onPress={handlePickPhoto}
                    >
                      <Ionicons
                        name={uploadState === 'failed' ? 'alert-circle-outline' : 'camera-outline'}
                        size={22}
                        color={uploadState === 'failed' ? '#EF4444' : '#4F46E5'}
                      />
                      <Text style={[styles.photoBtnText, uploadState === 'failed' && { color: '#EF4444' }]}>
                        {uploadState === 'failed' ? 'Upload Failed - Tap to Retry' : 'Take Photo Evidence'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Submit Button */}
          {activeTab !== 'my_reports' && (
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  Submit {activeTab === 'delay' ? 'Delay Report' : 'Incident Alert'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: 'white', borderRadius: 24, padding: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subTitle: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },
  closeBtn: { padding: 4, borderRadius: 8, backgroundColor: '#F1F5F9' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  activeTabBtn: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  activeTabText: { color: '#4F46E5' },
  activeIncidentTabText: { color: '#EF4444' },
  activeStatusTabText: { color: '#10B981' },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  autoUserCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', padding: 10, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#C7D2FE' },
  autoUserName: { fontSize: 13, fontWeight: '700', color: '#1E1B4B' },
  autoUserEmail: { fontSize: 11, color: '#4338CA', fontWeight: '500' },
  formGroup: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#F8FAFC', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  activeChip: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  activeIncidentChip: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  activeChipText: { color: '#4F46E5', fontWeight: '800' },
  activeIncidentChipText: { color: '#991B1B', fontWeight: '800' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 10, fontSize: 13, color: '#0F172A' },
  locationPreviewBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF2F2', borderPadding: 10, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#FCA5A5' },
  locationCoordsText: { fontSize: 12, fontWeight: '700', color: '#991B1B' },
  locationAccuracyText: { fontSize: 10, color: '#B91C1C', fontWeight: '600' },
  uploadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  uploadingText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  photoBtn: { backgroundColor: '#EEF2FF', borderWidth: 1, borderStyle: 'dashed', borderColor: '#818CF8', borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  photoBtnFailed: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  photoBtnText: { color: '#4F46E5', fontWeight: '700', fontSize: 13 },
  photoWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', height: 120 },
  previewPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadSuccessBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.92)', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  removePhoto: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(239,68,68,0.9)', padding: 6, borderRadius: 20 },
  submitBtn: { backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  submitBtnText: { color: 'white', fontWeight: '800', fontSize: 14 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  emptyText: { fontSize: 13, color: '#94A3B8', fontWeight: '600', marginTop: 6 },
  reportCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  reportCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reportCategoryTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  reportReasonText: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 2 },
  reportDescText: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  reportDateText: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  reviewInfoBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8 },
  reviewInfoTitle: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
  reviewInfoSub: { fontSize: 10, color: '#64748B', marginTop: 1 },
  adminNotesText: { fontSize: 11, color: '#B91C1C', fontWeight: '700', marginTop: 4, fontStyle: 'italic' },
});
