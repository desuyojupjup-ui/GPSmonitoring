import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, collection, query, where, onSnapshot, getDocs, ensureAuthenticatedSession, getCleanEmployeeEmail } from '../firebase';
import { isAssignmentDatePassed, resolveShift, isAssignmentForEmployee, deduplicateAssignments } from '../utils/assignmentUtils';



export default function TasksScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [employee, setEmployee] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [sites, setSites] = useState({});
  const [loading, setLoading] = useState(true);

  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);
  const formattedEmailName = currentEmail ? currentEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : '';
  const displayName = employee?.name 
    || propUser?.name 
    || route?.params?.user?.name 
    || formattedEmailName 
    || 'Employee';

  const employeeRef = React.useRef(null);
  const lastAsgKeyRef = React.useRef('');

  useEffect(() => {
    if (!currentEmail) {
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    const unsubEmp = onSnapshot(collection(db, 'employees'), (empSnap) => {
      let empData = null;

      if (!empSnap.empty) {
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

        const matchingDoc = empSnap.docs.find(d => {
          const data = d.data();
          const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
          const empName = (data.name || data.empName || '').trim().toLowerCase();
          const empUid = (data.uid || data.firebaseUid || d.id || '').toString().trim().toLowerCase();

          if (authUid && empUid && authUid === empUid) return true;
          if (emailToMatch && empMail && emailToMatch === empMail) return true;
          if (emailPrefixRaw && empMail && empMail.startsWith(emailPrefixRaw + '@')) return true;

          if (nameToMatch && nameToMatch.length >= 2 && empName && empName.length >= 2) {
            if (empName === nameToMatch) return true;
            const nameTokens = nameToMatch.split(/\s+/).filter(t => t.length >= 3);
            const empTokens = empName.split(/\s+/).filter(t => t.length >= 3);
            if (nameTokens.length > 0 && empTokens.length > 0) {
              if (nameTokens.some(nt => empTokens.some(et => nt === et))) return true;
            }
          }

          return false;
        });

        // IMPORTANT: Only use an explicit match. No docs[0] fallback.
        if (matchingDoc) {
          empData = { id: matchingDoc.id, ...matchingDoc.data() };
        }
      }

      if (!empData) {
        empData = {
          id: auth.currentUser?.uid || 'emp_fallback',
          name: propUser?.name || route?.params?.user?.name || formattedEmailName || 'Employee',
          email: currentEmail,
          status: 'On Duty'
        };
      }

      setEmployee(empData);
      employeeRef.current = empData;
      setLoading(false);
      clearTimeout(timer);
    });

    return () => unsubEmp();
  }, [currentEmail]);

  const [asgDocs, setAsgDocs] = useState([]);

  useEffect(() => {
    ensureAuthenticatedSession();

    let docs1 = [], docs2 = [];
    const updateMerged = () => {
      const merged = [...docs1, ...docs2];
      setAsgDocs(deduplicateAssignments(merged));
    };

    const unsub1 = onSnapshot(collection(db, 'Assignments'), (snap) => {
      docs1 = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      updateMerged();
    }, (err) => console.warn('Tasks Assignments unsub1 warning:', err.message));

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

    const processSnapshot = async () => {
      const emp = employeeRef.current || employee;
      const cleanDocs = asgDocs.filter(a => a && a.id !== 'asg1' && !isAssignmentDatePassed(a));
      let data = cleanDocs.filter(a => isAssignmentForEmployee(a, emp, emailToUse, currentUserName));

      // Loose fallback: if data is empty, check if any clean document matches employee site, name, or email
      if (data.length === 0) {
        const looseMatches = cleanDocs.filter(a => {
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
        if (looseMatches.length > 0) data = looseMatches;
      }

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

      data.sort((a, b) => {
        const ranks = { 'Active': 1, 'Upcoming': 2, 'Completed': 3, 'Cancelled': 4 };
        const statusDiff = (ranks[a.status] || 5) - (ranks[b.status] || 5);
        if (statusDiff !== 0) return statusDiff;
        return getTs(b) - getTs(a);
      });

      // Final filter to strictly exclude any passed assignments and deduplicate records
      data = deduplicateAssignments(data.filter(item => !isAssignmentDatePassed(item)));

      // Fallback: ONLY if employee has NO explicit assignment records in the database,
      // use the employee's assignedSite configured on their profile by admin.
      // If the employee had an assignment but its date passed, do NOT synthesize an active assignment!
      const hasEmployeeAssignmentsInDb = asgDocs.some(a => isAssignmentForEmployee(a, emp, emailToUse, currentUserName));

      if (data.length === 0 && emp && !hasEmployeeAssignmentsInDb) {
        const profileSite = (emp.assignedSite || emp.site || emp.assignedSiteName || '').trim();
        if (profileSite && profileSite.toLowerCase() !== 'unassigned' && profileSite.toLowerCase() !== 'none') {
          data = [{
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
          }];
        }
      }

      const asgKey = JSON.stringify(data.map(d => ({ id: d.id, site: d.site, shift: d.shift, status: d.status })));
      if (asgKey !== lastAsgKeyRef.current) {
        lastAsgKeyRef.current = asgKey;

        const siteMap = { ...sites };
        const allSitesSnap = await getDocs(collection(db, 'Sites')).catch(() => ({ empty: true, docs: [] }));
        const allSitesDocs = allSitesSnap.empty ? [] : allSitesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const a of data) {
          const sName = a.site || a.siteName || a.location;
          if (sName && !siteMap[sName]) {
            const targetSite = allSitesDocs.find(s => s.name && s.name.trim().toLowerCase() === sName.trim().toLowerCase());
            if (targetSite) {
              siteMap[sName] = targetSite;
            }
          }
        }
        setSites(siteMap);
        setAssignments(data);
      }
      setLoading(false);
    };

    processSnapshot();
  }, [asgDocs, employee, currentEmail]);

  const getStatusBadge = (status) => {
    let bg = '#FEF3C7', color = '#92400E';
    if (status === 'Active') { bg = '#DBEAFE'; color = '#1E40AF'; }
    else if (status === 'Completed') { bg = '#D1FAE5'; color = '#065F46'; }
    else if (status === 'Cancelled') { bg = '#FEE2E2'; color = '#991B1B'; }
    return (
      <View style={[styles.statusBadge, { backgroundColor: bg }]}>
        <Text style={[styles.statusBadgeText, { color }]}>{status || 'Upcoming'}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Fixed Navigation Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>My Site Assignments</Text>
        <Text style={styles.headerSub}>View and manage your active security posts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {assignments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="clipboard-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Active Site Assignment</Text>
            <Text style={styles.emptySub}>You currently have no scheduled site assignments.</Text>
          </View>
        ) : (
          assignments.map((item) => {
            const sName = item.site || item.siteName || item.location;
            const siteObj = sites[sName];

            return (
              <View key={item.id} style={styles.assignmentCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.siteTitle}>{sName || 'Assigned Site'}</Text>
                    <Text style={styles.siteSub}>{siteObj?.address || item.siteAddress || item.address || 'GPS Live Monitoring Active'}</Text>
                  </View>
                  {getStatusBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.infoGrid}>
                  <View style={styles.infoRow}>
                    <Ionicons name="business-outline" size={16} color="#4F46E5" />
                    <Text style={styles.infoText}>Site Name: <Text style={styles.boldText}>{sName || 'Assigned Site'}</Text></Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={16} color="#4F46E5" />
                    <Text style={styles.infoText}>Address: <Text style={styles.boldText}>{siteObj?.address || item.siteAddress || item.address || 'GPS Live Monitoring Active'}</Text></Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="time-outline" size={16} color="#4F46E5" />
                    <Text style={styles.infoText}>Shift: <Text style={styles.boldText}>{resolveShift(item, employee)}</Text></Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={16} color="#4F46E5" />
                    <Text style={styles.infoText}>Date: <Text style={styles.boldText}>{item.assignDate || item.assignedAt || 'Daily Scheduled'}</Text></Text>
                  </View>

                  {item.priority && (
                    <View style={styles.infoRow}>
                      <Ionicons name="alert-circle-outline" size={16} color={item.priority === 'High' ? '#EF4444' : '#F59E0B'} />
                      <Text style={styles.infoText}>Priority: <Text style={[styles.boldText, { color: item.priority === 'High' ? '#EF4444' : '#F59E0B' }]}>{item.priority}</Text></Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity 
                  style={styles.detailBtn}
                  onPress={() => navigation.navigate('Map', { assignment: item })}
                >
                  <Text style={styles.detailBtnText}>View Site Map & Geofence</Text>
                  <Ionicons name="chevron-forward" size={16} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 13,
    color: '#C7D2FE',
    marginTop: 2,
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },
  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  siteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  siteSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  infoGrid: {
    gap: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#4B5563',
  },
  boldText: {
    fontWeight: '600',
    color: '#111827',
  },
  detailBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 4,
  },
  detailBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  }
});
