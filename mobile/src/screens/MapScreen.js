import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, Linking, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { auth, db, collection, addDoc, serverTimestamp, getDocs, onSnapshot, ensureAuthenticatedSession, getCleanEmployeeEmail } from '../firebase';
import { Ionicons } from '@expo/vector-icons';
import { isAssignmentDatePassed, isAssignmentActiveToday, resolveShift, isAssignmentForEmployee, deduplicateAssignments } from '../utils/assignmentUtils';

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

function generateLeafletHtml(initialUserLat, initialUserLng, siteLat, siteLng, siteRadius, siteName, isOnSite, isNavigating, layerType) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #F1F5F9; overflow: hidden; }
    .pulse-pin {
      position: relative;
      width: 28px;
      height: 28px;
    }
    .pulse-dot {
      width: 20px;
      height: 20px;
      background: #3B82F6;
      border: 3.5px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      position: absolute;
      top: 4px;
      left: 4px;
      z-index: 2;
    }
    .pulse-ring {
      width: 44px;
      height: 44px;
      background: rgba(59, 130, 246, 0.45);
      border-radius: 50%;
      position: absolute;
      top: -8px;
      left: -8px;
      animation: pulse 1.6s infinite ease-out;
      z-index: 1;
    }
    @keyframes pulse {
      0% { transform: scale(0.5); opacity: 0.9; }
      100% { transform: scale(2.0); opacity: 0; }
    }
    .site-pin {
      width: 36px;
      height: 36px;
      background: #4F46E5;
      border: 3.5px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .site-pin-inner {
      width: 12px;
      height: 12px;
      background: #FFFFFF;
      border-radius: 50%;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 12px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var layers = {
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 })
    };

    var currentLayerType = '${layerType || 'osm'}';
    var userLat = ${initialUserLat || 10.3157};
    var userLng = ${initialUserLng || 123.8854};
    var sLat = ${siteLat || 'null'};
    var sLng = ${siteLng || 'null'};
    var sRadius = ${siteRadius || 200};
    var sName = ${JSON.stringify(siteName || 'Assigned Site')};
    var navigating = ${isNavigating ? 'true' : 'false'};

    var center = (sLat && sLng) ? [sLat, sLng] : [userLat, userLng];
    var map = L.map('map', {
      center: center,
      zoom: 16,
      zoomControl: false,
      layers: [layers[currentLayerType] || layers.osm]
    });

    // Custom user marker
    var userIcon = L.divIcon({
      className: '',
      html: '<div class="pulse-pin"><div class="pulse-ring"></div><div class="pulse-dot"></div></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    var userMarker = L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);

    // Site marker & Geofence
    var siteMarker = null;
    var geofenceCircle = null;
    var navLine = null;

    function renderSite() {
      if (siteMarker) map.removeLayer(siteMarker);
      if (geofenceCircle) map.removeLayer(geofenceCircle);

      if (sLat && sLng) {
        var siteIcon = L.divIcon({
          className: '',
          html: '<div class="site-pin"><div class="site-pin-inner"></div></div>',
          iconSize: [36, 36],
          iconAnchor: [18, 36]
        });
        siteMarker = L.marker([sLat, sLng], { icon: siteIcon })
          .bindPopup('<b>' + sName + '</b><br>Assigned Worksite')
          .addTo(map);

        geofenceCircle = L.circle([sLat, sLng], {
          radius: sRadius,
          color: ${isOnSite ? "'#10B981'" : "'#4F46E5'"},
          fillColor: ${isOnSite ? "'#10B981'" : "'#4F46E5'"},
          fillOpacity: 0.12,
          weight: 2
        }).addTo(map);
      }
    }
    renderSite();

    function updateNavLine() {
      if (navLine) map.removeLayer(navLine);
      if (navigating && sLat && sLng && userLat && userLng) {
        navLine = L.polyline([[userLat, userLng], [sLat, sLng]], {
          color: '#10B981',
          weight: 5,
          dashArray: '8, 6'
        }).addTo(map);
      }
    }
    updateNavLine();

    // Bridge functions from React Native
    window.updateUserLocation = function(lat, lng) {
      userLat = lat;
      userLng = lng;
      if (userMarker) userMarker.setLatLng([lat, lng]);
      updateNavLine();
    };

    window.updateSite = function(lat, lng, radius, name, onSite) {
      sLat = lat;
      sLng = lng;
      sRadius = radius;
      sName = name;
      renderSite();
      updateNavLine();
    };

    window.switchLayer = function(type) {
      if (layers[currentLayerType]) map.removeLayer(layers[currentLayerType]);
      if (layers[type]) {
        map.addLayer(layers[type]);
        currentLayerType = type;
      }
    };

    window.centerUser = function() {
      if (userLat && userLng) {
        map.flyTo([userLat, userLng], 17, { duration: 1.0 });
      }
    };

    window.centerSite = function() {
      if (sLat && sLng) {
        map.flyTo([sLat, sLng], 17, { duration: 1.0 });
      }
    };

    window.setNavigating = function(val) {
      navigating = Boolean(val);
      updateNavLine();
      if (navigating && sLat && sLng && userLat && userLng) {
        map.fitBounds([[userLat, userLng], [sLat, sLng]], { padding: [60, 60] });
      }
    };
  </script>
</body>
</html>`;
}

export default function MapScreen({ navigation, route, user: propUser }) {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const routeAsg = route?.params?.assignment;
  const validRouteAsg = (routeAsg && !isAssignmentDatePassed(routeAsg)) ? routeAsg : null;
  const [site, setSite] = useState(route?.params?.site && validRouteAsg ? resolveSiteDetails(route.params.site, route.params.site.name) : null);
  const [assignment, setAssignment] = useState(validRouteAsg);
  const [assignedSitesList, setAssignedSitesList] = useState([]);
  const [sitesData, setSitesData] = useState([]);
  const [distance, setDistance] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [layerType, setLayerType] = useState('osm'); // osm, satellite, terrain
  const [showLayers, setShowLayers] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const webViewRef = useRef(null);
  const locationSubscription = useRef(null);
  const employeeRef = useRef(null);
  const assignmentRef = useRef(null);
  const siteRef = useRef(null);

  const currentEmail = getCleanEmployeeEmail(propUser, route?.params?.user, auth.currentUser);

  // 1. Fetch Employee Profile
  useEffect(() => {
    if (!currentEmail) return;

    const unsubEmp = onSnapshot(collection(db, 'employees'), (empSnap) => {
      let empData = null;

      const authUid = (auth.currentUser?.uid || '').trim().toLowerCase();
      const emailToMatch = currentEmail.trim().toLowerCase();
      const nameToMatch = (
        auth.currentUser?.displayName || 
        route?.params?.user?.name || 
        ''
      ).trim().toLowerCase();

      if (!empSnap.empty) {
        const matchingDoc = empSnap.docs.find(d => {
          const data = d.data();
          const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
          const empName = (data.name || data.empName || '').trim().toLowerCase();
          const empUid = (data.uid || data.firebaseUid || d.id || '').toString().trim().toLowerCase();

          if (authUid && empUid && authUid === empUid) return true;
          if (emailToMatch && empMail && emailToMatch === empMail) return true;
          if (emailToMatch && empMail && empMail.startsWith(emailToMatch.split('@')[0] + '@')) return true;

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

        if (matchingDoc) {
          empData = { id: matchingDoc.id, ...matchingDoc.data() };
        }
      }

      if (!empData) {
        empData = {
          id: auth.currentUser?.uid || 'emp_fallback',
          name: route?.params?.user?.name || currentEmail.split('@')[0] || 'Employee',
          email: currentEmail,
          status: 'Active'
        };
      }

      employeeRef.current = empData;
      setEmployee(empData);
    });

    return () => unsubEmp();
  }, [currentEmail]);

  // 2. Real-time Assignment & Site Data Sync
  const [asgDocs, setAsgDocs] = useState([]);
  const sitesRef = useRef([]);

  useEffect(() => {
    ensureAuthenticatedSession();

    const unsubSites = onSnapshot(collection(db, 'Sites'), (snap) => {
      const loaded = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      sitesRef.current = loaded;
      setSitesData(loaded);
    }, (err) => console.warn('Map Sites snap warning:', err.message));
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
    }, (err) => console.warn('Map Assignments unsub1 warning:', err.message));

    let unsub2 = () => {};
    try {
      unsub2 = onSnapshot(collection(db, 'assignments'), (snap) => {
        docs2 = !snap.empty ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        updateMerged();
      }, () => {});
    } catch (e) {}

    return () => { unsub1(); unsub2(); };
  }, []);

  const selectSite = (siteItem) => {
    if (!siteItem || !siteItem.site) return;
    const resolved = siteItem.site;
    setSite(resolved);
    setAssignment(siteItem.assignment);
    siteRef.current = resolved;
    assignmentRef.current = siteItem.assignment;
    if (resolved.lat && resolved.lng && webViewRef.current) {
      const js = `if (window.updateSite) { window.updateSite(${resolved.lat}, ${resolved.lng}, ${resolved.radius}, ${JSON.stringify(resolved.name)}, ${isOnSite}); } if (window.centerOnSite) { window.centerOnSite(); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  };

  useEffect(() => {
    const emp = employeeRef.current || employee;
    const emailToUse = currentEmail;
    const currentUserName = (
      auth.currentUser?.displayName || 
      route?.params?.user?.name || 
      route?.params?.user?.displayName || 
      ''
    ).trim().toLowerCase();

    const getTs = (x) => {
      if (!x) return 0;
      if (typeof x.updatedAt === 'number') return x.updatedAt;
      if (typeof x.createdAt === 'number') return x.createdAt;
      if (x.createdAt?.toDate) return x.createdAt.toDate().getTime();
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

    // 1. Process matching assignment docs
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
    // Must check all asgDocs so completed/missed assignments don't trigger profile fallbacks!
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

    // Prioritize site selected in navigation route params
    const routeSiteName = (route?.params?.site?.name || route?.params?.assignment?.site || '').trim().toLowerCase();
    let chosenSiteItem = null;

    if (routeSiteName) {
      chosenSiteItem = gatheredSites.find(s => {
        const sn = s.siteName.toLowerCase();
        return sn === routeSiteName || sn.includes(routeSiteName) || routeSiteName.includes(sn);
      });
    }

    if (!chosenSiteItem && siteRef.current) {
      const currentName = (siteRef.current.name || '').trim().toLowerCase();
      chosenSiteItem = gatheredSites.find(s => s.siteName.toLowerCase() === currentName);
    }

    if (!chosenSiteItem && gatheredSites.length > 0) {
      chosenSiteItem = gatheredSites[0];
    }

    if (chosenSiteItem) {
      const resolved = chosenSiteItem.site;
      assignmentRef.current = chosenSiteItem.assignment;
      setAssignment(chosenSiteItem.assignment);
      siteRef.current = resolved;
      setSite(resolved);

      if (resolved && resolved.lat && resolved.lng) {
        const js = `if (window.updateSite) { window.updateSite(${resolved.lat}, ${resolved.lng}, ${resolved.radius}, ${JSON.stringify(resolved.name)}, ${isOnSite}); } true;`;
        webViewRef.current?.injectJavaScript(js);
      }
    } else {
      assignmentRef.current = null;
      setAssignment(null);
      siteRef.current = null;
      setSite(null);
    }
  }, [asgDocs, employee, currentEmail, sitesData]);

  // 3. Location Tracking & Distance Calculation
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== 'granted') {
          setLocationError('Location permission was denied. Showing site location.');
          return;
        }

        try {
          const currentLoc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
          });
          if (!cancelled) {
            setLocation(currentLoc.coords);
            setLocationError(null);
            calculateDistance(currentLoc.coords);
          }
        } catch (posErr) {
          try {
            const fallbackLoc = await Location.getLastKnownPositionAsync();
            if (!cancelled && fallbackLoc) {
              setLocation(fallbackLoc.coords);
              setLocationError(null);
              calculateDistance(fallbackLoc.coords);
            }
          } catch (_) {
            if (!cancelled) setLocationError('Could not acquire GPS position.');
          }
        }

        if (!cancelled) startTracking();
      } catch (err) {
        if (!cancelled) {
          setLocationError('GPS error: ' + (err?.message || 'Location unavailable'));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  const startTracking = async () => {
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 10,
      },
      (newLoc) => {
        setLocation(newLoc.coords);
        calculateDistance(newLoc.coords);
        const js = `if (window.updateUserLocation) { window.updateUserLocation(${newLoc.coords.latitude}, ${newLoc.coords.longitude}); } true;`;
        webViewRef.current?.injectJavaScript(js);
      }
    );
  };

  const calculateDistance = (currentCoords) => {
    const sLat = site?.lat || site?.latitude;
    const sLng = site?.lng || site?.longitude;

    if (sLat && sLng && currentCoords) {
      const R = 6371e3;
      const φ1 = currentCoords.latitude * Math.PI/180;
      const φ2 = sLat * Math.PI/180;
      const Δφ = (sLat - currentCoords.latitude) * Math.PI/180;
      const Δλ = (sLng - currentCoords.longitude) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      setDistance(Math.round(R * c));
    }
  };

  const siteLat = site?.lat || site?.latitude || 10.3157;
  const siteLng = site?.lng || site?.longitude || 123.8854;
  const siteRadius = site?.radius ? parseInt(site.radius.toString().replace('m', '')) : 200;
  const isOnSite = distance !== null && distance <= siteRadius;

  const centerOnSite = () => {
    webViewRef.current?.injectJavaScript('if (window.centerSite) { window.centerSite(); } true;');
  };

  const centerOnUser = () => {
    webViewRef.current?.injectJavaScript('if (window.centerUser) { window.centerUser(); } true;');
  };

  const handleLayerChange = (type) => {
    setLayerType(type);
    setShowLayers(false);
    webViewRef.current?.injectJavaScript(`if (window.switchLayer) { window.switchLayer("${type}"); } true;`);
  };

  const toggleNavigation = () => {
    const nextState = !isNavigating;
    setIsNavigating(nextState);
    webViewRef.current?.injectJavaScript(`if (window.setNavigating) { window.setNavigating(${nextState}); } true;`);
  };

  const openExternalMaps = () => {
    if (!siteLat || !siteLng) {
      Alert.alert('GPS Warning', 'Site location coordinates are unavailable.');
      return;
    }
    const siteTitle = site?.name || assignment?.site || 'Site Location';
    const label = encodeURIComponent(siteTitle);
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${siteLat},${siteLng}`;
    const nativeScheme = Platform.OS === 'ios' 
      ? `maps:0,0?q=${label}@${siteLat},${siteLng}`
      : `geo:${siteLat},${siteLng}?q=${siteLat},${siteLng}(${label})`;

    Linking.canOpenURL(nativeScheme).then((supported) => {
      if (supported) {
        Linking.openURL(nativeScheme);
      } else {
        Linking.openURL(googleUrl);
      }
    }).catch(() => {
      Linking.openURL(googleUrl);
    });
  };

  const userLat = location?.latitude || 10.3157;
  const userLng = location?.longitude || 123.8854;

  const leafletHtml = generateLeafletHtml(
    userLat,
    userLng,
    site ? siteLat : null,
    site ? siteLng : null,
    siteRadius,
    site?.name || assignment?.site,
    isOnSite,
    isNavigating,
    layerType
  );

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.navigate('Home')}>
          <Ionicons name="chevron-back" size={26} color="#1E5ADB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Map & Geofence</Text>
        <View style={styles.headerIcon} />
      </View>

      {/* GPS error banner if location permission denied */}
      {locationError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={18} color="#92400E" style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{locationError}</Text>
        </View>
      )}

      <View style={styles.mapContainer}>
        {/* Top In-App Navigation Guidance HUD Banner */}
        {isNavigating && (
          <View style={[styles.navHUD, { top: 14 }]}>
            <View style={styles.navHUDIconBg}>
              <Ionicons name="navigate-sharp" size={22} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navHUDTitle}>Navigating to {typeof site?.name === 'string' ? site.name : (typeof assignment?.site === 'string' ? assignment.site : 'Site')}</Text>
              <Text style={styles.navHUDSub}>
                {distance !== null ? `${distance} meters away` : 'Calculating route...'} • Live Guided Navigation
              </Text>
            </View>
            <TouchableOpacity style={styles.stopNavBtn} onPress={toggleNavigation}>
              <Ionicons name="close-circle" size={24} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* Multi-Site Assignment Switcher */}
        {assignedSitesList && assignedSitesList.length > 1 && (
          <View style={[styles.siteSwitcherBar, isNavigating ? { top: 90 } : { top: 14 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.siteSwitcherScroll}>
              {assignedSitesList.map((sItem, sIdx) => {
                const isSelected = (site?.name || '').toLowerCase() === sItem.siteName.toLowerCase();
                return (
                  <TouchableOpacity
                    key={sItem.id || `msite_${sIdx}`}
                    onPress={() => selectSite(sItem)}
                    style={[styles.sitePill, isSelected && styles.sitePillActive]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="location" size={13} color={isSelected ? '#FFFFFF' : '#4F46E5'} />
                    <Text style={[styles.sitePillText, isSelected && styles.sitePillTextActive]}>
                      {sItem.siteName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 100% Stable Leaflet WebView Map */}
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: leafletHtml }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text style={{ marginTop: 12, color: '#6B7280', fontWeight: '500' }}>Loading Interactive Map...</Text>
            </View>
          )}
        />

        {/* Floating Map Controls */}
        <View style={[styles.floatingControls, isNavigating && { top: 80 }]}>
          <View style={styles.layersMenuContainer}>
            {showLayers && (
              <View style={styles.layersMenu}>
                <TouchableOpacity style={styles.layerOption} onPress={() => handleLayerChange('osm')}>
                  <Text style={[styles.layerText, layerType === 'osm' && styles.layerTextActive]}>Street</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerOption} onPress={() => handleLayerChange('satellite')}>
                  <Text style={[styles.layerText, layerType === 'satellite' && styles.layerTextActive]}>Satellite</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerOption} onPress={() => handleLayerChange('terrain')}>
                  <Text style={[styles.layerText, layerType === 'terrain' && styles.layerTextActive]}>Terrain</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.fab} onPress={() => setShowLayers(!showLayers)}>
              <Ionicons name="layers" size={20} color="#1E5ADB" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.fab} onPress={centerOnSite}>
            <Ionicons name="business" size={22} color="#1E5ADB" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.fab} onPress={centerOnUser}>
            <Ionicons name="locate" size={22} color="#1E5ADB" />
          </TouchableOpacity>
        </View>

        {/* Modern Bottom Card */}
        {site ? (
          <View style={styles.bottomCard}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.siteName}>{typeof site?.name === 'string' ? site.name : (typeof assignment?.site === 'string' ? assignment.site : 'Assigned Site')}</Text>
                <Text style={styles.distanceText} numberOfLines={1}>
                  {distance !== null ? `${distance}m away` : 'Locating GPS...'} • Geofence Radius: {siteRadius}m
                </Text>
              </View>
              <View style={[styles.badge, isOnSite ? styles.onSiteBadge : styles.offSiteBadge]}>
                <View style={[styles.dot, { backgroundColor: isOnSite ? '#10B981' : '#F59E0B' }]} />
                <Text style={[styles.badgeText, { color: isOnSite ? '#065F46' : '#92400E' }]}>
                  {isOnSite ? 'Within Geofence' : 'Outside Geofence'}
                </Text>
              </View>
            </View>

            <View style={styles.addressRow}>
              <Ionicons name="location" size={16} color="#6B7280" style={{ marginTop: 2 }} />
              <Text style={styles.addressText} numberOfLines={2}>
                {typeof site?.address === 'string' ? site.address : (typeof assignment?.address === 'string' ? assignment.address : 'Registered Worksite Address')}
              </Text>
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.primaryActionBtn, isNavigating && { backgroundColor: '#EF4444' }]}
                onPress={toggleNavigation}
              >
                <Ionicons name={isNavigating ? 'close' : 'navigate'} size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.primaryActionText}>
                  {isNavigating ? 'Stop Guidance' : 'Start Route Guidance'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.externalMapBtn}
                onPress={openExternalMaps}
              >
                <Ionicons name="open-outline" size={18} color="#4F46E5" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.bottomCard}>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Ionicons name="information-circle-outline" size={32} color="#9CA3AF" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 6 }}>No Active Site Assignment</Text>
              <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4, paddingHorizontal: 16 }}>
                Once your administrator schedules your shift, the worksite and geofence boundary will appear here.
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    zIndex: 10,
  },
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  errorBanner: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#92400E',
    fontSize: 12,
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  floatingControls: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 12,
    zIndex: 20,
  },
  layersMenuContainer: {
    position: 'relative',
    alignItems: 'flex-end',
  },
  layersMenu: {
    position: 'absolute',
    right: 56,
    top: 0,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    width: 100,
  },
  layerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  layerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  layerTextActive: {
    color: '#1E5ADB',
  },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  navHUD: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  navHUDIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  navHUDTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  navHUDSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  stopNavBtn: {
    padding: 4,
    marginLeft: 8,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  siteName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F2937',
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  onSiteBadge: {
    backgroundColor: '#D1FAE5',
  },
  offSiteBadge: {
    backgroundColor: '#FEF3C7',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  addressText: {
    fontSize: 12,
    color: '#4B5563',
    flex: 1,
    lineHeight: 17,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  externalMapBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  siteSwitcherBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
  },
  siteSwitcherScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  sitePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sitePillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  sitePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  sitePillTextActive: {
    color: '#FFFFFF',
  },
});
