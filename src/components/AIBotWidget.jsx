import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Bot, User, Play } from 'lucide-react';

export default function AIBotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: "Hello! I'm Aura, Dr. Sabuj Das's virtual support assistant. How can I help you today? I can answer questions about session fees, booking guidelines, or guide you through a box breathing exercise for stress relief!",
      timestamp: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [breathingMode, setBreathingMode] = useState(false); // Guided breathing active
  const [breathingStep, setBreathingStep] = useState(0); // 0: inhale, 1: hold, 2: exhale, 3: hold empty
  const [breathingSeconds, setBreathingSeconds] = useState(4);
  const [breathingCycles, setBreathingCycles] = useState(0);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Guided Breathing Loop Timer
  useEffect(() => {
    let timer;
    if (breathingMode) {
      if (breathingSeconds > 0) {
        timer = setTimeout(() => {
          setBreathingSeconds(prev => prev - 1);
        }, 1000);
      } else {
        // Next Step
        const nextStep = (breathingStep + 1) % 4;
        setBreathingStep(nextStep);
        setBreathingSeconds(4);
        if (nextStep === 0) {
          setBreathingCycles(prev => {
            const nextCycle = prev + 1;
            if (nextCycle >= 3) {
              // End breathing session
              setBreathingMode(false);
              addBotMessage("Great job! You have completed 3 full cycles of Box Breathing. Take a moment to notice any release of tension in your shoulders or neck.");
              return 0;
            }
            return nextCycle;
          });
        }
      }
    }
    return () => clearTimeout(timer);
  }, [breathingMode, breathingSeconds, breathingStep]);

  const addBotMessage = (text) => {
    setMessages(prev => [...prev, {
      id: 'bot-' + Date.now(),
      sender: 'bot',
      text,
      timestamp: new Date().toISOString()
    }]);
  };

  const handleSendMessage = async (textToSend) => {
    if (!textToSend.trim()) return;

    const userMsg = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: updatedMessages.map(m => ({ sender: m.sender, text: m.text }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reply from Aura AI server');
      }

      const data = await response.json();
      setIsTyping(false);
      addBotMessage(data.response);
    } catch (err) {
      console.error('Error fetching AI response:', err);
      setIsTyping(false);
      // Offline fallback rules
      const query = textToSend.toLowerCase();
      if (query.includes('fee') || query.includes('cost') || query.includes('charge') || query.includes('price') || query.includes('pay')) {
        addBotMessage("Dr. Sabuj Das charges INR 1,500 per counseling session. Sessions last approximately 60 minutes and can be conducted online via Video, Audio, or Chat formats.");
      } else if (query.includes('book') || query.includes('schedule') || query.includes('appointment') || query.includes('slot')) {
        addBotMessage("You can book a session directly by navigating to the 'Schedule a Consultation' calendar picker in our portfolio. You can select your session format, find a date that matches Dr. Das's working shift, and submit details.");
      } else if (query.includes('breathe') || query.includes('breathing') || query.includes('stressed') || query.includes('stress') || query.includes('anxious') || query.includes('anxiety') || query.includes('panic')) {
        addBotMessage("I understand you might be feeling anxious or stressed right now. Let's do a guided 4-second Box Breathing cycle together to help calm your autonomic nervous system. Click 'Start Breathing' below to begin.");
      } else if (query.includes('language') || query.includes('speak') || query.includes('bengali') || query.includes('hindi')) {
        addBotMessage("Dr. Sabuj Das conducts therapy sessions in English, Hindi, and Bengali to ensure clients can express themselves in their preferred tongue.");
      } else if (query.includes('dbt') || query.includes('cbt') || query.includes('therapy') || query.includes('modality') || query.includes('special')) {
        addBotMessage("Dr. Das specializes in Cognitive Behavioral Therapy (CBT) and Dialectical Behavior Therapy (DBT), addressing conditions such as ADHD, Addiction Treatment, Anxiety, Depression, and anger regulation.");
      } else {
        addBotMessage("I'm having difficulty connecting with my server. Please reach out to Dr. Sabuj Das directly or schedule an appointment using the portal scheduler.");
      }
    }
  };

  const handleStartBreathing = () => {
    setBreathingMode(true);
    setBreathingStep(0);
    setBreathingSeconds(4);
    setBreathingCycles(0);
    addBotMessage("Starting Guided Box Breathing session. Focus on the animated timer block and synchronize your inhalation/exhalation accordingly.");
  };

  const getBreathingLabel = () => {
    switch (breathingStep) {
      case 0: return 'Breathe In...';
      case 1: return 'Hold Breath...';
      case 2: return 'Breathe Out...';
      case 3: return 'Hold Empty...';
      default: return '';
    }
  };

  const getBreathingColor = () => {
    switch (breathingStep) {
      case 0: return 'var(--color-confirmed)'; // Inhale
      case 1: return 'var(--color-pending)'; // Hold
      case 2: return 'var(--color-terracotta)'; // Exhale
      case 3: return 'var(--color-slate-light)'; // Hold Empty
      default: return 'var(--color-slate)';
    }
  };

  return (
    <div className="ai-bot-wrapper" style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 1000 }}>
      {/* 1. Floating Widget Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="ai-bot-bubble"
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-slate)',
            color: 'var(--color-white)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(42,71,62,0.25)',
            cursor: 'pointer',
            transition: 'var(--transition-normal)',
            position: 'relative'
          }}
        >
          <div className="ai-bot-ping-ring"></div>
          <MessageSquare size={24} />
        </button>
      )}

      {/* 2. Chat Panel */}
      {isOpen && (
        <div 
          className="ai-chat-panel glass-card"
          style={{
            width: '360px',
            height: '500px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid rgba(255,255,255,0.7)',
            backgroundColor: 'rgba(250, 248, 245, 0.95)'
          }}
        >
          {/* Header */}
          <div style={{ padding: '1rem 1.25rem', background: 'var(--color-slate)', color: 'var(--color-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={20} />
              <div>
                <h4 style={{ fontSize: '0.9rem', margin: 0, fontWeight: 600, color: '#FFF' }}>Aura - Assistant</h4>
                <span style={{ fontSize: '0.68rem', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: '6px', height: '6px', backgroundColor: '#5CD699', borderRadius: '50%' }}></span>
                  CBT Support Online
                </span>
              </div>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} style={{ color: '#FFF', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {/* Messages list */}
          <div className="custom-scroll" style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(240, 237, 232, 0.3)' }}>
            {messages.map((msg) => {
              const isBot = msg.sender === 'bot';
              return (
                <div 
                  key={msg.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    flexDirection: isBot ? 'row' : 'row-reverse',
                    alignSelf: isBot ? 'flex-start' : 'flex-end',
                    maxWidth: '85%'
                  }}
                >
                  <div 
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: isBot ? 'var(--color-sage)' : 'var(--color-slate-10)',
                      color: isBot ? 'var(--color-slate-dark)' : 'var(--color-slate)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {isBot ? <Bot size={14} /> : <User size={14} />}
                  </div>

                  <div 
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      borderTopLeftRadius: isBot ? '2px' : '12px',
                      borderTopRightRadius: isBot ? '12px' : '2px',
                      backgroundColor: isBot ? '#FFF' : 'var(--color-slate)',
                      color: isBot ? 'var(--color-slate-dark)' : '#FFF',
                      fontSize: '0.85rem',
                      lineHeight: '1.45',
                      boxShadow: '0 2px 6px rgba(42,71,62,0.02)',
                      border: isBot ? '1px solid rgba(42,71,62,0.05)' : 'none'
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: 'var(--color-sage)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bot size={14} /></div>
                <div style={{ padding: '0.5rem 0.8rem', background: '#FFF', borderRadius: '12px', display: 'flex', gap: '4px', border: '1px solid rgba(42,71,62,0.05)' }}>
                  <div className="typing-dot" style={{ width: '6px', height: '6px', background: 'var(--color-slate)', borderRadius: '50%', animation: 'typingDot 1.2s infinite' }}></div>
                  <div className="typing-dot" style={{ width: '6px', height: '6px', background: 'var(--color-slate)', borderRadius: '50%', animation: 'typingDot 1.2s infinite 0.2s' }}></div>
                  <div className="typing-dot" style={{ width: '6px', height: '6px', background: 'var(--color-slate)', borderRadius: '50%', animation: 'typingDot 1.2s infinite 0.4s' }}></div>
                </div>
              </div>
            )}

            {/* Guided Breathing Overlay Box */}
            {breathingMode && (
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-slate-10)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-slate-light)', fontWeight: 600 }}>Guided Box Breathing (Cycle {breathingCycles + 1}/3)</div>
                
                {/* Visual expansion timer block */}
                <div 
                  className="breathing-circle-scaler"
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: getBreathingColor(),
                    color: '#FFF',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0.5rem auto',
                    fontWeight: 700,
                    fontSize: '1.5rem',
                    transition: 'all 1s linear',
                    transform: breathingStep === 0 ? 'scale(1.25)' : breathingStep === 2 ? 'scale(0.85)' : 'scale(1.0)',
                    boxShadow: `0 0 20px ${getBreathingColor()}66`
                  }}
                >
                  {breathingSeconds}s
                </div>

                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-slate-dark)' }}>{getBreathingLabel()}</div>
                <button type="button" className="premium-btn-outline" style={{ padding: '0.3rem', fontSize: '0.75rem', marginTop: '0.2rem' }} onClick={() => setBreathingMode(false)}>
                  Stop Guided Breathing
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies Options */}
          {!breathingMode && (
            <div style={{ padding: '0.5rem', background: '#FFF', display: 'flex', gap: '0.4rem', overflowX: 'auto', borderTop: '1px solid rgba(42,71,62,0.05)' }} className="custom-scroll">
              <button 
                type="button" 
                onClick={() => handleSendMessage("Tell me about session fees")}
                style={{ whiteSpace: 'nowrap', padding: '0.35rem 0.65rem', background: 'var(--color-sage)', border: '1px solid var(--color-slate-10)', borderRadius: '15px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Session Fees
              </button>
              <button 
                type="button" 
                onClick={handleStartBreathing}
                style={{ whiteSpace: 'nowrap', padding: '0.35rem 0.65rem', background: 'var(--color-terracotta-10)', border: '1px solid var(--color-terracotta-light)', borderRadius: '15px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Play size={10} /> Breathing Exercise
              </button>
              <button 
                type="button" 
                onClick={() => handleSendMessage("How do I book an appointment?")}
                style={{ whiteSpace: 'nowrap', padding: '0.35rem 0.65rem', background: 'var(--color-sage)', border: '1px solid var(--color-slate-10)', borderRadius: '15px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                How to Book?
              </button>
            </div>
          )}

          {/* Input Box Footer */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-slate-10)', display: 'flex', gap: '0.5rem', background: '#FFF' }}
          >
            <input 
              type="text"
              disabled={breathingMode}
              placeholder={breathingMode ? "Breathing module active..." : "Type your query here..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid var(--color-slate-10)', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.85rem' }}
            />
            <button 
              type="submit" 
              disabled={!inputText.trim() || breathingMode}
              className="premium-btn" 
              style={{ width: '38px', height: '38px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
