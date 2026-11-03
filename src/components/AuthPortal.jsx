import React, { useState, useEffect } from 'react';
import { User, ShieldAlert, LogIn, Mail, Lock, UserPlus, Phone, KeyRound, ArrowLeft, AlertCircle, Clock, ShieldX } from 'lucide-react';

export default function AuthPortal({ onLogin, onRegister, onClose, initialStatus = '', initialError = '' }) {
  // Modes: 'client-login' | 'provider-login' | 'client-register' | 'client-verify-otp' | 'client-forgot-password' | 'client-reset-password'
  const [authMode, setAuthMode] = useState('client-login');
  
  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Registration Form States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAgeGroup, setRegAgeGroup] = useState('Adult');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  
  // Verification OTP States
  const [targetEmail, setTargetEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  // Reset Password Recovery States
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Status & Feedback States
  const [errorMsg, setErrorMsg] = useState(initialError);
  const [infoMsg, setInfoMsg] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [authBanner, setAuthBanner] = useState(initialStatus);

  useEffect(() => {
    if (initialStatus) {
      setAuthBanner(initialStatus);
    }
    if (initialError) {
      setErrorMsg(initialError);
    }
  }, [initialStatus, initialError]);

  const handleGoogleSignIn = () => {
    // Initiate secure server-side Google OAuth 2.0 authorization-code flow
    window.location.href = '/api/auth/google';
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setAuthBanner('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.unverified) {
          setTargetEmail(loginEmail.trim().toLowerCase());
          setAuthMode('client-verify-otp');
          setInfoMsg('Please verify your profile email using the registration OTP code.');
        } else {
          setErrorMsg(data.error || 'Authentication failed.');
        }
        setIsLoading(false);
        return;
      }

      onLogin(data.user);
    } catch (err) {
      setErrorMsg('Could not connect to backend server. Ensure Express is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const validateRegistration = () => {
    const errs = {};
    if (!regName.trim()) errs.name = 'Full name is required';
    if (!regEmail.trim()) {
      errs.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(regEmail)) {
      errs.email = 'Please enter a valid email';
    }
    if (!regPhone.trim()) {
      errs.phone = 'Phone number is required';
    } else if (!/^\+?[\d\s-]{8,15}$/.test(regPhone)) {
      errs.phone = 'Please enter a valid phone number';
    }
    if (!regPassword) {
      errs.password = 'Password is required';
    } else if (regPassword.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }
    if (regPassword !== regConfirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setAuthBanner('');

    if (!validateRegistration()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          name: regName,
          phone: regPhone,
          ageGroup: regAgeGroup
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Registration failed.');
        setIsLoading(false);
        return;
      }

      setTargetEmail(regEmail.trim().toLowerCase());
      setAuthMode('client-verify-otp');
      if (data.devOtp) {
        setInfoMsg(`Account drafted! (Dev Mode: Enter OTP code ${data.devOtp} to verify)`);
      } else {
        setInfoMsg('Account profile drafted! An email containing your 6-digit OTP verification code has been dispatched via Brevo.');
      }
    } catch (err) {
      setErrorMsg('Network error. Register request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setAuthBanner('');

    if (!otpCode.trim() || otpCode.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: targetEmail, otp: otpCode.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'OTP verification failed.');
        setIsLoading(false);
        return;
      }

      setInfoMsg('Verification successful! Account is activated.');
      setTimeout(() => {
        onLogin(data.user);
      }, 700);
    } catch (err) {
      setErrorMsg('Could not verify OTP. Network issue.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setAuthBanner('');

    if (!recoveryEmail.trim()) {
      setErrorMsg('Please specify your registered account email.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: recoveryEmail.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Failed to locate account.');
        setIsLoading(false);
        return;
      }

      setAuthMode('client-reset-password');
      if (data.devOtp) {
        setInfoMsg(`Recovery check complete! (Dev Mode: Enter reset OTP code ${data.devOtp})`);
      } else {
        setInfoMsg('Recovery check complete! A password reset OTP has been dispatched to your email.');
      }
    } catch (err) {
      setErrorMsg('Failed to process recovery request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setAuthBanner('');

    if (!recoveryOtp.trim() || !newPassword) {
      setErrorMsg('All fields are required.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: recoveryEmail, otp: recoveryOtp, newPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Reset password failed.');
        setIsLoading(false);
        return;
      }

      setAuthMode('client-login');
      setInfoMsg('Password successfully updated! You can now sign in using your new credentials.');
      setRecoveryEmail('');
      setRecoveryOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setErrorMsg('Password reset failed. Connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42, 71, 62, 0.4)', backdropFilter: 'blur(8px)', padding: '1rem' }}>
      <div className="glass-card auth-container" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', borderRadius: 'var(--radius-md)', position: 'relative', border: '1px solid rgba(255,255,255,0.8)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Close Button */}
        <button 
          type="button" 
          onClick={onClose} 
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--color-slate-light)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer' }}
          title="Return to Public View"
        >
          <XIcon />
        </button>

        {/* Tab Selector (only visible for standard logins) */}
        {(authMode === 'client-login' || authMode === 'provider-login') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(42,71,62,0.05)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem' }}>
            <button
              type="button"
              className={`tab-btn ${authMode === 'client-login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }}
              style={{ fontSize: '0.82rem', padding: '0.5rem 0' }}
            >
              <User size={14} style={{ marginRight: '0.35rem' }} /> Client Portal
            </button>
            <button
              type="button"
              className={`tab-btn ${authMode === 'provider-login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('provider-login'); setErrorMsg(''); setInfoMsg(''); }}
              style={{ fontSize: '0.82rem', padding: '0.5rem 0' }}
            >
              <ShieldAlert size={14} style={{ marginRight: '0.35rem' }} /> Staff & Admin
            </button>
          </div>
        )}

        {/* Form Title Headers */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', padding: 0, border: '2px solid rgba(42, 71, 62, 0.15)', boxShadow: '0 4px 12px rgba(42, 71, 62, 0.08)' }}>
              <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
          <h3 style={{ fontSize: '1.35rem', color: 'var(--color-slate-dark)', fontWeight: 700 }}>
            {authMode === 'client-login' && 'Sign In to Client Portal'}
            {authMode === 'provider-login' && 'Staff & Practitioner Sign In'}
            {authMode === 'client-register' && 'Register New Client Profile'}
            {authMode === 'client-verify-otp' && 'Verify Your Email'}
            {authMode === 'client-forgot-password' && 'Password Recovery'}
            {authMode === 'client-reset-password' && 'Configure New Password'}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', marginTop: '0.25rem' }}>
            {authMode === 'client-login' && 'Access your therapeutic plans, payments, and messaging.'}
            {authMode === 'provider-login' && 'Counsellor, Administrator, and Super Admin access.'}
            {authMode === 'client-register' && 'Join Verdant Mind care management program.'}
            {authMode === 'client-verify-otp' && `Enter the code sent to: ${targetEmail}`}
            {authMode === 'client-forgot-password' && 'Enter your email to receive recovery instructions.'}
            {authMode === 'client-reset-password' && 'Input recovery OTP code and your new password.'}
          </p>
        </div>

        {/* PROMINENT GOOGLE SIGN-IN BUTTON */}
        {(authMode === 'client-login' || authMode === 'provider-login') && (
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#FFFFFF',
                color: '#3C4043',
                border: '1px solid #DADCE0',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.9rem',
                fontWeight: 600,
                boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8F9FA'; e.currentTarget.style.borderColor = '#C6C8CC'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#DADCE0'; }}
            >
              <GoogleLogoSVG />
              <span>Continue with Google</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-slate-10)' }}></div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                or sign in with password
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-slate-10)' }}></div>
            </div>
          </div>
        )}

        {/* STATUS & AUDIT ERROR BANNERS */}
        {authBanner === 'pending_approval' && (
          <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', padding: '0.85rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <Clock size={18} color="#F57F17" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#E65100' }}>Account Awaiting Approval</strong>
              <p style={{ fontSize: '0.75rem', color: '#795548', margin: 0, lineHeight: 1.4 }}>
                Your Google account is registered. An administrator must approve your account and assign your clinical role before you can access portal records.
              </p>
            </div>
          </div>
        )}

        {authBanner === 'account_suspended' && (
          <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', padding: '0.85rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <ShieldX size={18} color="#C62828" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#B71C1C' }}>Account Suspended</strong>
              <p style={{ fontSize: '0.75rem', color: '#C62828', margin: 0, lineHeight: 1.4 }}>
                This account has been temporarily suspended by an administrator. Please contact clinical administration.
              </p>
            </div>
          </div>
        )}

        {authBanner === 'account_rejected' && (
          <div style={{ background: '#FBE9E7', border: '1px solid #FFCCBC', padding: '0.85rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertCircle size={18} color="#D84315" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.82rem', color: '#BF360C' }}>Registration Not Approved</strong>
              <p style={{ fontSize: '0.75rem', color: '#D84315', margin: 0, lineHeight: 1.4 }}>
                Your account application was reviewed and not approved.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: 'rgba(201,93,93,0.1)', color: 'var(--color-accent-terracotta)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div style={{ background: 'rgba(74,140,112,0.1)', color: '#2A5D48', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {infoMsg}
          </div>
        )}

        {/* 1. CLIENT & PROVIDER LOGIN FORM */}
        {(authMode === 'client-login' || authMode === 'provider-login') && (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {authMode === 'client-login' ? 'Account Email *' : 'Staff Email or Phone *'}
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                <input
                  type={authMode === 'client-login' ? 'email' : 'text'}
                  required
                  placeholder={authMode === 'client-login' ? 'e.g. client@example.com' : 'e.g. sabujd880@gmail.com'}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Password *</label>
                {authMode === 'client-login' && (
                  <button
                    type="button"
                    onClick={() => { setAuthMode('client-forgot-password'); setErrorMsg(''); setInfoMsg(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary-forest)', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                <input
                  type="password"
                  required
                  placeholder="Enter security password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="premium-btn"
              style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
            >
              <LogIn size={14} /> {isLoading ? 'Authenticating...' : 'Sign In'}
            </button>

            {authMode === 'client-login' && (
              <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                  New client?{' '}
                  <button
                    type="button"
                    onClick={() => { setAuthMode('client-register'); setErrorMsg(''); setInfoMsg(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary-forest)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Create Account
                  </button>
                </span>
              </div>
            )}
          </form>
        )}

        {/* 2. CLIENT REGISTRATION FORM */}
        {authMode === 'client-register' && (
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Full Legal Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Priya Sharma"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
              />
              {formErrors.name && <span style={{ color: 'var(--color-accent-terracotta)', fontSize: '0.7rem' }}>{formErrors.name}</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Email Address *</label>
              <input
                type="email"
                required
                placeholder="e.g. priya.sharma@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
              />
              {formErrors.email && <span style={{ color: 'var(--color-accent-terracotta)', fontSize: '0.7rem' }}>{formErrors.email}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Phone *</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Category</label>
                <select
                  value={regAgeGroup}
                  onChange={(e) => setRegAgeGroup(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem', background: '#fff' }}
                >
                  <option value="Adult">Adult (18-64)</option>
                  <option value="Teen">Teen (13-17)</option>
                  <option value="Child">Child (5-12)</option>
                  <option value="Senior">Senior (65+)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Min. 6 chars"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Confirm *</label>
                <input
                  type="password"
                  required
                  placeholder="Repeat pass"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="premium-btn"
              style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
            >
              <UserPlus size={14} /> {isLoading ? 'Drafting Profile...' : 'Complete Registration'}
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', color: 'var(--color-slate-light)', fontSize: '0.8rem', marginTop: '0.25rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <ArrowLeft size={12} /> Back to Sign In
            </button>
          </form>
        )}

        {/* 3. VERIFY REGISTRATION OTP FORM */}
        {authMode === 'client-verify-otp' && (
          <form onSubmit={handleVerifyOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>6-Digit Verification Code *</label>
              <input
                type="text"
                required
                maxLength="6"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', fontSize: '1.25rem', letterSpacing: '0.25em', textAlign: 'center', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontWeight: 700 }}
              />
            </div>

            <button type="submit" disabled={isLoading} className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
              <KeyRound size={14} /> {isLoading ? 'Verifying...' : 'Validate Code & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', color: 'var(--color-slate-light)', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <ArrowLeft size={12} /> Return to Sign In
            </button>
          </form>
        )}

        {/* 4. FORGOT PASSWORD FORM */}
        {authMode === 'client-forgot-password' && (
          <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Account Registered Email *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                <input
                  type="email"
                  required
                  placeholder="e.g. client@example.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
              Send Recovery OTP Code
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', color: 'var(--color-slate-light)', fontSize: '0.8rem', marginTop: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <ArrowLeft size={12} /> Back to Sign In
            </button>
          </form>
        )}

        {/* 5. RESET PASSWORD FORM */}
        {authMode === 'client-reset-password' && (
          <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Recovery OTP *</label>
              <input
                type="text"
                required
                maxLength="6"
                placeholder="Enter 6-digit reset OTP"
                value={recoveryOtp}
                onChange={(e) => setRecoveryOtp(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>New Password *</label>
              <input
                type="password"
                required
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Confirm New Password *</label>
              <input
                type="password"
                required
                placeholder="Re-enter password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
              />
            </div>

            <button type="submit" disabled={isLoading} className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              Reset & Update Password
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

function GoogleLogoSVG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
