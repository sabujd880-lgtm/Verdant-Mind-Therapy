import React, { useState, useEffect } from 'react';
import { 
  Shield, AlertTriangle, CheckCircle2, RefreshCw, Clock, 
  Lock, Users, Activity, LogOut, Settings, Save, AlertCircle, 
  Search, Filter, ChevronRight, UserX, Database, Eye, X
} from 'lucide-react';
import { formatISTDateTimeWithZone } from '../utils/dateTime.js';

export default function SecurityDashboard({ currentUser }) {
  const isSuperAdmin = currentUser && (currentUser.role === 'Super Admin' || currentUser.role === 'provider');
  const isAdmin = currentUser && ['Super Admin', 'Administrator', 'provider'].includes(currentUser.role);

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'events' | 'sessions' | 'settings'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Overview metrics state
  const [overview, setOverview] = useState(null);

  // Security events state
  const [events, setEvents] = useState([]);
  const [eventPagination, setEventPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [eventStatusFilter, setEventStatusFilter] = useState('all');
  const [eventSeverityFilter, setEventSeverityFilter] = useState('all');
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventResolutionNotes, setEventResolutionNotes] = useState('');
  const [eventResolutionStatus, setEventResolutionStatus] = useState('resolved');
  const [updatingEvent, setUpdatingEvent] = useState(false);

  // Active sessions state
  const [sessions, setSessions] = useState([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [revokingSessionId, setRevokingSessionId] = useState(null);
  const [bulkRevokeTarget, setBulkRevokeTarget] = useState('');
  const [showBulkRevokeModal, setShowBulkRevokeModal] = useState(false);

  // Security settings state
  const [settings, setSettings] = useState({
    sessionInactivityTimeoutMinutes: 15,
    loginRateLimitMax: 5,
    loginRateLimitWindowMinutes: 15,
    passwordMinLength: 8,
    requireSpecialChar: true,
    requireNumber: true,
    auditLogRetentionDays: 365,
    enableSuspiciousLoginAlerts: true,
    enableUnauthorizedAccessAlerts: true,
    approvedOrigins: []
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Load Overview Data
  const fetchOverview = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/admin/security/overview');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch security overview');
      }
      const data = await res.json();
      setOverview(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Security Events
  const fetchEvents = async (page = 1) => {
    try {
      setLoading(true);
      setErrorMsg('');
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        status: eventStatusFilter,
        severity: eventSeverityFilter,
        search: eventSearch
      });
      const res = await fetch(`/api/admin/security/events?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch security events');
      }
      const data = await res.json();
      setEvents(data.events || []);
      setEventPagination(data.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Active Sessions
  const fetchSessions = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/admin/security/sessions');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch active sessions');
      }
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Security Settings
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/admin/security/settings');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch security settings');
      }
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverview();
    } else if (activeTab === 'events') {
      fetchEvents(1);
    } else if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'settings') {
      fetchSettings();
    }
  }, [activeTab]);

  const handleUpdateEventStatus = async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;
    try {
      setUpdatingEvent(true);
      setErrorMsg('');
      const res = await fetch(`/api/admin/security/events/${selectedEvent.eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: eventResolutionStatus,
          resolutionNotes: eventResolutionNotes,
          assignedAdmin: currentUser?.email || 'admin'
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update security event');
      }
      setSuccessMsg(`Security alert ${selectedEvent.eventId} marked as ${eventResolutionStatus}.`);
      setSelectedEvent(null);
      setEventResolutionNotes('');
      fetchEvents(eventPagination.page);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setUpdatingEvent(false);
    }
  };

  const handleRevokeSession = async (sessionId, userEmail) => {
    if (!window.confirm(`Are you sure you want to revoke the active session for ${userEmail}?`)) {
      return;
    }
    try {
      setRevokingSessionId(sessionId);
      setErrorMsg('');
      const res = await fetch(`/api/admin/security/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to revoke session');
      }
      setSuccessMsg(`Session for ${userEmail} revoked immediately.`);
      fetchSessions();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleBulkRevoke = async () => {
    const confirmPrompt = bulkRevokeTarget 
      ? `Revoke all active sessions for ${bulkRevokeTarget}?`
      : 'Revoke all non-admin sessions across the portal?';
    if (!window.confirm(confirmPrompt)) return;

    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/admin/security/sessions/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: bulkRevokeTarget.trim() })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Bulk session revocation failed');
      }
      const data = await res.json();
      setSuccessMsg(data.message || 'Sessions revoked.');
      setShowBulkRevokeModal(false);
      setBulkRevokeTarget('');
      fetchSessions();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      setErrorMsg('Only Super Administrators are permitted to modify security governance settings.');
      return;
    }
    try {
      setSavingSettings(true);
      setErrorMsg('');
      const res = await fetch('/api/admin/security/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update security settings');
      }
      const data = await res.json();
      setSettings(data.settings);
      setSuccessMsg('Security policies updated and recorded in tamper-resistant audit log.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'critical':
        return <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>CRITICAL</span>;
      case 'high':
        return <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#FFEDD5', color: '#9A3412', border: '1px solid #FDBA74' }}>HIGH</span>;
      case 'medium':
        return <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>MEDIUM</span>;
      case 'low':
        return <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' }}>LOW</span>;
      default:
        return <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: 'var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>INFO</span>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#FEE2E2', color: '#B91C1C' }}>Open</span>;
      case 'investigating':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#FEF3C7', color: '#B45309' }}>Investigating</span>;
      case 'resolved':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#DCFCE7', color: '#15803D' }}>Resolved</span>;
      case 'dismissed':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, background: '#F1F5F9', color: '#475569' }}>Dismissed</span>;
      default:
        return status;
    }
  };

  const filteredSessions = sessions.filter(s => {
    if (!sessionSearch.trim()) return true;
    const q = sessionSearch.toLowerCase().trim();
    return (
      (s.userEmail && s.userEmail.toLowerCase().includes(q)) ||
      (s.userName && s.userName.toLowerCase().includes(q)) ||
      (s.role && s.role.toLowerCase().includes(q)) ||
      (s.ipAddress && s.ipAddress.toLowerCase().includes(q))
    );
  });

  return (
    <div className="security-dashboard-container" style={{ padding: '1rem 0' }}>
      
      {/* Module Title Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={24} style={{ color: 'var(--color-slate)' }} />
            Security Operations & Access Governance
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.86rem', color: 'var(--color-slate-light)' }}>
            Real-time telemetry, threat detection, session governance, and system-wide security controls.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (activeTab === 'overview') fetchOverview();
            if (activeTab === 'events') fetchEvents(eventPagination.page);
            if (activeTab === 'sessions') fetchSessions();
            if (activeTab === 'settings') fetchSettings();
          }}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', background: '#FFF', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', cursor: 'pointer' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem' }}>
          <AlertCircle size={16} /> <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem' }}>
          <CheckCircle2 size={16} /> <span>{successMsg}</span>
        </div>
      )}

      {/* Sub-Navigation Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          style={{ fontSize: '0.84rem', padding: '0.45rem 0.95rem' }}
        >
          <Activity size={14} style={{ marginRight: '0.35rem' }} /> Security Telemetry
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
          style={{ fontSize: '0.84rem', padding: '0.45rem 0.95rem' }}
        >
          <AlertTriangle size={14} style={{ marginRight: '0.35rem' }} /> Threat Alerts {overview?.metrics?.openSecurityAlerts > 0 && <span style={{ marginLeft: '0.3rem', background: '#EF4444', color: '#FFF', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.7rem' }}>{overview.metrics.openSecurityAlerts}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
          style={{ fontSize: '0.84rem', padding: '0.45rem 0.95rem' }}
        >
          <Users size={14} style={{ marginRight: '0.35rem' }} /> Active Sessions {overview?.metrics?.activeSessions > 0 && <span style={{ marginLeft: '0.3rem', background: 'var(--color-slate)', color: '#FFF', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.7rem' }}>{overview.metrics.activeSessions}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          style={{ fontSize: '0.84rem', padding: '0.45rem 0.95rem' }}
        >
          <Settings size={14} style={{ marginRight: '0.35rem' }} /> Security Governance
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: OVERVIEW & TELEMETRY */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div>
          {/* Key Metric Counters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-slate-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>REGISTERED USERS</span>
                <Users size={16} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-slate-dark)', margin: '0.5rem 0 0.2rem' }}>
                {overview?.metrics?.totalUsers ?? '—'}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#15803D' }}>
                Active: {overview?.metrics?.activeUsers ?? '—'} | Inactive: {overview?.metrics?.inactiveUsers ?? '—'}
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-slate-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>FAILED LOGINS (TODAY)</span>
                <Lock size={16} style={{ color: overview?.metrics?.failedLoginsToday > 0 ? '#B91C1C' : 'var(--color-slate-light)' }} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: overview?.metrics?.failedLoginsToday > 0 ? '#B91C1C' : 'var(--color-slate-dark)', margin: '0.5rem 0 0.2rem' }}>
                {overview?.metrics?.failedLoginsToday ?? '—'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--color-slate-light)' }}>
                Past 7 Days: {overview?.metrics?.failedLoginsPast7Days ?? '—'} attempts
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-slate-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>ACTIVE SESSIONS</span>
                <Clock size={16} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-slate-dark)', margin: '0.5rem 0 0.2rem' }}>
                {overview?.metrics?.activeSessions ?? '—'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--color-slate-light)' }}>
                Authenticated live clients & staff
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-slate-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>OPEN SECURITY ALERTS</span>
                <AlertTriangle size={16} style={{ color: overview?.metrics?.openSecurityAlerts > 0 ? '#DC2626' : 'var(--color-slate-light)' }} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: overview?.metrics?.openSecurityAlerts > 0 ? '#DC2626' : 'var(--color-slate-dark)', margin: '0.5rem 0 0.2rem' }}>
                {overview?.metrics?.openSecurityAlerts ?? '—'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--color-slate-light)' }}>
                Unauthorized (Today): {overview?.metrics?.unauthorizedAttemptsToday ?? '—'}
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-slate-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>AUDIT EVENTS (TODAY)</span>
                <Database size={16} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-slate-dark)', margin: '0.5rem 0 0.2rem' }}>
                {overview?.metrics?.auditEventsToday ?? '—'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--color-slate-light)' }}>
                Append-only immutable audit trail
              </div>
            </div>
          </div>

          {/* Visual Analytics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '1.5rem', marginBottom: '2rem' }}>
            
            {/* Chart 1: 7-Day Authentication Trends */}
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.98rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={16} style={{ color: 'var(--color-slate)' }} />
                Authentication Activity (Past 7 Days)
              </h4>
              <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>
                Daily distribution of successful logins vs failed / unauthorized attempts.
              </p>

              <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end', gap: '1rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--color-slate-10)' }}>
                {overview?.visualAnalytics?.authActivityTrends?.map((d, idx) => {
                  const maxVal = Math.max(1, ...overview.visualAnalytics.authActivityTrends.map(x => Math.max(x.success, x.failure + x.unauthorized)));
                  const successHeight = Math.max(6, Math.min(130, (d.success / maxVal) * 130));
                  const failHeight = Math.max(0, Math.min(130, ((d.failure + d.unauthorized) / maxVal) * 130));
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '130px' }}>
                        {/* Success Bar */}
                        <div 
                          title={`${d.date}: ${d.success} successful logins`}
                          style={{ width: '14px', height: `${successHeight}px`, background: 'var(--color-slate)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} 
                        />
                        {/* Failure Bar */}
                        {d.failure + d.unauthorized > 0 && (
                          <div 
                            title={`${d.date}: ${d.failure} failed, ${d.unauthorized} unauthorized`}
                            style={{ width: '14px', height: `${failHeight}px`, background: '#EF4444', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} 
                          />
                        )}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)', marginTop: '0.4rem', fontWeight: 600 }}>{d.day}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '10px', height: '10px', background: 'var(--color-slate)', borderRadius: '2px', display: 'inline-block' }} /> Successful Logins
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '10px', height: '10px', background: '#EF4444', borderRadius: '2px', display: 'inline-block' }} /> Failed / Unauthorized Attempts
                </span>
              </div>
            </div>

            {/* Chart 2: User Activity by Role */}
            <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.98rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} style={{ color: 'var(--color-slate)' }} />
                Account Breakdown by Role
              </h4>
              <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>
                Role-based access distribution across verified institutional accounts.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {overview?.visualAnalytics?.userActivityByRole && Object.entries(overview.visualAnalytics.userActivityByRole).map(([role, count]) => {
                  const total = overview.metrics.totalUsers || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={role}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{role === 'client' ? 'Student / Patient' : role}</span>
                        <span style={{ color: 'var(--color-slate-light)' }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--color-slate-10)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: role === 'Super Admin' ? 'var(--color-accent-terracotta)' : 'var(--color-slate)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Recent Threat Alerts Summary */}
          <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} style={{ color: '#DC2626' }} />
                Recent Security Alerts Awaiting Review
              </h4>
              <button 
                type="button" 
                onClick={() => setActiveTab('events')} 
                style={{ fontSize: '0.8rem', color: 'var(--color-slate)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                View All Alerts &rarr;
              </button>
            </div>

            {(!overview?.recentAlerts || overview.recentAlerts.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-slate-light)', fontSize: '0.85rem' }}>
                <CheckCircle2 size={32} style={{ color: '#16A34A', marginBottom: '0.5rem', opacity: 0.8 }} />
                <p style={{ margin: 0 }}>No active security alerts. System security parameters normal.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-slate-10)', textAlign: 'left', color: 'var(--color-slate-light)' }}>
                      <th style={{ padding: '0.5rem' }}>Severity</th>
                      <th style={{ padding: '0.5rem' }}>Event ID</th>
                      <th style={{ padding: '0.5rem' }}>Description</th>
                      <th style={{ padding: '0.5rem' }}>Source IP</th>
                      <th style={{ padding: '0.5rem' }}>Occurrences</th>
                      <th style={{ padding: '0.5rem' }}>Last Occurred</th>
                      <th style={{ padding: '0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentAlerts.map(ev => (
                      <tr key={ev._id || ev.id || ev.eventId} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                        <td style={{ padding: '0.65rem 0.5rem' }}>{getSeverityBadge(ev.severity)}</td>
                        <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>{ev.eventId}</td>
                        <td style={{ padding: '0.65rem 0.5rem' }}>{ev.title || ev.description}</td>
                        <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace' }}>{ev.sourceIp || '—'}</td>
                        <td style={{ padding: '0.65rem 0.5rem' }}>{ev.occurrences || 1}</td>
                        <td style={{ padding: '0.65rem 0.5rem', color: 'var(--color-slate-light)' }}>{formatISTDateTimeWithZone(ev.lastOccurred || ev.createdAt)}</td>
                        <td style={{ padding: '0.65rem 0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => { setSelectedEvent(ev); setEventResolutionStatus(ev.status === 'open' ? 'investigating' : 'resolved'); setActiveTab('events'); }}
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '3px', cursor: 'pointer' }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: SECURITY THREAT ALERTS */}
      {/* ===================================================================== */}
      {activeTab === 'events' && (
        <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
              <input
                type="text"
                placeholder="Search alerts by IP, user, or keyword..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchEvents(1); }}
                style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
              />
            </div>

            <select
              value={eventStatusFilter}
              onChange={(e) => setEventStatusFilter(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <select
              value={eventSeverityFilter}
              onChange={(e) => setEventSeverityFilter(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <button
              type="button"
              onClick={() => fetchEvents(1)}
              style={{ padding: '0.45rem 0.95rem', background: 'var(--color-slate)', color: '#FFF', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Filter
            </button>
          </div>

          {events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate-light)' }}>
              <Shield size={36} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
              <p>No security alerts match the active criteria.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-slate-10)', textAlign: 'left', color: 'var(--color-slate-light)' }}>
                    <th style={{ padding: '0.55rem' }}>Severity</th>
                    <th style={{ padding: '0.55rem' }}>Event ID</th>
                    <th style={{ padding: '0.55rem' }}>Title & Description</th>
                    <th style={{ padding: '0.55rem' }}>Source IP</th>
                    <th style={{ padding: '0.55rem' }}>Affected Account</th>
                    <th style={{ padding: '0.55rem' }}>Occurrences</th>
                    <th style={{ padding: '0.55rem' }}>Status</th>
                    <th style={{ padding: '0.55rem' }}>Last Occurred</th>
                    <th style={{ padding: '0.55rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev._id || ev.id || ev.eventId} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                      <td style={{ padding: '0.65rem 0.55rem' }}>{getSeverityBadge(ev.severity)}</td>
                      <td style={{ padding: '0.65rem 0.55rem', fontWeight: 600 }}>{ev.eventId}</td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{ev.title}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--color-slate-light)', marginTop: '0.15rem' }}>{ev.description}</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.55rem', fontFamily: 'monospace' }}>{ev.sourceIp || '—'}</td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>{ev.affectedUser || '—'}</td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>{ev.occurrences || 1}</td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>{getStatusBadge(ev.status)}</td>
                      <td style={{ padding: '0.65rem 0.55rem', color: 'var(--color-slate-light)' }}>{formatISTDateTimeWithZone(ev.lastOccurred || ev.createdAt)}</td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEvent(ev);
                            setEventResolutionStatus(ev.status === 'open' ? 'investigating' : ev.status);
                            setEventResolutionNotes(ev.resolutionNotes || '');
                          }}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'var(--color-slate-05)', border: '1px solid var(--color-slate-20)', borderRadius: '3px', cursor: 'pointer' }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {eventPagination.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-slate-10)', fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                  <span>Showing Page {eventPagination.page} of {eventPagination.totalPages} ({eventPagination.total} total alerts)</span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      disabled={eventPagination.page <= 1}
                      onClick={() => fetchEvents(eventPagination.page - 1)}
                      style={{ padding: '0.3rem 0.65rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', background: '#FFF', cursor: eventPagination.page <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={eventPagination.page >= eventPagination.totalPages}
                      onClick={() => fetchEvents(eventPagination.page + 1)}
                      style={{ padding: '0.3rem 0.65rem', border: '1px solid var(--color-slate-20)', borderRadius: '3px', background: '#FFF', cursor: eventPagination.page >= eventPagination.totalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ACTIVE SESSION MONITORING & REVOCATION */}
      {/* ===================================================================== */}
      {activeTab === 'sessions' && (
        <div className="card" style={{ padding: '1.5rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ position: 'relative', minWidth: '260px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-slate-light)' }} />
              <input
                type="text"
                placeholder="Filter sessions by email, name or IP..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
              />
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowBulkRevokeModal(true)}
                style={{ padding: '0.45rem 0.95rem', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <UserX size={14} /> Bulk Revoke Sessions
              </button>
            )}
          </div>

          {filteredSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate-light)' }}>
              <Users size={36} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
              <p>No active sessions located matching criteria.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-slate-10)', textAlign: 'left', color: 'var(--color-slate-light)' }}>
                    <th style={{ padding: '0.55rem' }}>User & Email</th>
                    <th style={{ padding: '0.55rem' }}>Role</th>
                    <th style={{ padding: '0.55rem' }}>Session ID</th>
                    <th style={{ padding: '0.55rem' }}>IP Address</th>
                    <th style={{ padding: '0.55rem' }}>Device / Agent</th>
                    <th style={{ padding: '0.55rem' }}>Login Time</th>
                    <th style={{ padding: '0.55rem' }}>Last Activity</th>
                    <th style={{ padding: '0.55rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map(s => (
                    <tr key={s._id || s.id || s.sessionId} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                      <td style={{ padding: '0.65rem 0.55rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{s.userName || 'User'}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--color-slate-light)' }}>{s.userEmail}</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>
                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.74rem', background: s.role === 'Super Admin' ? '#FEF3C7' : 'var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>
                          {s.role}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.55rem', fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--color-slate-light)' }}>
                        {s.sessionId?.substring(0, 14)}...
                      </td>
                      <td style={{ padding: '0.65rem 0.55rem', fontFamily: 'monospace' }}>{s.ipAddress || '—'}</td>
                      <td style={{ padding: '0.65rem 0.55rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.74rem', color: 'var(--color-slate-light)' }} title={s.userAgent}>
                        {s.userAgent || 'Web Browser'}
                      </td>
                      <td style={{ padding: '0.65rem 0.55rem', color: 'var(--color-slate-light)' }}>{formatISTDateTimeWithZone(s.loginTime)}</td>
                      <td style={{ padding: '0.65rem 0.55rem', color: 'var(--color-slate-dark)', fontWeight: 600 }}>{formatISTDateTimeWithZone(s.lastActivity)}</td>
                      <td style={{ padding: '0.65rem 0.55rem' }}>
                        <button
                          type="button"
                          disabled={revokingSessionId === s.sessionId}
                          onClick={() => handleRevokeSession(s.sessionId, s.userEmail)}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '3px', cursor: 'pointer' }}
                        >
                          {revokingSessionId === s.sessionId ? 'Revoking...' : 'Terminate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: SECURITY GOVERNANCE & POLICIES */}
      {/* ===================================================================== */}
      {activeTab === 'settings' && (
        <div className="card" style={{ padding: '1.75rem', background: '#FFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Settings size={18} style={{ color: 'var(--color-slate)' }} />
                Practice Security & Compliance Policies
              </h4>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--color-slate-light)' }}>
                Authoritative institutional controls. All configuration adjustments are recorded in append-only audit trails.
              </p>
            </div>
            {!isSuperAdmin && (
              <span style={{ fontSize: '0.75rem', background: '#FEF3C7', color: '#92400E', padding: '0.25rem 0.6rem', borderRadius: '4px', fontWeight: 600 }}>
                Read-Only (Super Admin Required)
              </span>
            )}
          </div>

          <form onSubmit={handleSaveSettings}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-slate-dark)', marginBottom: '0.35rem' }}>
                  Session Inactivity Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  disabled={!isSuperAdmin}
                  value={settings.sessionInactivityTimeoutMinutes}
                  onChange={(e) => setSettings({ ...settings, sessionInactivityTimeoutMinutes: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>Automatically expires session after idle duration (Standard: 15 min).</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-slate-dark)', marginBottom: '0.35rem' }}>
                  Login Rate Limit (Attempts per Window)
                </label>
                <input
                  type="number"
                  min="3"
                  max="50"
                  disabled={!isSuperAdmin}
                  value={settings.loginRateLimitMax}
                  onChange={(e) => setSettings({ ...settings, loginRateLimitMax: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>Maximum consecutive failed login attempts before throttling (Standard: 5).</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-slate-dark)', marginBottom: '0.35rem' }}>
                  Password Policy Minimum Length
                </label>
                <input
                  type="number"
                  min="8"
                  max="32"
                  disabled={!isSuperAdmin}
                  value={settings.passwordMinLength}
                  onChange={(e) => setSettings({ ...settings, passwordMinLength: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>Enforced for all client, staff and administrative passwords (Min: 8).</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-slate-dark)', marginBottom: '0.35rem' }}>
                  Audit Log Retention Window (Days)
                </label>
                <input
                  type="number"
                  min="30"
                  max="2555"
                  disabled={!isSuperAdmin}
                  value={settings.auditLogRetentionDays}
                  onChange={(e) => setSettings({ ...settings, auditLogRetentionDays: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>Statutory audit retention period (Standard medical/HIPAA: 365+ days).</span>
              </div>

            </div>

            {/* Checkbox Policy Flags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', padding: '1rem', background: 'var(--color-slate-05)', borderRadius: 'var(--radius-sm)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={settings.requireSpecialChar}
                  onChange={(e) => setSettings({ ...settings, requireSpecialChar: e.target.checked })}
                />
                <span>Enforce mandatory special character in user passwords (@, #, $, !, %, etc.)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={settings.enableSuspiciousLoginAlerts}
                  onChange={(e) => setSettings({ ...settings, enableSuspiciousLoginAlerts: e.target.checked })}
                />
                <span>Generate real-time security alerts on repeated failed logins or multi-IP access</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={settings.enableUnauthorizedAccessAlerts}
                  onChange={(e) => setSettings({ ...settings, enableUnauthorizedAccessAlerts: e.target.checked })}
                />
                <span>Immediately log high-severity alert on unauthorized clinical record access denial</span>
              </label>
            </div>

            {isSuperAdmin && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="premium-btn"
                  style={{ padding: '0.55rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Save size={15} />
                  {savingSettings ? 'Saving Policies...' : 'Update Security Governance Policies'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: SECURITY EVENT INVESTIGATION & RESOLUTION */}
      {/* ===================================================================== */}
      {selectedEvent && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ background: '#FFF', maxWidth: '600px', width: '100%', borderRadius: 'var(--radius-md)', padding: '1.75rem', position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-terracotta)', fontWeight: 600 }}>Security Incident Review</span>
                <h4 style={{ margin: '0.2rem 0 0 0', fontSize: '1.2rem', color: 'var(--color-slate-dark)' }}>{selectedEvent.title}</h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', marginTop: '0.2rem' }}>Event ID: {selectedEvent.eventId}</div>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-light)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.84rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'var(--color-slate-05)', padding: '0.75rem', borderRadius: '4px' }}>
                <div><strong>Severity:</strong> {getSeverityBadge(selectedEvent.severity)}</div>
                <div><strong>Current Status:</strong> {getStatusBadge(selectedEvent.status)}</div>
                <div><strong>Source IP:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedEvent.sourceIp || '—'}</span></div>
                <div><strong>Affected User:</strong> {selectedEvent.affectedUser || '—'}</div>
                <div><strong>Occurrences:</strong> {selectedEvent.occurrences || 1}</div>
                <div><strong>Last Occurred:</strong> {formatISTDateTimeWithZone(selectedEvent.lastOccurred || selectedEvent.createdAt)}</div>
              </div>

              <div>
                <strong>Incident Description:</strong>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--color-slate-dark)' }}>{selectedEvent.description}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateEventStatus}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Update Incident Status</label>
                <select
                  value={eventResolutionStatus}
                  onChange={(e) => setEventResolutionStatus(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem' }}
                >
                  <option value="investigating">Mark as Investigating</option>
                  <option value="resolved">Mark as Resolved</option>
                  <option value="dismissed">Dismiss as False Positive</option>
                  <option value="open">Keep Open</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Investigation / Remediation Notes</label>
                <textarea
                  rows="3"
                  placeholder="Document actions taken (e.g. verified client IP, confirmed reset password, whitelisted IP)..."
                  value={eventResolutionNotes}
                  onChange={(e) => setEventResolutionNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  style={{ padding: '0.5rem 1rem', background: 'var(--color-slate-05)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingEvent}
                  className="premium-btn"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                >
                  {updatingEvent ? 'Saving...' : 'Save Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: BULK SESSION REVOCATION */}
      {/* ===================================================================== */}
      {showBulkRevokeModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ background: '#FFF', maxWidth: '480px', width: '100%', borderRadius: 'var(--radius-md)', padding: '1.75rem', position: 'relative' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <UserX size={18} /> Bulk Session Termination
            </h4>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.82rem', color: 'var(--color-slate-light)' }}>
              Terminate active authenticated sessions. Targeted accounts will be immediately signed out on their next request.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Target User Email (Leave blank to revoke ALL non-admin sessions)
              </label>
              <input
                type="email"
                placeholder="e.g. client@example.com (or empty for all)"
                value={bulkRevokeTarget}
                onChange={(e) => setBulkRevokeTarget(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-20)', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowBulkRevokeModal(false)}
                style={{ padding: '0.5rem 1rem', background: 'var(--color-slate-05)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkRevoke}
                style={{ padding: '0.5rem 1rem', background: '#DC2626', color: '#FFF', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
              >
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

