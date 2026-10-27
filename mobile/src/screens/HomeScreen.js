import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  auth,
  db,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDocs,
  ensureAuthenticatedSession,
  getCleanEmployeeEmail
} from '../firebase';

import FacialVerificationModal from '../components/FacialVerificationModal';
import DelayIncidentModal from '../components/DelayIncidentModal';
import SecurityWarningModal from '../components/SecurityWarningModal';
import { runPreAttendanceChecks } from '../services/securityService';
import { getDeviceId } from '../services/deviceInfo';
import { getPendingSyncCount, syncOfflineRecords, clearOfflineQueue } from '../services/offlineSyncService';
import { isAssignmentDatePassed, resolveShift, isAssignmentForEmployee, deduplicateAssignments, isMobileFieldWithoutSite } from '../utils/assignmentUtils';
import {
  startSession as schedulerStart,
  stopSession as schedulerStop,
  onPromptReady,
  restoreSession,
  updateLastKnownLocation,
} from '../services/verificationScheduler';
import presenceService from '../services/presenceService';



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

function formatTimeDisplay(val) {
  if (!val) return '--:--';
  if (typeof val === 'string' && /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/.test(val.trim())) {
    return val.trim();
  }
  const d = parseDate(val);
  if (d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return '--:--';
}

function resolveSiteDetails(siteObj, targetSiteName, selectedAsg) {
  if (!siteObj && !selectedAsg && (!targetSiteName || targetSiteName === 'Unassigned Site' || targetSiteName === 'Unassigned')) {
    return null;
  }

  let lat = siteObj?.lat ?? siteObj?.latitude ?? selectedAsg?.latitude ?? selectedAsg?.lat ?? null;
  let lng = siteObj?.lng ?? siteObj?.longitude ?? selectedAsg?.longitude ?? selectedAsg?.lng ?? null;

  if (lat !== null && lat !== undefined) lat = Number(lat);
  if (lng !== null && lng !== undefined) lng = Number(lng);

  const nameStr = (targetSiteName || siteObj?.name || selectedAsg?.siteName || selectedAsg?.site || 'Office').trim();

  const knownLocations = {
    'office': { lat: 10.3273, lng: 123.9064, address: 'Cebu IT Park, Lahug, Cebu City, 6000 Cebu, Philippines' },
    'cebu office': { lat: 10.3273, lng: 123.9064, address: 'Cebu IT Park, Lahug, Cebu City, 6000 Cebu, Philippines' },
    'head office': { lat: 10.3273, lng: 123.9064, address: 'Cebu IT Park, Lahug, Cebu City, 6000 Cebu, Philippines' },
    'main office': { lat: 10.3273, lng: 123.9064, address: 'Cebu IT Park, Lahug, Cebu City, 6000 Cebu, Philippines' },
    'sm seaside': { lat: 10.2818, lng: 123.8808, address: 'South Road Properties, Cebu City, 6000 Cebu, Philippines' },
    'sm seaside city cebu': { lat: 10.2818, lng: 123.8808, address: 'South Road Properties, Cebu City, 6000 Cebu, Philippines' },
    'ayala center cebu': { lat: 10.3173, lng: 123.9058, address: 'Cebu Business Park, Cebu City, 6000 Cebu, Philippines' },
    'cebu business park': { lat: 10.3173, lng: 123.9058, address: 'Cebu Business Park, Cebu City, 6000 Cebu, Philippines' },
  };

  const nameLower = nameStr.toLowerCase();
  const matchedKey = knownLocations[nameLower] ? nameLower : Object.keys(knownLocations).find(k => nameLower.includes(k) || k.includes(nameLower));
  const matchedKnown = matchedKey ? knownLocations[matchedKey] : null;

  const isInvalid = lat === null || lng === null || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0);

  if (isInvalid) {
    if (matchedKnown) {
      lat = matchedKnown.lat;
      lng = matchedKnown.lng;
    } else {
      lat = 10.3273;
      lng = 123.9064;
    }
  }

  const rawAddress = siteObj?.address || siteObj?.location || selectedAsg?.siteAddress || selectedAsg?.address;
  const address = (rawAddress && rawAddress !== 'GPS Live Monitoring Active' && rawAddress !== 'Cebu City, Central Visayas, 6000, Philippines')
    ? rawAddress
    : (matchedKnown ? matchedKnown.address : 'Cebu IT Park, Lahug, Cebu City, 6000 Cebu, Philippines');

  return {
    ...siteObj,
    id: siteObj?.id || selectedAsg?.siteId || 'site-resolved',
    name: nameStr,
    address,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    radius: siteObj?.radius
      ? (typeof siteObj.radius === 'number' ? siteObj.radius : parseInt(siteObj.radius.toString().replace('m', '')))
      : (selectedAsg?.geofenceRadius || 200)
  };
}

