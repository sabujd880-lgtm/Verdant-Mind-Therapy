import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Portfolio from './components/Portfolio';
import BookingEngine from './components/BookingEngine';
import TherapistDashboard from './components/TherapistDashboard';
import AuthPortal from './components/AuthPortal';
import ClientPortal from './components/ClientPortal';
import { INITIAL_PROFILE } from './mockData';
import { Brain, Mail, Phone, MapPin } from 'lucide-react';
import ReloadPrompt from './components/ReloadPrompt';

function App() {
  const [activeView, setActiveView] = useState('client'); // 'client' | 'therapist' | 'client-portal'
  const [activeSection, setActiveSection] = useState('hero');
  const [profile] = useState(INITIAL_PROFILE);
  const [authOpen, setAuthOpen] = useState(false);

  // Authentication State
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

  // Database Synchronizer Hook
  const loadDatabaseRecords = async (user) => {
    try {
      // 1. Fetch availability config (always public)
      const availRes = await fetch('/api/availability');
      if (availRes.ok) {
        const availData = await availRes.json();
        if (availData) setAvailability(availData);
      }

      if (!user) {
        // If logged out, reset restricted list views
        setAppointments([]);
        setMessages([]);
        setCareDocuments([]);
        return;
      }

      // 2. Fetch based on user roles (Provider gets all, Client gets filtered copy)
      if (user.role === 'provider') {
        const aptRes = await fetch('/api/appointments');
        const aptData = await aptRes.json();
        setAppointments(aptData);

        const msgRes = await fetch('/api/messages');
        const msgData = await msgRes.json();
        setMessages(msgData);

        const docRes = await fetch('/api/documents');
        const docData = await docRes.json();
        setCareDocuments(docData);
      } else if (user.role === 'client') {
        const clientEmailQuery = encodeURIComponent(user.email);

        const aptRes = await fetch(`/api/appointments?clientEmail=${clientEmailQuery}`);
        const aptData = await aptRes.json();
        setAppointments(aptData);

        const msgRes = await fetch(`/api/messages?senderEmail=${clientEmailQuery}`);
        const msgData = await msgRes.json();
        setMessages(msgData);

        const docRes = await fetch(`/api/documents?clientEmail=${clientEmailQuery}`);
        const docData = await docRes.json();
        setCareDocuments(docData);
      }
    } catch (err) {
      console.error('Error synchronizing records with MongoDB backend:', err);
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
    if (user.role === 'provider') {
      setActiveView('therapist');
    } else {
      setActiveView('client-portal');
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setActiveView('client');
    setActiveSection('hero');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Safe callback triggered when an OTP is validated to log client in
  const handleRegisterClient = (newClient) => {
    loadDatabaseRecords(newClient);
  };

  const handleAddCareDocument = async (newDoc) => {
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleFooterPortalClick = () => {
    if (currentUser?.role === 'provider') {
      setActiveView('therapist');
    } else if (currentUser?.role === 'client') {
      setActiveView('client-portal');
    } else {
      setAuthOpen(true);
    }
  };

  const handleBookClick = () => {
    setActiveSection('booking');
    const el = document.getElementById('booking');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* Shared Nav Header */}
      <Header 
        currentUser={currentUser}
        onOpenAuth={() => setAuthOpen(true)}
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

        {/* PROVIDER CONTROL PANEL */}
        {activeView === 'therapist' && currentUser?.role === 'provider' && (
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
          />
        )}
      </main>

      {/* Authentification Overlay Modal */}
      {authOpen && (
        <AuthPortal 
          onLogin={handleLogin}
          onRegister={handleRegisterClient}
          onClose={() => setAuthOpen(false)}
        />
      )}

      {/* Premium Footer */}
      <footer className="app-footer">
        <div className="container footer-grid">
          
          {/* Brand Info */}
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Brain size={20} fill="var(--color-terracotta)" color="var(--color-terracotta)" />
              <h3 style={{ margin: 0 }}>Verdant Mind</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-terracotta)', fontWeight: 600, marginBottom: '0.75rem' }}>
              Sabuj Das | Psychologist
            </p>
            <p>
              Dedicated to offering evidence-based, compassionate cognitive counseling and dialectical therapy to heal, support, and transform lives.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-links">
            <h4>Client Resources</h4>
            <ul>
              <li>
                <button onClick={() => { setActiveView('client'); handleBookClick(); }} style={{ color: 'inherit', padding: 0 }}>
                  Book a Session
                </button>
              </li>
              <li>
                <button 
                  onClick={() => {
                    setActiveView('client');
                    setTimeout(() => {
                      document.getElementById('specializations')?.scrollIntoView({ behavior: 'smooth' });
                    }, 50);
                  }} 
                  style={{ color: 'inherit', padding: 0 }}
                >
                  Specializations
                </button>
              </li>
              <li>
                <button onClick={handleFooterPortalClick} style={{ color: 'inherit', padding: 0 }}>
                  Counseling Portal
                </button>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="footer-contact">
            <h4>Get in Touch</h4>
            <p>
              <MapPin size={16} />
              Kolkata, India
            </p>
            <p>
              <Mail size={16} />
              sabujd880@gmail.com
            </p>
            <p>
              <Phone size={16} />
              +91 98765 43210
            </p>
          </div>

        </div>

        {/* Copyright banner */}
        <div className="footer-copyright">
          <p>&copy; {new Date().getFullYear()} Verdant Mind by Sabuj Das. All Rights Reserved. Designed for premium psychological care.</p>
        </div>
      </footer>

      {/* PWA Update & Offline Notification Toast */}
      <ReloadPrompt />

    </div>
  );
}

export default App;
