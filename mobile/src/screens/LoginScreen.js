import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  db, 
  auth, 
  collection, 
  getDocs, 
  doc,
  updateDoc,
  signInWithEmailAndPassword, 
  saveUserSession,
  ensureAuthenticatedSession 
} from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Clears admin-owned cached collections so fresh data is fetched on login
const clearStaleCache = async () => {
  try {
    const keys = [
      'subai_store_Assignments',
      'subai_store_assignments',
      'subai_store_Sites',
      'subai_store_employees',
    ];
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.warn('Cache clear warning:', e);
  }
};

const { width } = Dimensions.get('window');
export const CARD_WIDTH = Math.min(width * 0.92, 400);

export default function LoginScreen({ navigation, route, onLogin: propOnLogin }) {
  const onLogin = propOnLogin || route?.params?.onLogin;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Load remembered email if previously stored
  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('@subai_remembered_email');
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch (err) {
        console.warn('Load remembered email error:', err);
      }
    };
    loadRememberedEmail();
  }, []);

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    // Block explicit Administrator accounts from accessing the mobile app
    if (cleanEmail.includes('admin') || cleanEmail.startsWith('admin@')) {
      Alert.alert(
        'Access Denied',
        'Mobile App access is restricted to employee accounts. Administrator accounts must log in via the Admin Web Portal.'
      );
      return;
    }

    setLoading(true);
    try {
      // 1. Ensure Firebase Auth session is active so Firestore Security Rules permit reading employees
      await ensureAuthenticatedSession();

      // 2. Fetch employee record from Firestore
      const allEmpSnap = await getDocs(collection(db, 'employees')).catch(() => ({ empty: true, docs: [] }));
      let empData = null;

      if (!allEmpSnap.empty) {
        const matchingDoc = allEmpSnap.docs.find(d => {
          const data = d.data();
          const empMail = (data.email || data.empEmail || '').trim().toLowerCase();
          const empId = (data.idNum || data.empId || data.employeeId || d.id || '').toString().trim().toLowerCase();
          const empName = (data.name || data.empName || '').trim().toLowerCase();

          // Match by exact email, prefix, ID number, or exact name
          if (empMail && empMail === cleanEmail) return true;
          if (empId && (empId === cleanEmail || empId === cleanEmail.replace('emp-', ''))) return true;
          if (empName && empName === cleanEmail) return true;

          return false;
        });

        if (matchingDoc) {
          empData = { id: matchingDoc.id, ...matchingDoc.data() };
        }
      }

      // CRITICAL SECURITY CHECK: Account MUST exist in the employees collection created by admin!
      if (!empData) {
        Alert.alert(
          'Account Not Found',
          'No employee profile was found for this account. Only employee accounts created by the administrator in the Admin Dashboard can log in.'
        );
        setLoading(false);
        return;
      }

      // Block Inactive Accounts
      if (empData.status && empData.status.toLowerCase() === 'inactive') {
        Alert.alert(
          'Account Inactive',
          'Your employee profile has been deactivated by the administrator. Please contact your supervisor.'
        );
        setLoading(false);
        return;
      }

      // Block Administrator roles
      const roleStr = (empData.role || '').toLowerCase();
      if (['admin', 'administrator', 'super admin', 'manager', 'supervisor', 'hr'].includes(roleStr)) {
        Alert.alert(
          'Access Denied',
          'Administrator accounts must log in via the Admin Web Portal. Mobile App is reserved for field employees.'
        );
        setLoading(false);
        return;
      }

      // 3. Strict Password Verification
      let passwordMatches = false;

      // Check 1: Does it match the assigned password on the employee's Firestore record?
      if (empData.password && typeof empData.password === 'string') {
        if (cleanPassword === empData.password.trim()) {
          passwordMatches = true;
        }
      }

      // Check 2: Try Firebase Auth signInWithEmailAndPassword with employee credentials
      if (!passwordMatches && empData.email) {
        try {
          const cred = await signInWithEmailAndPassword(auth, empData.email, cleanPassword);
          if (cred && cred.user) {
            passwordMatches = true;
          }
        } catch (_) {
          // Firebase Auth credentials didn't match
        }
      }

      // Check 3: If no password was explicitly saved on Firestore doc, verify default 'password123'
      if (!passwordMatches && !empData.password && cleanPassword === 'password123') {
        passwordMatches = true;
      }

      // If password does not match any valid credential, REJECT!
      if (!passwordMatches) {
        Alert.alert(
          'Invalid Password',
          'The password you entered is incorrect. Please check your credentials or contact your administrator.'
        );
        setLoading(false);
        return;
      }

      // 4. Authenticated successfully
      await clearStaleCache();
      const targetEmail = empData.email || cleanEmail;
      const targetName = empData.name || cleanEmail.split('@')[0];
      const sessionPayload = {
        ...empData,
        email: targetEmail,
        name: targetName,
        uid: empData.id || ('emp_' + Date.now()),
        status: 'Online',
        isOnline: true
      };

      if (empData.id && empData.id !== 'emp_fallback') {
        try {
          await updateDoc(doc(db, 'employees', empData.id), {
            status: 'Online',
            isOnline: true,
            lastLogin: new Date().toISOString(),
            lastActive: Date.now()
          });
        } catch (err) {
          console.warn('Set online status upon login warning:', err);
        }
      }

      // Persist or clear remembered email based on user preference
      try {
        if (rememberMe) {
          await AsyncStorage.setItem('@subai_remembered_email', cleanEmail);
        } else {
          await AsyncStorage.removeItem('@subai_remembered_email');
        }
      } catch (err) {
        console.warn('Remember me storage warning:', err);
      }

      await saveUserSession(sessionPayload);
      if (onLogin) {
        onLogin(sessionPayload.email, sessionPayload.name);
      }
    } catch (error) {
      console.warn('Authentication check warning:', error);
      Alert.alert(
        'Login Error',
        error?.message || 'Could not verify employee credentials. Please check your network connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Native Modern Login Card ── */}
          <View style={styles.card}>
            {/* Brand Logo Header */}
            <View style={styles.brandRow}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Title & Subtitle */}
            <Text style={styles.title}>Login</Text>
            <Text style={styles.subtitle}>
              Enter your assigned employee credentials to access presence tracking and field operations.
            </Text>

            {/* Divider line */}
            <View style={styles.divider} />

            {/* Input Form */}
            <View style={styles.formContainer}>
              {/* Email */}
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputBox}>
                <Ionicons name="mail-outline" size={18} color="#64748B" style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputBox}>
                <Ionicons name="lock-closed-outline" size={18} color="#64748B" style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                {/* Eye icon only appears once a password is being typed */}
                {password.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={18}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Remember Me Toggle */}
              <TouchableOpacity
                style={styles.rememberMeRow}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={rememberMe ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={rememberMe ? '#1D68EE' : '#94A3B8'}
                />
                <Text style={styles.rememberMeText}>Remember me</Text>
              </TouchableOpacity>

              {/* Login Pill Button */}
              <TouchableOpacity
                style={styles.button}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Authorized Employee Access • Fixed & Mobile Field Operations
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  brandRow: {
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  logo: {
    width: 120,
    height: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F275A',
    marginTop: 4,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 16,
    width: '100%',
  },
  formContainer: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  inputBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    height: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#0F172A',
    fontSize: 14,
  },
  fieldIcon: {
    marginRight: 10,
  },
  eyeBtn: {
    padding: 6,
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  rememberMeText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  button: {
    backgroundColor: '#1A6BFF',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A6BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 340,
  },
});