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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import ActionConfirmModal from '../components/ActionConfirmModal';
import { runPreAttendanceChecks } from '../services/securityService';
import { writeSecurityEvent } from '../services/securityLogger';
import { getDeviceId } from '../services/deviceInfo';
import { getPendingSyncCount, syncOfflineRecords, clearOfflineQueue } from '../services/offlineSyncService';
import { isAssignmentDatePassed, isAssignmentActiveToday, resolveShift, isAssignmentForEmployee, deduplicateAssignments, isMobileFieldWithoutSite, checkEarlyCheckout, checkLateCheckIn, isAttendanceRecordFlagged } from '../utils/assignmentUtils';
import {
  startSession as schedulerStart,
  stopSession as schedulerStop,
  onPromptReady,
  restoreSession,
  updateLastKnownLocation,
  isSchedulerActive,
} from '../services/verificationScheduler';
import presenceService from '../services/presenceService';
import locationLogService from '../services/locationLogService';
import { fetchCurrentWeather } from '../services/weatherService';



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
  const [assignedSitesList, setAssignedSitesList] = useState([]);
  const [sitesData, setSitesData] = useState([]);
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
  const [confirmModal, setConfirmModal] = useState({ visible: false, actionType: 'check_in' });
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [unresolvedAnomalyCount, setUnresolvedAnomalyCount] = useState(0);
  const [weather, setWeather] = useState(null);
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
    let active = true;
    fetchCurrentWeather().then(w => {
      if (active && w) setWeather(w);
    });
    const interval = setInterval(() => {
      fetchCurrentWeather().then(w => {
        if (active && w) setWeather(w);
      });
    }, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

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

  const lastViewedAnomalyTimeRef = useRef(0);

  useEffect(() => {
    if (currentEmail) {
      AsyncStorage.getItem('last_viewed_anomaly_time_' + currentEmail).then((val) => {
        if (val) lastViewedAnomalyTimeRef.current = Number(val);
      }).catch(() => {});
    }
  }, [currentEmail]);

  useEffect(() => {
    const unsubFocus = navigation.addListener('focus', async () => {
      if (currentEmail) {
        try {
          const val = await AsyncStorage.getItem('last_viewed_anomaly_time_' + currentEmail);
          if (val) {
            lastViewedAnomalyTimeRef.current = Number(val);
            setUnresolvedAnomalyCount(0);
          }
        } catch (_) {}
      }
    });
    return unsubFocus;
  }, [navigation, currentEmail]);

  // ── Track Unresolved Anomaly Alerts for Employee ──
  useEffect(() => {
    const rawEmails = [
      currentEmail,
      employee?.email,
      employee?.workEmail,
      propUser?.email,
      route?.params?.user?.email,
      auth.currentUser?.email,
    ].filter(Boolean).map(e => String(e).trim().toLowerCase());
    const validEmails = Array.from(new Set(rawEmails));

    const rawIds = [
      employee?.id,
      employee?.idNum,
      employee?.empId,
      employee?.employeeId,
      employee?.uid,
      propUser?.id,
      propUser?.uid,
      propUser?.empId,
      route?.params?.user?.id,
      route?.params?.user?.uid,
      route?.params?.user?.empId,
      auth.currentUser?.uid,
    ].filter(x => x !== undefined && x !== null && String(x).trim() !== '' && String(x).trim() !== 'emp_fallback')
     .map(x => String(x).trim().toLowerCase());
    const validIds = Array.from(new Set(rawIds));

    const genericWords = ['employee', 'user', 'guard', 'staff', 'admin', 'officer', 'field employee', 'security'];
    const cleanNames = [
      employee?.name,
      employee?.displayName,
      displayName,
      propUser?.name,
      route?.params?.user?.name,
      auth.currentUser?.displayName,
    ].filter(Boolean).map(n => String(n).trim().toLowerCase())
     .filter(n => n.length >= 2 && !genericWords.includes(n));
    const validNames = Array.from(new Set(cleanNames));

    const checkMatches = (d) => {
      const itemIds = [
        d.employeeId,
        d.employee_id,
        d.employeeUid,
        d.empId,
        d.userId,
        d.userUid,
        d.guardId,
        d.uid,
        d.employee?.id,
        d.employee?.employeeId,
        d.employee?.uid,
        d.user?.id,
        d.user?.uid,
        d.guard?.id,
      ].filter(x => x !== undefined && x !== null && String(x).trim() !== '' && String(x).trim() !== 'emp_fallback')
       .map(x => String(x).trim().toLowerCase());

      const itemEmails = [
        d.employeeEmail,
        d.email,
        d.empEmail,
        d.userEmail,
        d.employee?.email,
        d.user?.email,
      ].filter(Boolean).map(e => String(e).trim().toLowerCase());

      const itemNames = [
        d.employeeName,
        d.empName,
        d.userName,
        d.employee?.name,
        d.user?.name,
      ].filter(Boolean).map(n => String(n).trim().toLowerCase())
       .filter(n => !n.includes('employee') && !n.includes('verification') && !n.includes('anomaly') && !n.includes('attendance'));

      if (itemIds.length > 0) {
        if (validIds.length > 0 && itemIds.some(id => validIds.includes(id))) {
          return true;
        }
        return false;
      }

      if (itemEmails.length > 0) {
        if (validEmails.length > 0 && itemEmails.some(ie => validEmails.includes(ie))) {
          return true;
        }
        return false;
      }

      if (validNames.length > 0 && itemNames.length > 0) {
        return itemNames.some(iName => validNames.includes(iName));
      }

      return false;
    };

    const unsub = onSnapshot(collection(db, 'ai_analysis'), (snapshot) => {
      let count = 0;
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const matchesEmployee = checkMatches(d);
        if (matchesEmployee && !d.employeeResponse && d.status !== 'Resolved' && d.status !== 'Approved') {
          // If alert is already viewed or marked as read by employee, remove badge!
          if (d.read === true || d.viewedByEmployee === true) {
            return;
          }

          // If alert occurred before or at the time employee last viewed the alerts screen, remove badge!
          const docTs = (
            (d.timestamp?.toDate ? d.timestamp.toDate().getTime() : (typeof d.timestamp === 'number' ? d.timestamp : 0)) ||
            (d.createdAt?.toDate ? d.createdAt.toDate().getTime() : (typeof d.createdAt === 'number' ? d.createdAt : 0)) ||
            0
          );
          if (lastViewedAnomalyTimeRef.current && docTs > 0 && docTs <= lastViewedAnomalyTimeRef.current) {
            return;
          }

          // Outside geofence alerts apply ONLY to Fixed Site Employees
          const alertType = (d.type || d.eventType || '').toLowerCase();
          const alertDesc = (d.description || '').toLowerCase();
          const isGeofenceAlert = (
            d.eventType === 'UNAUTHORIZED_LOCATION' ||
            alertType.includes('geofence') ||
            alertDesc.includes('outside the assigned geofence') ||
            alertDesc.includes('outside assigned site')
          );
          const empWorkType = (employee?.workType || employee?.employeeType || '').toLowerCase();
          const isFieldEmployee = empWorkType.includes('mobile') || empWorkType.includes('field');

          if (isFieldEmployee && isGeofenceAlert) {
            return;
          }

          count++;
        }
      });
      setUnresolvedAnomalyCount(count);
    }, (err) => console.warn('ai_analysis alert badge error:', err.message));

    return () => unsub();
  }, [currentEmail, displayName, employee?.id]);

  const handleOpenAnomalyAlerts = () => {
    if (currentEmail) {
      AsyncStorage.setItem('last_viewed_anomaly_time_' + currentEmail, String(Date.now())).catch(() => {});
      lastViewedAnomalyTimeRef.current = Date.now();
    }
    setUnresolvedAnomalyCount(0);
    navigation.navigate('AnomalyAlerts', { employee, user: propUser });
  };

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
          status: 'Online'
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
          const initialStatus = (empData.status === 'On Duty') ? 'On Duty' : 'Online';
          presenceService.startPresence(empData, empData.id, initialStatus);
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
      const loaded = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      sitesRef.current = loaded;
      setSitesData(loaded);
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

    const cleanDocs = asgDocs.filter(a => a && a.id !== 'asg1' && !isAssignmentDatePassed(a) && isAssignmentActiveToday(a));
    const empAsg = cleanDocs.length > 0 ? cleanDocs.filter(a => isAssignmentForEmployee(a, emp, emailToUse, currentUserName)) : [];
    empAsg.sort((a, b) => getTs(b) - getTs(a));

    const gatheredSites = [];
    const seenSiteNames = new Set();

    const addSiteItem = (siteName, asgDoc, isVirtual = false) => {
      if (!siteName || typeof siteName !== 'string') return;
      const cleanName = siteName.trim();
      if (!cleanName || cleanName.toLowerCase() === 'unassigned' || cleanName.toLowerCase() === 'none') return;

      const key = cleanName.toLowerCase();
      if (seenSiteNames.has(key)) return;
      seenSiteNames.add(key);

      let matchedSiteDoc = null;
      if (sitesRef.current && sitesRef.current.length > 0) {
        matchedSiteDoc = sitesRef.current.find(s => {
          const sName = (s.name || s.id || '').trim().toLowerCase();
          return sName === key || sName.includes(key) || key.includes(sName);
        });
      }

      const resolvedSite = resolveSiteDetails(matchedSiteDoc, cleanName, asgDoc);
      const composedShift = resolveShift(asgDoc, emp);
      const asgDate = asgDoc?.assignDate || asgDoc?.assignedAt || new Date().toISOString().split('T')[0];
      const priority = asgDoc?.priority || 'Medium';
      const status = asgDoc?.status || 'Active';

      const cardAsg = {
        ...(asgDoc || {}),
        id: asgDoc?.id ? `${asgDoc.id}_${key.replace(/\s+/g, '_')}` : `site_asg_${key.replace(/\s+/g, '_')}`,
        site: cleanName,
        siteName: cleanName,
        siteAddress: resolvedSite?.address || asgDoc?.siteAddress || asgDoc?.address || '',
        address: resolvedSite?.address || asgDoc?.siteAddress || asgDoc?.address || '',
        latitude: resolvedSite?.latitude,
        longitude: resolvedSite?.longitude,
        geofenceRadius: resolvedSite?.radius || 200,
        shift: composedShift,
        status: status,
        priority: priority,
        assignDate: asgDate,
        isVirtualFromProfile: isVirtual,
      };

      gatheredSites.push({
        id: cardAsg.id,
        siteName: cleanName,
        address: resolvedSite?.address || 'Registered Worksite Address',
        radius: resolvedSite?.radius || 200,
        latitude: resolvedSite?.latitude,
        longitude: resolvedSite?.longitude,
        shift: composedShift,
        date: asgDate,
        priority: priority,
        status: status,
        assignment: cardAsg,
        site: resolvedSite,
      });
    };

    // 1. Process matching assignment docs from database
    if (empAsg.length > 0) {
      for (const asg of empAsg) {
        if (Array.isArray(asg.assignedSites) && asg.assignedSites.length > 0) {
          asg.assignedSites.forEach(s => addSiteItem(s, asg));
        } else if (asg.site && asg.site.includes(',')) {
          asg.site.split(',').forEach(s => addSiteItem(s, asg));
        } else if (asg.site || asg.siteName) {
          addSiteItem(asg.site || asg.siteName, asg);
        }
      }
    }

    // 2. Loose fallback if empAsg was empty
    if (gatheredSites.length === 0 && cleanDocs.length > 0) {
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

      if (looseMatch) {
        if (Array.isArray(looseMatch.assignedSites) && looseMatch.assignedSites.length > 0) {
          looseMatch.assignedSites.forEach(s => addSiteItem(s, looseMatch));
        } else if (looseMatch.site && looseMatch.site.includes(',')) {
          looseMatch.site.split(',').forEach(s => addSiteItem(s, looseMatch));
        } else if (looseMatch.site || looseMatch.siteName) {
          addSiteItem(looseMatch.site || looseMatch.siteName, looseMatch);
        }
      }
    }

    // 3. Fallback: ONLY if employee has NO explicit assignment records in the database,
    // check employee profile assignedSites or assignedSite.
    // Must check all asgDocs (including completed/missed) so expired or missed shifts do not resurrect profile sites!
    const hasEmployeeAssignmentsInDb = asgDocs.some(a => isAssignmentForEmployee(a, emp, emailToUse, currentUserName));

    if (gatheredSites.length === 0 && emp && !hasEmployeeAssignmentsInDb) {
      if (Array.isArray(emp.assignedSites) && emp.assignedSites.length > 0) {
        emp.assignedSites.forEach(s => addSiteItem(s, null, true));
      } else if (emp.assignedSite && emp.assignedSite.includes(',')) {
        emp.assignedSite.split(',').forEach(s => addSiteItem(s, null, true));
      } else {
        const profileSite = (emp.assignedSite || emp.site || emp.assignedSiteName || '').trim();
        if (profileSite && profileSite.toLowerCase() !== 'unassigned' && profileSite.toLowerCase() !== 'none') {
          addSiteItem(profileSite, null, true);
        }
      }
    }

    setAssignedSitesList(gatheredSites);

    if (gatheredSites.length > 0) {
      const primary = gatheredSites[0];
      assignmentRef.current = primary.assignment;
      setAssignment(primary.assignment);
      siteRef.current = primary.site;
      setSite(primary.site);
    } else {
      assignmentRef.current = null;
      setAssignment(null);
      siteRef.current = null;
      setSite(null);
    }
  }, [asgDocs, employee, currentEmail, sitesData]);

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

        const isCurrentlyCheckedIn = Boolean(
          todayRecord && (todayRecord.timeIn || todayRecord.checkIn || todayRecord.check_in) &&
          !(todayRecord.timeOut || todayRecord.checkOut || todayRecord.check_out || todayRecord.status === 'Completed')
        );

        if (isCurrentlyCheckedIn) {
          presenceService.setCurrentStatus('On Duty');
          const currentEmp = employeeRef.current || employee;
          if (!locationLogService.isPeriodicLoggingActive() && currentEmp) {
            locationLogService.startPeriodicLogging({
              employee: currentEmp,
              site,
              assignment,
              attendanceId: todayRecord.id,
            });
          }
          if (!isSchedulerActive() && currentEmp) {
            schedulerStart({
              employee: currentEmp,
              assignment,
              attendanceId: todayRecord.id,
            });
          }
        } else {
          presenceService.setCurrentStatus('Online');
          if (locationLogService.isPeriodicLoggingActive()) {
            locationLogService.stopPeriodicLogging();
          }
          if (isSchedulerActive()) {
            schedulerStop();
          }
        }
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

    const unsub1 = onSnapshot(collection(db, 'Attendance'), handleSnap('Attendance'), () => {});
    const unsub2 = onSnapshot(collection(db, 'attendance'), handleSnap('attendance'), () => {});

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentEmail, employee]);

  const requestCheckIn = () => {
    if (!employee) {
      Alert.alert('Error', 'Employee profile loading...');
      return;
    }

    if (!assignment || assignedSitesList.length === 0 || isAssignmentDatePassed(assignment)) {
      Alert.alert(
        'Check-In Blocked',
        'You have no active worksite assignment scheduled for today. Past shifts that have ended or were missed cannot be checked into.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (isMobileFieldWithoutSite(employee, assignment, site)) {
      Alert.alert(
        'Check-In Blocked',
        'You are registered as a Mobile Field Employee, but have no assigned worksite or patrol route. You cannot check in until an administrator assigns you at least one worksite.',
        [{ text: 'OK' }]
      );
      return;
    }

    setConfirmModal({
      visible: true,
      actionType: 'check_in',
    });
  };

  const requestCheckOut = () => {
    if (!attendance || !attendance.id) {
      Alert.alert('Error', 'No active check-in record found for today.');
      return;
    }

    setConfirmModal({
      visible: true,
      actionType: 'check_out',
    });
  };

  const handleConfirmAction = async () => {
    const action = confirmModal.actionType;
    setConfirmModal(prev => ({ ...prev, visible: false }));
    if (action === 'check_in') {
      await handleCheckIn();
    } else {
      await handleCheckOut();
    }
  };

  const handleCheckIn = async () => {
    if (!employee) {
      Alert.alert('Error', 'Employee profile loading...');
      return;
    }

    if (!assignment || assignedSitesList.length === 0 || isAssignmentDatePassed(assignment)) {
      Alert.alert(
        'Check-In Blocked',
        'You have no active worksite assignment scheduled for today. Past shifts that have ended or were missed cannot be checked into.',
        [{ text: 'OK' }]
      );
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
      const sitesToCheck = assignedSitesList.length > 0 ? assignedSitesList.map(s => s.site) : site;
      const checkResult = await runPreAttendanceChecks({ employee, site: sitesToCheck, allSites: sitesData, action: 'time_in' });
      if (!checkResult.passed) {
        if (checkResult.failedCheck === 'geofence') {
          const empWorkType = (employee?.workType || employee?.employeeType || employee?.type || '').toString().toLowerCase();
          const isFieldEmployee = empWorkType.includes('mobile') || empWorkType.includes('field');

          if (!isFieldEmployee) {
            const lat = checkResult.report?.latitude || 0;
            const lng = checkResult.report?.longitude || 0;
            const matchedSite = checkResult.report?.matchedSite;
            const activeLoc = checkResult.report?.activeLocationAddress;
            Alert.alert(
              'Geofence Warning',
              'You are outside your assigned fixed worksite perimeter. Check-in registered with out-of-bounds flag.',
              [
                { text: 'Proceed', onPress: () => processCheckIn(lat, lng, false, matchedSite, activeLoc) },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
            return;
          }
        }

        // Hard security enforcement: VPN, Mock GPS, Root Integrity, Speed Jumps
        setSecurityModal({
          visible: true,
          failedCheck: checkResult.failedCheck,
          reason: checkResult.reason,
        });
        return;
      }

      const { latitude, longitude, activeLocationAddress } = checkResult.report;
      const activeSite = checkResult.report?.matchedSite;
      await processCheckIn(latitude, longitude, true, activeSite, activeLocationAddress);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to retrieve location or verify security.');
    } finally {
      setChecking(false);
    }
  };

  const processCheckIn = async (lat, lng, inFence, activeSite, activeLocationAddress) => {
    try {
      const scheduledShift = resolveShift(assignment, employee);
      const hasScheduledShift = scheduledShift && scheduledShift !== 'Unassigned' && scheduledShift !== 'No Shift Scheduled';
      const shiftToUse = hasScheduledShift ? scheduledShift : (assignment?.shift || employee?.shift || 'Flexible');

      let isLate = false;
      let lateInfo = { isLate: false, minutesLate: 0 };
      if (hasScheduledShift && shiftToUse !== 'Flexible') {
        lateInfo = checkLateCheckIn(shiftToUse, new Date(), 15);
        isLate = Boolean(lateInfo.isLate);
      }

      const statusText = inFence ? (isLate ? 'Late' : 'On Site') : 'Flagged';
      // Priority for site display:
      // 1. If employee's GPS matches a recognized worksite fence, display that worksite name
      // 2. If out of fence or in field, display the reverse-geocoded active physical location address
      // 3. Fallback to assigned site or Active Field Location
      const resolvedSiteName = activeSite?.name || (inFence ? (site?.name || assignment?.site) : (activeLocationAddress || site?.name || 'Active Field Location'));
      const activeAddressToSave = activeLocationAddress || activeSite?.address || site?.address || resolvedSiteName;
      const siteToUse = activeSite || site || {
        id: activeSite?.id || site?.id || 'Unknown',
        name: resolvedSiteName,
        siteName: resolvedSiteName,
        address: activeAddressToSave,
        latitude: lat,
        longitude: lng,
      };

      const newAtt = {
        employee_id: employee.id,
        employeeId: employee.id,
        employeeUid: employee.uid || employee.id,
        employeeName: employee.name,
        email: employee.email || currentEmail,
        site_id: activeSite?.id || site?.id || 'Unknown',
        siteName: resolvedSiteName,
        assignedSite: site?.name || assignment?.site || 'Unassigned Site',
        actualLocation: activeAddressToSave,
        locationAddress: activeAddressToSave,
        shift: shiftToUse,
        date: serverTimestamp(),
        timeIn: serverTimestamp(),
        timeOut: null,
        status: statusText,
        isLate: isLate,
        late: isLate,
        minutesLate: isLate ? lateInfo.minutesLate : 0,
        anomalyFlag: isLate ? 'Late Check-In' : null,
        inFence: inFence,
        latitude: lat,
        longitude: lng
      };

      const attRef = await addDoc(collection(db, 'Attendance'), newAtt);
      const attId = attRef?.id || null;
      currentAttendanceIdRef.current = attId;
      // Dual-write to lowercase 'attendance' so admin dashboard picks it up
      await addDoc(collection(db, 'attendance'), { ...newAtt, id: attId }).catch(() => {});

      // Confirm check-in to user immediately
      Alert.alert('Check In Successful', `Recorded at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`);

      // Safely run secondary background logging and sync without risking false error alerts
      try {
        if (employee.id && employee.id !== 'emp_fallback') {
          await updateDoc(doc(db, 'employees', employee.id), {
            status: 'On Duty',
            lastCheckIn: serverTimestamp(),
            lastActive: Date.now(),
            isOnline: true,
          }).catch(() => {});
          presenceService.setCurrentStatus('On Duty');
          presenceService.sendHeartbeat(true, 'On Duty');
        }
      } catch (err) {
        console.warn('Check-in status update warning:', err);
      }

      try {
        await addDoc(collection(db, 'ActivityLogs'), {
          employee_id: employee.id,
          employeeName: employee.name,
          site_id: siteToUse?.id || site?.id || 'Unknown',
          siteName: resolvedSiteName || siteToUse?.name || site?.name || assignment?.site || 'Unassigned Site',
          action: 'Check In',
          type: 'Attendance',
          timestamp: serverTimestamp(),
          status: inFence ? 'Normal' : 'Warning'
        }).catch(() => {});
      } catch (err) {
        console.warn('Check-in ActivityLog warning:', err);
      }

      try {
        // 1. Immediately capture and save current location in the Location Log
        await locationLogService.captureAndSaveCurrentLocation({
          employee,
          site: siteToUse,
          assignment,
          attendanceId: attId,
          trigger: 'check_in',
          coords: { latitude: lat, longitude: lng },
        });

        // 2. Start periodic 5-minute location recording while checked in
        locationLogService.startPeriodicLogging({
          employee,
          site: siteToUse,
          assignment,
          attendanceId: attId,
        });
      } catch (err) {
        console.warn('Check-in locationLogService warning:', err);
      }

      try {
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
      } catch (err) {
        console.warn('Check-in scheduler warning:', err);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not record check-in.');
    }
  };

  const handleCheckOut = async () => {
    if (!attendance || !attendance.id) {
      Alert.alert('Error', 'No active check-in record found for today.');
      return;
    }

    setChecking(true);
    try {
      const now = new Date();
      const scheduledShift = resolveShift(assignment, employee);
      const hasScheduledShift = scheduledShift && scheduledShift !== 'Unassigned' && scheduledShift !== 'No Shift Scheduled';
      const earlyInfo = (hasScheduledShift && scheduledShift !== 'Flexible')
        ? checkEarlyCheckout(scheduledShift, now, 15)
        : { isEarly: false, minutesEarly: 0, shiftEndStr: 'Flexible' };

      let curCoords = { latitude: attendance.latitude || null, longitude: attendance.longitude || null };
      try {
        const curLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (curLoc?.coords) {
          curCoords = { latitude: curLoc.coords.latitude, longitude: curLoc.coords.longitude };
        }
      } catch (_) {}

      const checkoutPayload = {
        timeOut: serverTimestamp(),
        status: 'Completed',
        ...(earlyInfo.isEarly ? {
          earlyCheckOut: true,
          earlyDeparture: true,
          minutesEarly: earlyInfo.minutesEarly,
          anomalyFlag: 'Early Check-Out',
          departureNote: `Early Check-Out: Left ${earlyInfo.minutesEarly}m before scheduled shift end (${earlyInfo.shiftEndStr})`,
        } : {})
      };

      await updateDoc(doc(db, 'Attendance', attendance.id), checkoutPayload);
      // Dual-write checkout to lowercase collection
      await updateDoc(doc(db, 'attendance', attendance.id), checkoutPayload).catch(() => {});

      Alert.alert('Check Out Successful', 'Have a great day!');

      try {
        if (employee.id && employee.id !== 'emp_fallback') {
          await updateDoc(doc(db, 'employees', employee.id), {
            status: 'Completed',
            attendanceStatus: 'Completed',
            lastCheckOut: Date.now(),
            lastActive: Date.now(),
            isOnline: true
          }).catch(() => {});
          presenceService.setCurrentStatus('Completed');
          presenceService.sendHeartbeat(true, 'Completed');
        }
      } catch (err) {
        console.warn('Check-out employee status warning:', err);
      }

      try {
        let anomalyDocId = null;
        if (earlyInfo.isEarly) {
          const departureDesc = `You checked out early at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} before scheduled shift end (${earlyInfo.shiftEndStr}; ${earlyInfo.minutesEarly}m early departure).`;
          anomalyDocId = await writeSecurityEvent({
            eventType: 'EARLY_CHECKOUT',
            employee: {
              id: employee.id,
              name: employee.name,
              email: employee.email || currentEmail,
              employeeType: employee.workType || employee.employeeType || 'Employee',
            },
            assignment: {
              id: assignment?.id || null,
              siteId: site?.id || null,
              siteName: attendance.siteName || site?.name || assignment?.site || 'Scheduled Post',
            },
            coords: curCoords,
            relatedAttendanceId: attendance.id,
            customDescription: departureDesc,
            extra: { details: `${earlyInfo.minutesEarly}m before ${earlyInfo.shiftEndStr}` },
          }).catch(() => null);
        }

        await addDoc(collection(db, 'ActivityLogs'), {
          employee_id: employee.id,
          employeeName: employee.name,
          site_id: site?.id || 'Unknown',
          siteName: attendance.siteName || site?.name || assignment?.site || 'Unassigned Site',
          action: earlyInfo.isEarly ? 'Check Out (Early Departure)' : 'Check Out',
          type: 'Attendance',
          anomalyId: anomalyDocId || null,
          timestamp: serverTimestamp(),
          status: earlyInfo.isEarly ? 'Warning' : 'Normal',
          details: earlyInfo.isEarly ? `Early departure: ${earlyInfo.minutesEarly}m before ${earlyInfo.shiftEndStr}` : 'Shift Completed'
        }).catch(() => {});
      } catch (err) {
        console.warn('Check-out activity/anomaly log warning:', err);
      }

      try {
        await schedulerStop().catch(() => {});
        currentAttendanceIdRef.current = null;
      } catch (_) {}

      try {
        await locationLogService.stopPeriodicLogging().catch(() => {});
      } catch (_) {}

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

  const isCheckedIn = Boolean(
    attendance?.timeIn || attendance?.checkIn || attendance?.check_in
  );
  const isCheckedOut = Boolean(
    isCheckedIn && (attendance?.timeOut || attendance?.checkOut || attendance?.check_out || attendance?.status === 'Completed')
  );

  const displayStatus = (isCheckedIn && !isCheckedOut)
    ? 'On Duty'
    : (employee?.status || 'Online');
  const statusColor = (displayStatus === 'On Duty' || displayStatus === 'On Site') ? '#10B981' : (displayStatus === 'Online' ? '#0284C7' : '#F59E0B');

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

  const empShift = resolveShift(assignment, employee);
  const daysWorked = currentMonthRecords.length;
  const flaggedCount = currentMonthRecords.filter(r => isAttendanceRecordFlagged(r, empShift)).length;
  const onTimeCount = Math.max(0, daysWorked - flaggedCount);
  const monthlyRate = daysWorked > 0 ? ((onTimeCount / daysWorked) * 100).toFixed(1) : '100.0';

  return (
    <View style={styles.container}>
      {/* ── Fixed Header Banner ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/* Top Row: App Logo on Left, Action Nav Icons on Right */}
        <View style={styles.headerTopRow}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View style={styles.actionNavGroup}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => setShowFacialModal(true)}>
              <Image
                source={require('../../assets/identify.png')}
                style={styles.identifyIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('SecurityStatus')}>
              <Ionicons name="shield-checkmark-outline" size={22} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn} onPress={handleOpenAnomalyAlerts}>
              <Ionicons name="warning-outline" size={22} color="white" />
              {unresolvedAnomalyCount > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>
                    {unresolvedAnomalyCount > 9 ? '9+' : unresolvedAnomalyCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Greeting & Employee Name on Left, Weather Forecast on Right */}
        <View style={styles.headerGreetingRow}>
          <View style={styles.greetingLeftCol}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
              <Image source={require('../../assets/wave.png')} style={styles.waveIcon} />
            </View>
          </View>

          {weather && (
            <View style={styles.modernWeatherBox}>
              <View style={styles.weatherIconTempRow}>
                <Ionicons name={weather.icon || 'partly-sunny-outline'} size={17} color="#FDE047" />
                <Text style={styles.modernWeatherTemp}>{weather.temp}</Text>
                {(() => {
                  const rawCond = (weather.condition || '')
                    .replace(/overcast/gi, '')
                    .replace(/^[•\s-]+|[•\s-]+$/g, '')
                    .trim();
                  return rawCond ? (
                    <Text style={styles.modernWeatherConditionInline} numberOfLines={1}>
                      • {rawCond}
                    </Text>
                  ) : null;
                })()}
              </View>
              {weather.location ? (
                <View style={styles.weatherLocationRow}>
                  <Ionicons name="location-sharp" size={11} color="#C7D2FE" />
                  <Text style={styles.modernWeatherLocation} numberOfLines={1}>
                    {weather.location}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
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
            <View style={[styles.shiftBadge, (!assignment || assignedSitesList.length === 0) && { backgroundColor: '#F3F4F6' }]}>
              <Text style={[styles.shiftText, (!assignment || assignedSitesList.length === 0) && { color: '#6B7280' }]}>
                {assignment && assignedSitesList.length > 0 ? resolveShift(assignment, employee) : 'No Shift Scheduled'}
              </Text>
            </View>
          </View>

          {/* Location / Site Info Rows (Supports Multiple Assigned Locations) */}
          {assignedSitesList && assignedSitesList.length > 0 ? (
            <View style={{ marginBottom: 14, gap: 8 }}>
              {assignedSitesList.map((siteItem, idx) => (
                <TouchableOpacity
                  key={siteItem.id || `home_site_${idx}`}
                  style={[
                    styles.siteInfoContainer,
                    { marginBottom: 0 }
                  ]}
                  onPress={() => navigation.navigate('Map', { assignment: siteItem.assignment, site: siteItem.site })}
                  activeOpacity={0.8}
                >
                  <Ionicons name="location-sharp" size={18} color="#4F46E5" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.siteName}>
                        {siteItem.siteName}
                      </Text>
                      {assignedSitesList.length > 1 && (
                        <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#4F46E5' }}>Site {idx + 1}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.siteAddress} numberOfLines={2}>
                      {siteItem.address || 'GPS Live Monitoring Active • Tap to Navigate'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.siteInfoContainer}
              onPress={() => assignment && navigation.navigate('Map', { assignment, site })}
              activeOpacity={0.8}
            >
              <Ionicons name="location-sharp" size={18} color="#9CA3AF" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.siteName}>No Active Site Assignment</Text>
                <Text style={styles.siteAddress}>No active worksite assigned for today</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}

          {/* Warning Banner if No Active Shift Today */}
          {(!assignment || assignedSitesList.length === 0) && (
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
                  You have no active worksite assignment for today. Shifts whose date has passed or are missed/completed are automatically removed.
                </Text>
              </View>
            </View>
          )}

          {/* Warning Banner if Mobile Field Employee has no assigned site */}
          {assignment && assignedSitesList.length > 0 && isMobileFieldWithoutSite(employee, assignment, site) && (
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
            {(!assignment || assignedSitesList.length === 0) ? (
              isCheckedIn && !isCheckedOut ? (
                <TouchableOpacity
                  style={[styles.checkInBtn, { opacity: 0.85, backgroundColor: '#64748B' }]}
                  onPress={() => {
                    Alert.alert(
                      'No Shift Scheduled',
                      'You do not have an active worksite shift scheduled for today. Would you like to end your unscheduled on-duty session?',
                      [
                        { text: 'End Session', style: 'destructive', onPress: requestCheckOut },
                        { text: 'Cancel', style: 'cancel' }
                      ]
                    );
                  }}
                  disabled={checking}
                >
                  {checking ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="stop-circle-outline" size={20} color="white" />
                      <Text style={styles.btnText}>End Unscheduled Session</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.checkInBtn, { opacity: 0.6, backgroundColor: '#94A3B8' }]}
                  onPress={() => {
                    Alert.alert(
                      'No Shift Scheduled',
                      'You do not have an active worksite assignment scheduled for today. Shifts whose date has passed or are not scheduled for today cannot be checked in or out.'
                    );
                  }}
                  disabled={checking}
                >
                  {checking ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="lock-closed-outline" size={20} color="white" />
                      <Text style={styles.btnText}>No Shift Scheduled</Text>
                    </>
                  )}
                </TouchableOpacity>
              )
            ) : !isCheckedIn ? (
              <TouchableOpacity
                style={[
                  styles.checkInBtn, 
                  (checking || isAssignmentDatePassed(assignment) || isMobileFieldWithoutSite(employee, assignment, site)) && { 
                    opacity: 0.6, 
                    backgroundColor: '#94A3B8' 
                  }
                ]}
                onPress={requestCheckIn}
                disabled={checking || isAssignmentDatePassed(assignment)}
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
                  (isCheckedOut || checking) && { opacity: 0.6, backgroundColor: '#94A3B8' }
                ]}
                onPress={requestCheckOut}
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


        {/* ── Assigned Worksites (Rendered as Separate Cards) ── */}
        {assignedSitesList && assignedSitesList.length > 0 ? (
          <View style={{ marginBottom: 4 }}>
            {assignedSitesList.length > 1 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="business" size={17} color="#4F46E5" />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
                    Assigned Worksites ({assignedSitesList.length})
                  </Text>
                </View>
                <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>Mobile Field</Text>
                </View>
              </View>
            )}

            {assignedSitesList.map((siteItem, idx) => {
              const isMultiple = assignedSitesList.length > 1;
              return (
                <View key={siteItem.id || `asg_${idx}`} style={[styles.asgBentoCard, idx > 0 && { marginTop: 4 }]}>
                  <View style={styles.asgBentoHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
                      <View style={[styles.asgIconBg, isMultiple && { backgroundColor: '#F5F3FF' }]}>
                        <Ionicons name={isMultiple ? "business" : "briefcase"} size={18} color={isMultiple ? "#7C3AED" : "#4F46E5"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.asgBentoLabel}>
                            {isMultiple ? `Assigned Worksite ${idx + 1}` : 'Active Site Assignment'}
                          </Text>
                          {isMultiple && (
                            <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#6D28D9' }}>Site {idx + 1}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.asgBentoTitle} numberOfLines={1}>{siteItem.siteName}</Text>
                      </View>
                    </View>
                    <View style={styles.asgStatusBadge}>
                      <Text style={styles.asgStatusText}>{siteItem.status || 'Active'}</Text>
                    </View>
                  </View>

                  <View style={styles.asgDetailsGrid}>
                    <View style={styles.asgDetailRow}>
                      <Ionicons name="location-outline" size={15} color="#6B7280" />
                      <Text style={[styles.asgDetailText, { flex: 1 }]} numberOfLines={2}>
                        Address: <Text style={styles.asgDetailBold}>{siteItem.address || '—'}</Text>
                      </Text>
                    </View>
                    <View style={styles.asgDetailRow}>
                      <Ionicons name="radio-outline" size={15} color="#4F46E5" />
                      <Text style={styles.asgDetailText}>
                        Perimeter: <Text style={styles.asgDetailBold}>{siteItem.radius}m Geofence Radius</Text>
                      </Text>
                    </View>
                    <View style={styles.asgDetailRow}>
                      <Ionicons name="time-outline" size={15} color="#6B7280" />
                      <Text style={styles.asgDetailText}>Shift: <Text style={styles.asgDetailBold}>{siteItem.shift || '—'}</Text></Text>
                    </View>
                    <View style={styles.asgDetailRow}>
                      <Ionicons name="calendar-outline" size={15} color="#6B7280" />
                      <Text style={styles.asgDetailText}>Date: <Text style={styles.asgDetailBold}>{siteItem.date || 'Daily Scheduled'}</Text></Text>
                    </View>
                    <View style={styles.asgDetailRow}>
                      <Ionicons
                        name="flag-outline"
                        size={15}
                        color={
                          (siteItem.priority || '').toLowerCase() === 'medium' ? '#F59E0B' :
                            (siteItem.priority || '').toLowerCase() === 'low' ? '#10B981' : '#EF4444'
                        }
                      />
                      <Text style={styles.asgDetailText}>
                        Priority: <Text style={[
                          styles.asgDetailBold,
                          {
                            color: (siteItem.priority || '').toLowerCase() === 'medium' ? '#F59E0B' :
                              (siteItem.priority || '').toLowerCase() === 'low' ? '#10B981' : '#EF4444'
                          }
                        ]}>
                          {siteItem.priority || 'Medium'}
                        </Text>
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.openMapNavBtn}
                    onPress={() => navigation.navigate('Map', { assignment: siteItem.assignment, site: siteItem.site })}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="map" size={16} color="white" />
                    <Text style={styles.openMapNavText}>Open Live Map & Geofence</Text>
                    <Ionicons name="arrow-forward" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.asgBentoCard, { alignItems: 'center', paddingVertical: 32 }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="briefcase-outline" size={26} color="#9CA3AF" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 4 }}>No Active Worksites</Text>
            <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 }}>
              No active worksites scheduled for today.{'\n'}Missed, completed, or expired shifts are automatically removed.
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

      <ActionConfirmModal
        visible={confirmModal.visible}
        actionType={confirmModal.actionType}
        message="Are you sure you want to proceed?"
        loading={checking}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
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
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLogo: {
    width: 108,
    height: 36,
  },
  headerGreetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  greetingLeftCol: {
    flex: 1,
    paddingRight: 10,
  },
  modernWeatherBox: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  weatherIconTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modernWeatherTemp: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  modernWeatherConditionInline: {
    color: '#E0E7FF',
    fontSize: 11.5,
    fontWeight: '600',
    maxWidth: 110,
  },
  weatherLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    paddingLeft: 1,
  },
  modernWeatherLocation: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '500',
    maxWidth: 130,
  },
  actionNavGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  greeting: {
    color: '#C7D2FE',
    fontSize: 13.5,
    fontWeight: '500',
    marginBottom: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  waveIcon: {
    width: 20,
    height: 20,
    marginLeft: 6,
    flexShrink: 0,
  },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  identifyIcon: {
    width: 32,
    height: 32,
    tintColor: '#FFFFFF',
  },
  navBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#4F46E5',
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
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
