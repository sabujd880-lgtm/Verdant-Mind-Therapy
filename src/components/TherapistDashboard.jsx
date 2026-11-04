import React, { useState } from 'react';
import { 
  Check, X, Eye, Calendar, Clock, Plus, Trash2, 
  Video, PhoneCall, MessageSquare, BookOpen, AlertCircle,
  Inbox, FileText, Receipt, Mail, Send, Printer, CheckCircle2, Clipboard,
  RefreshCw, ChevronLeft, ChevronRight, Users
} from 'lucide-react';
import ClinicalRecords from './ClinicalRecords';
import AudioRecordings from './AudioRecordings';
import AdminManagement from './AdminManagement';
import PatientProfileManager from './PatientProfileManager';
import { 
  formatISTDate, 
  formatISTTime, 
  formatISTDateTimeWithZone, 
  normalizeToISTDate, 
  isSameISTDate,
  getISTWeekDays,
  getNowIST 
} from '../utils/dateTime.js';

export default function TherapistDashboard({ 
  appointments, 
  availability, 
  onUpdateStatus, 
  onUpdateNotes, 
  onUpdateAvailability,
  messages = [],
  onReplyMessage,
  onUpdateMessageStatus,
  onAddCareDocument,
  currentUser
}) {
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' | 'messages' | 'documents' | 'availability' | 'clinical-records' | 'recordings' | 'admin'
  const [scheduleView, setScheduleView] = useState('table'); // 'table' | 'week' | 'day'
  const [currentScheduleDate, setCurrentScheduleDate] = useState(() => getNowIST().dateObj);
  const [selectedApt, setSelectedApt] = useState(null); // For detailed inquiry viewer modal
  const [tempNotes, setTempNotes] = useState('');
  const [newBlockedDate, setNewBlockedDate] = useState('');

  // Rescheduling Modal State
  const [rescheduleApt, setRescheduleApt] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '10:00 AM', durationMinutes: 60, reason: '' });
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSuccess, setRescheduleSuccess] = useState('');

  // Cancellation Modal State
  const [cancelModalApt, setCancelModalApt] = useState(null);
  const [cancelReasonText, setCancelReasonText] = useState('');

  // Messaging Portal States
  const [selectedMsgId, setSelectedMsgId] = useState(messages[0]?.id || null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [composeData, setComposeData] = useState({
    toEmail: '',
    toName: '',
    subject: '',
    messageText: ''
  });
  const [composeSuccess, setComposeSuccess] = useState(false);

  // Document Center States
  const [selectedAptIdForDoc, setSelectedAptIdForDoc] = useState(appointments[0]?.id || '');
  const [docType, setDocType] = useState('receipt'); // 'receipt' | 'prescription' | 'report'
  
  // Doc fields: Receipt
  const [invoiceNo, setInvoiceNo] = useState('INV-2026-' + Math.floor(1000 + Math.random() * 9000));
  const [receiptAmount, setReceiptAmount] = useState('1500');
  const [paymentMethod, setPaymentMethod] = useState('UPI / QR Scan');
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [receiptServices, setReceiptServices] = useState('Cognitive Behavioral Therapy (CBT) Session');

  // Doc fields: Prescription / Therapeutic Plan
  const [prescDiagnosis, setPrescDiagnosis] = useState('Generalized Anxiety & Mild Executive Dysfunction');
  const [prescItems, setPrescItems] = useState([
    { name: 'Diaphragmatic Breathing Exercises (CBT / DBT)', dose: '5-second inhale, 7-second exhale technique', freq: 'Twice daily & during acute stress spikes', duration: '21 Days' },
    { name: 'Cognitive Thought Record Log (CBT Work)', dose: 'Identify triggers, automatic negative thoughts, and write rational counters', freq: 'Once daily (Every evening)', duration: 'Ongoing' }
  ]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDose, setNewItemDose] = useState('');
  const [newItemFreq, setNewItemFreq] = useState('');
  const [newItemDuration, setNewItemDuration] = useState('');
  const [prescRefills, setPrescRefills] = useState('Review progress during next session');

  // Doc fields: Report
  const [reportSummary, setReportSummary] = useState('Client exhibits symptoms of moderate occupational burnout and stress. Initial assessment points to boundary boundary settings issues in work-life integration.');
  const [reportObservations, setReportObservations] = useState('Client was cooperative and open. Displayed some psychomotor agitation when discussing manager conflicts. Responds well to behavioral modeling.');
  const [reportHomework, setReportHomework] = useState('1. Keep a 5-day sleep journal.\n2. Practice 10 minutes of box breathing daily during lunch breaks.');
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [polishingField, setPolishingField] = useState(null);

  // Simulated Email SMTP Sending States
  const [sendingState, setSendingState] = useState('idle'); // 'idle' | 'compiling' | 'smtp' | 'sending' | 'success'
  const [sendingProgress, setSendingProgress] = useState(0);

  // Metrics calculation
  const totalBookings = appointments.length;
  const pendingCount = appointments.filter(a => a.status === 'Pending').length;
  const confirmedCount = appointments.filter(a => a.status === 'Confirmed').length;
  const unreadMessagesCount = messages.filter(m => m.status === 'unread').length;

  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Open modal viewer
  const handleOpenDetails = (apt) => {
    setSelectedApt(apt);
    setTempNotes(apt.notes || '');
  };

  const handleSaveNotes = () => {
    onUpdateNotes(selectedApt._id || selectedApt.id, tempNotes);
    setSelectedApt(null);
  };

  // Availability updates
  const handleToggleDay = (dayIndex) => {
    let updatedDays = [...availability.workingDays];
    if (updatedDays.includes(dayIndex)) {
      if (updatedDays.length > 1) {
        updatedDays = updatedDays.filter(d => d !== dayIndex);
      }
    } else {
      updatedDays.push(dayIndex);
      updatedDays.sort();
    }
    onUpdateAvailability({ ...availability, workingDays: updatedDays });
  };

  const handleHourChange = (e) => {
    const { name, value } = e.target;
    onUpdateAvailability({ ...availability, [name]: value });
  };

  const handleAddBlockedDate = (e) => {
    e.preventDefault();
    if (!newBlockedDate) return;
    const normDate = normalizeToISTDate(newBlockedDate);
    if (!availability.blockedDates.some(d => isSameISTDate(d, normDate))) {
      const updatedBlocked = [...availability.blockedDates, normDate];
      onUpdateAvailability({ ...availability, blockedDates: updatedBlocked });
    }
    setNewBlockedDate('');
  };

  const handleRemoveBlockedDate = (dateToRemove) => {
    const updatedBlocked = availability.blockedDates.filter(d => !isSameISTDate(d, dateToRemove) && d !== dateToRemove);
    onUpdateAvailability({ ...availability, blockedDates: updatedBlocked });
  };

  // Rescheduling Submit Handler
  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!rescheduleApt) return;
    setRescheduleError('');
    setRescheduleSuccess('');

    try {
      const res = await fetch(`/api/appointments/${rescheduleApt._id || rescheduleApt.id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: rescheduleForm.date,
          time: rescheduleForm.time,
          durationMinutes: Number(rescheduleForm.durationMinutes) || 60,
          reason: rescheduleForm.reason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule appointment.');

      setRescheduleSuccess('Session successfully rescheduled! Confirmation notice dispatched to client.');
      if (onUpdateStatus) {
        onUpdateStatus(rescheduleApt._id || rescheduleApt.id, 'Confirmed', data);
      }
      setTimeout(() => {
        setRescheduleApt(null);
        setRescheduleSuccess('');
      }, 1500);
    } catch (err) {
      setRescheduleError(err.message);
    }
  };

  // Cancellation with Reason Submit Handler
  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!cancelModalApt) return;
    try {
      await fetch(`/api/appointments/${cancelModalApt._id || cancelModalApt.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'Cancelled',
          cancellationReason: cancelReasonText
        })
      });
      if (onUpdateStatus) {
        onUpdateStatus(cancelModalApt._id || cancelModalApt.id, 'Cancelled');
      }
      setCancelModalApt(null);
      setCancelReasonText('');
    } catch (err) {
      console.error('Cancellation error:', err);
    }
  };

  // Helper for session modes icons
  const getModeIcon = (mode) => {
    switch (mode) {
      case 'Video Session':
        return <Video size={14} />;
      case 'Audio Session':
        return <PhoneCall size={14} />;
      case 'Chat Session':
        return <MessageSquare size={14} />;
      default:
        return null;
    }
  };

  // Messaging operations
  const handleSelectMessage = (msg) => {
    setSelectedMsgId(msg._id || msg.id);
    if (msg.status === 'unread') {
      onUpdateMessageStatus(msg._id || msg.id, 'read');
    }
  };

  const handleSendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    onReplyMessage(selectedMsgId, replyText);
    setReplyText('');
    setIsReplying(false);
  };

  const handleComposeSubmit = (e) => {
    e.preventDefault();
    if (!composeData.toEmail || !composeData.subject || !composeData.messageText) return;

    // Simulate sending composed message
    const clientMsg = {
      id: 'msg-' + Date.now(),
      senderName: 'Sabuj Das (Sent)',
      senderEmail: composeData.toEmail,
      subject: composeData.subject,
      message: composeData.messageText,
      timestamp: new Date().toISOString(),
      status: 'replied',
      replies: []
    };

    onReplyMessage(clientMsg.id, `Original outgoing letter to ${composeData.toName || composeData.toEmail}: ${composeData.messageText}`);
    setComposeSuccess(true);
    setTimeout(() => {
      setComposeSuccess(false);
      setIsComposing(false);
      setComposeData({ toEmail: '', toName: '', subject: '', messageText: '' });
    }, 2000);
  };

  // Prescriptions List modifiers
  const handleAddPrescItem = (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    setPrescItems([...prescItems, {
      name: newItemName,
      dose: newItemDose || 'As directed',
      freq: newItemFreq || 'Once daily',
      duration: newItemDuration || 'Ongoing'
    }]);
    setNewItemName('');
    setNewItemDose('');
    setNewItemFreq('');
    setNewItemDuration('');
  };

  const handleRemovePrescItem = (index) => {
    setPrescItems(prescItems.filter((_, idx) => idx !== index));
  };

  // Find currently selected appointment object for Document Generation
  const selectedAptForDoc = appointments.find(a => a._id === selectedAptIdForDoc || a.id === selectedAptIdForDoc) || appointments[0];

  // Document Simulation Trigger
  const handleSendToClientEmail = () => {
    setSendingState('compiling');
    setSendingProgress(15);

    setTimeout(() => {
      setSendingState('smtp');
      setSendingProgress(45);
    }, 800);

    setTimeout(() => {
      setSendingState('sending');
      setSendingProgress(75);
    }, 1600);

    setTimeout(() => {
      setSendingState('success');
      setSendingProgress(100);

      // Securely store care document for client access
      if (onAddCareDocument && selectedAptForDoc) {
        onAddCareDocument({
          id: 'doc-' + Date.now(),
          clientEmail: selectedAptForDoc.clientEmail,
          clientName: selectedAptForDoc.clientName,
          type: docType,
          date: new Date().toISOString().split('T')[0],
          data: docType === 'receipt' ? {
            invoiceNo,
            receiptAmount,
            paymentMethod,
            paymentStatus,
            receiptServices
          } : docType === 'prescription' ? {
            prescDiagnosis,
            prescItems,
            prescRefills
          } : {
            reportSummary,
            reportObservations,
            reportHomework
          }
        });
      }
    }, 2500);
  };

  const handleCloseSendingModal = () => {
    setSendingState('idle');
    setSendingProgress(0);
  };

  const handlePrintDocument = () => {
    window.print();
  };

  const handlePolishField = async (fieldName, currentValue, setterFn) => {
    if (!currentValue || !currentValue.trim()) return;
    setPolishingField(fieldName);
    try {
      const response = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentValue })
      });
      if (!response.ok) {
        throw new Error('Polishing failed');
      }
      const data = await response.json();
      setterFn(data.polishedText);
    } catch (err) {
      console.error(err);
      alert('AI polishing failed. Ensure the server is running with a valid Gemini API key.');
    } finally {
      setPolishingField(null);
    }
  };

  return (
    <div className="container dashboard-container">
      
      {/* Title & Tab switch */}
      <div className="dashboard-title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(42, 71, 62, 0.15)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <h2>Therapist Control Panel</h2>
            <p style={{ color: 'var(--color-slate-light)' }}>
              Welcome back, Sabuj Das. Manage your schedule, view inbox messages, compile clinical reports, and manage shift hours.
            </p>
          </div>
        </div>
        
        <div className="dashboard-tabs">
          <button 
            className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            Appointments & Inquiries
          </button>
          <button 
            className={`tab-btn ${activeTab === 'profiles' ? 'active' : ''}`}
            onClick={() => setActiveTab('profiles')}
          >
            Patient Profiles
          </button>
          <button 
            className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('messages');
              if (messages.length > 0 && !selectedMsgId) {
                setSelectedMsgId(messages[0].id);
              }
            }}
          >
            Message Portal {unreadMessagesCount > 0 && <span className="tab-badge-count">{unreadMessagesCount}</span>}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Document Center
          </button>
          <button 
            className={`tab-btn ${activeTab === 'clinical-records' ? 'active' : ''}`}
            onClick={() => setActiveTab('clinical-records')}
          >
            Clinical Records & MSE
          </button>
          <button 
            className={`tab-btn ${activeTab === 'recordings' ? 'active' : ''}`}
            onClick={() => setActiveTab('recordings')}
          >
            Session Recordings
          </button>
          <button 
            className={`tab-btn ${activeTab === 'availability' ? 'active' : ''}`}
            onClick={() => setActiveTab('availability')}
          >
            Availability Settings
          </button>
          {(currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator' || currentUser?.role === 'provider') && (
            <button 
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
              style={{ fontWeight: 600, borderLeft: '2px solid var(--color-slate-light)' }}
            >
              Admin Governance
            </button>
          )}
        </div>
      </div>

      {/* Metric summary counters */}
      <div className="metrics-row" style={{ marginBottom: '2.5rem' }}>
        <div className="metric-card all glass-card" onClick={() => setActiveTab('appointments')} style={{ cursor: 'pointer' }}>
          <div className="metric-icon-box">
            <BookOpen size={20} />
          </div>
          <div className="metric-info">
            <h4>Total Inquiries</h4>
            <p>{totalBookings}</p>
          </div>
        </div>
        <div className="metric-card pending" onClick={() => setActiveTab('appointments')} style={{ cursor: 'pointer' }}>
          <div className="metric-icon-box">
            <Clock size={20} />
          </div>
          <div className="metric-info">
            <h4>Pending Review</h4>
            <p>{pendingCount}</p>
          </div>
        </div>
        <div className="metric-card confirmed" onClick={() => setActiveTab('appointments')} style={{ cursor: 'pointer' }}>
          <div className="metric-icon-box">
            <Check size={20} />
          </div>
          <div className="metric-info">
            <h4>Confirmed Sessions</h4>
            <p>{confirmedCount}</p>
          </div>
        </div>
        <div className="metric-card messages-metric glass-card" onClick={() => setActiveTab('messages')} style={{ cursor: 'pointer', borderLeft: '4px solid var(--color-slate)' }}>
          <div className="metric-icon-box" style={{ color: 'var(--color-slate)', background: 'var(--color-sage)' }}>
            <Inbox size={20} />
          </div>
          <div className="metric-info">
            <h4>Inbox Messages</h4>
            <p>{messages.length} ({unreadMessagesCount} new)</p>
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      
      {/* 1. Appointments and Inquiries */}
      {activeTab === 'appointments' && (
        <div className="glass-card appointments-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Clients & Booking Schedule</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-slate-light)' }}>
                Authoritative IST (Asia/Kolkata) • {appointments.length} Total Records
              </span>
            </div>

            {/* Schedule View Selector */}
            <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.04)', padding: '3px', borderRadius: '6px', border: '1px solid var(--color-slate-10)' }}>
              {[
                { id: 'table', label: 'Table View' },
                { id: 'week', label: 'Week Schedule' },
                { id: 'day', label: 'Day Timeline' }
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: scheduleView === v.id ? 'var(--color-primary)' : 'transparent',
                    color: scheduleView === v.id ? '#fff' : 'inherit',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => setScheduleView(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* VIEW 1: TABLE VIEW */}
          {scheduleView === 'table' && (
            <div className="table-responsive">
              {appointments.length === 0 ? (
                <div className="no-data-state">
                  <AlertCircle size={40} />
                  <p>No bookings or inquiries submitted yet.</p>
                </div>
              ) : (
                <table className="appointments-table">
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Date & Time (IST)</th>
                      <th>Duration</th>
                      <th>Session Mode</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...appointments].reverse().map((apt) => (
                      <tr key={apt._id || apt.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{apt.clientName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)' }}>{apt.clientAgeGroup || 'Client'}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Calendar size={14} style={{ color: 'var(--color-slate-light)' }} />
                            <span>{formatISTDate(apt.date)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                            <Clock size={12} />
                            <span>{formatISTTime(apt.time)}</span>
                          </div>
                          {apt.rescheduledFrom && (
                            <div style={{ fontSize: '0.68rem', color: '#DF9B34', marginTop: '2px' }}>
                              Rescheduled from {apt.rescheduledFrom.date} {apt.rescheduledFrom.time}
                            </div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{apt.durationMinutes || 60}m</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-slate-light)', display: 'block' }}>+{apt.bufferMinutes !== undefined ? apt.bufferMinutes : 15}m buf</span>
                        </td>
                        <td>
                          <span className="mode-badge">
                            {getModeIcon(apt.sessionMode)}
                            {apt.sessionMode}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${(apt.status || 'Pending').toLowerCase()}`}>
                            <span className="badge-dot"></span>
                            {apt.status || 'Pending'}
                          </span>
                          {apt.status === 'Cancelled' && apt.cancellationReason && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--color-cancelled)', marginTop: '2px', maxWidth: '140px' }} title={apt.cancellationReason}>
                              {apt.cancellationReason}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="action-row">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Review details, write notes, and generate clinical documents"
                              onClick={() => handleOpenDetails(apt)}
                            >
                              <Eye size={14} />
                            </button>

                            {/* Reschedule Button */}
                            {apt.status !== 'Cancelled' && (
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="Reschedule Session"
                                onClick={() => {
                                  setRescheduleApt(apt);
                                  setRescheduleForm({
                                    date: apt.date,
                                    time: apt.time,
                                    durationMinutes: apt.durationMinutes || 60,
                                    reason: ''
                                  });
                                  setRescheduleError('');
                                  setRescheduleSuccess('');
                                }}
                              >
                                <RefreshCw size={14} />
                              </button>
                            )}
                            
                            {(apt.status || 'Pending') !== 'Confirmed' && apt.status !== 'Cancelled' && (
                              <button
                                type="button"
                                className="action-icon-btn approve"
                                title="Confirm Session"
                                onClick={() => onUpdateStatus(apt._id || apt.id, 'Confirmed')}
                              >
                                <Check size={14} />
                              </button>
                            )}
                            
                            {(apt.status || 'Pending') !== 'Cancelled' && (
                              <button
                                type="button"
                                className="action-icon-btn cancel"
                                title="Cancel Session"
                                onClick={() => {
                                  setCancelModalApt(apt);
                                  setCancelReasonText('');
                                }}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* VIEW 2: WEEK SCHEDULE VIEW */}
          {scheduleView === 'week' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0.5rem 0' }}>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={() => {
                    const prevWk = new Date(currentScheduleDate);
                    prevWk.setDate(currentScheduleDate.getDate() - 7);
                    setCurrentScheduleDate(prevWk);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#fff', border: '1px solid var(--color-slate-10)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  <ChevronLeft size={16} /> Previous Week
                </button>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  Week of {formatISTDate(getISTWeekDays(currentScheduleDate)[0]?.dateStr)} to {formatISTDate(getISTWeekDays(currentScheduleDate)[6]?.dateStr)}
                </div>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={() => {
                    const nextWk = new Date(currentScheduleDate);
                    nextWk.setDate(currentScheduleDate.getDate() + 7);
                    setCurrentScheduleDate(nextWk);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#fff', border: '1px solid var(--color-slate-10)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Next Week <ChevronRight size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', minHeight: '340px' }}>
                {getISTWeekDays(currentScheduleDate).map((dayItem) => {
                  const dayApts = appointments.filter(a => isSameISTDate(a.date, dayItem.dateStr));
                  const isBlocked = (availability.blockedDates || []).some(b => isSameISTDate(b, dayItem.dateStr));

                  return (
                    <div
                      key={dayItem.dateStr}
                      style={{
                        background: isBlocked ? 'rgba(0,0,0,0.02)' : '#fff',
                        border: '1px solid var(--color-slate-10)',
                        borderRadius: '8px',
                        padding: '0.6rem 0.4rem',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <div style={{ textAlign: 'center', borderBottom: '1px solid var(--color-slate-10)', paddingBottom: '0.4rem', marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-slate-light)' }}>{dayItem.weekdayShort}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{dayItem.dayNumber}</div>
                        {isBlocked && (
                          <span style={{ fontSize: '0.62rem', background: 'rgba(201,93,93,0.1)', color: 'var(--color-cancelled)', padding: '1px 4px', borderRadius: '3px' }}>
                            Blocked
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, overflowY: 'auto' }}>
                        {dayApts.length === 0 ? (
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)', textAlign: 'center', margin: 'auto 0' }}>
                            No sessions
                          </div>
                        ) : (
                          dayApts.map((apt) => (
                            <div
                              key={apt._id || apt.id}
                              onClick={() => handleOpenDetails(apt)}
                              style={{
                                padding: '0.4rem',
                                borderRadius: '4px',
                                background: apt.status === 'Confirmed' ? 'rgba(74,140,112,0.1)' : apt.status === 'Cancelled' ? 'rgba(201,93,93,0.08)' : 'rgba(223,155,52,0.12)',
                                borderLeft: `3px solid ${apt.status === 'Confirmed' ? '#4A8C70' : apt.status === 'Cancelled' ? '#C95D5D' : '#DF9B34'}`,
                                fontSize: '0.72rem',
                                cursor: 'pointer'
                              }}
                            >
                              <div style={{ fontWeight: 700, color: 'var(--color-slate-dark)' }}>{apt.time}</div>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.clientName}</div>
                              <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>{apt.sessionMode?.split(' ')[0]}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 3: DAY TIMELINE VIEW */}
          {scheduleView === 'day' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0.5rem 0' }}>
                <button
                  type="button"
                  onClick={() => {
                    const prevD = new Date(currentScheduleDate);
                    prevD.setDate(currentScheduleDate.getDate() - 1);
                    setCurrentScheduleDate(prevD);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#fff', border: '1px solid var(--color-slate-10)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  <ChevronLeft size={16} /> Previous Day
                </button>
                <div style={{ textAlign: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{formatISTDate(currentScheduleDate)} (IST)</h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>
                    Practice Hours: {availability.startHour || '09:00'} - {availability.endHour || '17:00'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextD = new Date(currentScheduleDate);
                    nextD.setDate(currentScheduleDate.getDate() + 1);
                    setCurrentScheduleDate(nextD);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#fff', border: '1px solid var(--color-slate-10)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Next Day <ChevronRight size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
                {appointments
                  .filter(a => isSameISTDate(a.date, currentScheduleDate))
                  .length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-slate-light)' }}>
                    No sessions scheduled for this day.
                  </div>
                ) : (
                  appointments
                    .filter(a => isSameISTDate(a.date, currentScheduleDate))
                    .map((apt) => (
                      <div
                        key={apt._id || apt.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.85rem 1.25rem',
                          background: '#fff',
                          border: '1px solid var(--color-slate-10)',
                          borderRadius: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', minWidth: '90px' }}>
                            {apt.time}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-slate-dark)' }}>{apt.clientName}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)' }}>{apt.clientEmail} • {apt.sessionMode} • {apt.durationMinutes || 60}m</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span className={`status-badge ${(apt.status || 'Pending').toLowerCase()}`}>
                            {apt.status || 'Pending'}
                          </span>
                          <button
                            type="button"
                            className="action-icon-btn"
                            onClick={() => handleOpenDetails(apt)}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Message Sender/Receiver Portal */}
      {activeTab === 'messages' && (
        <div className="messages-tab-container glass-card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: '520px', overflow: 'hidden', padding: 0 }}>
          
          {/* Inbox Sidebar List */}
          <div className="messages-sidebar" style={{ borderRight: '1px solid var(--color-slate-10)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--color-slate-10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Inbox size={18} />
                Client Inbox
              </h3>
              <button 
                className="premium-btn" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setIsComposing(true)}
              >
                Compose
              </button>
            </div>

            <div className="messages-list custom-scroll" style={{ overflowY: 'auto', flex: 1 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-slate-light)' }}>No messages found.</div>
              ) : (
                [...messages].reverse().map((msg) => {
                  const isSelected = selectedMsgId === msg.id;
                  return (
                    <div 
                      key={msg._id || msg.id}
                      className={`message-item-card ${isSelected ? 'selected' : ''} ${msg.status}`}
                      onClick={() => handleSelectMessage(msg)}
                      style={{
                        padding: '1rem',
                        borderBottom: '1px solid var(--color-slate-05)',
                        cursor: 'pointer',
                        transition: 'var(--transition-fast)',
                        backgroundColor: isSelected ? 'rgba(42, 71, 62, 0.07)' : 'transparent',
                        borderLeft: msg.status === 'unread' ? '4px solid var(--color-pending)' : '4px solid transparent'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: msg.status === 'unread' ? 700 : 600, color: 'var(--color-slate-dark)' }}>{msg.senderName}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-slate-light)' }}>
                          {formatISTDate(msg.timestamp)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: msg.status === 'unread' ? 600 : 400, color: 'var(--color-slate)' }}>{msg.subject}</div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>
                        {msg.message}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Details & Replies Pane */}
          <div className="messages-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '520px' }}>
            {isComposing ? (
              /* Compose Pane */
              <form onSubmit={handleComposeSubmit} style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.25rem' }}>Compose Outbound Message</h3>
                  <button type="button" className="action-icon-btn" onClick={() => setIsComposing(false)}>
                    <X size={20} />
                  </button>
                </div>

                {composeSuccess ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'var(--color-confirmed-bg)', color: 'var(--color-confirmed)', marginBottom: '1rem' }}>
                      <CheckCircle2 size={36} />
                    </div>
                    <h4>Message Dispatched Successfully!</h4>
                    <p style={{ color: 'var(--color-slate-light)', fontSize: '0.9rem' }}>Outgoing record logged under sent messages.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Recipient Email Address *</label>
                        <input 
                          type="email" 
                          required
                          placeholder="e.g. client@example.com"
                          value={composeData.toEmail}
                          onChange={e => setComposeData({...composeData, toEmail: e.target.value})}
                          style={{ padding: '0.65rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Recipient Full Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. John Doe"
                          value={composeData.toName}
                          onChange={e => setComposeData({...composeData, toName: e.target.value})}
                          style={{ padding: '0.65rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Subject *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g., Session materials & exercises follow up"
                        value={composeData.subject}
                        onChange={e => setComposeData({...composeData, subject: e.target.value})}
                        style={{ padding: '0.65rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Message Text *</label>
                      <textarea 
                        required
                        rows="8"
                        placeholder="Write your email letter here..."
                        value={composeData.messageText}
                        onChange={e => setComposeData({...composeData, messageText: e.target.value})}
                        style={{ padding: '0.65rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'none', flex: 1 }}
                      ></textarea>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      <button type="button" className="premium-btn-outline" onClick={() => setIsComposing(false)}>Cancel</button>
                      <button type="submit" className="premium-btn"><Send size={16} /> Send Email</button>
                    </div>
                  </>
                )}
              </form>
            ) : (
              /* Selected Message details view */
              (() => {
                const currentMsg = messages.find(m => m.id === selectedMsgId);
                if (!currentMsg) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-slate-light)' }}>
                      <MessageSquare size={36} style={{ marginBottom: '0.5rem' }} />
                      <p>Select an inquiry to read detailed messages</p>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
                    {/* Header details */}
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-slate-10)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.2rem' }}>{currentMsg.subject}</h3>
                          <p style={{ fontSize: '0.88rem', color: 'var(--color-slate)' }}>
                            From: <strong>{currentMsg.senderName}</strong> &lt;{currentMsg.senderEmail}&gt;
                          </p>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                          {formatISTDateTimeWithZone(currentMsg.timestamp)}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <span className={`status-badge ${currentMsg.status === 'replied' ? 'confirmed' : 'pending'}`}>
                          {currentMsg.status === 'replied' ? 'Replied' : 'Awaiting Reply'}
                        </span>
                      </div>
                    </div>

                    {/* Message body + Replies */}
                    <div className="custom-scroll" style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', backgroundColor: '#FAF9F6' }}>
                      {/* Original Client Inquiry Message */}
                      <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-05)', boxShadow: 'var(--shadow-sm)', marginBottom: '1.5rem' }}>
                        <div style={{ borderBottom: '1px solid var(--color-slate-05)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-slate-light)' }}>
                          INCOMING MESSAGE FROM CLIENT:
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-slate-dark)', fontSize: '0.95rem' }}>{currentMsg.message}</p>
                      </div>

                      {/* Outgoing Replies list */}
                      {currentMsg.replies && currentMsg.replies.map((reply) => (
                        <div key={reply.id} style={{ background: 'var(--color-confirmed-bg)', border: '1px solid rgba(74, 140, 112, 0.15)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', marginLeft: '2rem', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(74, 140, 112, 0.1)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-confirmed)' }}>
                            <span>SENT REPLY (DISPATCHED OUTBOX):</span>
                            <span>{formatISTDateTimeWithZone(reply.timestamp)}</span>
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-slate-dark)', fontSize: '0.95rem' }}>{reply.message}</p>
                        </div>
                      ))}
                    </div>

                    {/* Compose Reply footer panel */}
                    <div style={{ padding: '1.25rem', borderTop: '1px solid var(--color-slate-10)', backgroundColor: '#FFF' }}>
                      {isReplying ? (
                        <form onSubmit={handleSendReply}>
                          <textarea
                            required
                            rows="4"
                            placeholder={`Reply to ${currentMsg.senderName}... Client will receive this reply on email.`}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical', marginBottom: '0.75rem' }}
                          ></textarea>
                          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="premium-btn-outline" style={{ padding: '0.5rem 1rem' }} onClick={() => setIsReplying(false)}>Cancel</button>
                            <button type="submit" className="premium-btn" style={{ padding: '0.5rem 1.25rem' }}><Send size={14} /> Send Reply via Email</button>
                          </div>
                        </form>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--color-slate-light)' }}>
                            Outgoing replies are automatically logged and simulated as dispatched to client's email address.
                          </span>
                          <button type="button" className="premium-btn" onClick={() => setIsReplying(true)}>
                            Reply to Client
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* 3. Document Generator Tab */}
      {activeTab === 'documents' && (
        <div className="document-tab-grid" style={{ display: 'grid', gridTemplateColumns: '430px 1fr', gap: '1.5rem' }}>
          
          {/* Left Panel: Document Creator Form */}
          <div className="glass-card doc-form-panel" style={{ padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} />
              1. Document Composer
            </h3>

            {/* Select Client Dropdown */}
            <div className="settings-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="doc-client" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Select Target Consultation Client:</label>
              <select
                id="doc-client"
                value={selectedAptIdForDoc}
                onChange={(e) => setSelectedAptIdForDoc(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', outline: 'none' }}
              >
                {appointments.length === 0 ? (
                  <option value="">No clients available</option>
                ) : (
                  appointments.map(apt => (
                    <option key={apt._id || apt.id} value={apt._id || apt.id}>{apt.clientName} ({formatISTDate(apt.date)} @ {formatISTTime(apt.time)})</option>
                  ))
                )}
              </select>
            </div>

            {/* Document Type Selector */}
            <div className="settings-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Select Document Template:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`tab-btn ${docType === 'receipt' ? 'active' : ''}`}
                  onClick={() => { setDocType('receipt'); setReceiptVerified(false); }}
                  style={{ fontSize: '0.8rem', padding: '0.6rem 0.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--color-slate-10)' }}
                >
                  <Receipt size={16} />
                  Receipt
                </button>
                <button
                  type="button"
                  className={`tab-btn ${docType === 'prescription' ? 'active' : ''}`}
                  onClick={() => { setDocType('prescription'); setReceiptVerified(false); }}
                  style={{ fontSize: '0.8rem', padding: '0.6rem 0.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--color-slate-10)' }}
                >
                  <FileText size={16} />
                  Therapeutic Plan
                </button>
                <button
                  type="button"
                  className={`tab-btn ${docType === 'report' ? 'active' : ''}`}
                  onClick={() => { setDocType('report'); setReceiptVerified(false); }}
                  style={{ fontSize: '0.8rem', padding: '0.6rem 0.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--color-slate-10)' }}
                >
                  <Clipboard size={16} />
                  Clinical Report
                </button>
              </div>
            </div>

            <hr style={{ border: '0', borderTop: '1px solid var(--color-slate-10)', marginBottom: '1.25rem' }} />

            {/* Contextual Template Fields */}
            
            {/* TYPE A: PAYMENT RECEIPT FIELDS */}
            {docType === 'receipt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Receipt Invoice No.</label>
                    <input 
                      type="text"
                      value={invoiceNo}
                      onChange={e => { setInvoiceNo(e.target.value); setReceiptVerified(false); }}
                      style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', outline: 'none', background: '#fff', transition: 'border-color 0.2s' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Amount Charged (INR)</label>
                    <input 
                      type="number"
                      value={receiptAmount}
                      onChange={e => { setReceiptAmount(e.target.value); setReceiptVerified(false); }}
                      style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', outline: 'none', background: '#fff', transition: 'border-color 0.2s' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Payment Method</label>
                    <input 
                      type="text"
                      value={paymentMethod}
                      onChange={e => { setPaymentMethod(e.target.value); setReceiptVerified(false); }}
                      style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', outline: 'none', background: '#fff', transition: 'border-color 0.2s' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Payment Status</label>
                    <select
                      value={paymentStatus}
                      onChange={e => { setPaymentStatus(e.target.value); setReceiptVerified(false); }}
                      style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', outline: 'none', background: '#fff', cursor: 'pointer' }}
                    >
                      <option value="Paid">Paid / Confirmed</option>
                      <option value="Refunded">Refunded</option>
                      <option value="Unpaid">Unpaid / Invoice Sent</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Services Rendered Description</label>
                  <textarea 
                    rows="3"
                    value={receiptServices}
                    onChange={e => { setReceiptServices(e.target.value); setReceiptVerified(false); }}
                    style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', resize: 'none', outline: 'none', background: '#fff', lineHeight: '1.4' }}
                  ></textarea>
                </div>

                {/* Verification Checkbox Card */}
                <div style={{ 
                  background: receiptVerified ? 'rgba(74, 140, 112, 0.08)' : 'rgba(223, 155, 52, 0.08)', 
                  border: receiptVerified ? '1px solid rgba(74, 140, 112, 0.2)' : '1px solid rgba(223, 155, 52, 0.2)', 
                  borderRadius: 'var(--radius-sm)', 
                  padding: '0.85rem', 
                  marginTop: '0.4rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  transition: 'all 0.2s ease-in-out'
                }}>
                  <input 
                    type="checkbox" 
                    id="receipt-verify-chk"
                    checked={receiptVerified}
                    onChange={e => setReceiptVerified(e.target.checked)}
                    style={{ marginTop: '0.2rem', width: '15px', height: '15px', cursor: 'pointer' }}
                  />
                  <label htmlFor="receipt-verify-chk" style={{ fontSize: '0.78rem', color: 'var(--color-slate-dark)', cursor: 'pointer', lineHeight: '1.45', userSelect: 'none' }}>
                    <strong style={{ color: receiptVerified ? 'var(--color-confirmed)' : 'var(--color-terracotta)', display: 'block', marginBottom: '0.15rem' }}>
                      {receiptVerified ? '✓ Details Verified' : '⚠️ Verification Required'}
                    </strong>
                    I confirm that the invoice details, including the charged amount of <strong>₹{receiptAmount}</strong>, are correct for <strong>{selectedAptForDoc ? selectedAptForDoc.clientName : 'the client'}</strong>.
                  </label>
                </div>
              </div>
            )}

            {/* TYPE B: CLINICAL THERAPEUTIC PLAN FIELDS */}
            {docType === 'prescription' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Clinical Indications / Diagnosis</label>
                    <button 
                      type="button" 
                      onClick={() => handlePolishField('prescDiagnosis', prescDiagnosis, setPrescDiagnosis)} 
                      disabled={!prescDiagnosis.trim() || polishingField === 'prescDiagnosis'}
                      style={{ fontSize: '0.7rem', color: 'var(--color-terracotta)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      {polishingField === 'prescDiagnosis' ? 'Polishing...' : '✨ AI Polish'}
                    </button>
                  </div>
                  <input 
                    type="text"
                    value={prescDiagnosis}
                    onChange={e => setPrescDiagnosis(e.target.value)}
                    style={{ padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', background: 'rgba(255,255,255,0.4)' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem', color: 'var(--color-slate-dark)' }}>Therapeutic Recommendations / Techniques Plan:</label>
                  
                  {prescItems.length === 0 ? (
                    <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--color-slate-light)', marginBottom: '0.5rem' }}>No recommendations or exercises added yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.8rem' }}>
                      {prescItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-slate-05)', fontSize: '0.8rem' }}>
                          <div>
                            <strong>{item.name}</strong> ({item.dose}) - <em>{item.freq}</em> [{item.duration}]
                          </div>
                          <button type="button" onClick={() => handleRemovePrescItem(idx)} style={{ color: 'var(--color-cancelled)', display: 'inline-flex' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add item sub-form */}
                  <div style={{ borderTop: '1px solid var(--color-slate-10)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      placeholder="Therapeutic Exercise / Recommended Action (CBT/DBT)"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      style={{ padding: '0.4rem', fontSize: '0.8rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        placeholder="Technique Focus / Instructions (e.g. 5-sec inhale)"
                        value={newItemDose}
                        onChange={e => setNewItemDose(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', outline: 'none' }}
                      />
                      <input 
                        type="text" 
                        placeholder="Practice Frequency (e.g. Twice Daily)"
                        value={newItemFreq}
                        onChange={e => setNewItemFreq(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', outline: 'none' }}
                      />
                      <input 
                        type="text" 
                        placeholder="Target Duration (e.g. 21 Days)"
                        value={newItemDuration}
                        onChange={e => setNewItemDuration(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--color-slate-10)', borderRadius: '4px', outline: 'none' }}
                      />
                    </div>
                    <button type="button" className="premium-btn" style={{ padding: '0.4rem', fontSize: '0.8rem', borderRadius: '4px' }} onClick={handleAddPrescItem}>
                      <Plus size={12} /> Add Recommendation
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Adherence Plan / Next Session Focus</label>
                    <button 
                      type="button" 
                      onClick={() => handlePolishField('prescRefills', prescRefills, setPrescRefills)} 
                      disabled={!prescRefills.trim() || polishingField === 'prescRefills'}
                      style={{ fontSize: '0.7rem', color: 'var(--color-terracotta)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      {polishingField === 'prescRefills' ? 'Polishing...' : '✨ AI Polish'}
                    </button>
                  </div>
                  <input 
                    type="text"
                    value={prescRefills}
                    onChange={e => setPrescRefills(e.target.value)}
                    style={{ padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            )}

            {/* TYPE C: CLINICAL REPORT FIELDS */}
            {docType === 'report' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Diagnosis & Clinical Summary</label>
                    <button 
                      type="button" 
                      onClick={() => handlePolishField('reportSummary', reportSummary, setReportSummary)} 
                      disabled={!reportSummary.trim() || polishingField === 'reportSummary'}
                      style={{ fontSize: '0.7rem', color: 'var(--color-terracotta)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      {polishingField === 'reportSummary' ? 'Polishing...' : '✨ AI Polish'}
                    </button>
                  </div>
                  <textarea 
                    rows="3"
                    value={reportSummary}
                    onChange={e => setReportSummary(e.target.value)}
                    style={{ padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', resize: 'none' }}
                  ></textarea>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Behavioral & Clinical Observations</label>
                    <button 
                      type="button" 
                      onClick={() => handlePolishField('reportObservations', reportObservations, setReportObservations)} 
                      disabled={!reportObservations.trim() || polishingField === 'reportObservations'}
                      style={{ fontSize: '0.7rem', color: 'var(--color-terracotta)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      {polishingField === 'reportObservations' ? 'Polishing...' : '✨ AI Polish'}
                    </button>
                  </div>
                  <textarea 
                    rows="3"
                    value={reportObservations}
                    onChange={e => setReportObservations(e.target.value)}
                    style={{ padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', resize: 'none' }}
                  ></textarea>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Recommended Homework & Action Plan</label>
                    <button 
                      type="button" 
                      onClick={() => handlePolishField('reportHomework', reportHomework, setReportHomework)} 
                      disabled={!reportHomework.trim() || polishingField === 'reportHomework'}
                      style={{ fontSize: '0.7rem', color: 'var(--color-terracotta)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      {polishingField === 'reportHomework' ? 'Polishing...' : '✨ AI Polish'}
                    </button>
                  </div>
                  <textarea 
                    rows="3"
                    value={reportHomework}
                    onChange={e => setReportHomework(e.target.value)}
                    style={{ padding: '0.5rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', resize: 'none' }}
                  ></textarea>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                className="premium-btn-outline" 
                style={{ 
                  padding: '0.7rem 0.5rem', 
                  fontSize: '0.85rem',
                  opacity: (docType === 'receipt' && !receiptVerified) ? 0.5 : 1,
                  cursor: (docType === 'receipt' && !receiptVerified) ? 'not-allowed' : 'pointer'
                }}
                onClick={handlePrintDocument}
                disabled={docType === 'receipt' && !receiptVerified}
              >
                <Printer size={14} style={{ marginRight: '0.35rem' }} /> Print Document
              </button>
              <button 
                type="button" 
                className="premium-btn" 
                style={{ 
                  padding: '0.7rem 0.5rem', 
                  fontSize: '0.85rem',
                  opacity: (!selectedAptForDoc || (docType === 'receipt' && !receiptVerified)) ? 0.5 : 1,
                  cursor: (!selectedAptForDoc || (docType === 'receipt' && !receiptVerified)) ? 'not-allowed' : 'pointer'
                }}
                onClick={handleSendToClientEmail}
                disabled={!selectedAptForDoc || (docType === 'receipt' && !receiptVerified)}
              >
                <Mail size={14} style={{ marginRight: '0.35rem' }} /> Send to Client
              </button>
            </div>
          </div>

          {/* Right Panel: Live Printable Letterhead Preview */}
          <div className="doc-preview-panel-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>2. Document Live Preview</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>Styled for professional printing letterheads</span>
            </div>

            {selectedAptForDoc ? (
              <div 
                id="clinical-printable-document" 
                className="printable-doc-container"
                style={{
                  background: '#FFFFFF',
                  color: '#2C3E50',
                  fontFamily: 'Inter, sans-serif',
                  padding: '3rem',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  minHeight: '650px',
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid rgba(44, 62, 80, 0.1)',
                  position: 'relative'
                }}
              >
                {/* Print Only Title Watermark */}
                <div style={{ position: 'absolute', top: '15px', right: '15px', border: '1px solid rgba(44, 62, 80, 0.2)', padding: '0.2rem 0.5rem', fontSize: '0.65rem', borderRadius: '4px', textTransform: 'uppercase', color: '#5A738E', fontWeight: 600 }}>
                  Practice Copy
                </div>

                {/* CLINIC HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #2C3E50', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
                  <div>
                    <h2 style={{ fontFamily: 'Outfit, sans-serif', color: '#1A252C', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Verdant Mind</h2>
                    <p style={{ color: '#5A738E', fontSize: '0.85rem', fontWeight: 500, margin: '0.1rem 0 0 0' }}>Sabuj Das | Consultant Psychologist</p>
                    <p style={{ color: '#5A738E', fontSize: '0.78rem', margin: '0.2rem 0 0 0' }}>Specialization: ADHD, Anxiety, Depression & DBT</p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#5A738E', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <strong>Verdant Mind Practice</strong>
                    <span>Kolkata, India</span>
                    <span>sabuj.das@example.com</span>
                    <span>+91 98765 43210</span>
                  </div>
                </div>

                {/* DOCUMENT TITLE TITLE */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  <h3 style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#1A252C',
                    borderBottom: '1px solid rgba(44, 62, 80, 0.15)',
                    display: 'inline-block',
                    paddingBottom: '0.25rem',
                    margin: 0
                  }}>
                    {docType === 'receipt' && 'Official Invoice & Receipt'}
                    {docType === 'prescription' && 'Clinical Consultation Plan & Interventions'}
                    {docType === 'report' && 'Clinical Summary & Progress Report'}
                  </h3>
                </div>

                {/* CLIENT & DATE SUB-META GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem', background: 'rgba(44, 62, 80, 0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid rgba(44, 62, 80, 0.06)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: '#5A738E' }}>Client Name:</span> <strong>{selectedAptForDoc.clientName}</strong></div>
                    <div><span style={{ color: '#5A738E' }}>Age Group:</span> {selectedAptForDoc.clientAgeGroup}</div>
                    <div><span style={{ color: '#5A738E' }}>Contact Email:</span> {selectedAptForDoc.clientEmail}</div>
                    <div><span style={{ color: '#5A738E' }}>Session Mode:</span> {selectedAptForDoc.sessionMode}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', textAlign: 'right' }}>
                    <div><span style={{ color: '#5A738E' }}>Date of Issue:</span> {formatISTDate(new Date())}</div>
                    {docType === 'receipt' && (
                      <>
                        <div><span style={{ color: '#5A738E' }}>Invoice Number:</span> <strong>{invoiceNo}</strong></div>
                        <div><span style={{ color: '#5A738E' }}>Payment Status:</span> <strong style={{ color: paymentStatus === 'Paid' ? 'var(--color-confirmed)' : 'var(--color-pending)' }}>{paymentStatus.toUpperCase()}</strong></div>
                      </>
                    )}
                    {docType === 'prescription' && (
                      <div><span style={{ color: '#5A738E' }}>Next Session Target:</span> <em>{prescRefills}</em></div>
                    )}
                    {docType === 'report' && (
                      <div><span style={{ color: '#5A738E' }}>Consultation Slot:</span> {selectedAptForDoc.date} ({selectedAptForDoc.time})</div>
                    )}
                  </div>
                </div>

                {/* DOCUMENT TEMPLATE CONTENT DETAILS */}
                <div style={{ flex: 1, fontSize: '0.9rem', lineHeight: '1.6' }}>
                  
                  {/* RECEIPT PREVIEW CONTENT */}
                  {docType === 'receipt' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #2C3E50', color: '#1A252C', fontWeight: 700, fontSize: '0.85rem', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem' }}>Consultation Date</th>
                            <th style={{ padding: '0.5rem' }}>Description of Services</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount Charged</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid rgba(44, 62, 80, 0.1)' }}>
                            <td style={{ padding: '0.75rem 0.5rem' }}>{selectedAptForDoc.date}</td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <div><strong>{receiptServices}</strong></div>
                              <div style={{ fontSize: '0.78rem', color: '#5A738E' }}>Professional counseling service with Sabuj Das</div>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>₹{receiptAmount}.00</td>
                          </tr>
                          <tr>
                            <td colSpan="2" style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: '#5A738E' }}>Total Paid / Settled:</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontSize: '1.05rem' }}>₹{receiptAmount}.00</td>
                          </tr>
                        </tbody>
                      </table>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', marginTop: '1.5rem', fontSize: '0.8rem', background: '#FAF9F6', padding: '1rem', borderRadius: '4px' }}>
                        <div>
                          <strong style={{ display: 'block', marginBottom: '0.2rem', color: '#1A252C' }}>Payment Transactions Info:</strong>
                          <span>Settled via {paymentMethod}. Transactions are securely processed under professional licensing.</span>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <span style={{ color: 'var(--color-confirmed)', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                            <Check size={16} /> TRANSACTION COMPLETED
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PRESCRIPTION PREVIEW CONTENT */}
                  {docType === 'prescription' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div>
                        <strong style={{ display: 'block', color: '#1A252C', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.2rem' }}>Indications / Clinical Diagnosis:</strong>
                        <p style={{ margin: 0, fontStyle: 'italic' }}>{prescDiagnosis}</p>
                      </div>

                      <div>
                        <strong style={{ display: 'block', color: '#1A252C', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.6rem' }}>Therapeutic Plan & Practice Guidelines (Rx):</strong>
                        
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #2C3E50', color: '#1A252C', fontWeight: 700, fontSize: '0.8rem', textAlign: 'left' }}>
                              <th style={{ padding: '0.4rem 0.25rem' }}>Exercise / Recommendation</th>
                              <th style={{ padding: '0.4rem 0.25rem' }}>Technique Focus / Instructions</th>
                              <th style={{ padding: '0.4rem 0.25rem' }}>Practice Frequency</th>
                              <th style={{ padding: '0.4rem 0.25rem', textAlign: 'right' }}>Target Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prescItems.length === 0 ? (
                              <tr>
                                <td colSpan="4" style={{ padding: '1rem 0', textAlign: 'center', fontStyle: 'italic', color: '#5A738E' }}>No recommendations listed. Add exercises in the left panel.</td>
                              </tr>
                            ) : (
                              prescItems.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(44, 62, 80, 0.08)' }}>
                                  <td style={{ padding: '0.6rem 0.25rem', fontWeight: 600 }}>{item.name}</td>
                                  <td style={{ padding: '0.6rem 0.25rem' }}>{item.dose}</td>
                                  <td style={{ padding: '0.6rem 0.25rem' }}>{item.freq}</td>
                                  <td style={{ padding: '0.6rem 0.25rem', textAlign: 'right' }}>{item.duration}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: '0.5rem', background: '#FAF9F6', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', borderLeft: '3px solid var(--color-terracotta)' }}>
                        <strong>Supportive Directives & Next Session Targets:</strong>
                        <p style={{ margin: '0.2rem 0 0 0', color: '#5A738E' }}>
                          These home practices are configured to support cognitive restructuring and emotional regulation goals. Please record your experiences in your journal for review next session.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* REPORT PREVIEW CONTENT */}
                  {docType === 'report' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div>
                        <strong style={{ display: 'block', color: '#1A252C', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.2rem' }}>1. Diagnostic Assessment & Clinical Summary:</strong>
                        <p style={{ margin: 0, fontSize: '0.88rem' }}>{reportSummary}</p>
                      </div>

                      <div>
                        <strong style={{ display: 'block', color: '#1A252C', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.2rem' }}>2. Therapeutic & Behavioral Observations:</strong>
                        <p style={{ margin: 0, fontSize: '0.88rem' }}>{reportObservations}</p>
                      </div>

                      <div>
                        <strong style={{ display: 'block', color: '#1A252C', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.2rem' }}>3. Recommended Exercises / Action Plan (Homework):</strong>
                        <p style={{ margin: 0, fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{reportHomework}</p>
                      </div>
                    </div>
                  )}

                </div>

                {/* DOCTOR SIGNATURE BLOCK */}
                <div style={{ borderTop: '1px solid rgba(44, 62, 80, 0.1)', paddingTop: '1.5rem', marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '0.75rem', color: '#5A738E' }}>
                    <div>This document is private and confidential clinical material.</div>
                    <div>Verdant Mind &copy; 2026.</div>
                  </div>
                  
                  <div style={{ textAlign: 'center', width: '200px' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', color: '#1A252C', borderBottom: '1px solid #2C3E50', paddingBottom: '0.1rem', marginBottom: '0.3rem', display: 'inline-block' }}>
                      Sabuj Das
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#5A738E', fontWeight: 600 }}>Sabuj Das, Counsel Lic. #990231</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-data-state glass-card" style={{ flex: 1, padding: '3rem' }}>
                <AlertCircle size={40} />
                <p>Select a consultation client appointment to preview documents.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Availability Settings Tab */}
      {activeTab === 'availability' && (
        <div className="availability-layout">
          <div className="glass-card availability-card">
            <h3>
              <Clock size={20} />
              Shift Hours & Working Days
            </h3>
            
            <div className="settings-group">
              <label>Select Working Days:</label>
              <div className="days-picker">
                {weekdayNames.map((day, index) => {
                  const isActive = availability.workingDays.includes(index);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`day-toggle-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handleToggleDay(index)}
                    >
                      {day.substring(0, 3)}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-slate-light)', marginTop: '0.5rem' }}>
                Toggling working days dynamically restricts or enables calendar dates for clients in the booking section.
              </p>
            </div>

            <div className="settings-group">
              <label>Working Shift Hours:</label>
              <div className="hours-picker">
                <div className="hour-input-container">
                  <label htmlFor="start-hour">Start time</label>
                  <input
                    type="time"
                    id="start-hour"
                    name="startHour"
                    value={availability.startHour}
                    onChange={handleHourChange}
                  />
                </div>
                <span style={{ marginTop: '1.25rem', fontWeight: 600 }}>to</span>
                <div className="hour-input-container">
                  <label htmlFor="end-hour">End time</label>
                  <input
                    type="time"
                    id="end-hour"
                    name="endHour"
                    value={availability.endHour}
                    onChange={handleHourChange}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card availability-card">
            <h3>
              <Calendar size={20} />
              Blocked Dates (Holidays & Breaks)
            </h3>
            
            <form onSubmit={handleAddBlockedDate} className="holiday-input-row">
              <input
                type="date"
                min={getNowIST().isoDateStr}
                value={newBlockedDate}
                onChange={(e) => setNewBlockedDate(e.target.value)}
              />
              <button type="submit" className="premium-btn">
                <Plus size={16} /> Add Break
              </button>
            </form>

            <div className="settings-group" style={{ marginTop: '1rem' }}>
              <label>Currently Blocked Dates:</label>
              {availability.blockedDates.length === 0 ? (
                <p style={{ color: 'var(--color-slate-light)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  No dates are currently blocked.
                </p>
              ) : (
                <div className="blocked-dates-list custom-scroll">
                  {availability.blockedDates.map((date) => (
                    <div key={date} className="blocked-date-tag">
                      <span>{formatISTDate(date)}</span>
                      <button
                        type="button"
                        className="remove-tag-btn"
                        onClick={() => handleRemoveBlockedDate(date)}
                        title="Remove blocked date"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Student / Patient Profiles Directory */}
      {activeTab === 'profiles' && (
        <PatientProfileManager currentUser={currentUser} mode="directory" />
      )}

      {/* Clinical Records: Case History & Mental Status Examination */}
      {activeTab === 'clinical-records' && (
        <ClinicalRecords appointments={appointments} currentUser={currentUser} />
      )}

      {/* Session Audio Recordings with Consent & Signed URLs */}
      {activeTab === 'recordings' && (
        <AudioRecordings appointments={appointments} currentUser={currentUser} />
      )}

      {/* Admin Governance Module */}
      {activeTab === 'admin' && (currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator' || currentUser?.role === 'provider') && (
        <AdminManagement currentUser={currentUser} />
      )}

      {/* Inquiry Detail Viewer + Consultation Notes Modal */}
      {selectedApt && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            
            <div className="modal-header">
              <h3>Client Inquiry Details</h3>
              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={() => setSelectedApt(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body custom-scroll">
              
              <div className="client-meta-grid">
                <div className="meta-item">
                  <label>Client Name</label>
                  <span>{selectedApt.clientName} ({selectedApt.clientAgeGroup})</span>
                </div>
                <div className="meta-item">
                  <label>Status</label>
                  <span className={`status-badge ${selectedApt.status.toLowerCase()}`} style={{ width: 'fit-content', marginTop: '0.25rem' }}>
                    <span className="badge-dot"></span>
                    {selectedApt.status}
                  </span>
                </div>
                <div className="meta-item">
                  <label>Email Address</label>
                  <span>{selectedApt.clientEmail}</span>
                </div>
                <div className="meta-item">
                  <label>Phone Number</label>
                  <span>{selectedApt.clientPhone}</span>
                </div>
                <div className="meta-item">
                  <label>Session Mode</label>
                  <span>{selectedApt.sessionMode}</span>
                </div>
                <div className="meta-item">
                  <label>Date & Time Slot</label>
                  <span>{formatISTDate(selectedApt.date)} at {formatISTTime(selectedApt.time)} (IST)</span>
                </div>
              </div>

              <div className="problem-statement-box">
                <h4>Problem Statement:</h4>
                <div className="problem-text-content">
                  {selectedApt.problemDescription}
                </div>
              </div>

              <div className="consultation-notes-box">
                <h4>Private Consultation Notes (Private):</h4>
                <textarea
                  className="notes-textarea"
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  placeholder="Type any private therapist notes here... These notes are saved locally and are only visible inside this admin dashboard."
                ></textarea>
              </div>

            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="premium-btn-outline"
                title="Open Document Center with this client pre-selected"
                onClick={() => {
                  setSelectedAptIdForDoc(selectedApt._id || selectedApt.id);
                  setActiveTab('documents');
                  setSelectedApt(null);
                }}
              >
                <FileText size={14} /> Compose Document (Plan/Receipt)
              </button>
              
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  className="premium-btn-outline" 
                  onClick={() => setSelectedApt(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="premium-btn" 
                  onClick={handleSaveNotes}
                >
                  Save Notes
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Simulated Email Sending Progression Modal Backdrop */}
      {sendingState !== 'idle' && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content glass-card" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem' }}>
            
            {sendingState === 'success' ? (
              <div style={{ padding: '1rem 0' }}>
                <div style={{ display: 'inline-flex', padding: '1.25rem', borderRadius: '50%', backgroundColor: 'var(--color-confirmed-bg)', color: 'var(--color-confirmed)', marginBottom: '1.5rem' }}>
                  <Mail size={40} />
                </div>
                
                <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', color: 'var(--color-slate-dark)' }}>Email Transmitted!</h3>
                <p style={{ color: 'var(--color-slate-light)', fontSize: '0.92rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                  The <strong>{docType === 'receipt' ? 'Payment Receipt' : docType === 'prescription' ? 'Therapeutic Intervention Plan' : 'Clinical Report'}</strong> has been converted to an encrypted PDF and securely sent to:
                  <br />
                  <strong style={{ color: 'var(--color-slate-dark)' }}>{selectedAptForDoc?.clientEmail || 'client@example.com'}</strong>
                </p>

                <button type="button" className="premium-btn" style={{ width: '100%' }} onClick={handleCloseSendingModal}>
                  Return to Dashboard
                </button>
              </div>
            ) : (
              <div style={{ padding: '1.5rem 0' }}>
                <div className="smtp-loader-container" style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner-ring" style={{ width: '100%', height: '100%', border: '4px solid var(--color-slate-05)', borderTop: '4px solid var(--color-slate)', borderRadius: '50%', animation: 'spin 1.5s linear infinite', position: 'absolute' }}></div>
                  <Mail size={28} style={{ color: 'var(--color-slate)' }} />
                </div>

                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Securing Mail Channel</h3>
                
                {/* Progress bar */}
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--color-slate-05)', borderRadius: '3px', margin: '1.25rem 0 0.75rem', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${sendingProgress}%`, backgroundColor: 'var(--color-slate)', borderRadius: '3px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-light)', height: '20px' }}>
                  {sendingState === 'compiling' && 'Rendering layout markup & finalizing clinical metadata...'}
                  {sendingState === 'smtp' && 'Authenticating with SMTP server & verifying credentials...'}
                  {sendingState === 'sending' && 'Injecting PDF stream envelope & sending payload...'}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* RESCHEDULE APPOINTMENT MODAL */}
      {rescheduleApt && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42,71,62,0.5)', backdropFilter: 'blur(6px)', padding: '1rem' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', background: '#fff', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-slate-dark)' }}>Reschedule Consultation</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                  Patient: {rescheduleApt.clientName} ({rescheduleApt.clientEmail})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleApt(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-slate-light)' }}
              >
                ✕
              </button>
            </div>

            {rescheduleError && (
              <div style={{ background: 'rgba(201,93,93,0.1)', color: 'var(--color-cancelled)', padding: '0.6rem 0.8rem', borderRadius: '4px', fontSize: '0.82rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={15} /> <span>{rescheduleError}</span>
              </div>
            )}
            {rescheduleSuccess && (
              <div style={{ background: 'rgba(74,140,112,0.1)', color: '#2A5D48', padding: '0.6rem 0.8rem', borderRadius: '4px', fontSize: '0.82rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={15} /> <span>{rescheduleSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Current Slot (IST):
                </label>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-light)', background: 'var(--color-slate-05)', padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
                  {formatISTDate(rescheduleApt.date)} at {formatISTTime(rescheduleApt.time)}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  New Date (DD-MM-YYYY) *:
                </label>
                <input
                  type="text"
                  required
                  placeholder={`e.g. ${getNowIST().dateStr}`}
                  value={rescheduleForm.date}
                  onChange={(e) => setRescheduleForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                    New Time Slot (IST) *:
                  </label>
                  <select
                    value={rescheduleForm.time}
                    onChange={(e) => setRescheduleForm(prev => ({ ...prev, time: e.target.value }))}
                    style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                  >
                    {['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                    Duration (Minutes):
                  </label>
                  <select
                    value={rescheduleForm.durationMinutes}
                    onChange={(e) => setRescheduleForm(prev => ({ ...prev, durationMinutes: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', background: '#fff' }}
                  >
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                  Rescheduling Reason (Optional):
                </label>
                <textarea
                  placeholder="e.g. Client requested postponement due to meeting conflict..."
                  rows={2}
                  value={rescheduleForm.reason}
                  onChange={(e) => setRescheduleForm(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setRescheduleApt(null)}
                  style={{ flex: 1, padding: '0.65rem', background: 'var(--color-slate-05)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="premium-btn"
                  style={{ flex: 1, padding: '0.65rem' }}
                >
                  Confirm Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCELLATION REASON MODAL */}
      {cancelModalApt && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42,71,62,0.5)', backdropFilter: 'blur(6px)', padding: '1rem' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem', background: '#fff', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-slate-dark)', marginBottom: '0.5rem' }}>
              Cancel Appointment
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-slate-light)', margin: '0 0 1rem 0' }}>
              Are you sure you want to cancel the session with <strong>{cancelModalApt.clientName}</strong> on {formatISTDate(cancelModalApt.date)} at {formatISTTime(cancelModalApt.time)}?
            </p>

            <form onSubmit={handleCancelSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Cancellation Reason:
                </label>
                <textarea
                  required
                  placeholder="e.g. Client requested cancellation due to scheduling conflict..."
                  rows={3}
                  value={cancelReasonText}
                  onChange={(e) => setCancelReasonText(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setCancelModalApt(null)}
                  style={{ flex: 1, padding: '0.65rem', background: 'var(--color-slate-05)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '0.65rem', background: 'var(--color-cancelled)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Confirm Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Local IP Status Info Footer */}
      <div style={{ borderTop: '1px solid var(--color-slate-10)', padding: '1rem 0 0 0', marginTop: '3rem', fontSize: '0.8rem', color: 'var(--color-slate-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span>Local network status: </span>
          <span style={{ color: 'var(--color-confirmed)', fontWeight: 600 }}>Online & Broadcasted</span>
        </div>
        <div>
          <span>Exposed Local IP: </span>
          <code style={{ background: 'var(--color-slate-05)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' }}>
            http://[local-network-ip]:5173
          </code>
        </div>
      </div>

    </div>
  );
}
