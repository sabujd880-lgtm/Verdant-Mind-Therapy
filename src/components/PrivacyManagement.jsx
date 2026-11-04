import React, { useState, useEffect, useCallback } from 'react';
import { 
  Shield, CheckCircle2, XCircle, AlertTriangle, Clock, 
  FileText, Download, UserCheck, RefreshCw, Eye, MessageSquare, 
  HelpCircle, ChevronRight, Lock, Key, Ban, ExternalLink, Check
} from 'lucide-react';
import { formatISTDateTimeWithZone } from '../utils/dateTime.js';

const CONSENT_DEFINITIONS = [
  {
    key: 'counselling',
    title: 'General Counselling & Psychotherapy Consent',
    category: 'Clinical Care',
    description: 'Permits the provision of psychological counselling, therapeutic goal setting, and evidence-based clinical interventions in accordance with ethical standards.',
    mandatory: true,
    version: 'v2.1'
  },
  {
    key: 'assessment',
    title: 'Psychological Assessment & Screening Consent',
    category: 'Diagnostic Evaluation',
    description: 'Authorizes administration, scoring, and clinical interpretation of standardized psychometric questionnaires, symptom inventories, and diagnostic assessments.',
    mandatory: false,
    version: 'v2.0'
  },
  {
    key: 'audio_recording',
    title: 'Encrypted Audio Session Recording Consent',
    category: 'Consultation Media',
    description: 'Consents to temporary audio capture during select consultations for clinical transcription and supervision. Recordings are protected with AES-256 encryption.',
    mandatory: false,
    version: 'v1.4'
  },
  {
    key: 'teleconsultation',
    title: 'Telehealth & Real-time Video Streaming Consent',
    category: 'Communication Protocol',
    description: 'Authorizes delivery of care via encrypted WebRTC audiovisual streams, acknowledging digital communication considerations and tele-mental health protocols.',
    mandatory: true,
    version: 'v1.8'
  },
  {
    key: 'data_sharing',
    title: 'Interdisciplinary & Referral Information Sharing',
    category: 'Continuity of Care',
    description: 'Permits sharing clinical summaries and treatment notes with designated medical specialists or referring general practitioners strictly when clinically warranted.',
    mandatory: false,
    version: 'v1.2'
  }
];

const REQUEST_TYPES = [
  { value: 'access_export', label: 'Right to Access & Data Portability', desc: 'Receive a copy of your personal data records and demographic history.' },
  { value: 'correction', label: 'Right to Rectification', desc: 'Request correction or updating of inaccurate personal or biographical information.' },
  { value: 'restriction', label: 'Restriction of Processing', desc: 'Limit how your non-clinical personal data is processed by the portal.' },
  { value: 'deactivation', label: 'Temporary Account Deactivation', desc: 'Temporarily suspend your portal access and notification dispatch.' },
  { value: 'deletion', label: 'Right to Erasure / Account Closure', desc: 'Request account deletion (subject to statutory clinical record retention mandates).' }
];

