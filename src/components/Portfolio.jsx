import React, { useState } from 'react';
import { 
  MapPin, Calendar, Globe, Sparkles, Brain, Compass, Activity, 
  Smile, Eye, FlameKindling, BadgeCheck, Send, CheckCircle2, Clipboard 
} from 'lucide-react';
import sabujDasImg from '../assets/sabuj-das.png';
import AssessmentTool from './AssessmentTool';
import AIBotWidget from './AIBotWidget';

export default function Portfolio({ profile, onBookClick, onSendMessage }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Map specializations to matching Lucide icons for high-end feel
  const getIcon = (id) => {
    switch (id) {
      case 'adhd':
        return <Brain size={24} />;
      case 'addiction':
        return <Compass size={24} />;
      case 'anger':
        return <Activity size={24} />;
      case 'anxiety':
        return <Sparkles size={24} />;
      case 'bipolar':
        return <FlameKindling size={24} />;
      case 'teen-child':
        return <Smile size={24} />;
      case 'depression':
        return <Eye size={24} />;
      case 'dbt':
        return <BadgeCheck size={24} />;
      case 'assessment':
        return <Clipboard size={24} />;
      default:
        return <Sparkles size={24} />;
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email';
    }
    if (!formData.subject.trim()) errors.subject = 'Subject is required';
    if (!formData.message.trim()) errors.message = 'Message is required';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    
    // Simulate API delay
    setTimeout(() => {
      const newMsg = {
        id: 'msg-' + Date.now(),
        senderName: formData.name,
        senderEmail: formData.email,
        subject: formData.subject,
        message: formData.message,
        timestamp: new Date().toISOString(),
        status: 'unread',
        replies: []
      };

      onSendMessage(newMsg);
      setIsSubmitting(false);
      setIsSuccess(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
    }, 1200);
  };

  return (
    <div className="portfolio-container">
      {/* Hero Section */}
      <section id="hero" className="container hero-section">
        <div className="hero-content">
          <h2>{profile.title}</h2>
          <h1>Empathetic Mental Support for Your Wellness</h1>
          <p className="subtitle">
            Hello, I am <strong>{profile.name}</strong>. I provide dedicated, confidential, and evidence-based psychological counseling to help you heal, find clarity, and thrive.
          </p>

          {/* Quick Details Badges */}
          <div className="hero-meta-badges">
            <div className="meta-badge">
              <MapPin size={16} />
              <span>Based in: <strong>{profile.location}</strong></span>
            </div>
            <div className="meta-badge">
              <Calendar size={16} />
              <span>Experience: <strong>{profile.experience}</strong></span>
            </div>
            <div className="meta-badge">
              <Globe size={16} />
              <span>Languages: <strong>{profile.languages.join(', ')}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={onBookClick}
              className="premium-btn"
            >
              Book a Consultation
            </button>
            <a 
              href="#specializations" 
              className="premium-btn-outline"
            >
              Explore Specializations
            </a>
          </div>
        </div>

        {/* Hero Illustration / Avatar */}
        <div className="hero-image-container">
          <div className="hero-deco-ring"></div>
          <div className="hero-image-wrapper">
            <img 
              src={sabujDasImg} 
              alt="Sabuj Das" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      </section>

      {/* Specializations Section */}
      <section id="specializations" className="container specializations-section">
        <h2 className="section-title">Areas of Specialization</h2>
        <p style={{ textAlign: 'center', color: 'var(--color-slate-light)', maxWidth: '600px', margin: '-2rem auto 3rem', fontSize: '1.05rem' }}>
          I utilize integrative therapeutic modalities (such as CBT and DBT) tailored to address your specific goals and unique mental health needs.
        </p>

        <div className="specializations-grid">
          {profile.specializations.map((spec) => (
            <div key={spec.id} className="spec-card glass-card">
              <div className="spec-icon-box">
                {getIcon(spec.id)}
              </div>
              <h3>{spec.name}</h3>
              <p>{spec.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Mood & Anxiety Screener Assessment Tool */}
      <AssessmentTool onSendMessage={onSendMessage} />

      {/* Message Sender Portal Section */}
      <section id="contact-message" className="container contact-section" style={{ paddingBottom: '5rem' }}>
        <h2 className="section-title">Message Therapist Portal</h2>
        <p style={{ textAlign: 'center', color: 'var(--color-slate-light)', maxWidth: '600px', margin: '-2rem auto 3rem', fontSize: '1.05rem' }}>
          Have a quick question or want to inquire about counseling before booking? Send a secure message directly to my portal.
        </p>

        <div className="glass-card contact-form-card" style={{ maxWidth: '700px', margin: '0 auto', padding: '2.5rem' }}>
          {isSuccess ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'var(--color-confirmed-bg)', color: 'var(--color-confirmed)', marginBottom: '1.25rem' }}>
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '1.4rem' }}>Message Dispatched!</h3>
              <p style={{ color: 'var(--color-slate-light)', marginBottom: '1.5rem' }}>
                Your message has been delivered to my control panel. I will review it and send a reply to your email address shortly.
              </p>
              <button 
                type="button" 
                className="premium-btn" 
                onClick={() => setIsSuccess(false)}
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label htmlFor="msg-name" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Your Name</label>
                  <input
                    type="text"
                    id="msg-name"
                    name="name"
                    placeholder="e.g., John Smith"
                    value={formData.name}
                    onChange={handleInputChange}
                    style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', outline: 'none', background: 'rgba(255,255,255,0.6)' }}
                  />
                  {formErrors.name && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.75rem' }}>{formErrors.name}</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label htmlFor="msg-email" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Email Address</label>
                  <input
                    type="email"
                    id="msg-email"
                    name="email"
                    placeholder="john.smith@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', outline: 'none', background: 'rgba(255,255,255,0.6)' }}
                  />
                  {formErrors.email && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.75rem' }}>{formErrors.email}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="msg-subject" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Subject</label>
                <input
                  type="text"
                  id="msg-subject"
                  name="subject"
                  placeholder="e.g., Inquiry regarding session formats"
                  value={formData.subject}
                  onChange={handleInputChange}
                  style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', outline: 'none', background: 'rgba(255,255,255,0.6)' }}
                />
                {formErrors.subject && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.75rem' }}>{formErrors.subject}</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="msg-message" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>Message Body</label>
                <textarea
                  id="msg-message"
                  name="message"
                  rows="4"
                  placeholder="Type your message here..."
                  value={formData.message}
                  onChange={handleInputChange}
                  style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', outline: 'none', background: 'rgba(255,255,255,0.6)', resize: 'vertical' }}
                ></textarea>
                {formErrors.message && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.75rem' }}>{formErrors.message}</span>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="premium-btn"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
              >
                {isSubmitting ? 'Sending Message...' : (
                  <>
                    <Send size={16} />
                    Send Message to Portal
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>
      
      {/* Floating Therapist AI Support Chat Bot Widget */}
      <AIBotWidget />
    </div>
  );
}

