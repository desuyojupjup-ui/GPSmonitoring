import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Alert, Modal, FlatList
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  auth, db, collection, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, getDocs, query, orderBy, getCleanEmployeeEmail
} from '../firebase';
import { isMobileFieldWithoutSite } from '../utils/assignmentUtils';
import presenceService from '../services/presenceService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatTime(ts) {
  if (!ts) return '--:--';
  if (typeof ts === 'string' && /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(ts.trim())) {
    return ts.trim();
  }
  const d = parseDate(ts);
  if (!d) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = parseDate(ts);
  if (!d) return typeof ts === 'string' ? ts : '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDuration(timeIn, timeOut) {
  if (!timeIn || !timeOut) return '—';
  const i = parseDate(timeIn);
  const o = parseDate(timeOut);
  if (!i || !o) return '—';
  const mins = Math.round((o - i) / 60000);
  if (mins < 0 || isNaN(mins)) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isSameDay(ts, ref) {
  if (!ts || !ref) return false;
  const d = parseDate(ts);
  const r = parseDate(ref);
  if (!d || !r) return false;
  return (
    d.getDate() === r.getDate() &&
    d.getMonth() === r.getMonth() &&
    d.getFullYear() === r.getFullYear()
  );
}

const STATUS_COLOR = {
  'On Site': { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  'Completed': { bg: '#EDE9FE', text: '#5B21B6', dot: '#7C3AED' },
  'Flagged': { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  'Late': { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  'Present': { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
};
function statusStyle(s) { return STATUS_COLOR[s] || { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' }; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ icon, label, value, color }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RecordCard({ record, onCheckOut }) {
  const ss = statusStyle(record.status);
  const canCheckOut = record.status === 'On Site' && !record.timeOut;
  return (
    <View style={styles.recordCard}>
      <View style={styles.recordTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recordDate}>{formatDate(record.timeIn || record.date)}</Text>
          <Text style={styles.recordSite} numberOfLines={1}>
            {record.siteName || record.site_name || record.site || '—'}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: ss.dot }]} />
          <Text style={[styles.statusText, { color: ss.text }]}>{record.status || 'Present'}</Text>
        </View>
      </View>

      <View style={styles.recordTimeline}>
        <View style={styles.timeBlock}>
          <Ionicons name="log-in-outline" size={14} color="#10B981" />
          <View>
            <Text style={styles.timeLabel}>Check In</Text>
            <Text style={styles.timeVal}>{formatTime(record.timeIn || record.checkIn)}</Text>
          </View>
        </View>
        <View style={styles.timelineLine} />
        <View style={styles.timeBlock}>
          <Ionicons name="log-out-outline" size={14} color="#EF4444" />
          <View>
            <Text style={styles.timeLabel}>Check Out</Text>
            <Text style={styles.timeVal}>{record.timeOut ? formatTime(record.timeOut) : '—'}</Text>
          </View>
        </View>
        <View style={styles.timeBlock}>
          <Ionicons name="time-outline" size={14} color="#6366F1" />
          <View>
            <Text style={styles.timeLabel}>Duration</Text>
            <Text style={styles.timeVal}>{getDuration(record.timeIn || record.checkIn, record.timeOut)}</Text>
          </View>
        </View>
      </View>

      {canCheckOut && (
        <TouchableOpacity style={styles.checkOutInline} onPress={() => onCheckOut(record)}>
          <Ionicons name="log-out-outline" size={14} color="white" />
          <Text style={styles.checkOutInlineText}>Check Out Now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AttendanceScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [employee, setEmployee] = useState(null);
  const [allRecords, setAllRecords] = useState([]);
  const [todayRecord, setTodayRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [filterMonth, setFilterMonth] = useState('all'); // 'all' | 'thisMonth' | 'today'
  const [showFilter, setShowFilter] = useState(false);

  const employeeRef = useRef(null);
  const lastEmpKeyRef = useRef('');
  const lastAttKeyRef = useRef('');
  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);
  const formattedName = currentEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

  // 1. Fetch Employee
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'employees'), snap => {
      let emp = null;
      if (!snap.empty) {
        const match = snap.docs.find(d => {
          const data = d.data();
          const em = (data.email || '').trim().toLowerCase();
          const en = (data.name || '').trim().toLowerCase();
          const prefix = currentEmail.split('@')[0];
          return em === currentEmail || en === prefix || prefix.includes(en);
        });
        if (match) emp = { id: match.id, ...match.data() };
      }
      if (!emp) emp = { id: auth.currentUser?.uid || 'emp_fallback', name: formattedName, email: currentEmail };
      const empKey = JSON.stringify({ id: emp.id, name: emp.name, email: emp.email });
      if (empKey !== lastEmpKeyRef.current) {
        lastEmpKeyRef.current = empKey;
        setEmployee(emp);
      }
      employeeRef.current = emp;
      setLoading(false);
    });
    return () => unsub();
  }, [currentEmail]);

  // 2. Fetch Attendance records – re-runs once employee is loaded
  useEffect(() => {
    // Helper: does this record belong to the current user?
    const matchesMe = (r) => {
      const uid = auth.currentUser?.uid || '';
      const email = currentEmail;
      const emp = employeeRef.current;
      const eid = (emp?.id || uid).toLowerCase();
      const ename = (emp?.name || formattedName).toLowerCase();

      const rid = (r.employee_id || '').toLowerCase();
      const rname = (r.employeeName || r.employee_name || '').toLowerCase();
      const remail = (r.email || '').toLowerCase();

      // Match by UID / Firestore doc ID, by name, or by email
      if (eid && rid && (rid === eid || rid.includes(eid) || eid.includes(rid))) return true;
      if (ename && rname && (rname === ename || rname.includes(ename) || ename.includes(rname))) return true;
      if (email && remail && remail === email) return true;
      return false;
    };

    let records = {};   // keyed by Firestore doc id – deduplicates across both collections

    const commit = () => {
      const all = Object.values(records);
      all.sort((a, b) => {
        const ta = a.timeIn?.toMillis?.() ?? a.timeIn ?? 0;
        const tb = b.timeIn?.toMillis?.() ?? b.timeIn ?? 0;
        return tb - ta;
      });
      const recKey = JSON.stringify(all.map(r => ({ id: r.id, timeIn: r.timeIn, timeOut: r.timeOut, status: r.status })));
      if (recKey !== lastAttKeyRef.current) {
        lastAttKeyRef.current = recKey;
        setAllRecords(all);
        const today = new Date();
        setTodayRecord(all.find(r => isSameDay(r.timeIn || r.date, today)) || null);
      }
      setLoading(false);
    };

    const handle = (collKey) => (snap) => {
      if (!snap || snap.empty) {
        // Remove any records that came from this collection
        Object.keys(records).forEach(k => { if (records[k]._col === collKey) delete records[k]; });
      } else {
        snap.docs.forEach(d => {
          const raw = { id: d.id, _col: collKey, ...d.data() };
          if (matchesMe(raw)) {
            records[d.id] = raw;
          } else {
            // In case a previously matched record was removed
            delete records[d.id];
          }
        });
      }
      commit();
    };

    const unsub1 = onSnapshot(collection(db, 'Attendance'), handle('Attendance'));
    const unsub2 = onSnapshot(collection(db, 'attendance'), handle('attendance'));
    return () => { unsub1(); unsub2(); };
  }, [currentEmail, employee?.id]);

  // 3. Check In
  const handleCheckIn = async () => {
    if (!employeeRef.current) return Alert.alert('Error', 'Employee profile not loaded.');

    // Mobile field employees cannot check in without assigned worksites
    if (isMobileFieldWithoutSite(employeeRef.current, null, null)) {
      Alert.alert(
        'Check-In Blocked',
        'You are registered as a Mobile Field Employee, but have no assigned worksite or patrol route. You cannot check in until an administrator assigns you at least one worksite.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (todayRecord) return Alert.alert('Already Checked In', 'You have already checked in today.');
    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Denied', 'Location is required to check in.'); setChecking(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const emp = employeeRef.current;
      const attData = {
        employee_id: emp.id,
        employeeId: emp.id,
        employeeUid: auth.currentUser?.uid || emp.id,
        employeeName: emp.name,
        email: emp.email || currentEmail,
        siteName: emp.assignedSite || emp.site || 'Unassigned Site',
        date: serverTimestamp(),
        timeIn: serverTimestamp(),
        timeOut: null,
        status: 'On Site',
        inFence: true,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        verification: 'GPS',
        createdAt: Date.now(),
      };
      await addDoc(collection(db, 'Attendance'), attData);
      await addDoc(collection(db, 'attendance'), attData).catch(() => { });
      if (emp.id !== 'emp_fallback') {
        await updateDoc(doc(db, 'employees', emp.id), {
          status: 'On Duty',
          lastCheckIn: serverTimestamp(),
          lastActive: Date.now(),
          isOnline: true,
        }).catch(() => { });
        presenceService.setCurrentStatus('On Duty');
        presenceService.sendHeartbeat(true, 'On Duty');
      }
      Alert.alert('✅ Checked In', `Recorded at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to check in.');
    } finally {
      setChecking(false);
    }
  };

  // 4. Check Out
  const handleCheckOut = async (record) => {
    // Mobile field employees cannot check out without assigned worksites
    if (isMobileFieldWithoutSite(employeeRef.current, null, null)) {
      Alert.alert(
        'Check-Out Blocked',
        'You are registered as a Mobile Field Employee with no assigned worksite.',
        [{ text: 'OK' }]
      );
      return;
    }

    const rec = record || todayRecord;
    if (!rec) return Alert.alert('No Record', 'No active check-in found for today.');
    setChecking(true);
    try {
      await updateDoc(doc(db, 'Attendance', rec.id), { timeOut: serverTimestamp(), status: 'Completed' }).catch(() => { });
      await updateDoc(doc(db, 'attendance', rec.id), { timeOut: serverTimestamp(), status: 'Completed' }).catch(() => { });
      const emp = employeeRef.current;
      if (emp?.id && emp.id !== 'emp_fallback') {
        await updateDoc(doc(db, 'employees', emp.id), { status: 'Online', lastActive: Date.now(), isOnline: true }).catch(() => { });
        presenceService.setCurrentStatus('Online');
        presenceService.sendHeartbeat(true, 'Online');
      }
      Alert.alert('✅ Checked Out', 'Have a great day!');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to check out.');
    } finally {
      setChecking(false);
    }
  };

  // Derived stats
  const now = new Date();
  const thisMonthRecs = allRecords.filter(r => {
    const d = (r.timeIn || r.date || r.createdAt || r.timestamp);
    if (!d) return false;
    const dt = parseDate(d);
    if (!dt) return false;
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  });

  const daysWorked = thisMonthRecs.length;
  const onTimeCount = thisMonthRecs.filter(r => r.status === 'On Site' || r.status === 'Completed' || r.status === 'Present').length;
  const lateCount = thisMonthRecs.filter(r => r.status === 'Late' || r.status === 'Flagged').length;
  const monthRate = daysWorked > 0 ? Math.round((onTimeCount / daysWorked) * 100) : 100;

  // Filter records for list
  const filteredRecords = allRecords.filter(r => {
    if (filterMonth === 'today') return isSameDay(r.timeIn || r.date, now);
    if (filterMonth === 'thisMonth') return thisMonthRecs.includes(r);
    return true;
  });

  const FILTERS = [
    { key: 'all', label: 'All Time' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'today', label: 'Today' },
  ];

  const checkedIn = !!todayRecord;
  const checkedOut = checkedIn && !!todayRecord?.timeOut;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Attendance</Text>
          <Text style={styles.headerSub}>{employee?.name || formattedName}</Text>
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilter(true)}>
          <Ionicons name="filter" size={18} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} tintColor="#4F46E5" />}
      >
        {/* ── Today's Status Card ── */}
        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <View>
              <Text style={styles.todayLabel}>Today's Attendance</Text>
              <Text style={styles.todayDate}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
            </View>
            {checkedIn && (
              <View style={[styles.statusBadge, { backgroundColor: checkedOut ? '#EDE9FE' : '#D1FAE5' }]}>
                <View style={[styles.statusDot, { backgroundColor: checkedOut ? '#7C3AED' : '#10B981' }]} />
                <Text style={[styles.statusText, { color: checkedOut ? '#5B21B6' : '#065F46' }]}>
                  {checkedOut ? 'Completed' : 'On Site'}
                </Text>
              </View>
            )}
          </View>

          {/* Time row */}
          <View style={styles.todayTimes}>
            <View style={styles.todayTimeBox}>
              <Text style={styles.todayTimeLabel}>Check In</Text>
              <Text style={[styles.todayTimeVal, { color: '#10B981' }]}>
                {checkedIn ? formatTime(todayRecord.timeIn) : '--:--'}
              </Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayTimeBox}>
              <Text style={styles.todayTimeLabel}>Check Out</Text>
              <Text style={[styles.todayTimeVal, { color: '#EF4444' }]}>
                {checkedOut ? formatTime(todayRecord.timeOut) : '--:--'}
              </Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayTimeBox}>
              <Text style={styles.todayTimeLabel}>Duration</Text>
              <Text style={[styles.todayTimeVal, { color: '#6366F1' }]}>
                {checkedOut ? getDuration(todayRecord.timeIn, todayRecord.timeOut) : '--'}
              </Text>
            </View>
          </View>

          {/* Site Row */}
          {checkedIn && (
            <View style={styles.siteRow}>
              <Ionicons name="location-sharp" size={14} color="#4F46E5" />
              <Text style={styles.siteRowText}>{todayRecord.siteName || todayRecord.site_name || 'Unassigned Site'}</Text>
            </View>
          )}

          {/* Warning Banner if Mobile Field Employee has no assigned site */}
          {isMobileFieldWithoutSite(employee, null, null) && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FEF2F2',
              borderWidth: 1,
              borderColor: '#FCA5A5',
              borderRadius: 12,
              padding: 12,
              marginTop: 12,
              gap: 8
            }}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>Check-In & Check-Out Locked</Text>
                <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 2 }}>
                  Mobile Field Employees must have at least one assigned worksite before checking in or out. Contact your administrator.
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.todayActions}>
            {!checkedIn ? (
              <TouchableOpacity
                style={[
                  styles.actionBtn, 
                  styles.checkInBtn, 
                  (checking || isMobileFieldWithoutSite(employee, null, null)) && { opacity: 0.6, backgroundColor: isMobileFieldWithoutSite(employee, null, null) ? '#94A3B8' : styles.checkInBtn.backgroundColor }
                ]}
                onPress={handleCheckIn}
                disabled={checking}
              >
                {checking ? <ActivityIndicator color="white" size="small" /> : (
                  <>
                    <Ionicons name="log-in-outline" size={18} color="white" />
                    <Text style={styles.actionBtnText}>Check In</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : !checkedOut ? (
              <TouchableOpacity
                style={[
                  styles.actionBtn, 
                  styles.checkOutBtn, 
                  (checking || isMobileFieldWithoutSite(employee, null, null)) && { opacity: 0.6, backgroundColor: isMobileFieldWithoutSite(employee, null, null) ? '#94A3B8' : styles.checkOutBtn.backgroundColor }
                ]}
                onPress={() => handleCheckOut(null)}
                disabled={checking}
              >
                {checking ? <ActivityIndicator color="white" size="small" /> : (
                  <>
                    <Ionicons name="log-out-outline" size={18} color="white" />
                    <Text style={styles.actionBtnText}>Check Out</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.doneRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.doneText}>Shift completed for today</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Monthly Stats ── */}
        <Text style={styles.sectionTitle}>This Month</Text>
        <View style={styles.statsRow}>
          <StatBox icon="calendar-outline" label="Days Worked" value={daysWorked} color="#4F46E5" />
          <StatBox icon="checkmark-circle" label="On Time" value={onTimeCount} color="#10B981" />
          <StatBox icon="alert-circle" label="Late / Flag" value={lateCount} color="#F59E0B" />
          <StatBox icon="trending-up" label="Rate" value={`${monthRate}%`} color="#3B82F6" />
        </View>

        {/* ── History List ── */}
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Attendance History</Text>
          <View style={styles.filterChips}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, filterMonth === f.key && styles.chipActive]}
                onPress={() => setFilterMonth(f.key)}
              >
                <Text style={[styles.chipText, filterMonth === f.key && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {filteredRecords.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No records found</Text>
            <Text style={styles.emptySubtext}>Check in from the Home screen to log attendance.</Text>
          </View>
        ) : (
          filteredRecords.map(record => (
            <RecordCard key={record.id} record={record} onCheckOut={handleCheckOut} />
          ))
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowFilter(false)} activeOpacity={1}>
          <View style={styles.filterSheet}>
            <Text style={styles.filterSheetTitle}>Filter Records</Text>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={styles.filterOption}
                onPress={() => { setFilterMonth(f.key); setShowFilter(false); }}
              >
                <Text style={[styles.filterOptionText, filterMonth === f.key && { color: '#4F46E5', fontWeight: '700' }]}>{f.label}</Text>
                {filterMonth === f.key && <Ionicons name="checkmark" size={18} color="#4F46E5" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },

  // Header
  header: { backgroundColor: '#4F46E5', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#C7D2FE', fontSize: 12, fontWeight: '500' },
  filterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

  // Today card
  todayCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 16, marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4 },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  todayLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  todayDate: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  todayTimes: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 12 },
  todayTimeBox: { flex: 1, alignItems: 'center' },
  todayDivider: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 4 },
  todayTimeLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  todayTimeVal: { fontSize: 16, fontWeight: '800' },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  siteRowText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  todayActions: { gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, gap: 8 },
  checkInBtn: { backgroundColor: '#10B981' },
  checkOutBtn: { backgroundColor: '#EF4444' },
  actionBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  doneText: { color: '#10B981', fontWeight: '700', fontSize: 14 },

  // Stats
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 18, marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  statVal: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, color: '#6B7280', fontWeight: '600', textAlign: 'center' },

  // History
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  filterChips: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#4F46E5' },
  chipText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  chipTextActive: { color: 'white' },

  // Record Card
  recordCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  recordDate: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  recordSite: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  recordTimeline: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, gap: 4 },
  timeBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timelineLine: { width: 1, backgroundColor: '#E5E7EB', height: 28, alignSelf: 'center' },
  timeLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '600' },
  timeVal: { fontSize: 12, fontWeight: '700', color: '#111827' },
  checkOutInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 8, marginTop: 10 },
  checkOutInlineText: { color: 'white', fontWeight: '700', fontSize: 13 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptySubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  // Filter modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
  filterSheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12 },
  filterOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filterOptionText: { fontSize: 14, color: '#374151', fontWeight: '500' },
});
