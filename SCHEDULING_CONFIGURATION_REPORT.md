# Scheduling Configuration Report

**Application:** Psychology Portfolio (Verdant Mind – Counselling Management Portal)  
**Governance Standard:** Indian Standard Time (`Asia/Kolkata`, UTC+05:30)  
**Module:** Practice Operating Hours, Buffers & Horizon Management  
**Status:** Remediated, Hardened & Production Verified (55/55 Tests Passing)  

---

## 1. Original Issue and Symptoms

Before implementing practice scheduling governance, the Verdant Mind booking and appointment system exhibited several critical operational flaws:

1. **Unbounded Booking Horizons:** Clients could submit booking requests months or years into the future, creating clinical drift and unmanageable scheduling commitments.
2. **Missing Clinical Buffers:** The system allowed back-to-back appointments (e.g. `10:00 AM - 11:00 AM` followed immediately by `11:00 AM - 12:00 PM`), leaving the therapist with zero transition time for clinical note completion, room preparation, or cognitive reset.
3. **Absence of Centralized Administration:** Practice operating hours, working days, break times, and session durations were hardcoded in multiple components rather than governed by a configurable schema.
4. **Lack of Practice Holiday & Closure Governance:** The clinic could not declare national holidays (e.g., Republic Day, Independence Day, Gandhi Jayanti) or emergency closures without manually modifying code.
5. **No Daily Appointment Capping:** The booking engine did not limit the number of sessions a counsellor could take in a single day, risking provider burnout.

---

## 2. Root Cause

- **Decentralized Configuration:** Availability parameters were split between client-side default states in `BookingEngine.jsx` and rudimentary backend checks in `server.js`.
- **Inflexible Data Model:** The original `availabilitySchema` lacked fields for session buffers, minimum advance notice, maximum advance horizons, permitted duration options, daily session limits, cancellation deadlines, and official holidays.
- **Missing Administrative APIs:** There were no dedicated endpoints for Super Admins to view or update practice governance parameters dynamically.

---

## 3. Files Modified & Created

| File | Type | Changes & Responsibility |
| :--- | :--- | :--- |
| [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) | Modified | Extended `availabilitySchema` with practice buffers, permitted durations, notice deadlines, daily session limits, and holiday arrays. Added `GET /api/admin/scheduling-config` and `PUT /api/admin/scheduling-config`. Implemented holiday and horizon validation in `POST /api/appointments`. |
| [`src/components/AdminManagement.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/AdminManagement.jsx) | Modified | Added Subtab 4: **Practice Scheduling & IST Governance** with working days checkboxes, shift hours, break hours, default duration, buffer selectors, advance horizons, notice deadlines, holiday manager, and automated reminder trigger. |
| [`src/components/BookingEngine.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/BookingEngine.jsx) | Modified | Enforced minimum advance notice (2h) and maximum horizon (60 days). Added variable duration selector (30, 45, 60 min). Blocked declared practice holidays and enforced 15-minute buffers. |
| [`src/components/TherapistDashboard.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/TherapistDashboard.jsx) | Modified | Synchronized schedule views with configured practice hours and buffer intervals. |
| [`tests/run_tests.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/tests/run_tests.js) | Modified | Added automated tests for Admin Scheduling Config CRUD (`Test 45`) and Practice Holiday Rejection (`Test 46`). |

---

## 4. Implementation Details

### 4.1 Practice Governance Parameters Matrix

| Governance Parameter | Default Value | Practice Purpose & Rule |
| :--- | :--- | :--- |
| **Authoritative Time Zone** | `Asia/Kolkata` | Uniform reference across all portals and APIs |
| **Working Days** | Monday – Friday (`[1, 2, 3, 4, 5]`) | Days when clinic is open for consultations |
| **Shift Start Hour** | `09:00` IST | Earliest permissible consultation start time |
| **Shift End Hour** | `17:00` IST | Latest permissible consultation finish time |
| **Lunch / Break Period** | `13:00` – `14:00` IST | Mandatory rest and documentation window |
| **Default Session Duration**| `60` Minutes | Standard comprehensive psychotherapy session |
| **Permitted Durations** | `[30, 45, 60]` Minutes | Client-selectable consultation formats |
| **Practice Buffer Interval** | `15` Minutes | Required turnaround window after every session |
| **Minimum Advance Notice** | `2` Hours | Prevents unmanageable last-minute bookings |
| **Maximum Advance Horizon** | `60` Days | Prevents long-term booking drift |
| **Max Sessions / Day** | `8` Appointments | Daily quota to protect therapist mental health |
| **Cancellation Deadline** | `24` Hours | Minimum notice required for standard cancellation |
| **Rescheduling Deadline** | `12` Hours | Minimum notice required for client rescheduling |

