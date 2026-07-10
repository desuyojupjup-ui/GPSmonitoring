import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, UrlTile, Circle, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { auth, db, collection, addDoc, serverTimestamp, query, where, getDocs, onSnapshot, orderBy, limit } from '../firebase';
import { Ionicons } from '@expo/vector-icons';
import FloatingChatButton from '../components/FloatingChatButton';

// ─── Location Pin Marker with Animated Pulse ─────────────────────────────────
function LocationPinMarker({ profilePic, initials, color = '#3B82F6', size = 52 }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.9, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 0,    useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.5, duration: 0,  useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  const tailSize  = size * 0.28;
  const imgSize   = size * 0.72;

  return (
    <View style={{ alignItems: 'center', width: size + 20 }}>
      {/* Pulse ring */}
      <Animated.View style={{
        position: 'absolute',
        top: 0, left: 10,
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: pulseOpacity,
        transform: [{ scale: pulseAnim }],
      }} />

      {/* Pin circle body */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 3, borderColor: 'white',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: color, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
        overflow: 'hidden',
      }}>
        <View style={{
          width: imgSize, height: imgSize, borderRadius: imgSize / 2,
          overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.15)',
        }}>
          {profilePic ? (
            <Image source={{ uri: profilePic }} style={{ width: imgSize, height: imgSize, borderRadius: imgSize / 2 }} resizeMode="cover" />
          ) : (
            <Text style={{ fontSize: size * 0.24, fontWeight: '900', color: 'white', letterSpacing: -0.5 }}>{initials}</Text>
          )}
        </View>
      </View>

      {/* Pin tail */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: tailSize, borderRightWidth: tailSize, borderTopWidth: tailSize * 1.4,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color,
        marginTop: -2,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2, shadowRadius: 4,
      }} />
    </View>
  );
}

// ─── Site Pin Marker ──────────────────────────────────────────────────────────
function SitePinMarker({ isOnSite }) {
  const color = isOnSite ? '#10B981' : '#4F46E5';
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: color,
        borderWidth: 3, borderColor: 'white',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: color, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
      }}>
        <Ionicons name="business" size={16} color="white" />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color,
        marginTop: -2,
      }} />
    </View>
  );
}


