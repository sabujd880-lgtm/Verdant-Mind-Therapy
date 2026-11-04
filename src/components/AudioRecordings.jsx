import React, { useState, useEffect } from 'react';
import { Mic, Upload, Play, Pause, Trash2, ShieldCheck, AlertCircle, CheckCircle2, Clock, FileAudio, Lock } from 'lucide-react';
import { formatISTDate } from '../utils/dateTime.js';
import { safeJson, getResponseError } from '../utils/api.js';

export default function AudioRecordings({ appointments = [], currentUser }) {
  const [selectedAptId, setSelectedAptId] = useState('');
  const [recordings, setRecordings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // Upload Form State
  const [audioFile, setAudioFile] = useState(null);
  const [recordingTitle, setRecordingTitle] = useState('');
  const [consentObtained, setConsentObtained] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  // Playback State
  const [activePlaybackUrl, setActivePlaybackUrl] = useState('');
  const [activeRecordingId, setActiveRecordingId] = useState('');
  const [playbackExpiresAt, setPlaybackExpiresAt] = useState(null);

  const isAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator' || currentUser?.role === 'provider';

  useEffect(() => {
    if (appointments.length > 0 && !selectedAptId) {
      setSelectedAptId(appointments[0]._id || appointments[0].id);
    }
  }, [appointments]);

  const selectedApt = appointments.find(a => (a._id === selectedAptId || a.id === selectedAptId));

  const fetchRecordings = async () => {
    if (!selectedAptId) return;
    setIsLoading(true);
    setStatusMsg({ type: '', text: '' });
    try {
      const res = await fetch(`/api/recordings/appointment/${selectedAptId}`, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Could not fetch session recordings.');
        throw new Error(errorText);
      }
      const data = await safeJson(res);
      setRecordings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    setActivePlaybackUrl('');
    setActiveRecordingId('');
  }, [selectedAptId]);

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });

    if (!consentObtained) {
      setStatusMsg({
        type: 'error',
        text: 'Explicit client consent is legally required under healthcare privacy laws before uploading session audio.'
      });
      return;
    }

    if (!audioFile) {
      setStatusMsg({ type: 'error', text: 'Please select an audio recording file.' });
      return;
    }

    if (!selectedApt) {
      setStatusMsg({ type: 'error', text: 'Please choose an associated appointment.' });
      return;
    }

    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('audioFile', audioFile);
      formData.append('appointmentId', selectedApt._id || selectedApt.id);
      formData.append('clientEmail', selectedApt.clientEmail);
      formData.append('clientName', selectedApt.clientName);
      formData.append('title', recordingTitle || `Session Recording - ${selectedApt.date}`);
      formData.append('consentObtained', 'true');
      formData.append('durationSeconds', durationSeconds.toString());

      const res = await fetch('/api/recordings/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to upload audio recording.');
        throw new Error(errorText);
      }

      await safeJson(res);
      setStatusMsg({ type: 'success', text: 'Audio recording securely encrypted and stored.' });
      setAudioFile(null);
      setRecordingTitle('');
      setConsentObtained(false);
      setDurationSeconds(0);
      fetchRecordings();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setUploadLoading(false);
    }
  };

  const handlePlayRecording = async (recId) => {
    try {
      const res = await fetch(`/api/recordings/${recId}/signed-url`, { credentials: 'include' });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Failed to generate signed URL.');
        throw new Error(errorText);
      }
      const data = await safeJson(res);
      if (!data?.url) {
        throw new Error('Streaming URL not provided by server.');
      }

      setActivePlaybackUrl(data.url);
      setActiveRecordingId(recId);
      setPlaybackExpiresAt(new Date(Date.now() + (data.expiresInSeconds || 900) * 1000));
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteRecording = async (recId) => {
    if (!window.confirm('Are you sure you want to delete this clinical recording? This action is audited.')) return;
    try {
      const res = await fetch(`/api/recordings/${recId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const errorText = await getResponseError(res, 'Deletion failed.');
        throw new Error(errorText);
      }
      setStatusMsg({ type: 'success', text: 'Recording securely removed.' });
      if (activeRecordingId === recId) {
        setActivePlaybackUrl('');
        setActiveRecordingId('');
      }
      fetchRecordings();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="audio-recordings-module">
      {/* Appointment Selection Header */}
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', color: 'var(--color-slate-light)', marginBottom: '0.25rem' }}>
            SELECT CONSULTATION SESSION
          </label>
          <select
            value={selectedAptId}
            onChange={(e) => setSelectedAptId(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--color-slate-10)', fontSize: '0.9rem', minWidth: '320px', background: '#fff' }}
          >
            {appointments.map(apt => (
              <option key={apt._id || apt.id} value={apt._id || apt.id}>
                {apt.date} - {apt.clientName} ({apt.sessionMode})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#2A5D48', background: 'rgba(74,140,112,0.1)', padding: '0.5rem 1rem', borderRadius: '20px' }}>
          <ShieldCheck size={16} />
          <span>AES-256 Healthcare Encryption (HIPAA Compliant)</span>
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
          {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }}>
        
        {/* LEFT: RECORDINGS LIST & PLAYER */}
        <div className="glass-card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-sm)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileAudio size={18} /> Encrypted Audio Records ({recordings.length})
          </h3>

          {/* Active Audio Player if short-lived URL generated */}
          {activePlaybackUrl && (
            <div style={{ background: '#FAF9F6', border: '1px solid var(--color-slate-10)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.85rem', color: 'var(--color-slate-dark)' }}>
                  Playing Authorized Secure Stream
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#E65100', background: '#FFF3E0', padding: '2px 8px', borderRadius: '10px' }}>
                  <Clock size={10} style={{ display: 'inline', marginRight: '3px' }} /> Signed URL (15 min validity)
                </span>
              </div>
              <audio controls src={activePlaybackUrl} autoPlay style={{ width: '100%', marginTop: '0.5rem' }} />
            </div>
          )}

          {recordings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate-light)' }}>
              <FileAudio size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No clinical recordings found for this consultation.</p>
              <span style={{ fontSize: '0.78rem' }}>Upload or attach an audio recording using the right panel.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recordings.map(rec => {
                const isPlaying = activeRecordingId === (rec._id || rec.id);

                return (
                  <div
                    key={rec._id || rec.id}
                    style={{
                      border: isPlaying ? '2px solid var(--color-slate)' : '1px solid var(--color-slate-10)',
                      borderRadius: '6px',
                      padding: '1rem',
                      background: '#fff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--color-slate-dark)' }}>
                        {rec.title}
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)', marginTop: '0.2rem', display: 'flex', gap: '0.75rem' }}>
                        <span>Uploaded: {formatISTDate(rec.uploadedAt)}</span>
                        <span>Size: {(rec.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                        <span>Encrypted Audio</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#2A5D48', marginTop: '0.2rem' }}>
                        ✓ Client consent verified on {formatISTDate(rec.consentDate)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handlePlayRecording(rec._id || rec.id)}
                        className="premium-btn"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Play size={12} /> {isPlaying ? 'Playing' : 'Listen'}
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRecording(rec._id || rec.id)}
                          style={{ background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }}
                          title="Secure Delete Recording"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: UPLOAD SESSION RECORDING WITH MANDATORY CONSENT */}
        <div className="glass-card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-sm)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--color-slate-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={18} /> Upload Clinical Session Audio
          </h3>

          <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Recording Title</label>
              <input
                type="text"
                placeholder="e.g. CBT Restructuring Consultation Audio"
                value={recordingTitle}
                onChange={(e) => setRecordingTitle(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Audio Recording File *</label>
              <input
                type="file"
                required
                accept="audio/*,.webm,.wav,.mp3,.m4a"
                onChange={(e) => setAudioFile(e.target.files[0] || null)}
                style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem' }}
              />
            </div>

            {/* MANDATORY CLIENT CONSENT CHECKBOX */}
            <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  required
                  checked={consentObtained}
                  onChange={(e) => setConsentObtained(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span style={{ fontSize: '0.78rem', color: '#5D4037', lineHeight: 1.4 }}>
                  <strong>Client Informed Consent Granted:</strong> I certify that the client has explicitly provided informed written or verbal consent for this clinical therapy session to be recorded for psychological treatment purposes.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={uploadLoading || !consentObtained}
              className="premium-btn"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
                opacity: consentObtained ? 1 : 0.6,
                cursor: consentObtained ? 'pointer' : 'not-allowed'
              }}
            >
              <Lock size={14} /> {uploadLoading ? 'Encrypting & Storing...' : 'Upload & Encrypt Recording'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

