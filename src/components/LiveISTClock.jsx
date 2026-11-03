import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { formatLiveISTClock } from '../utils/dateTime.js';

export default function LiveISTClock({ showIcon = true, className = '' }) {
  const [clockDisplay, setClockDisplay] = useState(() => formatLiveISTClock(new Date(), false));

  useEffect(() => {
    // Tick every second to keep live clock exact
    const timer = setInterval(() => {
      setClockDisplay(formatLiveISTClock(new Date(), false));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div 
      className={`live-ist-clock-pill ${className}`}
      title="Authoritative Application Clock: Indian Standard Time (Asia/Kolkata, UTC+05:30)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.3rem 0.75rem',
        background: 'var(--color-slate-05)',
        border: '1px solid var(--color-slate-20)',
        borderRadius: '20px',
        fontSize: '0.78rem',
        fontWeight: 600,
        color: 'var(--color-slate-dark)',
        letterSpacing: '0.01em',
        userSelect: 'none'
      }}
    >
      {showIcon && <Clock size={13} style={{ color: 'var(--color-slate)', flexShrink: 0 }} />}
      <span>{clockDisplay}</span>
    </div>
  );
}

