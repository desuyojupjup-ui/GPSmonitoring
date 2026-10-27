import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db, doc, updateDoc } from '../firebase';

export default function AnomalyNotificationModal({ visible, anomaly, onClose, onReportIssue }) {
  if (!anomaly) return null;

  const handleAcknowledge = async () => {
    if (anomaly.id) {
      try {
        await updateDoc(doc(db, 'anomalies', anomaly.id), { status: 'Acknowledged' });
      } catch (e) {}
    }
    onClose();
  };

  const handleCallSupervisor = () => {
    Linking.openURL('tel:09171234567').catch(() => {
      Alert.alert('Contact Supervisor', 'Supervisor Phone: 0917-123-4567');
    });
  };

  const severityColor =
    anomaly.severity === 'High' ? '#EF4444' :
    anomaly.severity === 'Medium' ? '#F59E0B' : '#3B82F6';

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Top Badge Icon */}
          <View style={[styles.iconCircle, { backgroundColor: severityColor + '15' }]}>
            <Ionicons name="warning" size={32} color={severityColor} />
          </View>

          <Text style={styles.title}>System Anomaly Alert</Text>
          <View style={[styles.severityBadge, { backgroundColor: severityColor + '20' }]}>
            <Text style={[styles.severityText, { color: severityColor }]}>{anomaly.severity || 'Medium'} Severity</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.anomalyType}>{anomaly.type || 'Unusual Location Event'}</Text>
            <Text style={styles.description}>{anomaly.description || 'Location or system anomaly flagged during shift.'}</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location:</Text>
              <Text style={styles.detailVal}>{anomaly.location || 'N/A'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Confidence:</Text>
              <Text style={styles.detailVal}>{anomaly.confidence ? `${anomaly.confidence}%` : '85%'}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.btnStack}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleAcknowledge}>
              <Text style={styles.primaryBtnText}>Acknowledge</Text>
            </TouchableOpacity>
            
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onReportIssue}>
                <Ionicons name="flag-outline" size={16} color="#374151" />
                <Text style={styles.secondaryBtnText}>Report Issue</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleCallSupervisor}>
                <Ionicons name="call-outline" size={16} color="#374151" />
                <Text style={styles.secondaryBtnText}>Call Supervisor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', backgroundColor: 'white', borderRadius: 24, padding: 24, alignItems: 'center' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 6 },
  severityBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 16 },
  severityText: { fontSize: 12, fontWeight: '700' },
  infoBox: { width: '100%', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, marginBottom: 20 },
  anomalyType: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  description: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  detailLabel: { fontSize: 12, color: '#9CA3AF' },
  detailVal: { fontSize: 12, color: '#374151', fontWeight: '600' },
  btnStack: { width: '100%', gap: 10 },
  primaryBtn: { backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, backgroundColor: '#F3F4F6', paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
});
