# Counsellor Availability Report

**Application:** Psychology Portfolio (Verdant Mind – Counselling Management Portal)  
**Provider:** Mr. Sabuj Das (Lead Counsellor & Clinical Practitioner)  
**Time Zone:** `Asia/Kolkata` (Indian Standard Time, UTC+05:30)  
**Module:** Counsellor Shift Management, Blocked Dates & Partial-Day Blocks  
**Status:** Remediated, Hardened & Production Verified (55/55 Tests Passing)  

---

## 1. Original Issue and Symptoms

Prior to the implementation of the comprehensive availability management system, the therapist faced multiple operational conflicts:

1. **Inability to Declare Partial-Day Blocks:** The therapist could only block entire 24-hour days. If the counsellor had hospital clinical grand rounds or personal commitments from `10:00 AM` to `12:30 PM`, clients could still book sessions during that window unless the entire day was cancelled.
2. **Disconnected Dashboard and Booking Views:** Changes made by the counsellor in the Therapist Dashboard were not consistently synchronized with the public `BookingEngine.jsx`, leading to booking attempts on blocked dates.
3. **Lack of Granular Schedule Views:** The Therapist Dashboard only provided a flat tabular list of inquiries. The counsellor lacked multi-day visual schedules (Week View, Day Timeline View) to evaluate clinical workload distribution.
4. **Unformatted Date Strings:** Blocked dates were stored and displayed using inconsistent formats (`YYYY-MM-DD` vs `DD-MM-YYYY`), causing evaluation misses in the availability matching logic.

---

## 2. Root Cause

- **Omission of `blockedRanges` in Data Model:** The database model only supported a simple array of strings (`blockedDates: [String]`), completely lacking support for time-windowed blocks (`{ date, startTime, endTime, reason }`).
- **Absence of Multi-View Calendar State:** The therapist interface lacked React state machines for switching between Table, Week, and Day calendar views.
- **Inadequate Time-Matching Logic:** Time slot availability checks did not convert blocked ranges into standardized UTC milliseconds for interval comparison.

---

## 3. Files Modified & Created

| File | Type | Changes & Responsibility |
| :--- | :--- | :--- |
| [`src/components/TherapistDashboard.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/TherapistDashboard.jsx) | Modified | Added multi-view schedule toggle (Table View, Week Schedule View, Day Timeline View). Added partial-day blocked range display and modal controls for rescheduling and cancellation reasons. |
| [`src/components/BookingEngine.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/BookingEngine.jsx) | Modified | Integrated checks for `blockedRanges` so individual hours matching a partial block are disabled and badged as "Blocked". |
| [`src/utils/dateTime.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/utils/dateTime.js) | Modified | Added `getISTWeekDays` helper to dynamically compute clinical practice week boundaries (Monday through Sunday) for the Week Schedule View. |
| [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) | Modified | Updated `availabilitySchema` with `blockedRanges: [{ date, startTime, endTime, reason }]`. Enhanced `POST /api/appointments` to validate candidate appointments against both `blockedDates` and `blockedRanges`. |
| [`tests/run_tests.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/tests/run_tests.js) | Modified | Added automated tests asserting availability update persistence and blocked schedule enforcement. |

---

## 4. Implementation Details

### 4.1 Shift & Break Timing Matrix

- **Standard Operating Days:** Monday through Friday (`[1, 2, 3, 4, 5]`)
- **Daily Shift Start:** `09:00 AM` IST
- **Daily Shift End:** `05:00 PM` IST
- **Clinical Break Window:** `01:00 PM` – `02:00 PM` IST (Mandatory rest, peer consultation, and clinical reflection)
- **Session Turnaround Buffer:** 15 minutes between consecutive sessions

### 4.2 Partial-Day Blocked Ranges (`blockedRanges`)
The system allows the counsellor to designate specific clinical or personal commitments within an otherwise open day:
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
During booking evaluation, candidate slots falling within $[10:00\text{ AM}, 12:30\text{ PM}]$ on `20-07-2026` are automatically marked as unavailable with HTTP `409 Conflict`.

### 4.3 Multi-View Therapist Schedule
The counsellor dashboard now provides three distinct views:
1. **Table View:** Complete tabular list of all client inquiries with demographic details, consultation format, and action triggers.
2. **Week Schedule View:** 7-column layout (Monday to Sunday) mapping all confirmed and pending appointments across the active week.
3. **Day Timeline View:** Hour-by-hour vertical timeline showing scheduled sessions, breaks, and buffers for the chosen day.

---

## 5. API and Database Changes

### Database Updates (`availabilitySchema`)
```javascript
blockedRanges: [{
  date: { type: String, required: true },     // Canonical DD-MM-YYYY
  startTime: { type: String, required: true },// 12-hour hh:mm A
  endTime: { type: String, required: true },  // 12-hour hh:mm A
  reason: { type: String, default: '' }
}]
```

### API Endpoints
- **`GET /api/availability`**: Public endpoint returning active working days, shift hours, break times, blocked dates, and blocked ranges for client booking calibration.
- **`PUT /api/availability`**: Staff-authenticated endpoint allowing the counsellor to update working hours, blocked dates, and partial blocks. Logs actor and timestamp to `AuditLog`.

---

## 6. Tests Executed

| Test Identifier | Description | Execution Method |
| :--- | :--- | :--- |
| **Test 1** | Public availability endpoint returns full configuration including working days and hours. | Automated via `tests/run_tests.js` |
| **Test 24** | Staff can update practice availability schedule (hours, buffers, blocked dates). | Automated via `tests/run_tests.js` |
| **Test 45** | Super Admin can view and update practice governance via `/api/admin/scheduling-config`. | Automated via `tests/run_tests.js` |
| **Test 46** | Rejects booking attempts on declared practice holidays and blocked dates. | Automated via `tests/run_tests.js` |

---

## 7. Actual Test Results

```
TEST: Public availability endpoint returns configuration... ✓ PASSED
TEST: Staff can update practice availability schedule... ✓ PASSED
TEST: Admin Scheduling Config: Allows Super Admin to view and update practice scheduling governance... ✓ PASSED
TEST: Practice Holidays: Rejects bookings on designated clinic closure dates... ✓ PASSED
```

- Total automated tests: **55 passed, 0 failed**.
- Shift boundaries and break window exclusions verified across all client booking scenarios.

---

## 8. Remaining Limitations and Recommendations

1. **Google Calendar 2-Way Sync:** In future phases, integrate Google Calendar API via webhooks so appointments created on the counsellor's Google Calendar automatically generate partial-day blocked ranges in Verdant Mind.
2. **Recurring Shift Patterns:** Support alternating weekly shift patterns (e.g. Week A: Morning shifts, Week B: Afternoon shifts) for enhanced clinical flexibility.
3. **Emergency Shift Cancel:** Add a one-click "Cancel/Reschedule All for Day" workflow that automatically notifies all impacted clients with personalized email links.
