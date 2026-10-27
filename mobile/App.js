import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { auth, onAuthStateChanged, signOut, loadUserSession, saveUserSession, subscribeToLogout, performGlobalLogout } from './src/firebase';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import TasksScreen from './src/screens/TasksScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ChatbotScreen from './src/screens/ChatbotScreen';
import SecurityStatusScreen from './src/screens/SecurityStatusScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import AnomalyAlertsScreen from './src/screens/AnomalyAlertsScreen';

import FloatingChatButton from './src/components/FloatingChatButton';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator({ route }) {
  const user = route?.params?.user;
  const onLogout = route?.params?.onLogout;

  return (
    <Tab.Navigator
      screenOptions={({ route: tabRoute }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (tabRoute.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (tabRoute.name === 'Map') iconName = focused ? 'map' : 'map-outline';
          else if (tabRoute.name === 'Tasks') iconName = focused ? 'clipboard' : 'clipboard-outline';
          else if (tabRoute.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          backgroundColor: '#ffffff',
          position: 'absolute',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} initialParams={{ user }} />
      <Tab.Screen name="Map" component={MapScreen} initialParams={{ user }} />
      <Tab.Screen name="Tasks" component={TasksScreen} initialParams={{ user }} />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ user, onLogout }} />
    </Tab.Navigator>
  );
}

import presenceService from './src/services/presenceService';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Track whether Firebase has fired its first auth event.
  // During cold start Firebase takes a moment to restore the persisted token;
  // we must NOT treat that transient null as "logged out".
  const authInitialized = React.useRef(false);

  useEffect(() => {
    let unsubscribe = () => {};

    // First restore our own AsyncStorage session so the splash screen
    // can show the cached user while Firebase catches up.
    loadUserSession().then((cachedUser) => {
      if (cachedUser) {
        const cached = typeof cachedUser === 'object' ? cachedUser : null;
        if (cached?.email && !cached.email.toLowerCase().includes('admin@')) {
          setUser(cached);
          presenceService.startPresence(cached);
        }
      }

      unsubscribe = onAuthStateChanged(auth, (authUser) => {
        authInitialized.current = true;
        // CRITICAL: We only adopt authUser if it is a real employee and NOT the internal admin gateway account
        if (authUser && !authUser.email?.toLowerCase().includes('admin@')) {
          const userData = {
            email: authUser.email,
            name: authUser.displayName || authUser.email.split('@')[0],
          };
          saveUserSession(userData); // persist so next cold start restores immediately
          setUser(userData);
          presenceService.startPresence(userData);
        }
        // NOTE: We do NOT clear saveUserSession(null) here when authUser is null!
        // Employees created by admin in Firestore or offline sessions will have authUser=null.
        // Sessions are ONLY cleared when the user explicitly taps Logout (handleLogout).
        setLoading(false);
      });
    }).catch(() => {
      authInitialized.current = true;
      setLoading(false);
    });

    return () => {
      unsubscribe();
      presenceService.stopPresence();
    };
  }, []);

  // Global logout listener to immediately clear user state
  useEffect(() => {
    const unsubLogout = subscribeToLogout(() => {
      setUser(null);
    });
    return () => unsubLogout();
  }, []);

  const handleLogin = (email, name) => {
    const userData = { email, name: name || email.split('@')[0] || 'User' };
    saveUserSession(userData); // ← persist so session survives app close/reopen
    setUser(userData);
    presenceService.startPresence(userData);
  };

  const handleLogout = async () => {
    setUser(null);
    try {
      presenceService.stopPresence(user).catch(() => {});
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
    await performGlobalLogout();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4F46E5', padding: 20 }}>
        <Image
          source={require('./assets/logo.png')}
          style={{ width: 100, height: 100, marginBottom: 18 }}
          resizeMode="contain"
        />
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5, marginBottom: 6 }}>
          SubAi
        </Text>
        <Text style={{ fontSize: 13, color: '#E0E7FF', marginBottom: 28, fontWeight: '500' }}>
          Workforce Intelligence & Field Operations
        </Text>
        <ActivityIndicator size="small" color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <>
              <Stack.Screen name="Main" component={TabNavigator} initialParams={{ user, onLogout: handleLogout }} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} initialParams={{ user }} />
              <Stack.Screen name="Chatbot" component={ChatbotScreen} initialParams={{ user }} />
              <Stack.Screen name="SecurityStatus" component={SecurityStatusScreen} initialParams={{ user }} />
              <Stack.Screen name="Attendance" component={AttendanceScreen} initialParams={{ user }} />
              <Stack.Screen name="AnomalyAlerts" component={AnomalyAlertsScreen} initialParams={{ user }} />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} initialParams={{ onLogin: handleLogin }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {user && <FloatingChatButton user={user} />}
    </View>
  );
}