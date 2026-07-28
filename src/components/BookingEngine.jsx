import React, { useState, useEffect } from 'react';
import { Video, PhoneCall, MessageSquare, Calendar as CalendarIcon, Clock, User, Mail, Phone, Heart, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

export default function BookingEngine({ currentUser, availability, appointments, onAddAppointment }) {
  const [selectedMode, setSelectedMode] = useState('Video Session');
  const [currentDate, setCurrentDate] = useState(new Date(2026, 6, 13)); // Pre-set to July 13, 2026 as per local time info
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    ageGroup: 'Adult',
    problemDescription: ''
  });
  
  const [isSuccess, setIsSuccess] = useState(false);
  const [successDetails, setSuccessDetails] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (currentUser && currentUser.role === 'client') {
      setFormData(prev => ({
        ...prev,
        name: currentUser.name || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        ageGroup: currentUser.ageGroup || 'Adult'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        name: '',
        email: '',
        phone: '',
        ageGroup: 'Adult'
      }));
    }
  }, [currentUser]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysOfWeekShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Helper to format Date objects as YYYY-MM-DD
  const formatDateString = (year, month, day) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  // Check if date is in the past (before July 13, 2026)
  const isPastDate = (year, month, day) => {
    const today = new Date(2026, 6, 13); // Fixed current date context
    const checkDate = new Date(year, month, day);
    return checkDate < today;
  };

  // Check if a date is active based on working days & blocked dates
  const isDateDisabled = (year, month, day) => {
    if (isPastDate(year, month, day)) return true;
    
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 1 is Monday...
    
    // Check if therapist works on this weekday
    if (!availability.workingDays.includes(dayOfWeek)) {
      return true;
    }
    
    // Check if date is in the blocked dates list
    const formattedDate = formatDateString(year, month, day);
    if (availability.blockedDates.includes(formattedDate)) {
      return true;
    }
    
    return false;
  };

  // Generate Slots dynamically based on start and end hour settings
  const generateTimeSlots = () => {
    if (!availability.startHour || !availability.endHour) return [];
    
    const startHourNum = parseInt(availability.startHour.split(':')[0], 10);
    const endHourNum = parseInt(availability.endHour.split(':')[0], 10);
    
    const slots = [];
    for (let hour = startHourNum; hour < endHourNum; hour++) {
      let period = "AM";
      let displayHour = hour;
      if (hour >= 12) {
        period = "PM";
        if (hour > 12) {
          displayHour = hour - 12;
        }
      }
      if (hour === 0) {
        displayHour = 12;
      }
      
      slots.push(`${displayHour}:00 ${period}`);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Get weekday of 1st day of month
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  // Get total days in month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const handlePrevMonth = () => {
    // Prevent going past July 2026
    if (currentDate.getFullYear() === 2026 && currentDate.getMonth() <= 6) return;
    
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  // Calendar rendering math
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayIndex = getFirstDayOfMonth(year, month);
  const totalDays = getDaysInMonth(year, month);
  
  const calendarDays = [];
  // Fill empty cells before the 1st day
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  // Fill day numbers
  for (let i = 1; i <= totalDays; i++) {
    calendarDays.push(i);
  }

  // Handle slot selection and double booking check
  const isSlotBooked = (slot) => {
    if (!selectedDate) return false;
    return appointments.some(apt => 
      apt.date === selectedDate && 
      apt.time === slot && 
      apt.status !== 'Cancelled'
    );
  };

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Full name is required";
    if (!formData.email.trim()) {
      errors.email = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = "Please enter a valid email";
    }
    if (!formData.phone.trim()) {
      errors.phone = "Phone number is required";
    } else if (!/^\+?[\d\s-]{8,15}$/.test(formData.phone)) {
      errors.phone = "Please enter a valid phone number";
    }
    if (!formData.problemDescription.trim()) {
      errors.problemDescription = "Please describe the problem/reason for your session";
    }
    if (!selectedDate) errors.date = "Please select a date on the calendar";
    if (!selectedSlot) errors.slot = "Please select an available time slot";
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const newApt = {
      id: 'apt-' + Date.now(),
      date: selectedDate,
      time: selectedSlot,
      clientName: formData.name,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      clientAgeGroup: formData.ageGroup,
      sessionMode: selectedMode,
      status: 'Pending',
      problemDescription: formData.problemDescription,
      notes: ''
    };

    onAddAppointment(newApt);

    setSuccessDetails({
      clientName: formData.name,
      date: selectedDate,
      time: selectedSlot,
      mode: selectedMode
    });

    setIsSuccess(true);
  };

  const handleReset = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      ageGroup: 'Adult',
      problemDescription: ''
    });
    setSelectedDate(null);
    setSelectedSlot(null);
    setIsSuccess(false);
    setSuccessDetails(null);
    setFormErrors({});
  };

  return (
    <section id="booking" className="container booking-section">
      <h2 className="section-title">Schedule a Consultation</h2>
      
      {isSuccess ? (
        <div className="glass-card success-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="success-icon-box">
            <CheckCircle2 size={36} />
          </div>
          <h3>Inquiry Received!</h3>
          <p>
            Thank you for reaching out, <strong>{successDetails.clientName}</strong>. Sabuj Das will review your session inquiry and respond to your email or phone shortly to confirm.
          </p>
          
          <div className="success-details">
            <div><span>Session Type:</span> {successDetails.mode}</div>
            <div><span>Date:</span> {successDetails.date}</div>
            <div><span>Time Slot:</span> {successDetails.time}</div>
            <div><span>Status:</span> <span style={{ color: 'var(--color-pending)' }}>Pending Therapist Review</span></div>
          </div>
          
          <button onClick={handleReset} className="premium-btn">
            Book Another Consultation
          </button>
        </div>
      ) : (
        <div className="booking-layout">
          
          {/* Calendar and Time Panel */}
          <div className="glass-card booking-panel">
            <h3 className="panel-title">
              <CalendarIcon size={20} />
              1. Date & Time Selection
            </h3>
            
            {/* Mode selector */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.75rem' }}>
                Select Session Mode:
              </label>
              <div className="mode-grid">
                {[
                  { name: 'Video Session', icon: <Video size={18} /> },
                  { name: 'Audio Session', icon: <PhoneCall size={18} /> },
                  { name: 'Chat Session', icon: <MessageSquare size={18} /> }
                ].map((mode) => (
                  <button
                    key={mode.name}
                    type="button"
                    className={`mode-card ${selectedMode === mode.name ? 'selected' : ''}`}
                    onClick={() => setSelectedMode(mode.name)}
                  >
                    {mode.icon}
                    <p>{mode.name.split(' ')[0]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Calendar Picker */}
            <div className="calendar-picker-container">
              <div className="calendar-header">
                <h4>{monthNames[month]} {year}</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="calendar-nav-btn"
                    onClick={handlePrevMonth}
                    disabled={year === 2026 && month <= 6}
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="calendar-nav-btn"
                    onClick={handleNextMonth}
                    aria-label="Next month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              
              <div className="calendar-grid">
                {daysOfWeekShort.map((day) => (
                  <div key={day} className="calendar-weekday">{day}</div>
                ))}
                
                {calendarDays.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`}></div>;
                  }
                  
                  const isToday = year === 2026 && month === 6 && day === 13;
                  const dateStr = formatDateString(year, month, day);
                  const isSelected = selectedDate === dateStr;
                  const isDisabled = isDateDisabled(year, month, day);
                  
                  return (
                    <button
                      key={`day-${day}`}
                      type="button"
                      disabled={isDisabled}
                      className={`calendar-day-btn ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setSelectedSlot(null); // Reset slot on date change
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {formErrors.date && (
                <p style={{ color: 'var(--color-cancelled)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  {formErrors.date}
                </p>
              )}
            </div>

            {/* Time Slot Picker */}
            {selectedDate && (
              <div className="slots-container">
                <h4 className="panel-title" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
                  <Clock size={16} />
                  Available Times for {selectedDate}
                </h4>
                <div className="slots-grid">
                  {timeSlots.map((slot) => {
                    const isBooked = isSlotBooked(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isBooked}
                        className={`slot-btn ${selectedSlot === slot ? 'selected' : ''}`}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot}
                        {isBooked && (
                          <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.6 }}>Booked</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {formErrors.slot && (
                  <p style={{ color: 'var(--color-cancelled)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    {formErrors.slot}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Client Inquiry Form Panel */}
          <div className="glass-card booking-panel">
            <h3 className="panel-title">
              <User size={20} />
              2. Your Details & Inquiry
            </h3>
            
            <form onSubmit={handleSubmit} className="inquiry-form">
              <div>
                <label htmlFor="client-name">Full Name</label>
                <input
                  type="text"
                  id="client-name"
                  name="name"
                  placeholder="e.g., Jane Doe"
                  value={formData.name}
                  onChange={handleInputChange}
                />
                {formErrors.name && (
                  <p style={{ color: 'var(--color-cancelled)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {formErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="client-age">Age Group</label>
                <select
                  id="client-age"
                  name="ageGroup"
                  value={formData.ageGroup}
                  onChange={handleInputChange}
                >
                  <option value="Child">Child (Under 12)</option>
                  <option value="Teen">Teen (12-19)</option>
                  <option value="Adult">Adult (20-64)</option>
                  <option value="Senior">Senior (65+)</option>
                </select>
              </div>

              <div>
                <label htmlFor="client-email">Email Address</label>
                <input
                  type="email"
                  id="client-email"
                  name="email"
                  placeholder="jane.doe@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                />
                {formErrors.email && (
                  <p style={{ color: 'var(--color-cancelled)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {formErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="client-phone">Phone Number</label>
                <input
                  type="text"
                  id="client-phone"
                  name="phone"
                  placeholder="+91 99999 88888"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
                {formErrors.phone && (
                  <p style={{ color: 'var(--color-cancelled)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {formErrors.phone}
                  </p>
                )}
              </div>

              <div className="form-group-full">
                <label htmlFor="client-desc">Reason for session inquiry</label>
                <textarea
                  id="client-desc"
                  name="problemDescription"
                  placeholder="Please describe the problem or reason for your session inquiry (e.g., stress, anxiety, relationship difficulties)..."
                  value={formData.problemDescription}
                  onChange={handleInputChange}
                ></textarea>
                {formErrors.problemDescription && (
                  <p style={{ color: 'var(--color-cancelled)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {formErrors.problemDescription}
                  </p>
                )}
              </div>

              <button
                type="submit"
                id="submit-booking-form"
                className="premium-btn form-submit-btn"
              >
                Submit Consultation Inquiry
              </button>
            </form>
          </div>

        </div>
      )}
    </section>
  );
}
