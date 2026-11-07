import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('Service Worker registered successfully:', r);
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  React.useEffect(() => {
    if (offlineReady) {
      const timer = setTimeout(() => {
        setOfflineReady(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [offlineReady]);

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: '24px',
        bottom: '24px',
        zIndex: 9999,
        maxWidth: '380px',
        background: 'rgba(15, 12, 30, 0.85)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        padding: '18px',
        color: '#ffffff',
        fontFamily: "'Outfit', 'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        animation: 'slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        transform: 'translateY(100px)',
        opacity: 0,
      }}
    >
      <style>{`
        @keyframes slideInUp {
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .pwa-btn-primary {
          background: linear-gradient(135deg, #863bff, #6b2ad6);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(134, 59, 255, 0.3);
        }
        .pwa-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(134, 59, 255, 0.4);
          background: linear-gradient(135deg, #9352ff, #7330e0);
        }
        .pwa-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .pwa-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
          color: white;
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(134, 59, 255, 0.2), rgba(107, 42, 214, 0.2))',
            borderRadius: '10px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(134, 59, 255, 0.3)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9c66ff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '-0.01em' }}>
            {offlineReady ? 'App Ready Offline' : 'Update Available'}
          </span>
          <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: '1.4' }}>
            {offlineReady
              ? 'Verdant Mind has been cached for offline use. You can access it anytime without internet.'
              : 'A new version of the app is available with latest updates and features.'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
        {needRefresh && (
          <button className="pwa-btn-primary" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
        )}
        <button className="pwa-btn-secondary" onClick={close}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default ReloadPrompt;
