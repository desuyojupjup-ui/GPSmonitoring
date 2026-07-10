import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Map each failed-check id to a professional title, icon, and remediation hint.
const META = {
  permission: { icon: 'location-outline', title: 'Location Permission Needed', hint: 'Enable location access in Settings, then try again.' },
  root:       { icon: 'shield-outline',   title: 'Device Integrity Failed',     hint: 'Attendance is blocked on rooted or jailbroken devices for security reasons.' },
  vpn:        { icon: 'globe-outline',     title: 'VPN Detected',                hint: 'Disable any VPN or proxy and reconnect to your normal network.' },
  mock:       { icon: 'navigate-outline',  title: 'Fake GPS Detected',           hint: 'Turn off mock-location apps and developer location overrides.' },
  accuracy:   { icon: 'aperture-outline',  title: 'Weak GPS Signal',             hint: 'Move to an open area away from buildings and try again.' },
  geofence:   { icon: 'pin-outline',       title: 'Outside Work Site',           hint: 'You must be inside your assigned site to record attendance.' },
  consistency:{ icon: 'pulse-outline',     title: 'Suspicious Movement',         hint: 'Your location changed unrealistically. Please try again in a moment.' },
  default:    { icon: 'alert-circle-outline', title: 'Attendance Blocked',       hint: 'A security check did not pass.' },
};

export default function SecurityWarningModal({ visible, failedCheck, reason, onClose }) {
  const meta = META[failedCheck] || META.default;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={meta.icon} size={34} color="#EF4444" />
          </View>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.reason}>{reason || meta.hint}</Text>
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color="#4F46E5" />
            <Text style={styles.hint}>{meta.hint}</Text>
          </View>
          <Text style={styles.note}>This event has been recorded in your security log.</Text>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  reason: { fontSize: 14, color: '#4B5563', textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  hintBox: { flexDirection: 'row', gap: 8, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12, alignItems: 'flex-start', marginBottom: 14 },
  hint: { flex: 1, fontSize: 13, color: '#3730A3', lineHeight: 19 },
  note: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginBottom: 18 },
  button: { backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 12, alignItems: 'center', alignSelf: 'stretch' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
