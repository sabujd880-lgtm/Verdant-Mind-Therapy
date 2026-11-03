import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Portfolio from './components/Portfolio';
import BookingEngine from './components/BookingEngine';
import TherapistDashboard from './components/TherapistDashboard';
import AuthPortal from './components/AuthPortal';
import ClientPortal from './components/ClientPortal';
import { INITIAL_PROFILE } from './mockData';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import ReloadPrompt from './components/ReloadPrompt';

function App() {
  const [activeView, setActiveView] = useState('client'); // 'client' | 'therapist' | 'client-portal'
  const [activeSection, setActiveSection] = useState('hero');
  const [profile] = useState(INITIAL_PROFILE);
  const [authOpen, setAuthOpen] = useState(false);
  const [initialAuthStatus, setInitialAuthStatus] = useState('');
  const [initialAuthError, setInitialAuthError] = useState('');

  // Authentication State
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(120);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('therapist_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // DB Sync State Lists
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState({
    workingDays: [1, 2, 3, 4, 5],
    blockedDates: [],
    startHour: '09:00',
    endHour: '17:00'
  });
  const [messages, setMessages] = useState([]);
  const [careDocuments, setCareDocuments] = useState([]);

  // Check URL query parameters for Google OAuth callback results & verify session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth_status');
    const authError = params.get('auth_error');

    if (authStatus === 'success') {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
            if (data.user.role === 'client') {
              setActiveView('client-portal');
            } else {
              setActiveView('therapist');
            }
          }
        })
        .catch(console.error);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authStatus) {
      setInitialAuthStatus(authStatus);
      setAuthOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authError) {
      setInitialAuthError(authError);
      setAuthOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Background session check with server
      fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Database Synchronizer Hook
  const loadDatabaseRecords = async (user) => {
    try {
      // 1. Fetch availability config (public)
      const availRes = await fetch('/api/availability');
      if (availRes.ok) {
        const availData = await availRes.json();
        if (availData) setAvailability(availData);
      }

      if (!user) {
        setAppointments([]);
        setMessages([]);
        setCareDocuments([]);
        return;
      }

      const isStaffRole = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(user.role);

      // 2. Fetch based on user roles (Staff gets backend-filtered clinical records, Client gets own records)
      if (isStaffRole) {
        const aptRes = await fetch('/api/appointments', { credentials: 'include' });
        if (aptRes.ok) setAppointments(await aptRes.json());

        const msgRes = await fetch('/api/messages', { credentials: 'include' });
        if (msgRes.ok) setMessages(await msgRes.json());

        const docRes = await fetch('/api/documents', { credentials: 'include' });
        if (docRes.ok) setCareDocuments(await docRes.json());
      } else if (user.role === 'client') {
        const clientEmailQuery = encodeURIComponent(user.email);

        const aptRes = await fetch(`/api/appointments?clientEmail=${clientEmailQuery}`, { credentials: 'include' });
        if (aptRes.ok) setAppointments(await aptRes.json());

        const msgRes = await fetch(`/api/messages?senderEmail=${clientEmailQuery}`, { credentials: 'include' });
        if (msgRes.ok) setMessages(await msgRes.json());

        const docRes = await fetch(`/api/documents?clientEmail=${clientEmailQuery}`, { credentials: 'include' });
        if (docRes.ok) setCareDocuments(await docRes.json());
      }
    } catch (err) {
      console.error('Error synchronizing records with backend:', err);
    }
  };

  // Synchronize on user authentication state shifts
  useEffect(() => {
    loadDatabaseRecords(currentUser);
    if (currentUser) {
      localStorage.setItem('therapist_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('therapist_current_user');
    }
  }, [currentUser]);

  // Session Inactivity Warning & Keep-Alive Renewal (Phase P2 Healthcare Compliance)
  const handleExtendSession = async () => {
    try {
      await fetch('/api/auth/keep-alive', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.warn('Session extension heartbeat warning:', err);
    }
    setShowInactivityWarning(false);
    setWarningCountdown(120);
  };

  // 15-Minute Inactivity Idle Auto-Lock (Clinical Records Privacy & HIPAA/DPDP Compliance)
  useEffect(() => {
    if (!currentUser) return;
    const IDLE_TIMEOUT_MS = 13 * 60 * 1000; // 13 minutes (2-minute warning window)
    let timeoutId;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowInactivityWarning(true);
        setWarningCountdown(120);

      }, IDLE_TIMEOUT_MS);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [currentUser, showInactivityWarning]);

  // 2-Minute Pre-Logout Countdown (Phase P2)
  useEffect(() => {
    if (!showInactivityWarning) return;
    const interval = setInterval(() => {
      setWarningCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setShowInactivityWarning(false);
          handleSignOut();
          alert('Your session has timed out due to 15 minutes of inactivity to protect client privacy.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showInactivityWarning]);

  // Handle intersection observer to highlight current navigation section
  useEffect(() => {
    if (activeView !== 'client') return;

    const sections = ['hero', 'specializations', 'booking'];
    const observers = sections.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;

      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          setActiveSection(id);
        }
      }, { threshold: 0.3 });

      observer.observe(el);
      return { observer, el };
    });

    return () => {
      observers.forEach(obs => {
        if (obs) obs.observer.unobserve(obs.el);
      });
    };
  }, [activeView]);

  // Handler functions
  const handleAddAppointment = async (newApt) => {
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newApt)
      });
      if (response.ok) {
        const data = await response.json();
        setAppointments(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('Error saving appointment:', err);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const response = await fetch(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        const data = await response.json();
        setAppointments(prev => prev.map(apt => (apt._id === id || apt.id === id) ? data : apt));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleUpdateNotes = async (id, notes) => {
    try {
      const response = await fetch(`/api/appointments/${id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes })
      });
      if (response.ok) {
        const data = await response.json();
        setAppointments(prev => prev.map(apt => (apt._id === id || apt.id === id) ? data : apt));
      }
    } catch (err) {
      console.error('Error saving notes:', err);
    }
  };

  const handleUpdateAvailability = async (newAvailability) => {
    try {
      const response = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newAvailability)
      });
      if (response.ok) {
        const data = await response.json();
        setAvailability(data);
      }
    } catch (err) {
      console.error('Error updating availability settings:', err);
    }
  };

  const handleSendMessage = async (newMsg) => {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          senderName: newMsg.senderName,
          senderEmail: newMsg.senderEmail,
          subject: newMsg.subject,
          message: newMsg.message
        })
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleReplyMessage = async (messageId, replyText) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ replyText })
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(msg => (msg._id === messageId || msg.id === messageId) ? data : msg));
      }
    } catch (err) {
      console.error('Error saving message reply:', err);
    }
  };

  const handleUpdateMessageStatus = async (id, newStatus) => {
    try {
      const response = await fetch(`/api/messages/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => prev.map(msg => (msg._id === id || msg.id === id) ? data : msg));
      }
    } catch (err) {
      console.error('Error reading message:', err);
    }
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    setAuthOpen(false);
    if (user.role === 'client') {
      setActiveView('client-portal');
    } else {
      setActiveView('therapist');
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.warn('Logout notification error:', e);
    }
    setCurrentUser(null);
    setActiveView('client');
    setActiveSection('hero');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegisterClient = (newClient) => {
    loadDatabaseRecords(newClient);
  };

  const handleAddCareDocument = async (newDoc) => {
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newDoc)
      });
      if (response.ok) {
        const data = await response.json();
        setCareDocuments(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('Error saving care document:', err);
    }
  };

  const handleCancelAppointment = async (id) => {
    try {
      const response = await fetch(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'Cancelled' })
      });
      if (response.ok) {
        const data = await response.json();
        setAppointments(prev => prev.map(apt => (apt._id === id || apt.id === id) ? data : apt));
      }
    } catch (err) {
      console.error('Error cancelling appointment:', err);
    }
  };

  const handleBookClick = () => {
    setActiveSection('booking');
    const el = document.getElementById('booking');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isStaff = currentUser && ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(currentUser.role);

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* Shared Nav Header */}
      <Header 
        currentUser={currentUser}
        onOpenAuth={() => {
          setInitialAuthStatus('');
          setInitialAuthError('');
          setAuthOpen(true);
        }}
        onSignOut={handleSignOut}
        activeView={activeView} 
        setActiveView={setActiveView} 
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        
        {/* PUBLIC VIEW (PORTFOLIO & BOOKING ENGINE) */}
        {activeView === 'client' && (
          <>
            <Portfolio 
              profile={profile} 
              onBookClick={handleBookClick}
              onSendMessage={handleSendMessage}
            />
            <BookingEngine 
              currentUser={currentUser}
              availability={availability}
              appointments={appointments}
              onAddAppointment={handleAddAppointment}
            />
          </>
        )}

        {/* SECURE CLIENT PORTAL */}
        {activeView === 'client-portal' && currentUser?.role === 'client' && (
          <ClientPortal 
            currentUser={currentUser}
            appointments={appointments}
            careDocuments={careDocuments}
            messages={messages}
            onSendMessage={handleSendMessage}
            onCancelAppointment={handleCancelAppointment}
          />
        )}

        {/* CLINIC & THERAPIST DASHBOARD */}
        {activeView === 'therapist' && isStaff && (
          <TherapistDashboard 
            appointments={appointments}
            availability={availability}
            onUpdateStatus={handleUpdateStatus}
            onUpdateNotes={handleUpdateNotes}
            onUpdateAvailability={handleUpdateAvailability}
            messages={messages}
            onReplyMessage={handleReplyMessage}
            onUpdateMessageStatus={handleUpdateMessageStatus}
            onAddCareDocument={handleAddCareDocument}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Authentication Overlay Modal */}
      {authOpen && (
        <AuthPortal 
          onLogin={handleLogin}
          onRegister={handleRegisterClient}
          onClose={() => {
            setAuthOpen(false);
            setInitialAuthStatus('');
            setInitialAuthError('');
          }}
          initialStatus={initialAuthStatus}
          initialError={initialAuthError}
        />
      )}

      {/* Session Inactivity Warning Modal (Phase P2 Healthcare Compliance) */}
      {showInactivityWarning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '1rem',
            maxWidth: '460px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            textAlign: 'center',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              borderRadius: '50%',
              backgroundColor: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}>
              <Clock size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
              Session Inactivity Warning
            </h3>
            <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              To protect clinical privacy and healthcare data integrity, your session will automatically log out in{' '}
              <strong style={{ color: '#DC2626', fontSize: '1.1rem' }}>{warningCountdown}s</strong> due to inactivity.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleExtendSession}
                style={{
                  background: 'var(--gradient-primary)',
                  color: '#FFFFFF',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Continue Session
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Sign Out Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Footer */}
      <footer className="app-footer">
        <div className="container footer-grid">
          
          {/* Brand Info */}
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
              <h3 style={{ margin: 0 }}>Verdant Mind</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-terracotta)', fontWeight: 600, marginBottom: '0.75rem' }}>
              Sabuj Das | Clinical Psychologist
            </p>
            <p>
              Dedicated to offering evidence-based, compassionate cognitive counseling and dialectical therapy to heal, support, and transform lives.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-col">
            <h4>Quick Navigation</h4>
            <ul>
              <li><a href="#hero" onClick={(e) => { e.preventDefault(); setActiveView('client'); setActiveSection('hero'); }}>Overview</a></li>
              <li><a href="#specializations" onClick={(e) => { e.preventDefault(); setActiveView('client'); setActiveSection('specializations'); }}>Specializations</a></li>
              <li><a href="#booking" onClick={(e) => { e.preventDefault(); setActiveView('client'); setActiveSection('booking'); }}>Book Consultation</a></li>
              <li><a href="#portal" onClick={(e) => { e.preventDefault(); if (currentUser) { setActiveView(isStaff ? 'therapist' : 'client-portal'); } else { setAuthOpen(true); } }}>Staff & Client Portal</a></li>
            </ul>
          </div>

          {/* Clinical Contact Details */}
          <div className="footer-col">
            <h4>Practice Clinic</h4>
            <div className="footer-contact-item">
              <MapPin size={16} />
              <span>Verdant Mind Clinic, Salt Lake Sector V, Kolkata, West Bengal - 700091</span>
            </div>
            <div className="footer-contact-item">
              <Phone size={16} />
              <span>+91 95476 91433</span>
            </div>
            <div className="footer-contact-item">
              <Mail size={16} />
              <span>sabujd880@gmail.com</span>
            </div>
          </div>

        </div>

        <div className="container footer-bottom">
          <p>© {new Date().getFullYear()} Verdant Mind Clinical Psychology. Encrypted Healthcare Portal.</p>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <span>HIPAA & Healthcare Data Protection Standard</span>
            <span>AES-256 Cloud Encryption</span>
          </div>
        </div>
      </footer>

      {/* Service Worker PWA Refresh Prompt */}
      <ReloadPrompt />

    </div>
  );
}

export default App;