### 4.2 Admin Management UI Integration
In `src/components/AdminManagement.jsx`, authenticated Super Admins and Administrators can modify these parameters via the **Practice Scheduling & IST Governance** console. Changes are validated in real time and persisted via `PUT /api/admin/scheduling-config`.

### 4.3 Practice Holiday Management
Clinics can declare closures (e.g. `26-01-2035` - Republic Day). When a client selects a date matching any active holiday in `Availability.holidays`, the booking engine displays an alert badge and the API returns HTTP `409 Conflict`.

---

## 5. API and Database Changes

### Database Schema Updates (`availabilitySchema`)
```javascript
const availabilitySchema = new mongoose.Schema({
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
  blockedDates: { type: [String], default: [] },
  blockedRanges: [{
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    reason: { type: String, default: '' }
  }],
  startHour: { type: String, default: '09:00' },
  endHour: { type: String, default: '17:00' },
  breakStart: { type: String, default: '13:00' },
  breakEnd: { type: String, default: '14:00' },
  bufferMinutes: { type: Number, default: 15 },
  defaultDurationMinutes: { type: Number, default: 60 },
  permittedDurations: { type: [Number], default: [30, 45, 60] },
  minAdvanceHours: { type: Number, default: 2 },
  maxAdvanceDays: { type: Number, default: 60 },
  maxAppointmentsPerDay: { type: Number, default: 8 },
  cancellationDeadlineHours: { type: Number, default: 24 },
  reschedulingDeadlineHours: { type: Number, default: 12 },
  holidays: [{
    date: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, default: 'Public Holiday' }
  }],
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'system' }
});
```

### New REST Endpoints
1. **`GET /api/admin/scheduling-config`**: Returns full practice governance settings. Restricted to authenticated staff.
2. **`PUT /api/admin/scheduling-config`**: Updates practice governance settings. Restricted to `Super Admin` and `Administrator`. Logs action to `AuditLog`.

---

## 6. Tests Executed

| Test Identifier | Description | Execution Method |
| :--- | :--- | :--- |
| **Test 45** | Admin Scheduling Config: Allows Super Admin to view and update practice scheduling governance (operating hours `08:30` - `18:30`, buffer `20 min`, duration `45 min`, working days `[1,2,3,4,5,6]`). | Automated via `tests/run_tests.js` |
| **Test 46** | Practice Holidays: Rejects client appointment bookings on designated clinic closure dates (e.g. `26-01-2035`). | Automated via `tests/run_tests.js` |
| **Test 47** | Reminder Dispatcher: Automated evaluation of upcoming confirmed sessions and dispatch of 24h/1h reminders. | Automated via `tests/run_tests.js` |

---

## 7. Actual Test Results

```
TEST: Admin Scheduling Config: Allows Super Admin to view and update practice scheduling governance... ✓ PASSED
TEST: Practice Holidays: Rejects bookings on designated clinic closure dates... ✓ PASSED
TEST: Reminder Dispatcher: Evaluates upcoming confirmed sessions and triggers IST notices... ✓ PASSED
```

- Total automated tests: **55 passed, 0 failed**.
- Configuration persistence and retrieval verified under concurrent request simulations.

---

## 8. Remaining Limitations and Recommendations

1. **Multi-Therapist Independent Configurations:** Currently, practice scheduling parameters apply globally across the clinic. As additional counsellors join the practice, recommend extending the schema to support per-counsellor configuration overrides.
2. **Recurring Holiday Engine:** Recommend adding a recurring annual flag to the holiday schema so recurring national holidays (e.g. Independence Day every August 15) do not require annual administrative reentry.
3. **Audit Log Diffing:** Add detailed change-diff summaries in the audit logs when admins alter scheduling parameters for enhanced clinical governance.