export default function PrivacyManagement({ currentUser, mode = 'client' }) {
  // Common states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Client states
  const [activeConsents, setActiveConsents] = useState({});
  const [consentHistory, setConsentHistory] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [newRequest, setNewRequest] = useState({
    requestType: 'access_export',
    reason: '',
    details: ''
  });
  const [togglingConsent, setTogglingConsent] = useState(null);

  // Admin states
  const [allRequests, setAllRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminResolution, setAdminResolution] = useState({
    status: 'completed',
    adminNotes: ''
  });
  const [processingAdmin, setProcessingAdmin] = useState(false);

  // Load Client Data
  const fetchClientPrivacyData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/privacy/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Unable to retrieve privacy consents and rights records.');
      const data = await res.json();
      setActiveConsents(data.activeConsents || {});
      setConsentHistory(data.consents || []);
      setMyRequests(data.privacyRequests || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Admin Data
  const fetchAdminRequests = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const url = statusFilter !== 'all' 
        ? `/api/admin/privacy/requests?status=${statusFilter}` 
        : '/api/admin/privacy/requests';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Unable to load privacy requests queue.');
      const data = await res.json();
      setAllRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (mode === 'admin') {
      fetchAdminRequests();
    } else {
      fetchClientPrivacyData();
    }
  }, [mode, fetchClientPrivacyData, fetchAdminRequests]);

  // Client: Handle Consent Toggle
  const handleToggleConsent = async (consentDef) => {
    const isGranted = activeConsents[consentDef.key]?.status === 'granted';
    const nextStatus = isGranted ? 'withdrawn' : 'granted';
    
    if (consentDef.mandatory && isGranted) {
      const confirmed = window.confirm(
        `"${consentDef.title}" is a primary condition of clinical consultation. Withdrawing this consent may restrict your ability to schedule active therapy sessions. Do you wish to proceed?`
      );
      if (!confirmed) return;
    }

    setTogglingConsent(consentDef.key);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/privacy/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          consentType: consentDef.key,
          status: nextStatus,
          notes: `User ${nextStatus} consent for ${consentDef.title} (${consentDef.version}) via Patient Privacy Center`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update consent status.');

      setSuccessMsg(`Consent for "${consentDef.title}" successfully ${nextStatus === 'granted' ? 'granted' : 'withdrawn'}.`);
      await fetchClientPrivacyData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setTogglingConsent(null);
    }
  };

  // Client: Submit Privacy / DSAR Request
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!newRequest.reason.trim()) {
      setErrorMsg('Please specify the rationale or subject of your privacy request.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/privacy/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newRequest)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit privacy request.');

      setSuccessMsg(`Privacy request ${data.requestId} has been lodged and queued for administrative compliance verification.`);
      setShowRequestModal(false);
      setNewRequest({ requestType: 'access_export', reason: '', details: '' });
      await fetchClientPrivacyData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Admin: Process Request
  const handleProcessRequest = async (e) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setProcessingAdmin(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/admin/privacy/requests/${selectedRequest._id || selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: adminResolution.status,
          adminNotes: adminResolution.adminNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update request status.');

      setSuccessMsg(`Privacy Request ${selectedRequest.requestId} updated to ${adminResolution.status.toUpperCase()}.`);
      setSelectedRequest(null);
      await fetchAdminRequests();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setProcessingAdmin(false);
    }
  };

  // ==========================================
  // RENDER: CLIENT / PATIENT MODE
  // ==========================================
  if (mode === 'client') {
    return (
      <div className="privacy-management-client" style={{ animation: 'fadeIn 0.3s ease' }}>
        {/* Alerts */}
        {errorMsg && (
          <div style={{ background: 'rgba(201,93,93,0.1)', color: 'var(--color-accent-terracotta)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} /> <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'rgba(74,140,112,0.1)', color: '#2A5D48', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} /> <span>{successMsg}</span>
          </div>
        )}

        {/* Trust & Compliance Header Banner */}
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--color-primary-forest)', background: 'linear-gradient(135deg, rgba(42,71,62,0.03) 0%, rgba(212,163,115,0.05) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ maxWidth: '780px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <Shield size={20} style={{ color: 'var(--color-primary-forest)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-slate-dark)' }}>
                  Patient Privacy & Consent Governance
                </h3>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--color-slate-light)', lineHeight: '1.5', margin: 0 }}>
                Verdant Mind operates under strict data protection protocols adhering to the Digital Personal Data Protection (DPDP) Act and international healthcare confidentiality standards. You have granular authority to grant or revoke specific processing consents at any time.
              </p>
            </div>
            <button
              type="button"
              className="premium-btn"
              onClick={() => setShowRequestModal(true)}
              style={{ padding: '0.55rem 1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
            >
              <FileText size={15} /> Exercise Privacy Rights (DSAR)
            </button>
          </div>
        </div>

        {/* Section 1: Granular Consents Grid */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-slate-dark)', fontWeight: 600 }}>
                Granular Treatment & Data Consents
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                Control which therapeutic services and processing activities your record is authorized for.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchClientPrivacyData}
              disabled={loading}
              style={{ background: 'none', border: '1px solid var(--color-slate-10)', padding: '0.35rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh Status
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {CONSENT_DEFINITIONS.map(def => {
              const active = activeConsents[def.key];
              const isGranted = active?.status === 'granted';
              const isToggling = togglingConsent === def.key;

              return (
                <div 
                  key={def.key} 
                  className="glass-card" 
                  style={{ 
                    padding: '1.25rem', 
                    borderRadius: 'var(--radius-sm)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between',
                    border: isGranted ? '1px solid rgba(74,140,112,0.3)' : '1px solid rgba(201,93,93,0.2)',
                    boxShadow: isGranted ? '0 2px 8px rgba(74,140,112,0.06)' : 'none'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-slate-light)', background: 'rgba(42,71,62,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                        {def.category}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: isGranted ? 'rgba(74,140,112,0.12)' : 'rgba(201,93,93,0.12)',
                        color: isGranted ? '#2A5D48' : '#A93B3B'
                      }}>
                        {isGranted ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {isGranted ? 'Active / Granted' : 'Withdrawn / Inactive'}
                      </span>
                    </div>

                    <h5 style={{ margin: '0 0 0.4rem 0', fontSize: '0.96rem', color: 'var(--color-slate-dark)', fontWeight: 600 }}>
                      {def.title}
                    </h5>
                    <p style={{ fontSize: '0.82rem', color: 'var(--color-slate-light)', lineHeight: '1.45', marginBottom: '1rem' }}>
                      {def.description}
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-slate-10)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>
                      {isGranted ? (
                        <span>Granted {formatISTDateTimeWithZone(active.grantedAt || active.createdAt)}</span>
                      ) : (
                        <span>Version {def.version}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleToggleConsent(def)}
                      style={{
                        padding: '0.35rem 0.85rem',
                        borderRadius: '4px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: isToggling ? 'not-allowed' : 'pointer',
                        border: 'none',
                        transition: 'all 0.2s ease',
                        background: isGranted ? 'rgba(201,93,93,0.15)' : 'var(--color-primary-forest)',
                        color: isGranted ? '#A93B3B' : '#FFFFFF'
                      }}
                    >
                      {isToggling ? 'Updating...' : isGranted ? 'Withdraw Consent' : 'Grant Consent'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Data Subject Access Requests (DSAR) Status */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-slate-dark)', fontWeight: 600 }}>
              My Privacy & Data Rights Requests
            </h4>
          </div>

          <div className="glass-card" style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'rgba(42,71,62,0.06)', borderBottom: '1px solid var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Request ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Right Requested</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Subject / Rationale</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date Lodged (IST)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-light)' }}>
                      No formal privacy or statutory data rights requests submitted.
                    </td>
                  </tr>
                ) : (
                  myRequests.map(req => {
                    const typeLabel = REQUEST_TYPES.find(t => t.value === req.requestType)?.label || req.requestType;
                    const getStatusColor = (s) => {
                      switch (s) {
                        case 'completed': return { bg: 'rgba(74,140,112,0.15)', color: '#2A5D48' };
                        case 'in_review': return { bg: 'rgba(212,163,115,0.2)', color: '#B46A2C' };
                        case 'rejected': return { bg: 'rgba(201,93,93,0.15)', color: '#A93B3B' };
                        default: return { bg: 'rgba(42,71,62,0.08)', color: 'var(--color-slate-dark)' };
                      }
                    };
                    const color = getStatusColor(req.status);

                    return (
                      <tr key={req._id || req.id} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-primary-forest)' }}>
                          {req.requestId}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-slate-dark)' }}>
                          {typeLabel}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--color-slate-light)', maxWidth: '280px' }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {req.reason}
                          </div>
                          {req.adminNotes && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-primary-forest)', marginTop: '2px' }}>
                              Response: {req.adminNotes}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--color-slate-light)', whiteSpace: 'nowrap' }}>
                          {formatISTDateTimeWithZone(req.submittedAt || req.createdAt)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '12px', background: color.bg, color: color.color, textTransform: 'capitalize' }}>
                            {req.status?.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Full Consent Audit History */}
        <div>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', color: 'var(--color-slate-dark)', fontWeight: 600 }}>
            Consent Verification & Audit History
          </h4>
          <div className="glass-card" style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(42,71,62,0.06)', borderBottom: '1px solid var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Timestamp (IST)</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Consent Category</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Action / State</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Legal Basis / Notes</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Version</th>
                </tr>
              </thead>
              <tbody>
                {consentHistory.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-light)' }}>
                      No consent actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  consentHistory.map((item, idx) => (
                    <tr key={item._id || item.id || idx} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                      <td style={{ padding: '0.65rem 0.85rem', color: 'var(--color-slate-light)', whiteSpace: 'nowrap' }}>
                        {formatISTDateTimeWithZone(item.createdAt || item.grantedAt || item.withdrawnAt)}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', fontWeight: 500, color: 'var(--color-slate-dark)' }}>
                        {CONSENT_DEFINITIONS.find(d => d.key === item.consentType)?.title || item.consentType}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: item.status === 'granted' ? 'rgba(74,140,112,0.12)' : 'rgba(201,93,93,0.12)',
                          color: item.status === 'granted' ? '#2A5D48' : '#A93B3B'
                        }}>
                          {item.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: 'var(--color-slate-light)' }}>
                        {item.notes || 'Recorded via portal interface'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'monospace', color: 'var(--color-slate-light)' }}>
                        {item.version || 'v2.1'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Submit DSAR Request */}
        {showRequestModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="glass-card" style={{ background: '#FFF', width: '100%', maxWidth: '540px', borderRadius: 'var(--radius-sm)', padding: '1.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Shield size={18} style={{ color: 'var(--color-primary-forest)' }} /> Formal Privacy Rights Request (DSAR)
                </h4>
                <button type="button" onClick={() => setShowRequestModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-light)' }}>
                  <XCircle size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitRequest}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>
                    Statutory Right to Exercise:
                  </label>
                  <select
                    value={newRequest.requestType}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, requestType: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', fontSize: '0.85rem' }}
                  >
                    {REQUEST_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)', marginTop: '4px', marginBottom: 0 }}>
                    {REQUEST_TYPES.find(t => t.value === newRequest.requestType)?.desc}
                  </p>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>
                    Subject / Specific Data Field:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Export complete account history, Correct my date of birth..."
                    value={newRequest.reason}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, reason: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>
                    Detailed Instructions / Context:
                  </label>
                  <textarea
                    rows="3"
                    placeholder="Provide any additional context or specifics for the compliance administrator..."
                    value={newRequest.details}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, details: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ background: 'rgba(42,71,62,0.04)', padding: '0.75rem', borderRadius: '4px', marginBottom: '1.25rem', fontSize: '0.75rem', color: 'var(--color-slate-light)' }}>
                  <strong>Compliance Note:</strong> Requests are processed within statutory timelines (typically 30 days under DPDP). Confidential clinical notes and psychometric evaluations remain subject to healthcare safety and professional retention regulations.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowRequestModal(false)}
                    style={{ padding: '0.5rem 1rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', background: '#FFF', fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="premium-btn"
                    style={{ padding: '0.5rem 1.25rem', fontSize: '0.82rem' }}
                  >
                    {loading ? 'Submitting...' : 'Lodge Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER: ADMIN MODE
  // ==========================================
  const filteredAdminRequests = allRequests.filter(r => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (r.requestId || '').toLowerCase().includes(term) ||
      (r.userEmail || '').toLowerCase().includes(term) ||
      (r.userName || '').toLowerCase().includes(term) ||
      (r.reason || '').toLowerCase().includes(term);
    return matchesSearch;
  });

  return (
    <div className="privacy-management-admin" style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Alert Messages */}
      {errorMsg && (
        <div style={{ background: 'rgba(201,93,93,0.1)', color: 'var(--color-accent-terracotta)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} /> <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div style={{ background: 'rgba(74,140,112,0.1)', color: '#2A5D48', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={16} /> <span>{successMsg}</span>
        </div>
      )}

      {/* Admin Controls Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search request ID, patient name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '0.45rem 0.75rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', width: '280px' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.45rem 0.75rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem' }}
          >
            <option value="all">All Request Statuses</option>
            <option value="submitted">Submitted (New)</option>
            <option value="in_review">In Review</option>
            <option value="completed">Completed / Fulfilled</option>
            <option value="rejected">Rejected / Denied</option>
          </select>
        </div>

        <button
          type="button"
          onClick={fetchAdminRequests}
          disabled={loading}
          style={{ background: '#FFF', border: '1px solid var(--color-slate-10)', padding: '0.45rem 0.85rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh Queue
        </button>
      </div>

      {/* Admin Requests Table */}
      <div className="glass-card" style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ background: 'rgba(42,71,62,0.06)', borderBottom: '1px solid var(--color-slate-10)', color: 'var(--color-slate-dark)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Request ID</th>
              <th style={{ padding: '0.75rem 1rem' }}>Patient / Student</th>
              <th style={{ padding: '0.75rem 1rem' }}>Right Category</th>
              <th style={{ padding: '0.75rem 1rem' }}>Subject & Context</th>
              <th style={{ padding: '0.75rem 1rem' }}>Lodged (IST)</th>
              <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAdminRequests.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-slate-light)' }}>
                  No privacy or data rights requests found matching your filter criteria.
                </td>
              </tr>
            ) : (
              filteredAdminRequests.map(req => {
                const typeLabel = REQUEST_TYPES.find(t => t.value === req.requestType)?.label || req.requestType;
                const getStatusColor = (s) => {
                  switch (s) {
                    case 'completed': return { bg: 'rgba(74,140,112,0.15)', color: '#2A5D48' };
                    case 'in_review': return { bg: 'rgba(212,163,115,0.2)', color: '#B46A2C' };
                    case 'rejected': return { bg: 'rgba(201,93,93,0.15)', color: '#A93B3B' };
                    default: return { bg: 'rgba(42,71,62,0.08)', color: 'var(--color-slate-dark)' };
                  }
                };
                const color = getStatusColor(req.status);

                return (
                  <tr key={req._id || req.id} style={{ borderBottom: '1px solid var(--color-slate-05)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-primary-forest)' }}>
                      {req.requestId}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ color: 'var(--color-slate-dark)', display: 'block' }}>{req.userName || 'Patient'}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)' }}>{req.userEmail}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-slate-dark)' }}>
                      {typeLabel}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '250px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-slate-dark)', fontWeight: 500 }}>
                        {req.reason}
                      </div>
                      {req.details && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {req.details}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--color-slate-light)', whiteSpace: 'nowrap' }}>
                      {formatISTDateTimeWithZone(req.submittedAt || req.createdAt)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, padding: '3px 8px', borderRadius: '12px', background: color.bg, color: color.color, textTransform: 'capitalize' }}>
                        {req.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRequest(req);
                          setAdminResolution({
                            status: req.status === 'submitted' ? 'in_review' : req.status,
                            adminNotes: req.adminNotes || ''
                          });
                        }}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', background: '#FFF', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, color: 'var(--color-primary-forest)' }}
                      >
                        Review & Process
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Review & Process Request Modal */}
      {selectedRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ background: '#FFF', width: '100%', maxWidth: '580px', borderRadius: 'var(--radius-sm)', padding: '1.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-slate-dark)' }}>
                  Process Privacy Request: <span style={{ fontFamily: 'monospace', color: 'var(--color-primary-forest)' }}>{selectedRequest.requestId}</span>
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', marginTop: '2px' }}>
                  Submitted by {selectedRequest.userName} ({selectedRequest.userEmail}) on {formatISTDateTimeWithZone(selectedRequest.submittedAt || selectedRequest.createdAt)}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-slate-light)' }}>
                <XCircle size={18} />
              </button>
            </div>

            <div style={{ background: 'rgba(42,71,62,0.03)', padding: '1rem', borderRadius: '4px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', marginBottom: '0.25rem' }}>
                Request Type: <strong>{REQUEST_TYPES.find(t => t.value === selectedRequest.requestType)?.label || selectedRequest.requestType}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-dark)', fontWeight: 600, marginBottom: '0.35rem' }}>
                Subject: {selectedRequest.reason}
              </div>
              {selectedRequest.details && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', lineHeight: '1.4' }}>
                  Details: {selectedRequest.details}
                </div>
              )}
            </div>

            <form onSubmit={handleProcessRequest}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>
                  Update Processing Status:
                </label>
                <select
                  value={adminResolution.status}
                  onChange={(e) => setAdminResolution(prev => ({ ...prev, status: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', fontSize: '0.85rem' }}
                >
                  <option value="in_review">In Review (Acknowledged & Investigating)</option>
                  <option value="completed">Completed / Fulfilled (Action Dispatched)</option>
                  <option value="rejected">Rejected / Denied (Statutory Exception)</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--color-slate-dark)' }}>
                  Administrative Compliance Notes:
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="Record verification actions taken, export archive generation details, or reason for rejection under retention guidelines..."
                  value={adminResolution.adminNotes}
                  onChange={(e) => setAdminResolution(prev => ({ ...prev, adminNotes: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  style={{ padding: '0.5rem 1rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', background: '#FFF', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingAdmin}
                  className="premium-btn"
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.82rem' }}
                >
                  {processingAdmin ? 'Saving...' : 'Save Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
