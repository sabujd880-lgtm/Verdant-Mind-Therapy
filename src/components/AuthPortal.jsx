import React, { useState } from 'react';
import { User, ShieldAlert, LogIn, Mail, Lock, UserPlus, Phone, KeyRound, ArrowLeft } from 'lucide-react';

export default function AuthPortal({ onLogin, onRegister, onClose }) {
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
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        // If unverified, shift client to OTP verification screen automatically
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

    if (!validateRegistration()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    if (!otpCode.trim() || otpCode.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, otp: otpCode })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'OTP verification failed.');
        setIsLoading(false);
        return;
      }

      // Automatically register the profile state inside App.jsx and log them in
      onRegister(data.user); 
      onLogin(data.user);
    } catch (err) {
      setErrorMsg('Verification failed. Unable to connect to backend.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!recoveryEmail.trim()) {
      setErrorMsg('Email address is required.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Recovery request failed.');
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
    <div className="auth-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42, 71, 62, 0.4)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-card auth-container" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem', borderRadius: 'var(--radius-md)', position: 'relative', border: '1px solid rgba(255,255,255,0.8)' }}>
        
        {/* Close Button */}
        <button 
          type="button" 
          onClick={onClose} 
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--color-slate-light)', display: 'flex' }}
          title="Return to Public View"
        >
          <XIcon />
        </button>

        {/* Tab Selector (only visible for standard logins) */}
        {(authMode === 'client-login' || authMode === 'provider-login') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(42,71,62,0.05)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', marginBottom: '2rem' }}>
            <button
              type="button"
              className={`tab-btn ${authMode === 'client-login' ? 'active' : ''}`}
              onClick={() => setAuthMode('client-login')}
              style={{ fontSize: '0.82rem', padding: '0.5rem 0' }}
            >
              <User size={14} style={{ marginRight: '0.35rem' }} /> Client Portal
            </button>
            <button
              type="button"
              className={`tab-btn ${authMode === 'provider-login' ? 'active' : ''}`}
              onClick={() => setAuthMode('provider-login')}
              style={{ fontSize: '0.82rem', padding: '0.5rem 0' }}
            >
              <ShieldAlert size={14} style={{ marginRight: '0.35rem' }} /> Provider Panel
            </button>
          </div>
        )}

        {/* Form Title Headers */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.4rem', color: 'var(--color-slate-dark)', fontWeight: 700 }}>
            {authMode === 'client-login' && 'Sign In to Client Portal'}
            {authMode === 'provider-login' && 'Provider Administration Sign In'}
            {authMode === 'client-register' && 'Register New Client Profile'}
            {authMode === 'client-verify-otp' && 'Verify Your Email'}
            {authMode === 'client-forgot-password' && 'Password Recovery'}
            {authMode === 'client-reset-password' && 'Configure New Password'}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', marginTop: '0.25rem' }}>
            {authMode === 'client-login' && 'Access your therapeutic plans, payments, and messaging.'}
            {authMode === 'provider-login' && 'Secure administrative access for Dr. Sabuj Das.'}
            {authMode === 'client-register' && 'Join Sabuj counseling management program.'}
            {authMode === 'client-verify-otp' && `Enter the code sent to: ${targetEmail}`}
            {authMode === 'client-forgot-password' && 'Enter your email to receive recovery instructions.'}
            {authMode === 'client-reset-password' && 'Input recovery OTP code and your new password.'}
          </p>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div style={{ padding: '0.65rem 0.8rem', background: 'var(--color-cancelled-bg)', color: 'var(--color-cancelled)', borderLeft: '3px solid var(--color-cancelled)', fontSize: '0.82rem', borderRadius: '4px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{errorMsg}</span>
          </div>
        )}
        {infoMsg && (
          <div style={{ padding: '0.65rem 0.8rem', background: 'var(--color-confirmed-bg)', color: 'var(--color-confirmed)', borderLeft: '3px solid var(--color-confirmed)', fontSize: '0.82rem', borderRadius: '4px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{infoMsg}</span>
          </div>
        )}

        {/* FORMS */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
            <div className="custom-scroll" style={{ width: '40px', height: '40px', border: '3px solid var(--color-slate-10)', borderTopColor: 'var(--color-slate)', borderRadius: '50%', animation: 'rotateCoil 1s linear infinite' }}></div>
            <span style={{ fontSize: '0.88rem', color: 'var(--color-slate)' }}>Processing your request...</span>
          </div>
        ) : (
          <>
            {/* 1. STANDARD LOGIN FORMS */}
            {(authMode === 'client-login' || authMode === 'provider-login') && (
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    {authMode === 'provider-login' ? 'Provider ID / Email' : 'Email Address'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                    <input
                      type={authMode === 'provider-login' ? "text" : "email"}
                      required
                      placeholder={authMode === 'provider-login' ? "9547691433" : "client@example.com"}
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Security Password</label>
                    {authMode === 'client-login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryEmail(loginEmail);
                          setAuthMode('client-forgot-password');
                          setErrorMsg('');
                          setInfoMsg('');
                        }}
                        style={{ fontSize: '0.75rem', color: 'var(--color-terracotta)', fontWeight: 600 }}
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
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                    />
                  </div>
                </div>

                <button type="submit" className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <LogIn size={16} /> Sign In
                </button>

                {authMode === 'client-login' && (
                  <div style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    <span style={{ color: 'var(--color-slate-light)' }}>First consultation? </span>
                    <button type="button" onClick={() => { setAuthMode('client-register'); setErrorMsg(''); setInfoMsg(''); }} style={{ color: 'var(--color-terracotta)', fontWeight: 600 }}>
                      Register Profile
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* 2. REGISTRATION FORM (CLIENTS ONLY) */}
            {authMode === 'client-register' && (
              <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
                  />
                  {formErrors.name && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.72rem' }}>{formErrors.name}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Phone Number *</label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                      <input
                        type="text"
                        required
                        placeholder="+91 99999 88888"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem 0.55rem 0.55rem 1.85rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.85rem' }}
                      />
                    </div>
                    {formErrors.phone && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.72rem' }}>{formErrors.phone}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Age Group</label>
                    <select
                      value={regAgeGroup}
                      onChange={(e) => setRegAgeGroup(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
                    >
                      <option value="Child">Child (Under 12)</option>
                      <option value="Teen">Teen (12-19)</option>
                      <option value="Adult">Adult (20-64)</option>
                      <option value="Senior">Senior (65+)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Email Address *</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                    <input
                      type="email"
                      required
                      placeholder="john.doe@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem 0.55rem 0.55rem 1.85rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.88rem' }}
                    />
                  </div>
                  {formErrors.email && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.72rem' }}>{formErrors.email}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 chars"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.85rem' }}
                    />
                    {formErrors.password && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.72rem' }}>{formErrors.password}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Confirm *</label>
                    <input
                      type="password"
                      required
                      placeholder="Confirm"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.85rem' }}
                    />
                    {formErrors.confirmPassword && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.72rem' }}>{formErrors.confirmPassword}</span>}
                  </div>
                </div>

                <button type="submit" className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <UserPlus size={16} /> Register Profile
                </button>

                <div style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  <span style={{ color: 'var(--color-slate-light)' }}>Already registered? </span>
                  <button type="button" onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }} style={{ color: 'var(--color-slate-dark)', fontWeight: 600 }}>
                    Sign In
                  </button>
                </div>
              </form>
            )}

            {/* 3. OTP VERIFICATION FORM */}
            {authMode === 'client-verify-otp' && (
              <form onSubmit={handleVerifyOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Enter 6-Digit OTP</label>
                  <div style={{ position: 'relative' }}>
                    <KeyRound size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
                    <input
                      type="text"
                      required
                      maxLength="6"
                      placeholder="e.g. 123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.25rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', letterSpacing: '0.2em', fontWeight: 'bold', fontSize: '1rem' }}
                    />
                  </div>
                </div>

                <button type="submit" className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                  Verify Email Account
                </button>

                <button
                  type="button"
                  onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', color: 'var(--color-slate-light)', fontSize: '0.8rem', marginTop: '0.5rem' }}
                >
                  <ArrowLeft size={12} /> Back to Sign In
                </button>
              </form>
            )}

            {/* 4. FORGOT PASSWORD REQUEST EMAIL FORM */}
            {authMode === 'client-forgot-password' && (
              <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Registered Email Address</label>
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

                <button type="submit" className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                  Send Recovery OTP Code
                </button>

                <button
                  type="button"
                  onClick={() => { setAuthMode('client-login'); setErrorMsg(''); setInfoMsg(''); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', color: 'var(--color-slate-light)', fontSize: '0.8rem', marginTop: '0.5rem' }}
                >
                  <ArrowLeft size={12} /> Back to Sign In
                </button>
              </form>
            )}

            {/* 5. FORGOT PASSWORD RESET ACTION FORM */}
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

                <button type="submit" className="premium-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  Reset & Update Password
                </button>
              </form>
            )}
          </>
        )}

      </div>
    </div>
  );
}

// Simple Internal Icon to avoid import redundancies
function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
