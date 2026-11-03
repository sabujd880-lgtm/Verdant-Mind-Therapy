import React from 'react';
import { User, ShieldAlert, LogIn, LogOut } from 'lucide-react';
import LiveISTClock from './LiveISTClock';

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
    
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
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
        {/* Brand Logo & Live IST Application Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div className="logo-section" style={{ cursor: 'pointer' }} onClick={() => handleNavClick('hero')}>
            <div className="logo-icon" style={{ overflow: 'hidden', padding: 0, border: '2px solid var(--color-slate-20)' }}>
              <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            </div>
            <div className="logo-text">
              <h1>Verdant Mind</h1>
              <p>Clinical Psychology & Counselling Portal</p>
            </div>
          </div>
          <LiveISTClock />
        </div>

        {/* Navigation & Mode Switcher */}
        <div className="nav-links" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
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
              /* Signed Out -> Render direct Staff/Admin button and Client Sign In */
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.42rem 0.85rem',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'rgba(128, 80, 232, 0.08)',
                    color: '#8050E8',
                    border: '1px solid rgba(128, 80, 232, 0.28)',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => onOpenAuth('provider-login')}
                  title="Staff, Counsellor & Practice Administration Sign In"
                >
                  <ShieldAlert size={14} /> Staff / Admin
                </button>
                <button
                  type="button"
                  className="premium-btn"
                  style={{ padding: '0.45rem 1.15rem', fontSize: '0.82rem' }}
                  onClick={() => onOpenAuth('client-login')}
                >
                  <LogIn size={14} /> Sign In
                </button>
              </div>
            ) : (
              /* Authenticated States */
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                
                {/* Switcher tabs */}
                <div className="mode-switcher" style={{ display: 'flex', background: 'rgba(42,71,62,0.05)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
                  {isStaff ? (
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
                        <ShieldAlert size={12} /> Clinic Dashboard
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
      </div>
    </header>
  );
}
