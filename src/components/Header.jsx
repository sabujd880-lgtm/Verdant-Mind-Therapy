import React from 'react';
import { Brain, User, ShieldAlert, LogIn, LogOut } from 'lucide-react';

export default function Header({ 
  currentUser, 
  onOpenAuth, 
  onSignOut,
  activeView, 
  setActiveView, 
  activeSection, 
  setActiveSection 
}) {
  const handleNavClick = (sectionId) => {
    setActiveView('client');
    setActiveSection(sectionId);
    
    // Smooth scroll to element
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="header-wrapper">
      <div className="container header-container">
        {/* Brand Logo */}
        <div className="logo-section" style={{ cursor: 'pointer' }} onClick={() => handleNavClick('hero')}>
          <div className="logo-icon">
            <Brain size={20} />
          </div>
          <div className="logo-text">
            <h1>Sabuj Das</h1>
            <p>Therapist & Psychologist</p>
          </div>
        </div>

        {/* Navigation & Mode Switcher */}
        <div className="nav-links" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          {/* Public client portfolio navigation (only visible when viewing client portfolio) */}
          {activeView === 'client' && (
            <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <button 
                onClick={() => handleNavClick('hero')} 
                className={`nav-link ${activeSection === 'hero' ? 'active' : ''}`}
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('specializations')} 
                className={`nav-link ${activeSection === 'specializations' ? 'active' : ''}`}
              >
                Specializations
              </button>
              <button 
                onClick={() => handleNavClick('booking')} 
                className={`nav-link ${activeSection === 'booking' ? 'active' : ''}`}
              >
                Book Session
              </button>
            </nav>
          )}

          {/* User authentication actions and role routing toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {!currentUser ? (
              /* Signed Out -> Render simple Sign In CTA */
              <button
                type="button"
                className="premium-btn"
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                onClick={onOpenAuth}
              >
                <LogIn size={14} /> Client Sign In
              </button>
            ) : (
              /* Authenticated States */
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                
                {/* Switcher tabs */}
                <div className="mode-switcher" style={{ display: 'flex', background: 'rgba(42,71,62,0.05)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
                  {currentUser.role === 'provider' ? (
                    <>
                      <button
                        className={`mode-btn ${activeView === 'client' ? 'active' : ''}`}
                        onClick={() => {
                          setActiveView('client');
                          setActiveSection('hero');
                        }}
                      >
                        <User size={12} /> Public View
                      </button>
                      <button
                        className={`mode-btn ${activeView === 'therapist' ? 'active' : ''}`}
                        onClick={() => setActiveView('therapist')}
                      >
                        <ShieldAlert size={12} /> Therapist Dashboard
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={`mode-btn ${activeView === 'client' ? 'active' : ''}`}
                        onClick={() => {
                          setActiveView('client');
                          setActiveSection('hero');
                        }}
                      >
                        Public Portfolio
                      </button>
                      <button
                        className={`mode-btn ${activeView === 'client-portal' ? 'active' : ''}`}
                        onClick={() => setActiveView('client-portal')}
                      >
                        My Client Account
                      </button>
                    </>
                  )}
                </div>

                {/* Profile Greeting badge & Log Out */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--color-slate-10)', paddingLeft: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-slate-dark)', fontWeight: 600 }}>
                    Hi, {currentUser.name.split(' ')[0]}
                  </span>
                  
                  <button 
                    type="button" 
                    onClick={onSignOut}
                    style={{ color: 'var(--color-cancelled)', display: 'flex', padding: '0.25rem' }}
                    title="Sign Out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