export default function MapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState(null);
  const [site, setSite] = useState(null);
  const [distance, setDistance] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [layerType, setLayerType] = useState('osm'); // osm, satellite, terrain
  const [showLayers, setShowLayers] = useState(false);
  
  const mapRef = useRef(null);
  const locationSubscription = useRef(null);

  const email = auth.currentUser?.email;

  useEffect(() => {
    if (!email) return;
    const qEmp = query(collection(db, 'employees'), where('email', '==', email));
    const unsubEmp = onSnapshot(qEmp, (empSnap) => {
      if (!empSnap.empty) {
        const empData = { id: empSnap.docs[0].id, ...empSnap.docs[0].data() };
        setEmployee(empData);
        
        // Fetch active assignment
        const qAssign = query(collection(db, 'Assignments'), where('empName', '==', empData.name), where('status', '==', 'Active'));
        onSnapshot(qAssign, (snapshot) => {
          if (!snapshot.empty) {
            const assignData = snapshot.docs[0].data();
            if (assignData.site) {
              getDocs(query(collection(db, 'Sites'), where('name', '==', assignData.site))).then(s => {
                if (!s.empty) setSite({ id: s.docs[0].id, ...s.docs[0].data() });
              });
            }
          } else {
            setSite(null);
          }
        });
        
        // Fetch historical route for today
        const fetchRoute = async () => {
          try {
            const rQ = query(collection(db, 'LocationLogs'), where('employee_id', '==', empData.id), limit(50));
            const rSnap = await getDocs(rQ);
            let pts = [];
            rSnap.forEach(d => {
              const data = d.data();
              if(data.latitude && data.longitude) {
                pts.push({ latitude: data.latitude, longitude: data.longitude, ts: data.timestamp?.toMillis?.() || 0 });
              }
            });
            pts.sort((a,b) => a.ts - b.ts);
            setRouteCoords(pts.map(p => ({ latitude: p.latitude, longitude: p.longitude })));
          } catch(e) {}
        };
        fetchRoute();
      }
    });
    return () => unsubEmp();
  }, [email]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }
      let currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(currentLoc.coords);
      startTracking();
    })();
    return () => {
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
        setRouteCoords(prev => [...prev, { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude }]);
        updateLocationToFirebase(newLoc.coords);
        calculateDistance(newLoc.coords);
      }
    );
  };

  const updateLocationToFirebase = async (coords) => {
    if (employee) {
      try {
        await addDoc(collection(db, 'LocationLogs'), {
          employee_id: employee.id,
          employeeName: employee.name,
          latitude: coords.latitude,
          longitude: coords.longitude,
          timestamp: serverTimestamp(),
          speed: coords.speed || 0,
        });
      } catch (error) {
        console.error(error);
      }
    }
  };

  const calculateDistance = (currentCoords) => {
    if (site?.lat && site?.lng) {
      const R = 6371e3;
      const φ1 = currentCoords.latitude * Math.PI/180;
      const φ2 = site.lat * Math.PI/180;
      const Δφ = (site.lat - currentCoords.latitude) * Math.PI/180;
      const Δλ = (site.lng - currentCoords.longitude) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      setDistance(Math.round(R * c));
    }
  };

  useEffect(() => {
    if (location && site) calculateDistance(location);
  }, [location, site]);

  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
    }
  };

  const siteRadius = site?.radius ? parseInt(site.radius.toString().replace('m', '')) : 100;
  const isOnSite = distance !== null && distance <= siteRadius;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#1E5ADB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Navigation</Text>
        <View style={styles.headerIcon} />
      </View>

      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            mapType={layerType === 'satellite' ? 'satellite' : 'none'}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={true}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            {layerType === 'osm' && (
              <UrlTile urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
            )}
            {layerType === 'terrain' && (
              <UrlTile urlTemplate="https://a.tile.opentopomap.org/{z}/{x}/{y}.png" maximumZ={17} flipY={false} />
            )}

            {site?.lat && site?.lng && (
              <>
                <Circle
                  center={{ latitude: site.lat, longitude: site.lng }}
                  radius={siteRadius}
                  fillColor={isOnSite ? "rgba(16, 185, 129, 0.12)" : "rgba(79, 70, 229, 0.12)"}
                  strokeColor={isOnSite ? "rgba(16, 185, 129, 0.6)" : "rgba(79, 70, 229, 0.6)"}
                  strokeWidth={2}
                />
                {/* Dashed inner ring */}
                <Circle
                  center={{ latitude: site.lat, longitude: site.lng }}
                  radius={siteRadius * 0.6}
                  fillColor="transparent"
                  strokeColor={isOnSite ? "rgba(16,185,129,0.3)" : "rgba(79,70,229,0.3)"}
                  strokeWidth={1}
                />
                <Marker
                  coordinate={{ latitude: site.lat, longitude: site.lng }}
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges={false}
                >
                  <SitePinMarker isOnSite={isOnSite} />
                </Marker>
              </>
            )}

            {/* Route Polyline */}
            {routeCoords.length > 1 && (
              <Polyline coordinates={routeCoords} strokeColor="#3B82F6" strokeWidth={5} lineDashPattern={[1, 5]} lineCap="round" />
            )}
            
            {/* Employee Location Pin */}
            <Marker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={999}
              tracksViewChanges={true}
            >
              <LocationPinMarker
                profilePic={employee?.profilePic}
                initials={employee?.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'ME'}
                color={isOnSite ? '#10B981' : '#3B82F6'}
                size={54}
              />
            </Marker>
          </MapView>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={{ marginTop: 12, color: '#6B7280', fontWeight: '500' }}>Acquiring GPS Signal...</Text>
          </View>
        )}

        {/* Floating Map Controls */}
        <View style={styles.floatingControls}>
          <View style={styles.layersMenuContainer}>
            {showLayers && (
              <View style={styles.layersMenu}>
                <TouchableOpacity style={styles.layerOption} onPress={() => { setLayerType('osm'); setShowLayers(false); }}>
                  <Text style={[styles.layerText, layerType === 'osm' && styles.layerTextActive]}>Street</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerOption} onPress={() => { setLayerType('satellite'); setShowLayers(false); }}>
                  <Text style={[styles.layerText, layerType === 'satellite' && styles.layerTextActive]}>Satellite</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerOption} onPress={() => { setLayerType('terrain'); setShowLayers(false); }}>
                  <Text style={[styles.layerText, layerType === 'terrain' && styles.layerTextActive]}>Terrain</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.fab} onPress={() => setShowLayers(!showLayers)}>
              <Ionicons name="layers" size={20} color="#1E5ADB" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.fab} onPress={centerOnUser}>
            <Ionicons name="locate" size={22} color="#1E5ADB" />
          </TouchableOpacity>
        </View>

        {/* Modern Glass Bottom Card */}
        {site && (
          <View style={styles.bottomCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.siteName}>{site.name}</Text>
                <Text style={styles.distanceText}>
                  <Ionicons name="navigate-circle" size={14} color="#6B7280" /> {distance !== null ? `${distance} meters away` : 'Calculating...'}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: isOnSite ? '#D1FAE5' : '#FEF3C7' }]}>
                <View style={[styles.badgeDot, { backgroundColor: isOnSite ? '#10B981' : '#F59E0B' }]} />
                <Text style={[styles.badgeText, { color: isOnSite ? '#065F46' : '#92400E' }]}>{isOnSite ? 'On Site' : 'In Transit'}</Text>
              </View>
            </View>
            
            <View style={styles.cardFooter}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Tracking</Text>
                <Text style={styles.statValue}>Active</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Distance Logged</Text>
                <Text style={styles.statValue}>{routeCoords.length * 10}m</Text>
              </View>
            </View>
          </View>
        )}
        <FloatingChatButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerIcon: { padding: 4, width: 40 },
  headerTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  mapContainer: { flex: 1, overflow: 'hidden' },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  
  floatingControls: { position: 'absolute', right: 16, top: 20, alignItems: 'flex-end', gap: 12 },
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  layersMenuContainer: { alignItems: 'flex-end', gap: 8 },
  layersMenu: { backgroundColor: 'white', borderRadius: 12, padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 },
  layerOption: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  layerText: { fontSize: 14, color: '#4B5563', fontWeight: '500' },
  layerTextActive: { color: '#1E5ADB', fontWeight: '700' },

  bottomCard: { position: 'absolute', bottom: 90, left: 16, right: 16, backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: 20, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,1)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  siteName: { fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 4 },
  distanceText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  
  cardFooter: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 12, padding: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB' },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 2 },
  statValue: { fontSize: 14, color: '#111827', fontWeight: '800' },
});

