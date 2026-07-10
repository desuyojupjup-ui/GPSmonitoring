import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Activity, ShieldCheck, PieChart, Users } from 'lucide-react';
import bgImage from '../assets/background.png';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Simulate login delay
    setTimeout(() => {
      // Accept any credentials in demo mode
      if (email && password) {
        onLogin(email, password);
      } else {
        setError('Please enter email and password.');
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0F172A', position: 'relative', overflow: 'hidden' }}>
      
      {/* Full Screen Custom Background */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1 }}></div>

      {/* Main Content Wrapper */}
      <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', zIndex: 10, position: 'relative', padding: '20px' }}>
        
        {/* Left Side: Text Content */}
        <div style={{ flex: 1, paddingRight: 40, display: 'flex', flexDirection: 'column' }}>
          
          {/* Logo Area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 50 }}>
            <img src="/src/assets/logo.png" alt="GeoStride" style={{ width: 36, height: 36 }} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #FFFFFF, #93C5FD)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                GeoStride
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.15em' }}>ADMIN PORTAL</div>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: 42, fontWeight: 800, color: 'white', lineHeight: 1.1, marginBottom: 16 }}>
            Smart Tracking.<br/>
            Stronger <span style={{ color: '#60A5FA' }}>Teams.</span>
          </h1>
          <p style={{ fontSize: 15, color: '#94A3B8', lineHeight: 1.6, maxWidth: 400, marginBottom: 40 }}>
            Real-time monitoring, powerful analytics, and complete visibility of your field workforce.
          </p>

          {/* Feature List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { icon: <Activity size={18}/>, title: 'Real-time Tracking', desc: 'Live location of your employees' },
              { icon: <ShieldCheck size={18}/>, title: 'Secure & Reliable', desc: 'Enterprise-grade security' },
              { icon: <PieChart size={18}/>, title: 'Powerful Analytics', desc: 'Data-driven insights & reports' },
              { icon: <Users size={18}/>, title: 'Team Management', desc: 'Manage employees and assignments' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(30, 58, 138, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>{f.title}</div>
                  <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: White Login Card */}
        <div style={{ width: 420, background: 'white', borderRadius: 20, padding: '40px 32px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
          
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', marginBottom: 6, textAlign: 'center' }}>Welcome Back!</h2>
          <p style={{ fontSize: 13, color: '#64748B', marginBottom: 30, textAlign: 'center' }}>Sign in to continue to GeoStride Admin Portal</p>

          {error && (
            <div style={{ padding: 10, background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}><Mail size={16} /></div>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@geostride.com"
                  style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', transition: 'border 0.2s', color: '#0F172A' }}
                  onFocus={(e) => e.target.style.borderColor = '#3B82F6'}
                  onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}><Lock size={16} /></div>
                <input 
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ width: '100%', padding: '12px 38px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, outline: 'none', transition: 'border 0.2s', color: '#0F172A' }}
                  onFocus={(e) => e.target.style.borderColor = '#3B82F6'}
                  onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                />
                <div 
                  onClick={() => setShowPwd(!showPwd)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', cursor: 'pointer' }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </div>
              </div>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 14, height: 14, accentColor: '#4F46E5', cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Remember me</span>
              </label>
              <span style={{ fontSize: 12, color: '#4F46E5', fontWeight: 600, cursor: 'pointer' }}>Forgot Password?</span>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#4338CA'}
              onMouseOut={(e) => e.target.style.background = '#4F46E5'}
            >
              {loading ? 'Signing in...' : 'Sign In'} <ArrowRight size={16} />
            </button>
          </form>

          {/* Social Sign In */}
          <div style={{ marginTop: 30, textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ borderTop: '1px solid #E2E8F0', width: '100%', position: 'absolute' }}></div>
              <span style={{ background: 'white', padding: '0 10px', color: '#94A3B8', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', position: 'relative' }}>OR SIGN IN WITH</span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <button style={{ padding: '8px', background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" width="14" /> Google
              </button>
              <button style={{ padding: '8px', background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" width="14" /> Microsoft
              </button>
              <button style={{ padding: '8px', background: 'white', border: '1px solid #E2E8F0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <svg width="14" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg> Apple
              </button>
            </div>
          </div>

          <div style={{ marginTop: 'auto', textAlign: 'center', color: '#64748B', fontSize: 12, fontWeight: 500, paddingTop: 20 }}>
            Need help? <span style={{ color: '#4F46E5', fontWeight: 600, cursor: 'pointer' }}>Contact Administrator</span>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 20, textAlign: 'center', width: '100%', color: '#64748B', fontSize: 12, fontWeight: 500, zIndex: 10 }}>
        © 2026 GeoStride. All rights reserved.
      </div>
    </div>
  );
}
