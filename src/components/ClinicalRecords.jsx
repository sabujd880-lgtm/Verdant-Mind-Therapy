import React, { useState, useEffect } from 'react';
import { FileText, Brain, AlertTriangle, CheckCircle2, User, Calendar, Save, Plus, ShieldCheck, Download, Trash2, Clock } from 'lucide-react';
import { formatISTDate, formatISTDateTimeWithZone, normalizeToISTDate } from '../utils/dateTime.js';
import { safeJson, getResponseError } from '../utils/api.js';

export default function ClinicalRecords({ appointments = [], currentUser }) {
  const [activeSubTab, setActiveSubTab] = useState('case-history'); // 'case-history' | 'mse'
  const [selectedClientEmail, setSelectedClientEmail] = useState('');
  const [selectedClientName, setSelectedClientName] = useState('');
  
  // Case History State
  const [caseHistory, setCaseHistory] = useState({
    presentingProblems: '',
    historyOfPresentIllness: '',
    pastPsychiatricHistory: '',
    medicalHistory: '',
    familyPsychiatricHistory: '',
    personalAndSocialHistory: '',
    riskAssessment: {
      suicideRisk: 'None',
      selfHarmRisk: 'None',
      harmToOthers: 'None',
      riskNotes: ''
    }
  });

  // MSE Records State
  const [mseList, setMseList] = useState([]);
  const [newMse, setNewMse] = useState({
    date: new Date().toISOString().split('T')[0],
    appearanceAndBehavior: '',
    speechAndCommunication: '',
    moodAndAffect: '',
    thoughtProcessAndContent: '',
    perceptualDisturbances: '',
    cognitionAndOrientation: '',
    insightAndJudgment: '',
    clinicalSummary: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  const [exportStatus, setExportStatus] = useState('idle');
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);

  const handleExportClientData = async () => {
    if (!selectedClientEmail) return;
    setExportStatus('requested');
    setStatusMsg({ type: 'info', text: 'Generating consolidated patient record export bundle (DSAR)...' });

    try {
      setExportStatus('processing');
      const res = await fetch(`/api/clients/${encodeURIComponent(selectedClientEmail)}/export?reason=DSAR_Patient_Request`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to export patient records.');
        throw new Error(errorText);
      }
      const data = await safeJson(res);
      const blob = new Blob([JSON.stringify(data || {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patient_record_export_${selectedClientEmail}_${formatISTDate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus('completed');
      setStatusMsg({ type: 'success', text: `Patient export bundle successfully generated for ${selectedClientEmail}.` });
      setTimeout(() => setExportStatus('idle'), 4000);
    } catch (err) {
      setExportStatus('failed');
      setStatusMsg({ type: 'error', text: err.message });
      setTimeout(() => setExportStatus('idle'), 4000);
    }
  };

  const handlePurgePatient = async () => {
    if (purgeConfirmText !== 'PERMANENTLY_DELETE_PATIENT') {
      alert('You must type PERMANENTLY_DELETE_PATIENT to confirm data erasure.');
      return;
    }
    setPurgeLoading(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(selectedClientEmail)}/purge`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          confirmationText: purgeConfirmText,
          reason: 'GDPR/DPDP Right to be Forgotten Request'
        })
      });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to purge patient data.');
        throw new Error(errorText);
      }
      const data = await safeJson(res);
      setShowPurgeModal(false);
      setPurgeConfirmText('');
      setStatusMsg({ type: 'success', text: data?.message || 'Patient data permanently erased.' });
      setCaseHistory({
        presentingProblems: '',
        historyOfPresentIllness: '',
        pastPsychiatricHistory: '',
        medicalHistory: '',
        familyPsychiatricHistory: '',
        personalAndSocialHistory: '',
        riskAssessment: { suicideRisk: 'None', selfHarmRisk: 'None', harmToOthers: 'None', riskNotes: '' }
      });
      setMseList([]);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setPurgeLoading(false);
    }
  };

  const isReadOnly = currentUser?.role === 'Viewer';

  // Extract unique clients from appointments
  const uniqueClients = Array.from(
    new Map(appointments.map(a => [a.clientEmail.toLowerCase(), { email: a.clientEmail, name: a.clientName }])).values()
  );

  useEffect(() => {
    if (uniqueClients.length > 0 && !selectedClientEmail) {
      setSelectedClientEmail(uniqueClients[0].email);
      setSelectedClientName(uniqueClients[0].name);
    }
  }, [appointments]);

  // Fetch client clinical data when selection changes
  useEffect(() => {
    if (!selectedClientEmail) return;

    const fetchClientRecords = async () => {
      setIsLoading(true);
      setStatusMsg({ type: '', text: '' });
      try {
        // Fetch Case History
        const chRes = await fetch(`/api/clinical/case-history/${encodeURIComponent(selectedClientEmail)}`, { credentials: 'include' });
        if (chRes.ok) {
          const chData = await chRes.json();
          if (chData) {
            setCaseHistory({
              presentingProblems: chData.presentingProblems || '',
              historyOfPresentIllness: chData.historyOfPresentIllness || '',
              pastPsychiatricHistory: chData.pastPsychiatricHistory || '',
              medicalHistory: chData.medicalHistory || '',
              familyPsychiatricHistory: chData.familyPsychiatricHistory || '',
              personalAndSocialHistory: chData.personalAndSocialHistory || '',
              riskAssessment: chData.riskAssessment || { suicideRisk: 'None', selfHarmRisk: 'None', harmToOthers: 'None', riskNotes: '' }
            });
          } else {
            // Reset to empty
            setCaseHistory({
              presentingProblems: '',
              historyOfPresentIllness: '',
              pastPsychiatricHistory: '',
              medicalHistory: '',
              familyPsychiatricHistory: '',
              personalAndSocialHistory: '',
              riskAssessment: { suicideRisk: 'None', selfHarmRisk: 'None', harmToOthers: 'None', riskNotes: '' }
            });
          }
        }

        // Fetch MSEs
        const mseRes = await fetch(`/api/clinical/mse/${encodeURIComponent(selectedClientEmail)}`, { credentials: 'include' });
        if (mseRes.ok) {
          const mseData = await mseRes.json();
          setMseList(mseData || []);
        }
      } catch (err) {
        console.error('Error fetching clinical data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClientRecords();
  }, [selectedClientEmail]);

  const handleSaveCaseHistory = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    setStatusMsg({ type: '', text: '' });

    try {
      const res = await fetch('/api/clinical/case-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientEmail: selectedClientEmail,
          clientName: selectedClientName,
          ...caseHistory
        })
      });

      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to save case history.');
        throw new Error(errorText);
      }

      setStatusMsg({ type: 'success', text: 'Clinical Case History successfully saved and encrypted.' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleCreateMse = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    setStatusMsg({ type: '', text: '' });

    try {
      const res = await fetch('/api/clinical/mse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientEmail: selectedClientEmail,
          clientName: selectedClientName,
          ...newMse
        })
      });

      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to log MSE record.');
        throw new Error(errorText);
      }

      const created = await safeJson(res);
      if (created) {
        setMseList(prev => [created, ...prev]);
      }
      setStatusMsg({ type: 'success', text: 'Mental Status Examination logged successfully.' });
      setNewMse({
        date: new Date().toISOString().split('T')[0],
        appearanceAndBehavior: '',
        speechAndCommunication: '',
        moodAndAffect: '',
        thoughtProcessAndContent: '',
        perceptualDisturbances: '',
        cognitionAndOrientation: '',
        insightAndJudgment: '',
        clinicalSummary: ''
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="clinical-records-module">
      {/* Client Selector Header */}
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', color: 'var(--color-slate-light)', marginBottom: '0.25rem' }}>
            SELECT CLINICAL CLIENT
          </label>
          <select
            value={selectedClientEmail}
            onChange={(e) => {
              const email = e.target.value;
              setSelectedClientEmail(email);
              const found = uniqueClients.find(c => c.email.toLowerCase() === email.toLowerCase());
              if (found) setSelectedClientName(found.name);
            }}
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.9rem', minWidth: '280px', background: '#fff' }}
          >
            {uniqueClients.map(c => (
              <option key={c.email} value={c.email}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`tab-btn ${activeSubTab === 'case-history' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('case-history')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <FileText size={15} style={{ marginRight: '0.35rem' }} /> Case History & Risk Assessment
          </button>
          <button
            type="button"
            className={`tab-btn ${activeSubTab === 'mse' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('mse')}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <Brain size={15} style={{ marginRight: '0.35rem' }} /> Mental Status Examination (MSE)
          </button>
        </div>
      </div>

      {statusMsg.text && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem',
          background: statusMsg.type === 'success' ? 'rgba(74,140,112,0.1)' : 'rgba(201,93,93,0.1)',
          color: statusMsg.type === 'success' ? '#2A5D48' : 'var(--color-accent-terracotta)'
        }}>
          {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* SUBTAB 1: CASE HISTORY & RISK ASSESSMENT */}
      {activeSubTab === 'case-history' && (
        <form onSubmit={handleSaveCaseHistory} className="glass-card" style={{ padding: '2rem', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-slate-dark)' }}>
              Comprehensive Psychological Case History
            </h3>
            {isReadOnly ? (
              <span style={{ fontSize: '0.75rem', background: '#FFF3E0', color: '#E65100', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                Viewer Mode (Read-Only)
              </span>
            ) : (
              <button type="submit" className="premium-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.25rem' }}>
                <Save size={14} /> Save Case History
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                1. Chief Presenting Complaints & Triggers
              </label>
              <textarea
                rows="4"
                disabled={isReadOnly}
                value={caseHistory.presentingProblems}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, presentingProblems: e.target.value }))}
                placeholder="Specific symptoms, duration, precipitating events, impact on functioning..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                2. History of Present Illness (HPI)
              </label>
              <textarea
                rows="4"
                disabled={isReadOnly}
                value={caseHistory.historyOfPresentIllness}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, historyOfPresentIllness: e.target.value }))}
                placeholder="Onset, trajectory, exacerbating and relieving factors, coping methods used..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                3. Past Psychiatric & Therapy History
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={caseHistory.pastPsychiatricHistory}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, pastPsychiatricHistory: e.target.value }))}
                placeholder="Previous diagnoses, hospitalizations, counseling courses, medications..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                4. Medical & Substance History
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={caseHistory.medicalHistory}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, medicalHistory: e.target.value }))}
                placeholder="Chronic illnesses, physical complaints, alcohol/nicotine/substance use..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                5. Family Psychiatric History
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={caseHistory.familyPsychiatricHistory}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, familyPsychiatricHistory: e.target.value }))}
                placeholder="Familial mental health conditions, suicide history, relational dynamics..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                6. Personal, Occupational & Social History
              </label>
              <textarea
                rows="3"
                disabled={isReadOnly}
                value={caseHistory.personalAndSocialHistory}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, personalAndSocialHistory: e.target.value }))}
                placeholder="Education, work stressors, marital/relationship status, social support network..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Clinical Risk Assessment Section */}
          <div style={{ background: 'rgba(201,93,93,0.05)', border: '1px solid rgba(201,93,93,0.2)', padding: '1.25rem', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'var(--color-accent-terracotta)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
              <AlertTriangle size={16} /> Clinical Risk Assessment Matrix
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Suicide Risk</label>
                <select
                  disabled={isReadOnly}
                  value={caseHistory.riskAssessment.suicideRisk}
                  onChange={(e) => setCaseHistory(prev => ({ ...prev, riskAssessment: { ...prev.riskAssessment, suicideRisk: e.target.value } }))}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.82rem', background: '#fff' }}
                >
                  <option value="None">None</option>
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High (Immediate Protocol)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Self-Harm Risk</label>
                <select
                  disabled={isReadOnly}
                  value={caseHistory.riskAssessment.selfHarmRisk}
                  onChange={(e) => setCaseHistory(prev => ({ ...prev, riskAssessment: { ...prev.riskAssessment, selfHarmRisk: e.target.value } }))}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.82rem', background: '#fff' }}
                >
                  <option value="None">None</option>
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Harm to Others Risk</label>
                <select
                  disabled={isReadOnly}
                  value={caseHistory.riskAssessment.harmToOthers}
                  onChange={(e) => setCaseHistory(prev => ({ ...prev, riskAssessment: { ...prev.riskAssessment, harmToOthers: e.target.value } }))}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.82rem', background: '#fff' }}
                >
                  <option value="None">None</option>
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Safety Planning Notes / Mitigation Protocol</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={caseHistory.riskAssessment.riskNotes}
                onChange={(e) => setCaseHistory(prev => ({ ...prev, riskAssessment: { ...prev.riskAssessment, riskNotes: e.target.value } }))}
                placeholder="Crisis contact given, family notified, safety contract agreed..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.82rem' }}
              />
            </div>
          </div>
        </form>
      )}

      {/* SUBTAB 2: MENTAL STATUS EXAMINATION (MSE) */}
      {activeSubTab === 'mse' && (
        <div style={{ display: 'grid', gridTemplateColumns: isReadOnly ? '1fr' : '1.1fr 0.9fr', gap: '1.5rem' }}>
          {/* New MSE Form (Hidden for Viewers) */}
          {!isReadOnly && (
            <form onSubmit={handleCreateMse} className="glass-card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-slate-dark)' }}>
                  Log Mental Status Examination
                </h4>
                <input
                  type="date"
                  required
                  value={newMse.date}
                  onChange={(e) => setNewMse(prev => ({ ...prev, date: e.target.value }))}
                  style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>1. Appearance & Behavior</label>
                  <input
                    type="text"
                    placeholder="Grooming, eye contact, motor activity, posture..."
                    value={newMse.appearanceAndBehavior}
                    onChange={(e) => setNewMse(prev => ({ ...prev, appearanceAndBehavior: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>2. Speech & Communication</label>
                  <input
                    type="text"
                    placeholder="Rate, volume, tone, latency, fluency..."
                    value={newMse.speechAndCommunication}
                    onChange={(e) => setNewMse(prev => ({ ...prev, speechAndCommunication: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>3. Mood (Subjective) & Affect (Objective)</label>
                  <input
                    type="text"
                    placeholder="e.g. Anxious, dysphoric; affect congruent, blunted, labile..."
                    value={newMse.moodAndAffect}
                    onChange={(e) => setNewMse(prev => ({ ...prev, moodAndAffect: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>4. Thought Process & Content</label>
                  <input
                    type="text"
                    placeholder="Goal-directed, linear, circumstantial; obsessions, ruminations..."
                    value={newMse.thoughtProcessAndContent}
                    onChange={(e) => setNewMse(prev => ({ ...prev, thoughtProcessAndContent: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>5. Cognition, Insight & Judgment</label>
                  <input
                    type="text"
                    placeholder="Alert, oriented x3; intact judgment, fair insight..."
                    value={newMse.cognitionAndOrientation}
                    onChange={(e) => setNewMse(prev => ({ ...prev, cognitionAndOrientation: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>6. Diagnostic Summary & Plan</label>
                  <textarea
                    rows="2"
                    placeholder="Summary of clinical impressions and next steps..."
                    value={newMse.clinicalSummary}
                    onChange={(e) => setNewMse(prev => ({ ...prev, clinicalSummary: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.82rem' }}
                  />
                </div>

                <button type="submit" className="premium-btn" style={{ marginTop: '0.5rem', width: '100%' }}>
                  Submit MSE Record
                </button>
              </div>
            </form>
          )}

          {/* MSE Timeline History */}
          <div className="glass-card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--color-slate-dark)' }}>
              MSE Historical Evaluations ({mseList.length})
            </h4>

            {mseList.length === 0 ? (
              <p style={{ color: 'var(--color-slate-light)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                No Mental Status Examinations logged yet for this client.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                {mseList.map((m, idx) => (
                  <div key={m._id || m.id || idx} style={{ border: '1px solid var(--color-slate-10)', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #f0f0f0', paddingBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-primary-forest)' }}>
                        Date: {formatISTDate(m.date)}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)' }}>
                        Evaluator: {m.counsellorEmail}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-dark)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {m.appearanceAndBehavior && <div><strong>Appearance:</strong> {m.appearanceAndBehavior}</div>}
                      {m.moodAndAffect && <div><strong>Mood/Affect:</strong> {m.moodAndAffect}</div>}
                      {m.thoughtProcessAndContent && <div><strong>Thought:</strong> {m.thoughtProcessAndContent}</div>}
                      {m.clinicalSummary && <div><strong>Summary:</strong> {m.clinicalSummary}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