export default function HomeScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [employee, setEmployee] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [site, setSite] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [allAttendance, setAllAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [checking, setChecking] = useState(false);

  // Modals State
  const [showFacialModal, setShowFacialModal] = useState(false);
  const [facialTriggerType, setFacialTriggerType] = useState('manual');
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [securityModal, setSecurityModal] = useState({ visible: false, failedCheck: 'vpn', reason: '' });
  const [activeAnomaly, setActiveAnomaly] = useState(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const currentAttendanceIdRef = useRef(null);

  const hasSetOnline = useRef(false);
  const employeeRef = useRef(null);          // stable ref so assignment effect doesn't re-subscribe
  const assignmentRef = useRef(null);         // track last assignment to avoid redundant setState
  const siteRef = useRef(null);         // track last site to avoid redundant setState
  const lastEmpKeyRef = useRef('');
  const lastAttKeyRef = useRef('');
  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);

  const formattedEmailName = currentEmail ? currentEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : '';
  const displayName = employee?.name
    || propUser?.name
    || route?.params?.user?.name
    || formattedEmailName
    || 'Employee';

  useEffect(() => {
    getPendingSyncCount().then(setPendingSyncCount);
    const interval = setInterval(async () => {
      const res = await syncOfflineRecords();
      if (res.synced > 0) {
        getPendingSyncCount().then(setPendingSyncCount);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // ── Restore scheduler on mount (handles app re-open during active session) ──
  useEffect(() => {
    restoreSession(({ triggerType }) => {
      setFacialTriggerType(triggerType || 'scheduled_random');
      setShowFacialModal(true);
    });
    onPromptReady(({ triggerType }) => {
      setFacialTriggerType(triggerType || 'scheduled_random');
      setShowFacialModal(true);
    });
  }, []);

  // 1. Fetch Employee Profile
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    const unsubEmp = onSnapshot(collection(db, 'employees'), (empSnap) => {
      let empData = null;

      const authUid = (auth.currentUser?.uid || '').trim().toLowerCase();
      const emailToMatch = currentEmail.trim().toLowerCase();
      const nameToMatch = (
        auth.currentUser?.displayName ||
        propUser?.name ||
        route?.params?.user?.name ||
        formattedEmailName ||
        ''
      ).trim().toLowerCase();

      const emailPrefixRaw = emailToMatch ? emailToMatch.split('@')[0] : '';
      const emailPrefixClean = emailPrefixRaw.replace(/[._-]/g, ' ').trim().toLowerCase();

      if (!empSnap.empty) {
        const matchingDoc = empSnap.docs.find(d => {
          const data = d.data();
          const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
          const empName = (data.name || data.empName || '').trim().toLowerCase();
          const empUid = (data.uid || data.firebaseUid || d.id || '').toString().trim().toLowerCase();

          // Strict matching: UID, exact email, or email-prefix
          if (authUid && empUid && authUid === empUid) return true;
          if (emailToMatch && empMail && emailToMatch === empMail) return true;
          if (emailPrefixRaw && empMail && empMail.startsWith(emailPrefixRaw + '@')) return true;

          // Name match only if both sides are meaningful
          if (nameToMatch && nameToMatch.length >= 2 && empName && empName.length >= 2) {
            if (empName === nameToMatch) return true;
            // Token exact match (not substring)
            const nameTokens = nameToMatch.split(/\s+/).filter(t => t.length >= 3);
            const empTokens = empName.split(/\s+/).filter(t => t.length >= 3);
            if (nameTokens.length > 0 && empTokens.length > 0) {
              if (nameTokens.some(nt => empTokens.some(et => nt === et))) return true;
            }
          }

          return false;
        });

        // IMPORTANT: Only assign empData if we found an explicit match.
        // Do NOT fall back to docs[0] — that would show another employee's assignments.
        if (matchingDoc) {
          empData = { id: matchingDoc.id, ...matchingDoc.data() };
        }
      }

      if (!empData) {
        empData = {
          id: auth.currentUser?.uid || 'emp_fallback',
          name: propUser?.name || route?.params?.user?.name || formattedEmailName || 'Employee',
          email: currentEmail || 'employee@subai.com',
          status: 'On Duty'
        };
      }

      const empKey = JSON.stringify({ id: empData.id, name: empData.name, email: empData.email, status: empData.status, assignedSite: empData.assignedSite, shift: empData.shift });
      if (empKey !== lastEmpKeyRef.current) {
        lastEmpKeyRef.current = empKey;
        setEmployee(empData);
      }
      employeeRef.current = empData;   // keep ref in sync for use inside assignment effect

      if (empData.id && empData.id !== 'emp_fallback') {
        presenceService.setEmployeeId(empData.id);
        if (!hasSetOnline.current) {
          hasSetOnline.current = true;
          presenceService.startPresence(empData, empData.id);
        }
      }
      setLoading(false);
      clearTimeout(timer);
    });

    return () => unsubEmp();
  }, [currentEmail]);



  const [asgDocs, setAsgDocs] = useState([]);
  const sitesRef = useRef([]);

  useEffect(() => {
    ensureAuthenticatedSession();

    const unsubSites = onSnapshot(collection(db, 'Sites'), (snap) => {
      sitesRef.current = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
    }, (err) => console.warn('Sites snap warning:', err.message));
    return () => unsubSites();
  }, []);

  useEffect(() => {
    let docs1 = [], docs2 = [];
    const updateMerged = () => {
      const merged = [...docs1, ...docs2];
      setAsgDocs(deduplicateAssignments(merged));
    };

    const unsub1 = onSnapshot(collection(db, 'Assignments'), (snap) => {
      docs1 = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      updateMerged();
    }, (err) => console.warn('Assignments unsub1 warning:', err.message));

    let unsub2 = () => {};
    try {
      unsub2 = onSnapshot(collection(db, 'assignments'), (snap) => {
        docs2 = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        updateMerged();
      }, () => {});
    } catch (e) {}

    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    const emailToUse = currentEmail;
    const currentUserName = (
      auth.currentUser?.displayName ||
      propUser?.name ||
      propUser?.displayName ||
      route?.params?.user?.name ||
      route?.params?.user?.displayName ||
      ''
    ).trim().toLowerCase();

    const emp = employee || employeeRef.current;

    const getTs = (x) => {
      if (!x) return 0;
      if (typeof x.updatedAt === 'number') return x.updatedAt;
      if (typeof x.createdAt === 'number') return x.createdAt;
      if (x.createdAt?.toDate) return x.createdAt.toDate().getTime();
      if (x.timestamp?.toDate) return x.timestamp.toDate().getTime();
      if (x.assignedOn) {
        const t = new Date(x.assignedOn).getTime();
        if (!isNaN(t)) return t;
      }
      if (x.assignedAt) {
        const t = new Date(x.assignedAt).getTime();
        if (!isNaN(t)) return t;
      }
      if (typeof x.id === 'string' && x.id.startsWith('doc_')) {
        const parts = x.id.split('_');
        if (parts[1] && !isNaN(Number(parts[1]))) return Number(parts[1]);
      }
      return 0;
    };

    let selectedAsg = null;
    const cleanDocs = asgDocs.filter(a => a && a.id !== 'asg1' && !isAssignmentDatePassed(a));

    if (cleanDocs.length > 0) {
      const empAsg = cleanDocs.filter(a => isAssignmentForEmployee(a, emp, emailToUse, currentUserName));
      empAsg.sort((a, b) => getTs(b) - getTs(a));

      selectedAsg = empAsg.find(a => {
        const st = (a.status || 'active').toLowerCase();
        return st === 'active' || st === 'upcoming' || st === 'scheduled' || st === 'on duty';
      }) || empAsg[0] || null;

      // Loose fallback: if empAsg was empty, check if any clean document matches employee site or name
      if (!selectedAsg) {
        const looseMatch = cleanDocs.find(a => {
          const asgSite = (a.site || a.siteName || '').trim().toLowerCase();
          const empSite = (emp?.assignedSite || emp?.site || '').trim().toLowerCase();
          if (asgSite && empSite && (asgSite === empSite || asgSite.includes(empSite) || empSite.includes(asgSite))) return true;

          const aName = (a.employeeName || a.empName || a.assignedTo || '').toLowerCase();
          const eName = (emp?.name || currentUserName || '').toLowerCase();
          if (aName && eName && (aName.includes(eName) || eName.includes(aName))) return true;

          const aEmail = (a.employeeEmail || a.empEmail || a.email || '').toLowerCase();
          if (aEmail && emailToUse && (aEmail === emailToUse || aEmail.startsWith(emailToUse.split('@')[0]))) return true;

          return false;
        });
        if (looseMatch) selectedAsg = looseMatch;
      }
    }

    // Fallback: ONLY if employee has NO explicit assignment records in the database,
    // use the employee's assignedSite configured on their profile by admin.
    // If the employee had an assignment but its date passed, do NOT synthesize an active assignment!
    const hasEmployeeAssignmentsInDb = asgDocs.some(a => isAssignmentForEmployee(a, emp, emailToUse, currentUserName));

    if (!selectedAsg && emp && !hasEmployeeAssignmentsInDb) {
      const profileSite = (emp.assignedSite || emp.site || emp.assignedSiteName || '').trim();
      if (profileSite && profileSite.toLowerCase() !== 'unassigned' && profileSite.toLowerCase() !== 'none') {
        selectedAsg = {
          id: `profile_site_${emp.id || 'emp'}`,
          assignmentId: `profile_site_${emp.id || 'emp'}`,
          site: profileSite,
          siteName: profileSite,
          siteId: emp.assignedSiteId || emp.siteId || 'site-active',
          siteAddress: emp.assignedSiteAddress || emp.address || '',
          shift: emp.shift || '08:00 AM - 05:00 PM',
          status: 'Active',
          geofenceRadius: emp.geofenceRadius || 200,
          employeeName: emp.name || currentUserName || 'Employee',
          employeeEmail: emp.email || emailToUse || '',
          employeeId: emp.id || emp.idNum || '',
          assignDate: new Date().toISOString().split('T')[0],
          isVirtualFromProfile: true
        };
      }
    }

    if (selectedAsg) {
      const composedShift = resolveShift(selectedAsg, emp);
      selectedAsg = { ...selectedAsg, shift: composedShift };
      assignmentRef.current = selectedAsg;
      setAssignment(selectedAsg);

      const targetSiteName = selectedAsg.site || selectedAsg.siteName || selectedAsg.location || 'Assigned Site';
      let matchedSiteObj = null;
      if (sitesRef.current.length > 0) {
        const matchedSiteDoc = sitesRef.current.find(s => {
          const sName = (s.name || '').trim().toLowerCase();
          const tName = targetSiteName.trim().toLowerCase();
          return sName === tName || sName.includes(tName) || tName.includes(sName);
        });
        if (matchedSiteDoc) matchedSiteObj = matchedSiteDoc;
      }
      const resolvedSite = resolveSiteDetails(matchedSiteObj, targetSiteName, selectedAsg);
      siteRef.current = resolvedSite;
      setSite(resolvedSite);
    } else {
      assignmentRef.current = null;
      setAssignment(null);
      siteRef.current = null;
      setSite(null);
    }
  }, [asgDocs, employee, currentEmail]);

  // 3. Fetch Attendance Records
  useEffect(() => {
    if (!currentEmail) return;

    let records = {};

    const commitAttendance = () => {
      const all = Object.values(records);
      const emp = employeeRef.current || employee;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayRecord = all.find(data => {
        const rawDate = data.date || data.timeIn || data.timestamp || data.createdAt;
        if (!rawDate) return false;
        const recDate = parseDate(rawDate);
        if (!recDate) return false;
        recDate.setHours(0, 0, 0, 0);
        return recDate.getTime() === today.getTime();
      });

      const attKey = JSON.stringify({ count: all.length, todayId: todayRecord?.id, timeIn: todayRecord?.timeIn, timeOut: todayRecord?.timeOut, status: todayRecord?.status });
      if (attKey !== lastAttKeyRef.current) {
        lastAttKeyRef.current = attKey;
        setAllAttendance(all);
        setAttendance(todayRecord || null);
      }
    };

    const matchesMe = (r) => {
      const emp = employeeRef.current || employee;
      const eid = (emp?.id || '').toLowerCase();
      const ename = (emp?.name || '').toLowerCase();
      const email = (currentEmail || emp?.email || '').toLowerCase();

      const rid = String(r.employee_id || r.employeeId || r.employeeUid || '').toLowerCase();
      const rname = String(r.employeeName || r.employee_name || '').toLowerCase();
      const remail = String(r.email || '').toLowerCase();

      if (eid && rid && (rid === eid || rid.includes(eid) || eid.includes(rid))) return true;
      if (ename && rname && (rname === ename || rname.includes(ename) || ename.includes(rname))) return true;
      if (email && remail && remail === email) return true;
      return false;
    };

    const handleSnap = (collKey) => (snapshot) => {
      if (!snapshot || snapshot.empty) {
        Object.keys(records).forEach(k => { if (records[k]._col === collKey) delete records[k]; });
      } else {
        snapshot.docs.forEach(d => {
          const raw = { id: d.id, _col: collKey, ...d.data() };
          if (matchesMe(raw)) {
            records[d.id] = raw;
          }
        });
      }
      commitAttendance();
    };

    const unsub1 = onSnapshot(collection(db, 'Attendance'), handleSnap('Attendance'));
    const unsub2 = onSnapshot(collection(db, 'attendance'), handleSnap('attendance'));

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentEmail, employee]);

  const handleCheckIn = async () => {
    if (!employee) {
      Alert.alert('Error', 'Employee profile loading...');
      return;
    }

    // Mobile field employees cannot check in without assigned worksites
    if (isMobileFieldWithoutSite(employee, assignment, site)) {
      Alert.alert(
        'Check-In Blocked',
        'You are registered as a Mobile Field Employee, but have no assigned worksite or patrol route. You cannot check in until an administrator assigns you at least one worksite.',
        [{ text: 'OK' }]
      );
      return;
    }

    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to check in.');
        setChecking(false);
        return;
      }

      // ── Anti-Spoofing & Security Checks Pipeline ──
      // Checks: Root/Jailbreak, VPN/Proxy, Mock GPS, Accuracy, Geofence, Speed/Consistency
      const checkResult = await runPreAttendanceChecks({ employee, site, action: 'time_in' });
      if (!checkResult.passed) {
        if (checkResult.failedCheck === 'geofence') {
          const lat = checkResult.report?.latitude || 0;
          const lng = checkResult.report?.longitude || 0;
          Alert.alert(
            'Geofence Warning',
            'You are outside your assigned site radius. Check-in registered with out-of-bounds flag.',
            [
              { text: 'Proceed', onPress: () => processCheckIn(lat, lng, false) },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
          return;
        }

        // Hard security enforcement: VPN, Mock GPS, Root Integrity, Speed Jumps
        setSecurityModal({
          visible: true,
          failedCheck: checkResult.failedCheck,
          reason: checkResult.reason,
        });
        return;
      }

      const { latitude, longitude } = checkResult.report;
      await processCheckIn(latitude, longitude, true);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to retrieve location or verify security.');
    } finally {
      setChecking(false);
    }
  };

  const processCheckIn = async (lat, lng, inFence) => {
    try {
      const statusText = inFence ? 'On Site' : 'Flagged';

      const newAtt = {
        employee_id: employee.id,
        employeeId: employee.id,
        employeeUid: employee.uid || employee.id,
        employeeName: employee.name,
        email: employee.email || currentEmail,
        site_id: site?.id || 'Unknown',
        siteName: site?.name || assignment?.site || 'Unassigned Site',
        date: serverTimestamp(),
        timeIn: serverTimestamp(),
        timeOut: null,
        status: statusText,
        inFence: inFence,
        latitude: lat,
        longitude: lng
      };

      const attRef = await addDoc(collection(db, 'Attendance'), newAtt);
      const attId = attRef?.id || null;
      currentAttendanceIdRef.current = attId;
      // Dual-write to lowercase 'attendance' so admin dashboard picks it up
      await addDoc(collection(db, 'attendance'), { ...newAtt, id: attId }).catch(() => {});

      if (employee.id && employee.id !== 'emp_fallback') {
        await updateDoc(doc(db, 'employees', employee.id), {
          status: 'On Site',
          lastCheckIn: serverTimestamp(),
          lastActive: Date.now(),
          isOnline: true,
        });
      }

      await addDoc(collection(db, 'ActivityLogs'), {
        employee_id: employee.id,
        employeeName: employee.name,
        site_id: site?.id || 'Unknown',
        siteName: site?.name || assignment?.site || 'Unassigned Site',
        action: 'Check In',
        type: 'Attendance',
        timestamp: serverTimestamp(),
        status: inFence ? 'Normal' : 'Warning'
      });

      // Start verification scheduler for this session
      await schedulerStart({
        employee,
        assignment,
        attendanceId: attId,
      });
      onPromptReady(({ triggerType }) => {
        setFacialTriggerType(triggerType || 'scheduled_random');
        setShowFacialModal(true);
      });

      // Trigger immediate check-in verification
      setFacialTriggerType('check_in');
      setShowFacialModal(true);

      Alert.alert('Check In Successful', `Recorded at ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not record check-in.');
    }
  };

  const handleCheckOut = async () => {
    // Mobile field employees cannot check out without assigned worksites
    if (isMobileFieldWithoutSite(employee, assignment, site)) {
      Alert.alert(
        'Check-Out Blocked',
        'You are registered as a Mobile Field Employee with no assigned worksite. Check-out cannot be performed.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!attendance || !attendance.id) {
      Alert.alert('Error', 'No active check-in record found for today.');
      return;
    }

    setChecking(true);
    try {
      await updateDoc(doc(db, 'Attendance', attendance.id), {
        timeOut: serverTimestamp(),
        status: 'Completed'
      });
      // Dual-write checkout to lowercase collection
      await updateDoc(doc(db, 'attendance', attendance.id), {
        timeOut: serverTimestamp(),
        status: 'Completed'
      }).catch(() => {});


      if (employee.id && employee.id !== 'emp_fallback') {
        await updateDoc(doc(db, 'employees', employee.id), {
          status: 'On Duty'
        });
      }

      await addDoc(collection(db, 'ActivityLogs'), {
        employee_id: employee.id,
        employeeName: employee.name,
        site_id: site?.id || 'Unknown',
        siteName: site?.name || assignment?.site || 'Unassigned Site',
        action: 'Check Out',
        type: 'Attendance',
        timestamp: serverTimestamp(),
        status: 'Normal'
      });

      // Stop verification scheduler
      await schedulerStop();
      currentAttendanceIdRef.current = null;

      Alert.alert('Check Out Successful', 'Have a great day!');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not record check-out.');
    } finally {
      setChecking(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!employee) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera access is required to capture site updates.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled) {
        setUploadingPhoto(true);
        const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;

        await addDoc(collection(db, 'ActivityLogs'), {
          employee_id: employee.id,
          employeeName: employee.name,
          site_id: site?.id || 'Unknown',
          siteName: site?.name || assignment?.site || 'Unknown',
          action: 'Uploaded Site Photo',
          type: 'Site Update',
          photo: base64Img,
          timestamp: serverTimestamp(),
          status: 'Info'
        });

        Alert.alert('Success', 'Photo uploaded and logged successfully!');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const displayStatus = (assignment?.status === 'Active' || assignment?.status === 'On Duty')
    ? (employee?.status === 'On Site' ? 'On Site' : 'Active')
    : (employee?.status || 'Active');
  const statusColor = (displayStatus === 'On Site' || displayStatus === 'Active' || displayStatus === 'On Duty') ? '#10B981' : '#F59E0B';

  const isCheckedIn = Boolean(
    attendance?.timeIn || attendance?.checkIn || attendance?.check_in
  );
  const isCheckedOut = Boolean(
    isCheckedIn && (attendance?.timeOut || attendance?.checkOut || attendance?.check_out || attendance?.status === 'Completed')
  );

  const effectiveTimeIn = attendance?.timeIn || attendance?.checkIn || attendance?.check_in;
  const effectiveTimeOut = attendance?.timeOut || attendance?.checkOut || attendance?.check_out;

  const timeInStr = formatTimeDisplay(effectiveTimeIn);
  const timeOutStr = formatTimeDisplay(effectiveTimeOut);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 18) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  const now = new Date();
  const currentMonthRecords = allAttendance.filter(r => {
    const rawD = r.date || r.timeIn || r.timestamp || r.createdAt;
    if (!rawD) return false;
    const d = parseDate(rawD);
    if (!d) return false;
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const daysWorked = currentMonthRecords.length;
  const onTimeCount = currentMonthRecords.filter(r => r.status === 'Present' || r.status === 'Completed' || r.status === 'On Site').length;
  const flaggedCount = currentMonthRecords.filter(r => r.status === 'Late' || r.status === 'Flagged' || r.status === 'Missed').length;
  const monthlyRate = daysWorked > 0 ? ((onTimeCount / daysWorked) * 100).toFixed(1) : '100.0';

  return (
    <View style={styles.container}>
      {/* ── Fixed Header Banner ── */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={styles.name}>{displayName}</Text>
              <Image source={require('../../assets/wave.png')} style={{ width: 22, height: 22, marginLeft: 6, marginTop: 2 }} />
            </View>
          </View>
          <View style={styles.actionNavGroup}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => setShowFacialModal(true)}>
              <Ionicons name="scan-circle-outline" size={22} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('SecurityStatus')}>
              <Ionicons name="shield-checkmark-outline" size={22} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Offline Sync Banner Indicator */}
        {pendingSyncCount > 0 && (
          <TouchableOpacity
            style={styles.offlineBanner}
            disabled={isSyncing}
            onPress={async () => {
              setIsSyncing(true);
              try {
                const res = await syncOfflineRecords();
                const newRemaining = res.remaining;
                setPendingSyncCount(newRemaining);
                if (res.synced > 0) {
                  Alert.alert(
                    'Offline Sync Complete',
                    `Successfully pushed ${res.synced} offline record(s) to the server!`
                  );
                } else if (newRemaining > 0) {
                  Alert.alert(
                    'Offline Records Pending',
                    `Could not push ${newRemaining} record(s) right now. Would you like to keep retrying or clear the pending records?`,
                    [
                      { text: 'Keep Retrying', style: 'cancel' },
                      {
                        text: 'Clear Records',
                        style: 'destructive',
                        onPress: async () => {
                          await clearOfflineQueue();
                          setPendingSyncCount(0);
                        }
                      }
                    ]
                  );
                } else {
                  Alert.alert('Offline Sync', 'All offline records are up to date!');
                }
              } catch (e) {
                Alert.alert('Sync Error', 'An error occurred during sync. Tap again or clear queue.');
              } finally {
                setIsSyncing(false);
              }
            }}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#B45309" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={16} color="#B45309" />
            )}
            <Text style={styles.offlineText}>
              {isSyncing ? 'Syncing offline records to server...' : `${pendingSyncCount} offline record(s) pending sync • Tap to push`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Scrollable Body Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        {/* Dynamic Status & Check-In Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusIndicator}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={styles.statusText}>
                Status: <Text style={{ fontWeight: '700', color: statusColor }}>{displayStatus}</Text>
              </Text>
            </View>
            <View style={[styles.shiftBadge, !assignment && { backgroundColor: '#F3F4F6' }]}>
              <Text style={[styles.shiftText, !assignment && { color: '#6B7280' }]}>
                {assignment ? resolveShift(assignment, employee) : 'Unassigned'}
              </Text>
            </View>
          </View>

          {/* Location / Site Info */}
          <TouchableOpacity
            style={styles.siteInfoContainer}
            onPress={() => navigation.navigate('Map', { assignment, site })}
            activeOpacity={0.8}
          >
            <Ionicons name="location-sharp" size={18} color={assignment ? "#4F46E5" : "#9CA3AF"} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.siteName}>
                {assignment ? (site?.name || assignment?.site || assignment?.siteName || 'Assigned Site') : 'No Active Site Assignment'}
              </Text>
              <Text style={styles.siteAddress}>
                {assignment ? (site?.address || assignment?.siteAddress || assignment?.address || 'GPS Live Monitoring Active • Tap to Navigate') : 'No active site assigned by administrator'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Warning Banner if Mobile Field Employee has no assigned site */}
          {isMobileFieldWithoutSite(employee, assignment, site) && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FEF2F2',
              borderWidth: 1,
              borderColor: '#FCA5A5',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
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

          {/* Attendance Action Buttons */}
          <View style={styles.actionRow}>
            {!isCheckedIn ? (
              <TouchableOpacity
                style={[
                  styles.checkInBtn, 
                  (checking || isMobileFieldWithoutSite(employee, assignment, site)) && { opacity: 0.6, backgroundColor: isMobileFieldWithoutSite(employee, assignment, site) ? '#94A3B8' : styles.checkInBtn.backgroundColor }
                ]}
                onPress={handleCheckIn}
                disabled={checking}
              >
                {checking ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="white" />
                    <Text style={styles.btnText}>Check In</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.checkOutBtn, 
                  (isCheckedOut || checking || isMobileFieldWithoutSite(employee, assignment, site)) && { opacity: 0.6, backgroundColor: isMobileFieldWithoutSite(employee, assignment, site) ? '#94A3B8' : styles.checkOutBtn.backgroundColor }
                ]}
                onPress={handleCheckOut}
                disabled={isCheckedOut || checking}
              >
                {checking ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="log-out-outline" size={20} color="white" />
                    <Text style={styles.btnText}>{isCheckedOut ? 'Shift Completed' : 'Check Out'}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.photoBtn, uploadingPhoto && { opacity: 0.7 }]}
              onPress={handleUploadPhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? <ActivityIndicator color="#4F46E5" /> : (
                <Ionicons name="camera-outline" size={22} color="#4F46E5" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoBtn, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
              onPress={() => setShowDelayModal(true)}
            >
              <Ionicons name="warning-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Delay & Incident Reporting Quick Action Card ── */}
        <TouchableOpacity
          style={styles.reportActionCard}
          onPress={() => setShowDelayModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.reportIconBg}>
            <Ionicons name="warning" size={22} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportCardTitle}>Submit Delay or Incident Report</Text>
            <Text style={styles.reportCardSub}>Report traffic, breakdowns, accidents & field incidents with photo proof</Text>
          </View>
          <View style={styles.reportArrowBg}>
            <Ionicons name="chevron-forward" size={16} color="#EF4444" />
          </View>
        </TouchableOpacity>

        {/* ── Active Site Assignment Bento Card ── */}
        {assignment ? (
          <View style={styles.asgBentoCard}>
            <View style={styles.asgBentoHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.asgIconBg}>
                  <Ionicons name="briefcase" size={18} color="#4F46E5" />
                </View>
                <View>
                  <Text style={styles.asgBentoLabel}>Active Site Assignment</Text>
                  <Text style={styles.asgBentoTitle}>{assignment?.site || site?.name || '—'}</Text>
                </View>
              </View>
              <View style={styles.asgStatusBadge}>
                <Text style={styles.asgStatusText}>{assignment?.status || 'Active'}</Text>
              </View>
            </View>

            <View style={styles.asgDetailsGrid}>
              <View style={styles.asgDetailRow}>
                <Ionicons name="location-outline" size={15} color="#6B7280" />
                <Text style={[styles.asgDetailText, { flex: 1 }]} numberOfLines={2}>
                  Address: <Text style={styles.asgDetailBold}>{site?.address || assignment?.address || '—'}</Text>
                </Text>
              </View>
              <View style={styles.asgDetailRow}>
                <Ionicons name="time-outline" size={15} color="#6B7280" />
                <Text style={styles.asgDetailText}>Shift: <Text style={styles.asgDetailBold}>{resolveShift(assignment) || '—'}</Text></Text>
              </View>
              <View style={styles.asgDetailRow}>
                <Ionicons name="calendar-outline" size={15} color="#6B7280" />
                <Text style={styles.asgDetailText}>Date: <Text style={styles.asgDetailBold}>{assignment?.assignDate || assignment?.assignedAt || 'Daily Scheduled'}</Text></Text>
              </View>
              <View style={styles.asgDetailRow}>
                <Ionicons
                  name="flag-outline"
                  size={15}
                  color={
                    (assignment?.priority || '').toLowerCase() === 'medium' ? '#F59E0B' :
                      (assignment?.priority || '').toLowerCase() === 'low' ? '#10B981' : '#EF4444'
                  }
                />
                <Text style={styles.asgDetailText}>
                  Priority: <Text style={[
                    styles.asgDetailBold,
                    {
                      color: (assignment?.priority || '').toLowerCase() === 'medium' ? '#F59E0B' :
                        (assignment?.priority || '').toLowerCase() === 'low' ? '#10B981' : '#EF4444'
                    }
                  ]}>
                    {assignment?.priority || 'Medium'}
                  </Text>
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.openMapNavBtn}
              onPress={() => navigation.navigate('Map', { assignment: assignment, site: site })}
            >
              <Ionicons name="map" size={16} color="white" />
              <Text style={styles.openMapNavText}>Open Live Map & Geofence</Text>
              <Ionicons name="arrow-forward" size={16} color="white" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.asgBentoCard, { alignItems: 'center', paddingVertical: 32 }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="briefcase-outline" size={26} color="#9CA3AF" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 4 }}>No Active Assignment</Text>
            <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 }}>
              Your admin has not assigned a site to you yet.
            </Text>
          </View>
        )}

        {/* Today's Shift Logs Card */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View>
              <Text style={styles.cardTitle}>Today's Shift Log</Text>
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500', marginTop: 2 }}>
                {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('Attendance')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ fontSize: 12, color: '#4F46E5', fontWeight: '700' }}>Full History</Text>
              <Ionicons name="arrow-forward" size={13} color="#4F46E5" />
            </TouchableOpacity>
          </View>
          <View style={styles.timeGrid}>
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Time In</Text>
              <Text style={styles.timeValue}>{timeInStr}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Time Out</Text>
              <Text style={styles.timeValue}>{timeOutStr}</Text>
            </View>
          </View>
        </View>

        {/* Monthly Attendance Metrics Card */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={styles.cardTitle}>Monthly Attendance Metrics</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '500' }}>This Month</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{daysWorked}</Text>
              <Text style={styles.statLabel}>Days Worked</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#10B981' }]}>{monthlyRate}%</Text>
              <Text style={styles.statLabel}>On-Time Rate</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#EF4444' }]}>{flaggedCount}</Text>
              <Text style={styles.statLabel}>Flagged/Late</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Facial & Delay Modals */}
      <FacialVerificationModal
        visible={showFacialModal}
        onClose={() => setShowFacialModal(false)}
        employee={employee}
        triggerType={facialTriggerType}
        attendanceId={currentAttendanceIdRef.current}
        onVerified={(record) => {
          if (facialTriggerType === 'check_in') {
            Alert.alert('Identity Verified', `Check-in verification passed! (${record.confidenceScore}% confidence)`);
          }
        }}
      />

      <DelayIncidentModal
        visible={showDelayModal}
        onClose={() => setShowDelayModal(false)}
        employee={employee}
        anomaly={activeAnomaly}
        onSubmitted={() => Alert.alert('Report Submitted', 'Your justification has been sent to admin.')}
      />

      <SecurityWarningModal
        visible={securityModal.visible}
        failedCheck={securityModal.failedCheck}
        reason={securityModal.reason}
        onClose={() => setSecurityModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  reportActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  reportIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  reportCardSub: {
    fontSize: 11.5,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  reportArrowBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionNavGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  greeting: {
    color: '#C7D2FE',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 14,
  },
  offlineText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    color: '#6B7280',
  },
  shiftBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shiftText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '600',
  },
  siteInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  siteName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  siteAddress: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  checkInBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  checkOutBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  photoBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  asgBentoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#EEF2FF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  asgBentoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  asgIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  asgBentoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  asgBentoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 1,
  },
  asgStatusBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  asgStatusText: {
    color: '#1E40AF',
    fontSize: 11,
    fontWeight: '700',
  },
  asgDetailsGrid: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 14,
  },
  asgDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  asgDetailText: {
    fontSize: 13,
    color: '#4B5563',
  },
  asgDetailBold: {
    fontWeight: '600',
    color: '#111827',
  },
  openMapNavBtn: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    gap: 8,
  },
  openMapNavText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  timeGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBox: {
    flex: 1,
    alignItems: 'center',
  },
  timeDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  timeLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4F46E5',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  }
});
