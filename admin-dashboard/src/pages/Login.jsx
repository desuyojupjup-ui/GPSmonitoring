import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Mail, Lock, Eye, EyeOff, ArrowRight, Activity, ShieldCheck, 
  PieChart, Users, LogOut, LayoutDashboard, AlertCircle, CheckCircle2, ShieldAlert
} from 'lucide-react';
import Swal from 'sweetalert2';
import bgImage from '../assets/background.png';
import logoImage from '../assets/logo.png';
import { showToast } from '../utils/toast';
import { 
  auth, 
  isRealFirebaseConfigured, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  resetAdminPassword
} from '../firebase';

export default function Login({ onLogin, currentUser, onLogout }) {
  const navigate = useNavigate();
  
  // Login input state (clean, no dummy values)
  const [email, setEmail] = useState(() => localStorage.getItem('subai_remembered_email') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('subai_remembered_email')));
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Handle Admin Sign In ──
  const handleLogin = async (e) => {
    e?.preventDefault?.();
    setError('');

    const cleanEmail = (email || '').trim();
    if (!cleanEmail) {
      setError('Please enter your administrator email address.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setLoading(true);

    if (rememberMe) {
      localStorage.setItem('subai_remembered_email', cleanEmail);
    } else {
      localStorage.removeItem('subai_remembered_email');
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const authenticatedUser = userCredential.user;
      
      showToast('Authentication Successful', `Welcome back, ${authenticatedUser.displayName || authenticatedUser.email}!`, 'success');
      
      onLogin(authenticatedUser.email || cleanEmail, password, {
        uid: authenticatedUser.uid,
        name: authenticatedUser.displayName || cleanEmail.split('@')[0],
        role: authenticatedUser.role || 'Super Admin'
      });
    } catch (err) {
      console.error('Sign-in error:', err);
      let errorMsg = 'Invalid email or password. Please verify your credentials.';
      if (err.code === 'auth/user-not-found' || err.message?.includes('No administrator account')) {
        errorMsg = 'No administrator account found with this email address.';
      } else if (err.code === 'auth/wrong-password' || err.message?.includes('Incorrect password')) {
        errorMsg = 'Incorrect password. Please verify your credentials or reset your password.';
      } else if (err.code === 'auth/user-disabled' || err.message?.includes('inactive')) {
        errorMsg = 'This administrator account has been deactivated. Please contact your Super Administrator.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed attempts. Please wait a few minutes before trying again.';
      } else if (err.code === 'auth/invalid-credential') {
        errorMsg = 'Invalid login credentials. Please check your email and password.';
      } else if (err.message) {
        errorMsg = err.message.replace('Firebase: ', '');
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // ── Handle Password Reset ──
  const handleForgotPassword = async () => {
    const { value: targetEmail } = await Swal.fire({
      title: 'Reset Password',
      text: 'Enter your registered administrator email address to reset password:',
      input: 'email',
      inputValue: email || '',
      inputPlaceholder: 'admin@subai.com',
      showCancelButton: true,
      confirmButtonText: 'Proceed',
      cancelButtonText: 'Cancel',
      buttonsStyling: false,
      customClass: {
        popup: 'premium-delete-modal',
        title: 'premium-modal-title',
        htmlContainer: 'premium-modal-text',
        confirmButton: 'premium-confirm-btn',
        cancelButton: 'premium-cancel-btn',
        input: 'premium-modal-input'
      },
      inputValidator: (val) => {
        if (!val || !/\S+@\S+\.\S+/.test(val)) {
          return 'Please enter a valid email address.';
        }
      }
    });

    if (!targetEmail) return;

    try {
      if (isRealFirebaseConfigured) {
        await sendPasswordResetEmail(auth, targetEmail);
        Swal.fire({
          title: 'Reset Link Sent',
          text: `A password reset link has been dispatched to ${targetEmail}. Please check your inbox.`,
          icon: 'success',
          confirmButtonText: 'OK',
          buttonsStyling: false,
          customClass: { popup: 'premium-delete-modal', confirmButton: 'premium-confirm-btn' }
        });
      } else {
        // Local Admin Authentication Password Reset Prompt
        const { value: newPassword } = await Swal.fire({
          title: 'Set New Password',
          text: `Enter new security password for ${targetEmail}:`,
          input: 'password',
          inputPlaceholder: 'Minimum 6 characters',
          showCancelButton: true,
          confirmButtonText: 'Update Password',
          cancelButtonText: 'Cancel',
          buttonsStyling: false,
          customClass: {
            popup: 'premium-delete-modal',
            title: 'premium-modal-title',
            htmlContainer: 'premium-modal-text',
            confirmButton: 'premium-confirm-btn',
            cancelButton: 'premium-cancel-btn',
            input: 'premium-modal-input'
          },
          inputValidator: (val) => {
            if (!val || val.length < 6) {
              return 'New password must be at least 6 characters.';
            }
          }
        });

        if (newPassword) {
          await resetAdminPassword(targetEmail, newPassword);
          showToast('Password Updated', 'Your administrator password has been updated. You can now sign in.', 'success');
          setEmail(targetEmail);
          setPassword(newPassword);
        }
      }
    } catch (err) {
      Swal.fire({
        title: 'Reset Failed',
        text: err.message || 'Could not reset password. Please verify the email address.',
        icon: 'error',
        confirmButtonText: 'OK',
        buttonsStyling: false,
        customClass: { popup: 'premium-delete-modal', confirmButton: 'premium-confirm-btn' }
      });
    }
  };

  return (
    <div className="subai-login-page" style={{ minHeight: '100vh', display: 'flex', background: '#0B1120', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background Image Layer */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        backgroundImage: `url(${bgImage})`, 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        zIndex: 1,
        opacity: 0.95
      }}></div>

      {/* Subtle Dark Gradient Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(11, 17, 32, 0.88) 0%, rgba(15, 23, 42, 0.72) 50%, rgba(30, 58, 138, 0.45) 100%)',
        zIndex: 2
      }}></div>

      {/* Main Content Wrapper */}
      <div className="subai-login-wrapper" style={{ 
        width: '100%', 
        maxWidth: 1160, 
        margin: '0 auto', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        zIndex: 10, 
        position: 'relative', 
        padding: '40px 24px' 
      }}>
        
        {/* Left Side: Brand Story & System Features */}
        <div className="subai-login-left" style={{ flex: 1, paddingRight: 60, display: 'flex', flexDirection: 'column' }}>
          
          {/* Logo Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', marginBottom: 36, width: 'fit-content' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(16px)',
              padding: '10px 20px',
              borderRadius: 14,
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.5)'
            }}>
              <img src={logoImage} alt="SubAi Workforce Monitoring" style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }} />
            </div>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: 44, fontWeight: 800, color: 'white', lineHeight: 1.15, marginBottom: 18, letterSpacing: '-0.02em' }}>
            Enterprise Workforce<br/>
            Command <span style={{ color: '#38BDF8', background: 'linear-gradient(90deg, #38BDF8, #818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Center.</span>
          </h1>
          <p style={{ fontSize: 16, color: '#94A3B8', lineHeight: 1.6, maxWidth: 440, marginBottom: 36 }}>
            Real-time GPS telemetry, biometric attendance verification, and AI anomaly tracking for enterprise field operations.
          </p>

          {/* Feature Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 480 }}>
            {[
              { icon: <Activity size={18}/>, title: 'Real-time Telemetry', desc: 'Live GPS & geofencing' },
              { icon: <ShieldCheck size={18}/>, title: 'AI Anti-Spoofing', desc: 'Mock location detection' },
              { icon: <PieChart size={18}/>, title: 'Workforce Analytics', desc: 'Attendance & delay reports' },
              { icon: <Users size={18}/>, title: 'Dispatch & Roles', desc: 'Enterprise staff security' },
            ].map((f, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: 12,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
                padding: '12px 14px',
                borderRadius: 12
              }}>
                <div style={{ 
                  width: 34, 
                  height: 34, 
                  borderRadius: 8, 
                  background: 'rgba(56, 189, 248, 0.15)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  color: '#38BDF8', 
                  flexShrink: 0 
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{f.title}</div>
                  <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Admin Login Card */}
        <div className="subai-login-card" style={{ 
          width: 440, 
          background: 'white', 
          borderRadius: 24, 
          padding: '40px 34px', 
          display: 'flex', 
          flexDirection: 'column', 
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          position: 'relative'
        }}>
          
          {/* Card Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
              Admin Portal
            </h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
              Sign in to access SubAi Workforce Command Center
            </p>
          </div>

          {/* Active Session Notice (If already logged in) */}
          {currentUser && (
            <div style={{
              marginBottom: 20,
              padding: '12px 14px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#16A34A" />
                <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
                  Active Session: <strong>{currentUser.email}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  style={{
                    flex: 1,
                    background: '#16A34A',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <LayoutDashboard size={14} /> Open Dashboard
                </button>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    style={{
                      background: '#FEE2E2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      borderRadius: 6,
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <LogOut size={13} /> Sign Out
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Inline Error Message */}
          {error && (
            <div style={{ 
              padding: '11px 14px', 
              background: '#FEF2F2', 
              border: '1px solid #FCA5A5',
              color: '#991B1B', 
              borderRadius: 8, 
              fontSize: 13, 
              marginBottom: 18, 
              fontWeight: 500,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2, color: '#DC2626' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Admin Sign In Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* Email Field */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Administrator Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                  <Mail size={16} />
                </div>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  style={{ 
                    width: '100%', 
                    padding: '11px 12px 11px 38px', 
                    borderRadius: 8, 
                    border: '1px solid #CBD5E1', 
                    fontSize: 13, 
                    outline: 'none', 
                    transition: 'border 0.2s', 
                    color: '#0F172A',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                  onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                  <Lock size={16} />
                </div>
                <input 
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ 
                    width: '100%', 
                    padding: '11px 38px', 
                    borderRadius: 8, 
                    border: '1px solid #CBD5E1', 
                    fontSize: 13, 
                    outline: 'none', 
                    transition: 'border 0.2s', 
                    color: '#0F172A',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                  onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                />
                <div 
                  onClick={() => setShowPwd(!showPwd)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', cursor: 'pointer' }}
                  title={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </div>
              </div>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={rememberMe} 
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: '#2563EB', cursor: 'pointer' }} 
                />
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Remember email</span>
              </label>
              <span 
                onClick={handleForgotPassword}
                style={{ fontSize: 12, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}
              >
                Forgot Password?
              </span>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: '12px', 
                background: '#1D4ED8', 
                color: 'white', 
                border: 'none', 
                borderRadius: 8, 
                fontSize: 14, 
                fontWeight: 600, 
                cursor: loading ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: 8, 
                marginTop: 4, 
                transition: 'background 0.2s',
                boxShadow: '0 4px 12px rgba(29, 78, 216, 0.25)',
                opacity: loading ? 0.8 : 1
              }}
              onMouseOver={(e) => { if (!loading) e.target.style.background = '#1E40AF'; }}
              onMouseOut={(e) => { if (!loading) e.target.style.background = '#1D4ED8'; }}
            >
              {loading ? 'Authenticating...' : 'Sign In to Command Center'} <ArrowRight size={16} />
            </button>
          </form>

          {/* Security Notice Footer */}
          <div style={{ 
            marginTop: 26, 
            paddingTop: 18,
            borderTop: '1px solid #F1F5F9',
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 10,
            background: '#F8FAFC',
            padding: '12px 14px',
            borderRadius: 10
          }}>
            <ShieldAlert size={16} color="#64748B" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
              <strong style={{ color: '#334155' }}>Restricted System:</strong> Account creation is managed strictly by System Administrators. New Operations Managers and Dispatchers must be provisioned internally via Users & Roles.
            </div>
          </div>
        </div>
      </div>

      {/* Footer copyright */}
      <div style={{ position: 'absolute', bottom: 16, textAlign: 'center', width: '100%', color: '#64748B', fontSize: 12, fontWeight: 500, zIndex: 10 }}>
        © 2026 SubAi Workforce Monitoring. Enterprise Command Center.
      </div>

      {/* Responsive styling */}
      <style>{`
        @media (max-width: 900px) {
          .subai-login-wrapper {
            flex-direction: column !important;
            padding: 30px 16px 60px !important;
          }
          .subai-login-left {
            padding-right: 0 !important;
            margin-bottom: 24px !important;
            text-align: center;
            align-items: center;
          }
          .subai-login-left h1 {
            font-size: 32px !important;
          }
          .subai-login-left p {
            font-size: 14px !important;
            margin-bottom: 20px !important;
          }
          .subai-login-card {
            width: 100% !important;
            max-width: 440px !important;
            padding: 28px 20px !important;
          }
        }
      `}</style>
    </div>
  );
}