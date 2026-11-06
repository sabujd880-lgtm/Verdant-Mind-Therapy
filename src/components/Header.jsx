import React, { useState, useEffect } from 'react';
import { User, ShieldAlert, LogIn, LogOut, Menu, X, Home, Sparkles, Calendar } from 'lucide-react';

export default function Header({ 
  currentUser, 
  onOpenAuth, 
  onSignOut,
  activeView, 
  setActiveView, 
  activeSection, 
  setActiveSection 
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleNavClick = (sectionId) => {
    setMobileMenuOpen(false);
    setActiveView('client');
    setActiveSection(sectionId);
    
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSwitchView = (view, section = 'hero') => {
    setMobileMenuOpen(false);
    setActiveView(view);
    if (section) setActiveSection(section);
  };

  const isStaff = currentUser && ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(currentUser.role);

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'Super Admin':
        return { background: '#ECEFF1', color: '#263238', border: '1px solid #CFD8DC' };
      case 'Administrator':
        return { background: '#E8F5E9', color: '#1B5E20', border: '1px solid #C8E6C9' };
      case 'Counsellor':
      case 'provider':
        return { background: '#E0F2F1', color: '#004D40', border: '1px solid #B2DFDB' };
      case 'Viewer':
        return { background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2' };
      default:
        return { background: '#E3F2FD', color: '#0D47A1', border: '1px solid #BBDEFB' };
    }
  };

  return (
    <header className="header-wrapper">
      <div className="container header-container">
        {/* Brand Logo & Portal Identity */}
        <div className="logo-section" style={{ cursor: 'pointer' }} onClick={() => handleNavClick('hero')}>
          <div className="logo-icon" style={{ overflow: 'hidden', padding: 0, border: '2px solid var(--color-slate-20)' }}>
            <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          <div className="logo-text">
            <h1>Verdant Mind</h1>
            <p className="logo-subtext">Mental Health Portal</p>
          </div>
        </div>

        {/* Desktop Navigation & Mode Switcher */}
        <div className="nav-links desktop-only-nav" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {/* Public client portfolio navigation (only visible when viewing client portfolio) */}
          {activeView === 'client' && (
            <nav style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {!currentUser ? (
              /* Signed Out -> Render Client Sign In */
              <button
                type="button"
                className="premium-btn"
                style={{ padding: '0.45rem 1.15rem', fontSize: '0.82rem' }}
                onClick={() => onOpenAuth('client-login')}
              >
                <LogIn size={14} /> Sign In
              </button>
            ) : (
              /* Authenticated States */
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                
                {/* Switcher tabs */}
                <div className="mode-switcher" style={{ display: 'flex', background: 'rgba(42,71,62,0.05)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
                  {isStaff ? (
                    <>
                      <button
                        className={`mode-btn ${activeView === 'client' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('client', 'hero')}
                      >
                        <User size={12} /> Public View
                      </button>
                      <button
                        className={`mode-btn ${activeView === 'therapist' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('therapist')}
                      >
                        <ShieldAlert size={12} /> Clinic Dashboard
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={`mode-btn ${activeView === 'client' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('client', 'hero')}
                      >
                        Public Portfolio
                      </button>
                      <button
                        className={`mode-btn ${activeView === 'client-portal' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('client-portal')}
                      >
                        My Client Account
                      </button>
                    </>
                  )}
                </div>

                {/* Profile Greeting badge & Log Out */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--color-slate-10)', paddingLeft: '0.75rem' }}>
                  {currentUser.picture ? (
                    <img 
                      src={currentUser.picture} 
                      alt={currentUser.name} 
                      style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #ccc' }}
                    />
                  ) : null}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-slate-dark)', fontWeight: 600, lineHeight: 1.2 }}>
                      {currentUser.name ? currentUser.name.split(' ')[0] : 'User'}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      marginTop: '2px',
                      ...getRoleBadgeStyle(currentUser.role)
                    }}>
                      {currentUser.role === 'provider' ? 'Super Admin' : currentUser.role}
                    </span>
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={onSignOut}
                    style={{ color: 'var(--color-cancelled)', display: 'flex', padding: '0.25rem', background: 'none', border: 'none', cursor: 'pointer' }}
                    title="Sign Out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Mobile Header Controls: Quick user pill & Hamburger trigger */}
        <div className="mobile-header-controls">
          {currentUser ? (
            <div 
              className="mobile-user-pill"
              onClick={() => setMobileMenuOpen(true)}
              title="Open Navigation Menu"
            >
              {currentUser.picture ? (
                <img 
                  src={currentUser.picture} 
                  alt={currentUser.name} 
                  className="mobile-user-avatar"
                />
              ) : (
                <div className="mobile-user-avatar-placeholder">
                  <User size={13} />
                </div>
              )}
              <span className="mobile-user-pill-name">
                {currentUser.name ? currentUser.name.split(' ')[0] : 'User'}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="mobile-signin-btn"
              onClick={() => onOpenAuth('client-login')}
            >
              <LogIn size={13} /> Sign In
            </button>
          )}

          <button
            type="button"
            className="mobile-menu-toggle-btn"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            title={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

      </div>

      {/* Mobile Navigation Drawer & Backdrop */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer-panel" onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', border: '1.5px solid var(--color-slate-20)' }}>
                  <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 700, color: 'var(--color-slate-dark)' }}>Verdant Mind</h3>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-slate-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Navigation</span>
                </div>
              </div>
              <button 
                type="button" 
                className="mobile-drawer-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Profile Summary Card inside Drawer */}
            {currentUser && (
              <div className="mobile-drawer-profile-card">
                {currentUser.picture ? (
                  <img 
                    src={currentUser.picture} 
                    alt={currentUser.name} 
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-slate-10)' }}
                  />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-slate)' }}>
                    <User size={18} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-slate-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser.name || 'User'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--color-slate-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser.email || ''}
                  </div>
                  <span style={{
                    display: 'inline-block',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    marginTop: '3px',
                    ...getRoleBadgeStyle(currentUser.role)
                  }}>
                    {currentUser.role === 'provider' ? 'Super Admin' : currentUser.role}
                  </span>
                </div>
              </div>
            )}

            {/* Portal Switcher Buttons (if signed in) */}
            {currentUser && (
              <div className="mobile-drawer-section">
                <span className="mobile-drawer-section-title">Active Workspace</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
                  {isStaff ? (
                    <>
                      <button
                        type="button"
                        className={`mobile-drawer-nav-item ${activeView === 'therapist' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('therapist')}
                      >
                        <ShieldAlert size={16} />
                        <span>Clinic Dashboard</span>
                        {activeView === 'therapist' && <span className="mobile-drawer-active-dot" />}
                      </button>
                      <button
                        type="button"
                        className={`mobile-drawer-nav-item ${activeView === 'client' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('client', 'hero')}
                      >
                        <User size={16} />
                        <span>Public View</span>
                        {activeView === 'client' && <span className="mobile-drawer-active-dot" />}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`mobile-drawer-nav-item ${activeView === 'client-portal' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('client-portal')}
                      >
                        <User size={16} />
                        <span>My Client Account</span>
                        {activeView === 'client-portal' && <span className="mobile-drawer-active-dot" />}
                      </button>
                      <button
                        type="button"
                        className={`mobile-drawer-nav-item ${activeView === 'client' ? 'active' : ''}`}
                        onClick={() => handleSwitchView('client', 'hero')}
                      >
                        <Home size={16} />
                        <span>Public Portfolio</span>
                        {activeView === 'client' && <span className="mobile-drawer-active-dot" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Public Links (always available) */}
            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-title">Navigation</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
                <button
                  type="button"
                  className={`mobile-drawer-nav-item ${activeView === 'client' && activeSection === 'hero' ? 'active' : ''}`}
                  onClick={() => handleNavClick('hero')}
                >
                  <Home size={16} />
                  <span>Home</span>
                </button>
                <button
                  type="button"
                  className={`mobile-drawer-nav-item ${activeView === 'client' && activeSection === 'specializations' ? 'active' : ''}`}
                  onClick={() => handleNavClick('specializations')}
                >
                  <Sparkles size={16} />
                  <span>Specializations</span>
                </button>
                <button
                  type="button"
                  className={`mobile-drawer-nav-item ${activeView === 'client' && activeSection === 'booking' ? 'active' : ''}`}
                  onClick={() => handleNavClick('booking')}
                >
                  <Calendar size={16} />
                  <span>Book Session</span>
                </button>
              </div>
            </div>

            {/* Footer Sign In / Sign Out Action */}
            <div className="mobile-drawer-footer">
              {currentUser ? (
                <button
                  type="button"
                  className="mobile-drawer-signout-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignOut();
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="premium-btn"
                  style={{ width: '100%', minHeight: '42px', fontSize: '0.88rem' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('client-login');
                  }}
                >
                  <LogIn size={15} />
                  <span>Sign In to Portal</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </header>
  );
}
