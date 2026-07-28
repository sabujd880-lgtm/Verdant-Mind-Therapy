import React, { useState } from 'react';
import { Clipboard, ArrowRight, CheckCircle2, MessageSquare } from 'lucide-react';

export default function AssessmentTool({ onSendMessage }) {
  const [step, setStep] = useState(1); // 1: Info/Pre-form, 2: Questions, 3: Score/Results
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    q1: 0, // Nervous/anxious
    q2: 0, // Worrying
    q3: 0, // Little interest/pleasure
    q4: 0  // Down/depressed/hopeless
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSentToTherapist, setIsSentToTherapist] = useState(false);

  const questions = [
    { id: 'q1', text: '1. Feeling nervous, anxious, or on edge?', type: 'anxiety' },
    { id: 'q2', text: '2. Not being able to stop or control worrying?', type: 'anxiety' },
    { id: 'q3', text: '3. Little interest or pleasure in doing things?', type: 'depression' },
    { id: 'q4', text: '4. Feeling down, depressed, or hopeless?', type: 'depression' }
  ];

  const options = [
    { label: 'Not at all', value: 0 },
    { label: 'Several days', value: 1 },
    { label: 'More than half the days', value: 2 },
    { label: 'Nearly every day', value: 3 }
  ];

  const validatePreForm = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errs.email = 'Please enter a valid email';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    if (validatePreForm()) {
      setStep(2);
    }
  };

  const handleOptionSelect = (qId, value) => {
    setFormData(prev => ({ ...prev, [qId]: value }));
  };

  const calculateScores = () => {
    const anxietyScore = formData.q1 + formData.q2;
    const depressionScore = formData.q3 + formData.q4;
    const totalScore = anxietyScore + depressionScore;

    let category = 'Minimal Distress';
    let recommendations = 'Your distress scores are minimal. Maintain a healthy lifestyle, practice mindfulness regularly, and check in on your boundaries.';
    
    if (totalScore >= 9) {
      category = 'Severe Distress (Anxiety & Mood)';
      recommendations = 'Your results show elevated levels of clinical distress. We highly recommend booking a consultation session to explore therapeutic exercises and distress tolerance strategies.';
    } else if (totalScore >= 6) {
      category = 'Moderate Distress';
      recommendations = 'Your scores point to moderate levels of anxiety or depression. Scheduling a therapeutic session would help identify behavioral patterns and develop coping mechanisms.';
    } else if (totalScore >= 3) {
      category = 'Mild Distress';
      recommendations = 'You are experiencing mild emotional distress. Practicing box breathing and cognitive restructuring logs can help stabilize mood and worries.';
    }

    return { totalScore, anxietyScore, depressionScore, category, recommendations };
  };

  const { totalScore, anxietyScore, depressionScore, category, recommendations } = calculateScores();

  const handleSendResults = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      const assessmentMsg = {
        id: 'msg-' + Date.now(),
        senderName: formData.name,
        senderEmail: formData.email,
        subject: `Mental Health Assessment Result: ${category}`,
        message: `Self-Assessment Completed (PHQ-4 / GAD-4 Screener):
Score Summary:
- Total Score: ${totalScore}/12 (${category})
- Anxiety Sub-score: ${anxietyScore}/6
- Mood/Depression Sub-score: ${depressionScore}/6

Breakdown:
1. Feeling nervous/anxious: ${options.find(o => o.value === formData.q1)?.label || ''} (${formData.q1})
2. Unable to control worry: ${options.find(o => o.value === formData.q2)?.label || ''} (${formData.q2})
3. Little interest/pleasure: ${options.find(o => o.value === formData.q3)?.label || ''} (${formData.q3})
4. Feeling down/depressed: ${options.find(o => o.value === formData.q4)?.label || ''} (${formData.q4})`,
        timestamp: new Date().toISOString(),
        status: 'unread',
        replies: []
      };

      onSendMessage(assessmentMsg);
      setIsSubmitting(false);
      setIsSentToTherapist(true);
    }, 1200);
  };

  const handleReset = () => {
    setFormData({
      name: '',
      email: '',
      q1: 0,
      q2: 0,
      q3: 0,
      q4: 0
    });
    setStep(1);
    setIsSentToTherapist(false);
    setErrors({});
  };

  return (
    <div id="self-assessment" className="glass-card assessment-container" style={{ padding: '2.5rem', maxWidth: '800px', margin: '3rem auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(42,71,62,0.1)', paddingBottom: '1rem' }}>
        <div style={{ color: 'var(--color-terracotta)' }}>
          <Clipboard size={26} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.4rem', color: 'var(--color-slate-dark)' }}>Interactive Clinical Screener (PHQ-4)</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-light)', margin: 0 }}>Evaluate your general mood and anxiety levels in 2 minutes. Private and confidential.</p>
        </div>
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ color: 'var(--color-slate)', fontSize: '0.95rem', lineHeight: '1.6' }}>
            This short questionnaire is the standard 4-item Patient Health Questionnaire (PHQ-4), a validated clinical screening tool used by psychologists globally to flag general indicators of anxiety and depression.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="assess-name" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Your Name *</label>
              <input
                type="text"
                id="assess-name"
                name="name"
                placeholder="e.g. Emily Watson"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', background: 'rgba(255,255,255,0.6)', outline: 'none' }}
              />
              {errors.name && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.75rem' }}>{errors.name}</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="assess-email" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Email Address *</label>
              <input
                type="email"
                id="assess-email"
                name="email"
                placeholder="emily@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', background: 'rgba(255,255,255,0.6)', outline: 'none' }}
              />
              {errors.email && <span style={{ color: 'var(--color-cancelled)', fontSize: '0.75rem' }}>{errors.email}</span>}
            </div>
          </div>

          <button 
            type="button" 
            className="premium-btn" 
            onClick={handleNextStep}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
          >
            Begin Screener <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <p style={{ fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--color-slate-light)', background: 'var(--color-sage)', padding: '0.75rem', borderRadius: '6px' }}>
            Instructions: Over the last 2 weeks, how often have you been bothered by the following problems?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {questions.map((q) => (
              <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--color-slate-dark)' }}>{q.text}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {options.map((opt) => {
                    const isSelected = formData[q.id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleOptionSelect(q.id, opt.value)}
                        style={{
                          padding: '0.7rem 0.5rem',
                          fontSize: '0.8rem',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid var(--color-slate)' : '1px solid var(--color-slate-10)',
                          background: isSelected ? 'rgba(42, 71, 62, 0.08)' : 'rgba(255,255,255,0.5)',
                          color: isSelected ? 'var(--color-slate-dark)' : 'var(--color-slate)',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'var(--transition-fast)'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="premium-btn-outline" style={{ flex: 1 }} onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="premium-btn" style={{ flex: 2 }} onClick={() => setStep(3)}>
              Calculate Results
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Results Summary Box */}
          <div style={{ background: 'rgba(42, 71, 62, 0.02)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-slate-10)', display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-slate-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Screening Score:</span>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-slate-dark)' }}>{totalScore} <span style={{ fontSize: '1.25rem', color: 'var(--color-slate-light)', fontWeight: 400 }}>/ 12</span></div>
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: totalScore >= 6 ? 'var(--color-cancelled)' : 'var(--color-confirmed)' }}>
              {category}
            </span>
          </div>

          {/* Breakdown grids */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ padding: '1rem', background: '#FAF9F6', borderRadius: '8px', borderLeft: '3px solid var(--color-terracotta)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', fontWeight: 600 }}>Anxiety Screener (GAD-2)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{anxietyScore} / 6</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', marginTop: '0.25rem' }}>Anxiety indicators. An active score &gt;= 3 suggests screening triggers.</p>
            </div>
            <div style={{ padding: '1rem', background: '#FAF9F6', borderRadius: '8px', borderLeft: '3px solid var(--color-slate)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-slate-light)', fontWeight: 600 }}>Mood/Depression Screener (PHQ-2)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{depressionScore} / 6</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)', marginTop: '0.25rem' }}>Depressive indicators. An active score &gt;= 3 flags mood difficulties.</p>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '0.98rem', fontWeight: 600, marginBottom: '0.35rem' }}>Recommended Focus:</h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-slate-light)', lineHeight: '1.5' }}>{recommendations}</p>
          </div>

          <div style={{ borderTop: '1px solid rgba(42,71,62,0.1)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            {isSentToTherapist ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-confirmed)', background: 'var(--color-confirmed-bg)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                <CheckCircle2 size={16} />
                <span>Results successfully synchronized with Dr. Sabuj Das's secure portal! He will review this.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-slate-light)' }}>
                  Would you like to securely submit these results to Dr. Das so he can prepare recommendations before your first consultation?
                </p>
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="premium-btn"
                  onClick={handleSendResults}
                  style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                >
                  {isSubmitting ? 'Transmitting Data...' : (
                    <>
                      <MessageSquare size={16} /> Send Results to Therapist Portal
                    </>
                  )}
                </button>
              </div>
            )}
            
            <button 
              type="button" 
              className="premium-btn-outline" 
              onClick={handleReset}
              style={{ width: '100%' }}
            >
              Take Screener Again
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
