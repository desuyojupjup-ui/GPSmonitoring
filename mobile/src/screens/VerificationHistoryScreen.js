import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db, collection, onSnapshot, query, where, getCleanEmployeeEmail } from '../firebase';

// ─────────────────────────────────────────────────────────────────────────────
// VerificationHistoryScreen
// Displays the logged-in employee's own facial verification history in real time.
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status, result }) {
  const raw = status || result || 'pending';
  const label = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
  const colors = {
    successful: { bg: '#D1FAE5', text: '#065F46' },
    verified: { bg: '#D1FAE5', text: '#065F46' },
    Verified: { bg: '#D1FAE5', text: '#065F46' },
    pending_review: { bg: '#FEF3C7', text: '#92400E' },
    missed: { bg: '#F3F4F6', text: '#6B7280' },
    failed: { bg: '#FEE2E2', text: '#991B1B' },
    rejected: { bg: '#FEE2E2', text: '#991B1B' },
    dismissed: { bg: '#F3F4F6', text: '#6B7280' },
  };
  const c = colors[raw] || { bg: '#EEF2FF', text: '#4F46E5' };
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.badgeText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

export default function VerificationHistoryScreen({ navigation, route, employee: propEmployee }) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  const currentEmail = getCleanEmployeeEmail(propEmployee, route?.params?.employee, route?.params?.user, auth.currentUser);
  const employeeId = propEmployee?.id || route?.params?.employee?.id || auth.currentUser?.uid || 'emp_fallback';

  useEffect(() => {
    setLoading(true);
    let fvDocs = [];
    let actDocs = [];

    const mergeAndSetRecords = () => {
      const recordsMap = new Map();

      // Add direct facial_verifications if any
      fvDocs.forEach(r => {
        if (r && r.id) recordsMap.set(r.verificationId || r.id, r);
      });

      // Add ActivityLogs verification entries
      actDocs.forEach(d => {
        const key = d.verificationId || d.id;
        if (!recordsMap.has(key)) {
          recordsMap.set(key, {
            id: d.id,
            verificationId: d.verificationId || d.id,
            employeeId: d.employee_id || d.employeeId,
            employeeName: d.employeeName,
            employeeEmail: d.employeeEmail,
            verificationResult: d.verificationResult || d.result || (d.status === 'Warning' ? 'failed' : 'verified'),
            verificationStatus: d.verificationStatus || (d.status === 'Warning' ? 'pending_review' : 'successful'),
            confidenceScore: d.confidenceScore || 95,
            triggerType: d.triggerType || 'manual',
            photo: d.photo || d.imageRef || d.capturedImageUrl,
            capturedImageUrl: d.photo || d.imageRef || d.capturedImageUrl,
            imageRef: d.photo || d.imageRef || d.capturedImageUrl,
            latitude: d.latitude,
            longitude: d.longitude,
            submittedAt: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : (d.submittedAt || new Date().toISOString()),
            timestamp: d.timestamp,
            status: d.status || 'Normal',
          });
        }
      });

      const all = Array.from(recordsMap.values());
      const mine = all.filter(r => {
        const empIdMatch = r.employeeId && (r.employeeId === employeeId || r.employeeId.includes(employeeId));
        const emailMatch = currentEmail && r.employeeEmail && r.employeeEmail.toLowerCase() === currentEmail;
        return empIdMatch || emailMatch || (!r.employeeEmail && !r.employeeId);
      });

      mine.sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tb - ta;
      });

      setRecords(mine);
      setLoading(false);
    };

    let unsubFV = () => {};
    try {
      unsubFV = onSnapshot(collection(db, 'facial_verifications'), (snap) => {
        fvDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndSetRecords();
      }, () => {});
    } catch (e) {}

    let unsubAct = () => {};
    try {
      unsubAct = onSnapshot(collection(db, 'ActivityLogs'), (snap) => {
        actDocs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => (d.type && d.type.includes('Verification')) || (d.action && d.action.includes('Facial')));
        mergeAndSetRecords();
      }, (err) => {
        console.warn('[VerificationHistory] ActivityLogs listener error:', err?.message);
        setLoading(false);
      });
    } catch (e) {
      setLoading(false);
    }

    return () => {
      unsubFV();
      unsubAct();
    };
  }, [employeeId, currentEmail]);

  const stats = useMemo(() => {
    const total = records.length;
    const verified = records.filter(r => r.verificationStatus === 'successful' || r.verificationStatus === 'verified' || r.verificationResult === 'verified').length;
    const failed = records.filter(r => r.verificationResult === 'failed').length;
    const missed = records.filter(r => r.verificationResult === 'missed').length;
    const avgConf = total > 0
      ? Math.round(records.reduce((sum, r) => sum + (r.confidenceScore || 0), 0) / total)
      : 0;
    return { total, verified, failed, missed, avgConf };
  }, [records]);

  const renderItem = ({ item }) => {
    const ts = item.submittedAt || item.timestamp;
    const hasPhoto = item.capturedImageUrl || item.selfieUrl || item.photo || item.imageRef;

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => setSelectedRecord(item)}
        activeOpacity={0.8}
      >
        <View style={s.cardLeft}>
          {hasPhoto ? (
            <Image
              source={{ uri: hasPhoto }}
              style={s.thumb}
              defaultSource={require('../../assets/wave.png')}
            />
          ) : (
            <View style={[s.thumb, { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={22} color="#4F46E5" />
            </View>
          )}
        </View>

        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.dateText}>{formatDate(ts)}</Text>
            <StatusBadge status={item.verificationStatus} result={item.verificationResult} />
          </View>
          <Text style={s.timeText}>{formatTime(ts)}</Text>
          <View style={s.cardMeta}>
            <Text style={s.metaText}>
              <Text style={s.metaLabel}>Confidence: </Text>
              {item.confidenceScore || 0}%
            </Text>
            <Text style={s.metaText}>
              <Text style={s.metaLabel}>Type: </Text>
              {(item.triggerType || 'manual').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Verification History</Text>
          <Text style={s.headerSub}>Your biometric verification records</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statNum}>{stats.total}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
        <View style={[s.statBox, { borderColor: '#10B981' }]}>
          <Text style={[s.statNum, { color: '#10B981' }]}>{stats.verified}</Text>
          <Text style={s.statLabel}>Verified</Text>
        </View>
        <View style={[s.statBox, { borderColor: '#EF4444' }]}>
          <Text style={[s.statNum, { color: '#EF4444' }]}>{stats.failed}</Text>
          <Text style={s.statLabel}>Failed</Text>
        </View>
        <View style={[s.statBox, { borderColor: '#6B7280' }]}>
          <Text style={[s.statNum, { color: '#6B7280' }]}>{stats.missed}</Text>
          <Text style={s.statLabel}>Missed</Text>
        </View>
        <View style={[s.statBox, { borderColor: '#6366F1' }]}>
          <Text style={[s.statNum, { color: '#6366F1' }]}>{stats.avgConf}%</Text>
          <Text style={s.statLabel}>Avg Conf.</Text>
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={s.loadingText}>Loading verification history…</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="scan-circle-outline" size={56} color="#E2E8F0" />
          <Text style={s.emptyTitle}>No Verifications Yet</Text>
          <Text style={s.emptyBody}>Your verification records will appear here after your first biometric check.</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => item.id || item.verificationId || Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
          <View style={s.detailOverlay}>
            <View style={s.detailCard}>
              <View style={s.detailHeader}>
                <Text style={s.detailTitle}>Verification Details</Text>
                <TouchableOpacity onPress={() => setSelectedRecord(null)} style={s.closeBtnSmall}>
                  <Ionicons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Selfie */}
                {(selectedRecord.capturedImageUrl || selectedRecord.selfieUrl || selectedRecord.photo) && (
                  <TouchableOpacity
                    style={s.selfieContainer}
                    onPress={() => setExpandedPhoto(selectedRecord.capturedImageUrl || selectedRecord.selfieUrl || selectedRecord.photo)}
                  >
                    <Image
                      source={{ uri: selectedRecord.capturedImageUrl || selectedRecord.selfieUrl || selectedRecord.photo }}
                      style={s.selfie}
                    />
                    <Text style={s.tapToExpand}>Tap to expand</Text>
                  </TouchableOpacity>
                )}

                <StatusBadge status={selectedRecord.verificationStatus} result={selectedRecord.verificationResult} />

                {/* Info rows */}
                {[
                  ['Verification ID', selectedRecord.verificationId || selectedRecord.id],
                  ['Date', formatDate(selectedRecord.submittedAt)],
                  ['Time', formatTime(selectedRecord.submittedAt)],
                  ['Result', selectedRecord.verificationResult || '—'],
                  ['Confidence', `${selectedRecord.confidenceScore || 0}%`],
                  ['Trigger Type', (selectedRecord.triggerType || 'manual').replace(/_/g, ' ')],
                  ['Latitude', selectedRecord.latitude?.toFixed(5) || '—'],
                  ['Longitude', selectedRecord.longitude?.toFixed(5) || '—'],
                  ['Location Accuracy', `±${selectedRecord.locationAccuracy || 0}m`],
                ].map(([label, val]) => (
                  <View key={label} style={s.infoRow}>
                    <Text style={s.infoLabel}>{label}</Text>
                    <Text style={s.infoVal}>{val}</Text>
                  </View>
                ))}

                {/* Admin review section */}
                {selectedRecord.reviewedBy && (
                  <View style={s.reviewBox}>
                    <Text style={s.reviewTitle}>Admin Review</Text>
                    <Text style={s.infoVal}>Reviewed by: {selectedRecord.reviewedBy}</Text>
                    {selectedRecord.reviewedAt && (
                      <Text style={s.infoVal}>Date: {formatDate(selectedRecord.reviewedAt)}</Text>
                    )}
                    {selectedRecord.adminNotes ? (
                      <Text style={s.adminNotes}>{selectedRecord.adminNotes}</Text>
                    ) : null}
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity style={s.closeFullBtn} onPress={() => setSelectedRecord(null)}>
                <Text style={s.closeFullText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Expanded Photo Modal */}
      {expandedPhoto && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setExpandedPhoto(null)}>
          <TouchableOpacity
            style={s.photoOverlay}
            activeOpacity={1}
            onPress={() => setExpandedPhoto(null)}
          >
            <Image source={{ uri: expandedPhoto }} style={s.expandedPhoto} resizeMode="contain" />
            <TouchableOpacity style={s.photoCloseBtn} onPress={() => setExpandedPhoto(null)}>
              <Ionicons name="close-circle" size={34} color="white" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: 'white' },
  headerSub: { fontSize: 12, color: '#C7D2FE', fontWeight: '500', marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    margin: 16,
    marginBottom: 0,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    elevation: 2,
  },
  statNum: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  statLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600', marginTop: 2 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  loadingText: { color: '#6B7280', fontWeight: '500', marginTop: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#374151' },
  emptyBody: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },

  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  cardLeft: {},
  thumb: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#E2E8F0' },
  cardBody: { flex: 1, gap: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  timeText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  cardMeta: { flexDirection: 'row', gap: 12 },
  metaText: { fontSize: 11, color: '#374151' },
  metaLabel: { fontWeight: '700', color: '#6B7280' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Detail modal
  detailOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'flex-end' },
  detailCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  detailTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  closeBtnSmall: { padding: 4 },

  selfieContainer: { alignItems: 'center', marginBottom: 14 },
  selfie: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#4F46E5',
  },
  tapToExpand: { fontSize: 11, color: '#6B7280', marginTop: 4 },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  infoVal: { fontSize: 13, color: '#111827', fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 8 },

  reviewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewTitle: { fontSize: 13, fontWeight: '800', color: '#374151', marginBottom: 4 },
  adminNotes: { fontSize: 12, color: '#6B7280', lineHeight: 16, marginTop: 4, fontStyle: 'italic' },

  closeFullBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  closeFullText: { color: 'white', fontWeight: '700', fontSize: 15 },

  // Photo expand
  photoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedPhoto: { width: '90%', height: '80%' },
  photoCloseBtn: { position: 'absolute', top: 50, right: 20 },
});
