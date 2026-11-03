# Counsellor Availability Report

**Application:** Psychology Portfolio (Verdant Mind)  
**Provider:** Mr. Sabuj Das (Lead Counsellor & Clinical Practitioner)  
**Time Zone:** `Asia/Kolkata` (Indian Standard Time, UTC+05:30)  
**Status:** Integrated & Verified  

---

## 1. Counsellor Availability Overview

Counsellor availability governance ensures that client bookings strictly align with the therapist's working hours, clinical shift patterns, leave schedules, and partial-day commitments.

---

## 2. Shift Management & Scheduling Structure

### 2.1 Standard Weekly Shifts
- **Operating Schedule:** Monday through Friday
- **Working Hours:** `09:00 AM` – `05:00 PM` IST
- **Clinical Break:** `01:00 PM` – `02:00 PM` IST (Reserved for lunch, clinical reflection, and case documentation)
- **Session Durations:** 30 minutes, 45 minutes, or 60 minutes
- **Practice Buffer:** 15 minutes between sessions for room sanitization, note finalizing, and mental reset

### 2.2 Whole-Day Leave & Holiday Blocks (`blockedDates`)
Whole days during which the counsellor is unavailable for consultations are stored as canonical `DD-MM-YYYY` strings:
- Example: `14-07-2026`, `25-12-2026`.
- Evaluated case-insensitively using `isSameISTDate`.
- Automatically disables date selection in `BookingEngine.jsx`.
- Blocks API booking requests with HTTP `409 Conflict`.

### 2.3 Partial-Day Blocked Ranges (`blockedRanges`)
For times when the therapist has external clinical commitments, conferences, or personal appointments during a working day:
```json
[
  {
    "date": "20-07-2026",
    "startTime": "10:00 AM",
    "endTime": "12:30 PM",
    "reason": "Hospital Clinical Grand Rounds"
  }
]
```
The booking engine checks interval overlap: if an appointment requested between 10:00 AM and 11:00 AM overlaps with a blocked range, it is immediately flagged as unavailable.

---

## 3. Public Booking Engine Synchronization

The counsellor's availability is synchronized with the client-facing booking interface via `/api/availability`:
1. **Disabled Day Buttons:** The calendar picker automatically grays out days where `workingDays.includes(dayOfWeek) === false` or `blockedDates.includes(date)`.
2. **Disabled Time Slots:** Time slot buttons display dynamic state badges:
   - **Available (Green):** Open for reservation.
   - **Booked (Muted Gray):** Already reserved by another client or blocked by buffer time.
   - **Selected (Gold Accent):** Currently chosen by user.

---

## 4. Therapist Dashboard Controls

Within `src/components/TherapistDashboard.jsx`:
- **Shift Hours & Working Days Tab:** Allows the therapist to adjust shift start/end hours and toggle working days.
- **Blocked Dates Manager:** Allows the therapist to add new dates to the blocked list in `DD-MM-YYYY` format and remove existing blocked entries.
- **Schedule Views:**
  - **Table View:** Comprehensive tabular listing of all inquiries with client details, age group, session format, and direct action triggers.
  - **Week Schedule View:** Multi-column view of Monday through Sunday showing all sessions booked across the current week.
  - **Day Timeline View:** Detailed hourly breakdown of scheduled sessions for the selected day.

---

## 5. Verification & Audit Trail

All changes to availability are logged to the security audit trail (`AuditLog`) with actor email, timestamp, and updated schedule payload. Automatic regression tests confirm that appointments cannot be booked on blocked dates or outside scheduled shift hours.
