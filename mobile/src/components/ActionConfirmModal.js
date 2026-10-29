import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Confirmation modal for Check In and Check Out actions
 * Prevents accidental taps by requiring explicit employee confirmation.
 */
export default function ActionConfirmModal({
  visible,
  actionType = 'check_in', // 'check_in' | 'check_out'
  title,
  message = 'Are you sure you want to proceed?',
  subMessage,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const isCheckIn = actionType === 'check_in';

  const defaultTitle = isCheckIn ? 'Confirm Check In' : 'Confirm Check Out';
  const defaultSub = isCheckIn
    ? 'Your active GPS location and timestamp will be recorded for today’s shift.'
    : 'Your shift session will be completed and location tracking will stop.';

  const themeColor = isCheckIn ? '#10B981' : '#EF4444';
  const themeBg = isCheckIn ? '#ECFDF5' : '#FEF2F2';
  const themeBorder = isCheckIn ? '#A7F3D0' : '#FECACA';
  const iconName = isCheckIn ? 'log-in-outline' : 'log-out-outline';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
    >
      <Pressable
        style={styles.backdrop}
        onPress={loading ? undefined : onCancel}
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Action Icon Badge */}
          <View style={[styles.iconWrap, { backgroundColor: themeBg, borderColor: themeBorder }]}>
            <Ionicons name={iconName} size={34} color={themeColor} />
          </View>

          {/* Action Title */}
          <Text style={styles.title}>{title || defaultTitle}</Text>

          {/* User-requested confirmation query */}
          <Text style={styles.confirmQuestion}>{message}</Text>

          {/* Explanatory Context Note */}
          <Text style={styles.subText}>{subMessage || defaultSub}</Text>

          <View style={styles.tipBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#6366F1" />
            <Text style={styles.tipText}>
              Verifies attendance security, geofence boundary & biometric integrity.
            </Text>
          </View>

          {/* Buttons: Cancel vs Yes, Proceed */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, loading && styles.btnDisabled]}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: isCheckIn ? '#10B981' : '#EF4444' },
                loading && styles.btnDisabled
              ]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.confirmBtnText}>
                    {isCheckIn ? 'Yes, Check In' : 'Yes, Check Out'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  confirmQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  subText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    width: '100%',
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1.4,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
