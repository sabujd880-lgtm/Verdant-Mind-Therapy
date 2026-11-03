import React, { useState } from 'react';
import { 
  Calendar, Clock, FileText, Receipt, Send, Inbox, 
  MessageSquare, CheckCircle2, Eye, Printer, X
} from 'lucide-react';
import { 
  formatISTDate, 
  formatISTTime, 
  formatISTDateTimeWithZone 
} from '../utils/dateTime.js';

export default function ClientPortal({ 
  currentUser, 
  appointments = [], 
  careDocuments = [], 
  messages = [], 
  onSendMessage, 
  onCancelAppointment 
}) {
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'documents' | 'messages'
  const [selectedDoc, setSelectedDoc] = useState(null); // For detailed document viewer modal
  
  // Message composition states
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);

  // Filter records to only show those belonging to the logged-in client
  const clientEmailNormalized = currentUser?.email.toLowerCase();
  
  const clientAppointments = appointments.filter(
    apt => apt.clientEmail.toLowerCase() === clientEmailNormalized
  );
  
  const clientDocuments = careDocuments.filter(
    doc => doc.clientEmail.toLowerCase() === clientEmailNormalized
  );
  
  const clientMessages = messages.filter(
    msg => msg.senderEmail.toLowerCase() === clientEmailNormalized || msg.id.includes(clientEmailNormalized)
  );

  const getModeIcon = (mode) => {
    switch (mode) {
      case 'Video Session': return <VideoIcon size={14} />;
      case 'Audio Session': return <PhoneIcon size={14} />;
      case 'Chat Session': return <ChatIcon size={14} />;
      default: return null;
    }
  };

  const handleComposeSubmit = (e) => {
    e.preventDefault();
    if (!msgSubject.trim() || !msgBody.trim()) return;

    setIsSendingMsg(true);
    
    // Simulate delay
    setTimeout(() => {
      const newMsg = {
        id: 'msg-' + Date.now(),
        senderName: currentUser.name,
        senderEmail: currentUser.email,
        subject: msgSubject.trim(),
        message: msgBody.trim(),
        timestamp: new Date().toISOString(),
        status: 'unread',
        replies: []
      };

      onSendMessage(newMsg);
      setIsSendingMsg(false);
      setMsgSuccess(true);
      setMsgSubject('');
      setMsgBody('');

      setTimeout(() => {
        setMsgSuccess(false);
      }, 3000);
    }, 1000);
  };

  return (
    <div className="container client-portal-container" style={{ padding: '3rem 2rem 6rem' }}>
      
      {/* Title / User Greeting header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', borderBottom: '1px solid rgba(42,71,62,0.1)', paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(42, 71, 62, 0.15)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <img src="/pwa-192x192.png" alt="Verdant Mind Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-terracotta)', fontWeight: 600 }}>Secure Account Portal</span>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--color-slate-dark)', marginTop: '0.2rem' }}>Welcome back, {currentUser.name}</h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-slate-light)' }}>View your upcoming therapeutic plan, past invoices, and message your psychologist.</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(42,71,62,0.05)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
          <button 
            className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            My Sessions
          </button>
          <button 
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            My Documents {clientDocuments.length > 0 && <span className="tab-badge-count" style={{ background: 'var(--color-slate)', color: '#FFF' }}>{clientDocuments.length}</span>}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            Message Inbox
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      
      {/* 1. SESSIONS TAB */}
      {activeTab === 'sessions' && (
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-slate-dark)' }}>Your Consultations Schedule</h3>
          
          {clientAppointments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate-light)' }}>
              <Calendar size={40} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
              <p>No active sessions or consultations booked yet.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Use the Public Booking system on the homepage to schedule a session.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Session Format</th>
                    <th>Inquiry Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...clientAppointments].reverse().map(apt => (
                    <tr key={apt._id || apt.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                          <Calendar size={14} style={{ color: 'var(--color-slate-light)' }} />
                          <span>{formatISTDate(apt.date)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                          <Clock size={12} />
                          <span>{formatISTTime(apt.time)}</span>
                        </div>
                      </td>
                      <td>
                        <span className="mode-badge">
                          {getModeIcon(apt.sessionMode)}
                          {apt.sessionMode}
                        </span>
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        <p style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-slate-light)' }}>
                          {apt.problemDescription}
                        </p>
                      </td>
                      <td>
                        <span className={`status-badge ${apt.status.toLowerCase()}`}>
                          <span className="badge-dot"></span>
                          {apt.status}
                        </span>
                      </td>
                      <td>
                        {apt.status === 'Pending' ? (
                          <button
                            type="button"
                            className="premium-btn-outline"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                            onClick={() => onCancelAppointment(apt._id || apt.id)}
                          >
                            Cancel Inquiry
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', fontStyle: 'italic' }}>Locked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. CLINICAL DOCUMENTS TAB */}
      {activeTab === 'documents' && (
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--color-slate-dark)' }}>Assigned Care & Financial Documents</h3>
          
          {clientDocuments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-slate-light)' }}>
              <FileText size={40} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
              <p>No documents generated or shared for your profile yet.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Payment receipts and clinical therapeutic plans will appear here after Mr. Das sends them.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {clientDocuments.map(doc => (
                <div 
                  key={doc._id || doc.id}
                  className="glass-card"
                  style={{
                    padding: '1.5rem',
                    border: '1px solid rgba(42, 71, 62, 0.08)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{
                      padding: '0.65rem',
                      borderRadius: '8px',
                      backgroundColor: doc.type === 'receipt' ? 'var(--color-confirmed-bg)' : 'var(--color-terracotta-10)',
                      color: doc.type === 'receipt' ? 'var(--color-confirmed)' : 'var(--color-terracotta)'
                    }}>
                      {doc.type === 'receipt' ? <Receipt size={20} /> : <FileText size={20} />}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-slate-light)', fontWeight: 600 }}>{formatISTDate(doc.date || doc.createdAt)}</span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '1rem', color: 'var(--color-slate-dark)', fontWeight: 700 }}>
                      {doc.type === 'receipt' && `Invoice Receipt (${doc.data.invoiceNo})`}
                      {doc.type === 'prescription' && 'Therapeutic Guidance Plan'}
                      {doc.type === 'report' && 'Clinical Summary Report'}
                    </h4>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', marginTop: '0.25rem' }}>
                      {doc.type === 'receipt' && `INR ${doc.data.amount} Charged - Paid via ${doc.data.paymentMethod}`}
                      {doc.type === 'prescription' && `Clinical diagnosis target: ${doc.data.prescDiagnosis}`}
                      {doc.type === 'report' && `Diagnosed summary: ${doc.data.reportSummary.substring(0, 45)}...`}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="premium-btn"
                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', gap: '0.35rem', marginTop: '0.5rem' }}
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <Eye size={14} /> Open Document
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. MESSAGES TAB */}
      {activeTab === 'messages' && (
        <div className="messages-tab-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
          
          {/* Messages History List */}
          <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Inbox size={18} />
              Secure Conversation
            </h3>

            <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingRight: '0.5rem' }}>
              {clientMessages.length === 0 ? (
                <div style={{ textAlign: 'center', margin: 'auto 0', color: 'var(--color-slate-light)' }}>
                  <MessageSquare size={36} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <p>No message logs with Mr. Das.</p>
                  <p style={{ fontSize: '0.78rem' }}>Draft your first message in the panel on the right.</p>
                </div>
              ) : (
                [...clientMessages].reverse().map(msg => (
                  <div key={msg._id || msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    
                    {/* User's Original Message */}
                    <div style={{ alignSelf: 'flex-end', background: 'var(--color-slate)', color: '#FFF', padding: '0.85rem 1rem', borderRadius: '12px', borderTopRightRadius: '2px', maxWidth: '85%', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ fontSize: '0.72rem', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '0.25rem', marginBottom: '0.4rem', opacity: 0.8, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Sent Inquiry: {msg.subject}</span>
                        <span>{formatISTDateTimeWithZone(msg.timestamp)}</span>
                      </div>
                      <p style={{ fontSize: '0.88rem', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                    </div>

                    {/* Replies from Therapist */}
                    {msg.replies && msg.replies.map(reply => (
                      <div key={reply.id} style={{ alignSelf: 'flex-start', background: '#FFF', color: 'var(--color-slate-dark)', padding: '0.85rem 1rem', borderRadius: '12px', borderTopLeftRadius: '2px', maxWidth: '85%', border: '1px solid var(--color-slate-10)', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ fontSize: '0.72rem', borderBottom: '1px solid var(--color-slate-05)', paddingBottom: '0.25rem', marginBottom: '0.4rem', color: 'var(--color-confirmed)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Reply from Mr. Sabuj Das:</span>
                          <span>{formatISTDateTimeWithZone(reply.timestamp)}</span>
                        </div>
                        <p style={{ fontSize: '0.88rem', margin: 0, whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                      </div>
                    ))}

                  </div>
                ))
              )}
            </div>
          </div>

          {/* Message Composition Panel */}
          <div className="glass-card" style={{ padding: '2rem', height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.25rem' }}>Send Secure Message</h3>
            
            {msgSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-confirmed)', background: 'var(--color-confirmed-bg)', padding: '0.65rem 0.8rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <CheckCircle2 size={16} />
                <span>Message dispatched successfully to portal!</span>
              </div>
            )}

            <form onSubmit={handleComposeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="comp-subject" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Message Subject *</label>
                <input
                  type="text"
                  required
                  id="comp-subject"
                  placeholder="e.g. Schedule adjustments / Technique question"
                  value={msgSubject}
                  onChange={e => setMsgSubject(e.target.value)}
                  style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="comp-body" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Message Body *</label>
                <textarea
                  required
                  rows="6"
                  id="comp-body"
                  placeholder="Describe your question or request in detail..."
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  style={{ padding: '0.6rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'none' }}
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSendingMsg}
                className="premium-btn"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
              >
                {isSendingMsg ? 'Sending Message...' : (
                  <>
                    <Send size={14} /> Send Message to Mr. Das
                  </>
                )}
              </button>
            </form>
          </div>

        </div>
      )}

      {/* DETAILED DOCUMENT VIEWER MODAL */}
      {selectedDoc && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content glass-card" style={{ maxWidth: '850px', padding: '1rem', overflow: 'hidden' }}>
            
            {/* Modal Actions Header */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-slate-10)' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="premium-btn"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                  onClick={() => window.print()}
                >
                  <Printer size={12} /> Print Document
                </button>
              </div>

              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={() => setSelectedDoc(null)}
                style={{ display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Document Letterhead Body Preview */}
            <div className="custom-scroll" style={{ overflowY: 'auto', maxHeight: '550px', padding: '2rem' }}>
              <div 
                id="clinical-printable-document" 
                className="printable-doc-container"
                style={{
                  background: '#FFFFFF',
                  color: 'var(--color-slate-dark)',
                  fontFamily: 'Inter, sans-serif',
                  padding: '2.5rem',
                  border: '1px solid var(--color-slate-10)',
                  position: 'relative'
                }}
              >
                {/* Print Title Watermark */}
                <div style={{ position: 'absolute', top: '15px', right: '15px', border: '1px solid var(--color-slate-20)', padding: '0.2rem 0.5rem', fontSize: '0.65rem', borderRadius: '4px', textTransform: 'uppercase', color: 'var(--color-slate-light)', fontWeight: 600 }}>
                  Client Copy
                </div>

                {/* CLINIC HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--color-slate)', paddingBottom: '1.25rem', marginBottom: '1.75rem' }}>
                  <div>
                    <h2 style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--color-slate-dark)', fontSize: '1.45rem', fontWeight: 700, margin: 0 }}>Verdant Mind</h2>
                    <p style={{ color: 'var(--color-slate-light)', fontSize: '0.8rem', fontWeight: 500, margin: '0.1rem 0 0 0' }}>Sabuj Das | Psychologist</p>
                    <p style={{ color: 'var(--color-slate-light)', fontSize: '0.74rem', margin: '0.2rem 0 0 0' }}>Specialization: ADHD, Anxiety, Depression & DBT</p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.74rem', color: 'var(--color-slate-light)', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <strong>Verdant Mind Practice</strong>
                    <span>Kolkata, India</span>
                    <span>sabuj.das@example.com</span>
                    <span>+91 98765 43210</span>
                  </div>
                </div>

                {/* DOCUMENT TITLE */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-slate-dark)',
                    borderBottom: '1px solid var(--color-slate-20)',
                    display: 'inline-block',
                    paddingBottom: '0.25rem',
                    margin: 0
                  }}>
                    {selectedDoc.type === 'receipt' && 'Official Invoice & Receipt'}
                    {selectedDoc.type === 'prescription' && 'Clinical Consultation Plan & Interventions'}
                    {selectedDoc.type === 'report' && 'Clinical Summary & Progress Report'}
                  </h3>
                </div>

                {/* CLIENT & DATE SUB-META GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem', background: 'rgba(42, 71, 62, 0.02)', padding: '0.85rem', borderRadius: '6px', border: '1px solid rgba(42, 71, 62, 0.05)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
                    <div><span style={{ color: 'var(--color-slate-light)' }}>Client Name:</span> <strong>{currentUser.name}</strong></div>
                    <div><span style={{ color: 'var(--color-slate-light)' }}>Age Group:</span> {currentUser.ageGroup || 'Adult'}</div>
                    <div><span style={{ color: 'var(--color-slate-light)' }}>Contact Email:</span> {currentUser.email}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', textAlign: 'right' }}>
                    <div><span style={{ color: 'var(--color-slate-light)' }}>Date of Issue:</span> {formatISTDate(selectedDoc.date || selectedDoc.createdAt)}</div>
                    {selectedDoc.type === 'receipt' && (
                      <>
                        <div><span style={{ color: 'var(--color-slate-light)' }}>Invoice Number:</span> <strong>{selectedDoc.data.invoiceNo}</strong></div>
                        <div><span style={{ color: 'var(--color-slate-light)' }}>Payment Status:</span> <strong style={{ color: selectedDoc.data.paymentStatus === 'Paid' ? 'var(--color-confirmed)' : 'var(--color-pending)' }}>{selectedDoc.data.paymentStatus.toUpperCase()}</strong></div>
                      </>
                    )}
                    {selectedDoc.type === 'prescription' && (
                      <div><span style={{ color: 'var(--color-slate-light)' }}>Next Session Target:</span> <em>{selectedDoc.data.prescRefills}</em></div>
                    )}
                  </div>
                </div>

                {/* DOCUMENT TEMPLATE CONTENT DETAILS */}
                <div style={{ fontSize: '0.88rem', lineHeight: '1.55' }}>
                  
                  {/* RECEIPT PREVIEW CONTENT */}
                  {selectedDoc.type === 'receipt' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--color-slate)', color: 'var(--color-slate-dark)', fontWeight: 700, fontSize: '0.8rem', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.25rem' }}>Description of Services</th>
                            <th style={{ padding: '0.5rem 0.25rem', textAlign: 'right' }}>Amount Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid rgba(42, 71, 62, 0.1)' }}>
                            <td style={{ padding: '0.75rem 0.25rem' }}>
                              <div><strong>{selectedDoc.data.receiptServices}</strong></div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--color-slate-light)' }}>Professional psychological consultation counseling service</div>
                            </td>
                            <td style={{ padding: '0.75rem 0.25rem', textAlign: 'right', fontWeight: 600 }}>₹{selectedDoc.data.receiptAmount}.00</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '0.75rem 0.25rem', textAlign: 'right', fontWeight: 600, color: 'var(--color-slate-light)' }}>Total Settled:</td>
                            <td style={{ padding: '0.75rem 0.25rem', textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>₹{selectedDoc.data.receiptAmount}.00</td>
                          </tr>
                        </tbody>
                      </table>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '1rem', fontSize: '0.78rem', background: '#FAF9F6', padding: '0.75rem', borderRadius: '4px' }}>
                        <strong>Payment Transactions Info:</strong>
                        <span>Settled via {selectedDoc.data.paymentMethod}. Transactions are securely processed under state licensing protocols.</span>
                      </div>
                    </div>
                  )}

                  {/* PRESCRIPTION PREVIEW CONTENT */}
                  {selectedDoc.type === 'prescription' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div>
                        <strong style={{ display: 'block', color: 'var(--color-slate-dark)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.2rem' }}>Indications / Clinical Diagnosis:</strong>
                        <p style={{ margin: 0, fontStyle: 'italic' }}>{selectedDoc.data.prescDiagnosis}</p>
                      </div>

                      <div>
                        <strong style={{ display: 'block', color: 'var(--color-slate-dark)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.4rem' }}>Therapeutic Plan & Practice Guidelines (Rx):</strong>
                        
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-slate)', color: 'var(--color-slate-dark)', fontWeight: 700, fontSize: '0.75rem', textAlign: 'left' }}>
                              <th style={{ padding: '0.4rem 0.25rem' }}>Exercise / Recommendation</th>
                              <th style={{ padding: '0.4rem 0.25rem' }}>Technique Focus / Instructions</th>
                              <th style={{ padding: '0.4rem 0.25rem' }}>Practice Frequency</th>
                              <th style={{ padding: '0.4rem 0.25rem', textAlign: 'right' }}>Target Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedDoc.data.prescItems && selectedDoc.data.prescItems.map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(42, 71, 62, 0.08)' }}>
                                <td style={{ padding: '0.55rem 0.25rem', fontWeight: 600 }}>{item.name}</td>
                                <td style={{ padding: '0.55rem 0.25rem' }}>{item.dose}</td>
                                <td style={{ padding: '0.55rem 0.25rem' }}>{item.freq}</td>
                                <td style={{ padding: '0.55rem 0.25rem', textAlign: 'right' }}>{item.duration}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: '0.5rem', background: '#FAF9F6', padding: '0.85rem', borderRadius: '4px', fontSize: '0.78rem', borderLeft: '3px solid var(--color-terracotta)' }}>
                        <strong>Supportive Directives & Next Session Targets:</strong>
                        <p style={{ margin: '0.2rem 0 0 0', color: 'var(--color-slate-light)' }}>
                          These home practices are configured to support cognitive restructuring and emotional regulation goals. Please record your experiences in your journal for review next session.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* REPORT PREVIEW CONTENT */}
                  {selectedDoc.type === 'report' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                      <div>
                        <strong style={{ display: 'block', color: 'var(--color-slate-dark)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.15rem' }}>1. Diagnostic Assessment & Clinical Summary:</strong>
                        <p style={{ margin: 0 }}>{selectedDoc.data.reportSummary}</p>
                      </div>

                      <div>
                        <strong style={{ display: 'block', color: 'var(--color-slate-dark)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.15rem' }}>2. Therapeutic & Behavioral Observations:</strong>
                        <p style={{ margin: 0 }}>{selectedDoc.data.reportObservations}</p>
                      </div>

                      <div>
                        <strong style={{ display: 'block', color: 'var(--color-slate-dark)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '0.15rem' }}>3. Recommended Exercises / Action Plan (Homework):</strong>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selectedDoc.data.reportHomework}</p>
                      </div>
                    </div>
                  )}

                </div>

                {/* CLINIC SIGNATURE */}
                <div style={{ borderTop: '1px solid rgba(42, 71, 62, 0.1)', paddingTop: '1.25rem', marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-slate-light)' }}>
                    <div>This document is private and confidential clinical material.</div>
                    <div>Verdant Mind &copy; 2026.</div>
                  </div>
                  
                  <div style={{ textAlign: 'center', width: '180px' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.1rem', color: 'var(--color-slate-dark)', borderBottom: '1px solid var(--color-slate)', paddingBottom: '0.1rem', marginBottom: '0.3rem', display: 'inline-block' }}>
                      Sabuj Das
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-slate-light)', fontWeight: 600 }}>Sabuj Das, Counsel Lic. #990231</div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Simple icons to avoid importing unused packages
function VideoIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  );
}

function PhoneIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ChatIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
