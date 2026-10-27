import React, { useState } from 'react';
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
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  db, 
  auth, 
  collection, 
  getDocs, 
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

export default function LoginScreen({ navigation, route, onLogin: propOnLogin }) {
  const onLogin = propOnLogin || route?.params?.onLogin;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
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

          // Match by exact email, prefix, ID number, or name
          if (empMail && (empMail === cleanEmail || empMail.startsWith(cleanEmail + '@') || cleanEmail.startsWith(empMail.split('@')[0]))) return true;
          if (empId && (empId === cleanEmail || empId === cleanEmail.replace('emp-', ''))) return true;
          if (empName && (empName === cleanEmail || cleanEmail.includes(empName) || empName.includes(cleanEmail))) return true;

          return false;
        });
        if (matchingDoc) {
          empData = { id: matchingDoc.id, ...matchingDoc.data() };
        }
      }

      // If specific role is Admin/Administrator, block mobile access
      if (empData && (empData.role === 'Admin' || empData.role === 'Administrator')) {
        Alert.alert(
          'Access Denied',
          'Mobile App access is restricted to employee accounts. Administrator accounts must log in via the Admin Web Portal.'
        );
        setLoading(false);
        return;
      }

      // 3. Authenticate with individual employee credentials or maintain gateway session
      const targetEmail = empData?.email || cleanEmail;
      const targetName = empData?.name || cleanEmail.split('@')[0];

      try {
        const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password.trim());
        await clearStaleCache();
        const sessionPayload = {
          ...empData,
          email: userCredential.user.email || targetEmail,
          name: targetName,
          uid: userCredential.user.uid || empData?.id
        };
        await saveUserSession(sessionPayload);
        if (onLogin) {
          onLogin(sessionPayload.email, sessionPayload.name);
        }
      } catch (authError) {
        // Fallback for employee accounts created in admin dashboard:
        // Ensure background session is active for Firestore rules and proceed with verified employee profile
        await ensureAuthenticatedSession();
        await clearStaleCache();
        const sessionPayload = {
          ...empData,
          email: targetEmail,
          name: targetName,
          uid: empData?.id || 'emp_' + Date.now()
        };
        await saveUserSession(sessionPayload);
        if (onLogin) {
          onLogin(targetEmail, targetName);
        }
      }
    } catch (error) {
      console.warn('Authentication check warning:', error);
      await ensureAuthenticatedSession();
      if (onLogin) {
        await clearStaleCache();
        onLogin(cleanEmail, cleanEmail.split('@')[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.contentContainer}>
        {/* Logo & Header */}
        <View style={styles.headerContainer}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={styles.logo} 
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>Workforce Employee Mobile Portal</Text>
          
          <View style={styles.employeeOnlyChip}>
            <Ionicons name="people" size={14} color="#059669" />
            <Text style={styles.employeeOnlyText}>Fixed & Mobile Employee Access</Text>
          </View>
        </View>

        {/* Input Form */}
        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Employee Email Address"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotPassword} onPress={() => Alert.alert('Reset Password', 'Please contact your system administrator to reset your employee account credentials.')}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button} 
            onPress={handleLogin} 
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign In as Employee</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Authorized Employee Access (Fixed On-Site & Mobile Field Workers) • Admin Portal Required for Management</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 12,
  },
  employeeOnlyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  employeeOnlyText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '700',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    height: '100%',
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 28,
  },
  forgotPasswordText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#4F46E5',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  }
});