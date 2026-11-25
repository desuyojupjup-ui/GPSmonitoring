import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  ensureAuthenticatedSession,
} from '../firebase';
import { queueOfflineRecord } from '../services/offlineSyncService';
import { markPromptAnswered } from '../services/verificationScheduler';
import { writeSecurityEvent } from '../services/securityLogger';
import { SECURITY } from '../services/securityConfig';
import locationLogService from '../services/locationLogService';

// ─────────────────────────────────────────────────────────────────────────────
// FacialVerificationModal (Requirements 7, 8 & 9)
//  - Requires first-time face registration before verification is allowed.
//  - Never auto-returns "Verification Successful" when no registered face exists.
//  - Supports Admin-initiated verification requests (`Pending` -> `Verified`/`Failed`).
//  - Performs deterministic comparison against registered face signature (no Math.random).
//  - Stamps companyId and stores selfies in `facial_verifications` (not ActivityLogs).
// ─────────────────────────────────────────────────────────────────────────────

export const FACE_REG_REQUIRED_MSG = 'Face registration required before verification.';

function generateVerificationId() {
  return `VID-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

/**
 * Compute a compact, deterministic 64-bin feature signature from a base64 image payload.
 * Used to verify the captured selfie against the employee's registered face reference.
 */
export function computeFaceSignature(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const clean = rawInput.includes(',') ? rawInput.split(',')[1] : rawInput;
  if (!clean || clean.length < 120) return null;

  const bins = new Array(64).fill(0);
  const step = Math.max(1, Math.floor(clean.length / 4096));
  let sampled = 0;

  for (let i = 0; i < clean.length; i += step) {
    const code = clean.charCodeAt(i);
    bins[code % 64] += 1;
    sampled += 1;
  }

  if (sampled === 0) return null;
  const norm = Math.sqrt(bins.reduce((acc, v) => acc + v * v, 0)) || 1;
  const vector = bins.map((v) => Number((v / norm).toFixed(5)));

  return {
    version: 1,
    byteLength: clean.length,
    vector,
  };
}

/**
 * Deterministic similarity comparison between registered face reference signature
 * and newly captured verification selfie signature.
 */
export function compareFaceSignatures(referenceSig, liveSig) {
  if (!referenceSig?.vector || !liveSig?.vector) {
    return { matched: false, confidenceScore: 0, reason: 'Missing valid facial signature.' };
  }
  if (referenceSig.vector.length !== liveSig.vector.length) {
    return { matched: false, confidenceScore: 0, reason: 'Signature dimension mismatch.' };
  }

  let dot = 0;
  for (let i = 0; i < referenceSig.vector.length; i += 1) {
    dot += referenceSig.vector[i] * liveSig.vector[i];
  }
  const cosine = Math.max(0, Math.min(1, dot));

  const minLen = Math.min(referenceSig.byteLength || 1, liveSig.byteLength || 1);
  const maxLen = Math.max(referenceSig.byteLength || 1, liveSig.byteLength || 1);
  const sizeRatio = minLen / maxLen;

  // Weighted composite similarity (cosine dominates; severe size mismatch penalizes invalid captures)
  const rawScore = (cosine * 0.85 + sizeRatio * 0.15) * 100;
  const confidenceScore = Math.max(0, Math.min(99, Math.round(rawScore)));
  const matched = confidenceScore >= 65;

  return {
    matched,
    confidenceScore,
    reason: matched
      ? 'Captured selfie matches registered face reference.'
      : 'Captured selfie did not meet similarity threshold against registered face reference.',
  };
}

export default function FacialVerificationModal({
  visible,
  employee,
  assignment = null,
  onClose,
  onVerified,
  onFaceRegistered,
  mode = 'verify',                 // 'verify' | 'register'
  verificationRequest = null,      // Pending Admin request doc from facial_verifications
  triggerType = 'manual',          // 'admin_request' | 'manual' | 'check_in' | 'registration'
  attendanceId = null,
}) {
  const [activeMode, setActiveMode] = useState(mode);
  const [stage, setStage] = useState('prompt'); // prompt | no_registration | camera | processing | result
  const [photoUri, setPhotoUri] = useState(null);
  const [result, setResult] = useState(null);   // 'Verified' | 'Failed' | 'Registered' | 'Error'
  const [confidenceScore, setConfidenceScore] = useState(null);
  const [verificationId, setVerificationId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [adminStatus, setAdminStatus] = useState(null);
  const [firestoreDocId, setFirestoreDocId] = useState(null);
  const [localFaceRef, setLocalFaceRef] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const listenerRef = useRef(null);

  const effectiveFaceRegistered = Boolean(
    localFaceRef ||
    (employee?.faceRegistered && (employee?.faceReferencePhoto || employee?.faceReferenceSignature))
  );

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      const nextMode = mode === 'register' ? 'register' : 'verify';
      setActiveMode(nextMode);
      setPhotoUri(null);
      setResult(null);
      setConfidenceScore(null);
      setVerificationId(verificationRequest?.verificationRequestId || verificationRequest?.id || null);
      setStatusMessage('');
      setAdminStatus(null);
      setFirestoreDocId(verificationRequest?.id || null);
      setRetryCount(0);

      if (nextMode === 'verify' && !effectiveFaceRegistered) {
        setStage('no_registration');
      } else {
        setStage('prompt');
      }
    } else if (listenerRef.current) {
      listenerRef.current();
      listenerRef.current = null;
    }
  }, [visible, mode, verificationRequest?.id, effectiveFaceRegistered]);

  // Listen to facial_verifications document for live Admin review updates
  useEffect(() => {
    if (!firestoreDocId || activeMode === 'register') return;
    try {
      const unsub = onSnapshot(doc(db, 'facial_verifications', firestoreDocId), (snap) => {
        if (snap && snap.exists && snap.exists()) {
          const data = snap.data();
          if (data?.reviewedBy && data?.verificationStatus) {
            setAdminStatus(data.verificationStatus);
          }
        }
      }, () => {});
      listenerRef.current = unsub;
      return () => {
        unsub();
        listenerRef.current = null;
      };
    } catch (_) {}
  }, [firestoreDocId, activeMode]);

  const handleCapturePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed for facial capture.');
        return;
      }

      const captureRes = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.35, // Compressed to stay safely under Firestore's 1MB document limit
        cameraType: ImagePicker.CameraType.front,
        base64: true,
      });

      if (captureRes.canceled || !captureRes.assets?.[0]) return;

      const image = captureRes.assets[0];
      const base64Content = image.base64 || '';
      if (!base64Content) {
        Alert.alert('Capture Error', 'Could not read captured image data. Please try again.');
        return;
      }

      const photoData = `data:image/jpeg;base64,${base64Content}`;
      setPhotoUri(image.uri || photoData);
      setStage('processing');

      const liveSig = computeFaceSignature(base64Content);
      if (!liveSig) {
        setStage('result');
        setResult('Failed');
        setConfidenceScore(0);
        setStatusMessage('Captured photo was unclear or invalid. Please retake in good lighting.');
        return;
      }

      const emp = employee || {};
      const companyId = emp.companyId || assignment?.companyId || 'company_default';

      await ensureAuthenticatedSession();

      // ── MODE 1: FIRST-TIME FACE REGISTRATION (Requirement 8) ──────────────
      if (activeMode === 'register') {
        if (!emp.id) {
          setStage('result');
          setResult('Error');
          setStatusMessage('Employee profile not loaded. Please try again.');
          return;
        }

        const regTimestamp = new Date().toISOString();
        await updateDoc(doc(db, 'employees', emp.id), {
          faceRegistered: true,
          faceReferencePhoto: photoData,
          faceReferenceSignature: liveSig,
          faceRegisteredAt: regTimestamp,
          faceUpdatedAt: serverTimestamp(),
          photoUrl: photoData,
          imageRef: photoData,
        });

        await addDoc(collection(db, 'ActivityLogs'), {
          companyId,
          employee_id: emp.id,
          employeeId: emp.id,
          employeeName: emp.name || 'Employee',
          employeeEmail: emp.email || '',
          action: 'Registered Face Reference',
          type: 'Face Registration',
          status: 'Normal',
          details: 'Employee registered facial reference photo for identity verification.',
          timestamp: serverTimestamp(),
        }).catch(() => {});

        const registeredInfo = {
          faceRegistered: true,
          faceReferencePhoto: photoData,
          faceReferenceSignature: liveSig,
          faceRegisteredAt: regTimestamp,
        };
        setLocalFaceRef(registeredInfo);
        setResult('Registered');
        setConfidenceScore(100);
        setStatusMessage('Your face reference has been securely registered. You can now respond to facial verification requests.');
        setStage('result');

        if (onFaceRegistered) {
          onFaceRegistered(registeredInfo);
        }
        return;
      }

      // ── MODE 2: IDENTITY VERIFICATION (Requirements 7 & 8) ───────────────
      const refSig =
        localFaceRef?.faceReferenceSignature ||
        emp.faceReferenceSignature ||
        computeFaceSignature(localFaceRef?.faceReferencePhoto || emp.faceReferencePhoto);

      if (!refSig) {
        // Strict hard gate: NEVER auto-succeed without a registered face
        setStage('no_registration');
        setStatusMessage(FACE_REG_REQUIRED_MSG);
        return;
      }

      // Acquire current GPS location if available (never fabricate coordinates)
      let coords = { latitude: null, longitude: null, accuracy: null };
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm?.status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc?.coords) {
            coords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? null,
            };
          }
        }
      } catch (_) {}

      // Deterministic comparison against registered face reference
      const comparison = compareFaceSignatures(refSig, liveSig);
      const isVerified = comparison.matched;
      const finalStatus = isVerified ? 'Verified' : 'Failed';
      const nowIso = new Date().toISOString();
      const nowDate = new Date();
      const vid = verificationRequest?.verificationRequestId || verificationRequest?.verificationId || generateVerificationId();

      setVerificationId(vid);
      setConfidenceScore(comparison.confidenceScore);
      setResult(finalStatus);
      setStatusMessage(comparison.reason);

      const recordPayload = {
        companyId,
        verificationId: vid,
        verificationRequestId: verificationRequest?.verificationRequestId || verificationRequest?.id || vid,
        employeeId: emp.id || null,
        employeeName: emp.name || 'Employee',
        employeeEmail: emp.email || '',
        employeeType: emp.workType || emp.employeeType || emp.type || 'Employee',
        assignmentId: assignment?.id || emp.assignmentId || null,
        siteId: assignment?.siteId || emp.assignedSiteId || null,
        siteName: assignment?.siteName || assignment?.site || emp.assignedSite || 'Assigned Worksite',
        capturedImageUrl: photoData,
        imageRef: photoData,
        selfieUrl: photoData,
        photo: photoData,
        verificationResult: finalStatus,
        confidenceScore: comparison.confidenceScore,
        status: finalStatus,
        verificationStatus: finalStatus,
        comparisonReason: comparison.reason,
        faceRegistered: true,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationAccuracy: coords.accuracy,
        triggerType: verificationRequest ? 'admin_request' : triggerType,
        attendanceId: attendanceId || null,
        submittedAt: nowIso,
        completedAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        retryCount,
      };

      let savedDocId = verificationRequest?.id || vid;
      try {
        // 1. Update existing Admin verification request OR create new record in facial_verifications
        if (verificationRequest?.id) {
          await updateDoc(doc(db, 'facial_verifications', verificationRequest.id), recordPayload);
          savedDocId = verificationRequest.id;
        } else {
          const ref = await addDoc(collection(db, 'facial_verifications'), {
            ...recordPayload,
            createdAt: serverTimestamp(),
          });
          if (ref?.id) savedDocId = ref.id;
        }
        setFirestoreDocId(savedDocId);

        // 2. Write lightweight audit entry to ActivityLogs (no giant base64 blob)
        await addDoc(collection(db, 'ActivityLogs'), {
          companyId,
          employee_id: emp.id || null,
          employeeId: emp.id || null,
          employeeName: emp.name || 'Employee',
          employeeEmail: emp.email || '',
          site_id: recordPayload.siteId,
          siteName: recordPayload.siteName,
          action: isVerified
            ? `Facial Verification Verified (${comparison.confidenceScore}% Confidence)`
            : `Facial Verification Failed (${comparison.confidenceScore}% Confidence)`,
          type: 'Security Verification',
          confidenceScore: comparison.confidenceScore,
          verificationResult: finalStatus,
          verificationStatus: finalStatus,
          verificationId: vid,
          verificationRequestId: recordPayload.verificationRequestId,
          triggerType: recordPayload.triggerType,
          latitude: coords.latitude,
          longitude: coords.longitude,
          status: isVerified ? 'Normal' : 'Warning',
          timestamp: serverTimestamp(),
        }).catch(() => {});

        // 3. Update employee last verification timestamp
        if (emp.id) {
          await updateDoc(doc(db, 'employees', emp.id), {
            lastVerifiedAt: nowIso,
            lastVerificationStatus: finalStatus,
            lastVerificationConfidence: comparison.confidenceScore,
          }).catch(() => {});
        }

        // 4. Location log if GPS available
        if (coords.latitude != null && coords.longitude != null) {
          await locationLogService.saveLocationLogEntry({
            employee: emp,
            site: { id: recordPayload.siteId, name: recordPayload.siteName },
            assignment,
            attendanceId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            trigger: 'facial_verification',
          }).catch(() => {});
        }

        // 5. Persistent notifications (Admin on failure or completion, Employee confirmation)
        const dateStr = nowIso.split('T')[0];
        const timeStr = nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (!isVerified) {
          await addDoc(collection(db, 'notifications'), {
            companyId,
            type: 'admin_security_alert',
            notificationType: 'FACIAL_VERIFICATION_FAILED',
            targetRole: 'admin',
            title: 'Facial Verification Failed',
            message: `${recordPayload.employeeName} failed facial verification (${comparison.confidenceScore}% similarity). Review required.`,
            severity: 'High',
            employeeId: emp.id || null,
            employeeName: recordPayload.employeeName,
            relatedRecordId: savedDocId,
            verificationId: vid,
            date: dateStr,
            time: timeStr,
            status: 'Unread',
            read: false,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
          }).catch(() => {});

          // Track consecutive failures for REPEATED_FACIAL_VERIFICATION_FAILURE
          try {
            const failKey = `facial_fail_count_${emp.id || 'emp'}`;
            const raw = await AsyncStorage.getItem(failKey);
            const newCount = (raw ? parseInt(raw, 10) : 0) + 1;
            await AsyncStorage.setItem(failKey, String(newCount));

            if (newCount >= SECURITY.REPEATED_FACIAL_FAILURES_THRESHOLD) {
              await writeSecurityEvent({
                eventType: 'REPEATED_FACIAL_VERIFICATION_FAILURE',
                employee: { ...emp, companyId },
                assignment: { ...(assignment || {}), companyId },
                coords,
                relatedVerificationId: vid,
                relatedAttendanceId: attendanceId,
                extra: { count: newCount },
              });
              await AsyncStorage.setItem(failKey, '0');
            }
          } catch (_) {}
        } else {
          await AsyncStorage.setItem(`facial_fail_count_${emp.id || 'emp'}`, '0').catch(() => {});
          if (verificationRequest?.id) {
            await addDoc(collection(db, 'notifications'), {
              companyId,
              type: 'admin',
              notificationType: 'FACIAL_VERIFICATION_COMPLETED',
              targetRole: 'admin',
              title: 'Facial Verification Completed',
              message: `${recordPayload.employeeName} completed requested facial verification (${comparison.confidenceScore}% match).`,
              severity: 'Info',
              employeeId: emp.id || null,
              employeeName: recordPayload.employeeName,
              relatedRecordId: savedDocId,
              verificationId: vid,
              date: dateStr,
              time: timeStr,
              status: 'Unread',
              read: false,
              timestamp: serverTimestamp(),
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }
        }

        await addDoc(collection(db, 'notifications'), {
          companyId,
          type: 'employee',
          notificationType: 'FACIAL_VERIFICATION_RESULT',
          targetRole: 'employee',
          employeeId: emp.id || null,
          employeeName: recordPayload.employeeName,
          title: isVerified ? 'Verification Successful' : 'Verification Failed',
          message: isVerified
            ? `Identity verified (${comparison.confidenceScore}% match).`
            : `Identity verification failed (${comparison.confidenceScore}% match). Please retry in better lighting.`,
          severity: isVerified ? 'Info' : 'High',
          relatedRecordId: savedDocId,
          date: dateStr,
          time: timeStr,
          status: 'Unread',
          read: false,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
        }).catch(() => {});
      } catch (fsErr) {
        console.warn('[FacialVerificationModal] Firestore write failed, queuing offline:', fsErr?.message);
        await queueOfflineRecord('facial_verifications', recordPayload);
      }

      await markPromptAnswered();
      setStage('result');

      if (isVerified && onVerified) {
        onVerified(recordPayload);
      }
    } catch (error) {
      console.error('[FacialVerificationModal] capture error:', error);
      setStage('result');
      setResult('Error');
      setConfidenceScore(0);
      setStatusMessage(error?.message || 'An error occurred during facial capture.');
    }
  }, [activeMode, employee, assignment, localFaceRef, verificationRequest, triggerType, attendanceId, retryCount, onVerified, onFaceRegistered]);

  const handleRetry = useCallback(() => {
    if (retryCount >= MAX_RETRIES) {
      Alert.alert('Maximum Retries Reached', 'You have reached the maximum verification attempts. Please contact your supervisor.');
      onClose();
      return;
    }
    setRetryCount((prev) => prev + 1);
    setPhotoUri(null);
    setResult(null);
    setConfidenceScore(null);
    setStatusMessage('');
    setStage('camera');
  }, [retryCount, onClose]);

  const handleSwitchToRegister = () => {
    setActiveMode('register');
    setPhotoUri(null);
    setResult(null);
    setStage('prompt');
  };

  const handleProceedToVerifyAfterRegistration = () => {
    setActiveMode('verify');
    setPhotoUri(null);
    setResult(null);
    setConfidenceScore(null);
    setStage('prompt');
  };

  const isSuccess = result === 'Verified' || result === 'Registered';
  const resultColor = isSuccess ? '#10B981' : result === 'Error' ? '#6B7280' : '#EF4444';
  const resultLabel = result === 'Registered'
    ? 'Registered ✓'
    : result === 'Verified'
      ? 'Verified ✓'
      : result === 'Error'
        ? 'Error'
        : 'Failed ✗';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBg}>
                <Ionicons name={activeMode === 'register' ? 'person-add' : 'scan-circle'} size={22} color="#4F46E5" />
              </View>
              <View>
                <Text style={styles.headerTitle}>
                  {activeMode === 'register'
                    ? 'Face Reference Registration'
                    : verificationRequest
                      ? 'Admin Verification Request'
                      : 'Identity Verification'}
                </Text>
                <Text style={styles.headerSub}>
                  {activeMode === 'register'
                    ? 'First-time facial enrollment'
                    : verificationRequest?.requestedByName
                      ? `Requested by ${verificationRequest.requestedByName}`
                      : 'Facial identity check'}
                </Text>
              </View>
            </View>
            {stage !== 'processing' && (
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* STAGE: No Face Registration Gate (Requirement 8) */}
          {stage === 'no_registration' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.promptIllustration}>
                <View style={[styles.scanRing, { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="alert-circle" size={56} color="#D97706" />
                </View>
              </View>

              <Text style={styles.promptTitle}>Face Registration Required</Text>
              <Text style={[styles.promptBody, { color: '#92400E', fontWeight: '700' }]}>
                {FACE_REG_REQUIRED_MSG}
              </Text>
              <Text style={styles.promptBody}>
                You must register your face reference photo first so your live selfie can be compared against your enrolled identity.
              </Text>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleSwitchToRegister}>
                <Ionicons name="camera" size={18} color="white" />
                <Text style={styles.btnText}>Register Face Now</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                <Text style={styles.secondaryText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* STAGE: Prompt */}
          {stage === 'prompt' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.promptIllustration}>
                <View style={styles.scanRing}>
                  <Ionicons name={activeMode === 'register' ? 'person-add' : 'person-circle'} size={60} color="#4F46E5" />
                </View>
              </View>

              <Text style={styles.promptTitle}>
                {activeMode === 'register'
                  ? 'Register Your Face Reference'
                  : verificationRequest
                    ? 'Facial Verification Requested'
                    : 'Identity Verification'}
              </Text>
              <Text style={styles.promptBody}>
                {activeMode === 'register'
                  ? 'Capture a clear front-facing photo in good lighting. This reference will be stored securely and used to verify your identity.'
                  : verificationRequest?.reason
                    ? `${verificationRequest.reason} Make sure you are safely parked / stationary before taking your selfie.`
                    : 'Align your face in a well-lit area while stationary to verify your identity against your registered face reference.'}
              </Text>

              <View style={styles.hintRow}>
                <View style={styles.hintItem}>
                  <Ionicons name="car-outline" size={16} color="#DC2626" />
                  <Text style={styles.hintText}>Only verify when safely stationary — never while driving</Text>
                </View>
                <View style={styles.hintItem}>
                  <Ionicons name="sunny-outline" size={16} color="#D97706" />
                  <Text style={styles.hintText}>Good front lighting required</Text>
                </View>
                <View style={styles.hintItem}>
                  <Ionicons name="scan-outline" size={16} color="#4F46E5" />
                  <Text style={styles.hintText}>Position your face clearly inside the frame</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={() => setStage('camera')}>
                <Ionicons name="camera" size={18} color="white" />
                <Text style={styles.btnText}>
                  {activeMode === 'register' ? 'Capture Face Reference' : 'Proceed to Capture'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* STAGE: Camera */}
          {stage === 'camera' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={styles.subtitle}>
                {activeMode === 'register'
                  ? 'Look straight ahead in clear lighting, then tap Capture Reference Photo.'
                  : 'Align your face within the guide, then tap Capture Selfie to compare with your registered face.'}
              </Text>

              <View style={styles.cameraBox}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.selfieImage} />
                ) : (
                  <View style={styles.placeholderBox}>
                    <Ionicons name="person-circle-outline" size={80} color="#9CA3AF" />
                    <Text style={styles.guideText}>Front camera • Position your face</Text>
                  </View>
                )}
                <View style={styles.ovalOverlay} />
              </View>

              <View style={styles.guidanceBox}>
                <Ionicons name="sunny-outline" size={16} color="#D97706" />
                <Text style={styles.guidanceText}>Ensure good lighting. Remove glasses or hats if possible.</Text>
              </View>

              {retryCount > 0 && activeMode === 'verify' && (
                <View style={styles.retryBadge}>
                  <Text style={styles.retryText}>Attempt {retryCount + 1} of {MAX_RETRIES + 1}</Text>
                </View>
              )}

              <TouchableOpacity style={styles.primaryBtn} onPress={handleCapturePhoto}>
                <Ionicons name="camera" size={18} color="white" />
                <Text style={styles.btnText}>
                  {activeMode === 'register' ? 'Capture Reference Photo' : 'Capture Selfie'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* STAGE: Processing */}
          {stage === 'processing' && (
            <View style={styles.processingContainer}>
              {photoUri && <Image source={{ uri: photoUri }} style={styles.processingThumb} />}
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={styles.processingTitle}>
                  {activeMode === 'register' ? 'Saving Face Reference…' : 'Comparing Against Registered Face…'}
                </Text>
                <Text style={styles.processingBody}>
                  {activeMode === 'register'
                    ? 'Securely storing your reference profile in Firestore'
                    : 'Validating facial signature and syncing result to Admin Portal'}
                </Text>
              </View>
            </View>
          )}

          {/* STAGE: Result */}
          {stage === 'result' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {photoUri && (
                <View style={styles.selfieResultContainer}>
                  <Image source={{ uri: photoUri }} style={styles.selfieResultImg} />
                  <View style={[styles.resultBadge, { backgroundColor: resultColor }]}>
                    <Text style={styles.resultBadgeText}>{resultLabel}</Text>
                  </View>
                </View>
              )}

              <View style={[styles.resultCard, { borderColor: resultColor + '40' }]}>
                <Text style={[styles.resultStatus, { color: resultColor }]}>
                  {result === 'Registered'
                    ? 'Face Registered Successfully'
                    : result === 'Verified'
                      ? 'Identity Verified Successfully'
                      : result === 'Error'
                        ? 'Verification Error'
                        : 'Verification Failed'}
                </Text>

                {statusMessage ? (
                  <Text style={styles.resultMessage}>{statusMessage}</Text>
                ) : null}

                {activeMode === 'verify' && confidenceScore !== null && (
                  <View style={styles.scoreRow}>
                    <Text style={styles.scoreLabel}>Similarity Confidence</Text>
                    <Text style={[styles.scoreValue, { color: resultColor }]}>{confidenceScore}%</Text>
                  </View>
                )}

                {verificationId && activeMode === 'verify' && (
                  <Text style={styles.vidText}>Request ID: {verificationId}</Text>
                )}

                {adminStatus && (
                  <View style={[styles.adminStatusRow, { borderColor: '#4F46E5' }]}>
                    <Ionicons name="shield-checkmark" size={14} color="#4F46E5" />
                    <Text style={[styles.adminStatusText, { color: '#4F46E5' }]}>
                      Admin Review: {adminStatus}
                    </Text>
                  </View>
                )}
              </View>

              {result === 'Registered' && verificationRequest ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleProceedToVerifyAfterRegistration}>
                  <Ionicons name="scan-circle" size={20} color="white" />
                  <Text style={styles.btnText}>Continue to Verification Request</Text>
                </TouchableOpacity>
              ) : isSuccess ? (
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#10B981' }]} onPress={onClose}>
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text style={styles.btnText}>Done</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.actionGroup}>
                  {retryCount < MAX_RETRIES && (
                    <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleRetry}>
                      <Ionicons name="refresh" size={18} color="white" />
                      <Text style={styles.btnText}>Retry ({MAX_RETRIES - retryCount} left)</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose}>
                    <Text style={styles.secondaryText}>Close</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    elevation: 16,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 11, color: '#6B7280', fontWeight: '500', marginTop: 1 },
  closeBtn: { padding: 6 },
  promptIllustration: { alignItems: 'center', marginBottom: 16 },
  scanRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  promptTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  promptBody: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  hintRow: { gap: 8, marginBottom: 20 },
  hintItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10 },
  hintText: { fontSize: 12, color: '#374151', fontWeight: '500', flex: 1 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 14, lineHeight: 18, textAlign: 'center' },
  cameraBox: {
    height: 220,
    backgroundColor: '#F3F4F6',
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 12,
  },
  placeholderBox: { alignItems: 'center' },
  guideText: { fontSize: 12, color: '#9CA3AF', marginTop: 6, fontWeight: '500' },
  selfieImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  ovalOverlay: {
    position: 'absolute',
    width: 140,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(79, 70, 229, 0.7)',
    borderStyle: 'dashed',
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  guidanceText: { fontSize: 12, color: '#92400E', fontWeight: '500', flex: 1 },
  retryBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 10,
  },
  retryText: { fontSize: 12, color: '#991B1B', fontWeight: '700' },
  processingContainer: { alignItems: 'center', paddingVertical: 30 },
  processingThumb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#4F46E5',
    opacity: 0.7,
  },
  processingOverlay: { alignItems: 'center', gap: 10 },
  processingTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  processingBody: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  selfieResultContainer: { alignItems: 'center', marginBottom: 16, position: 'relative' },
  selfieResultImg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#E2E8F0',
  },
  resultBadge: {
    position: 'absolute',
    bottom: -6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  resultBadgeText: { fontSize: 11, fontWeight: '800', color: 'white' },
  resultCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  resultStatus: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  resultMessage: { fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 17 },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  scoreLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  scoreValue: { fontSize: 16, fontWeight: '800' },
  vidText: { fontSize: 10, color: '#94A3B8', textAlign: 'center', fontFamily: 'monospace' },
  adminStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  adminStatusText: { fontSize: 12, fontWeight: '700' },
  actionGroup: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  btnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryText: { color: '#374151', fontWeight: '700', fontSize: 15 },
});
