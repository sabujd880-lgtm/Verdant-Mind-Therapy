# Date & Time Selection Implementation Summary

**Application:** Psychology Portfolio (Verdant Mind – Counselling Management Portal)  
**Authoritative Standard:** Indian Standard Time (`Asia/Kolkata`, UTC+05:30)  
**Date Format:** `DD-MM-YYYY`  
**Time Format:** 12-hour AM/PM (`hh:mm A`)  
**Storage Standard:** UTC (`ISO-8601`) in MongoDB  
**Audit Scope:** Full Application Stack (Frontend, Backend, Database, Admin Console, Counsellor Portal, Client Portal, Email Alerts)  
**Status:** Complete, Remediated, Hardened & Production Verified (55/55 Tests Passing)  

---

## 1. Original Issue and Symptoms

The Verdant Mind counselling management platform was audited for temporal stability, timezone resilience, and appointment conflict vulnerabilities. The audit revealed five critical defects:

1. **Client-Local Timezone Boundary Rollover:** Date conversions performed via native `new Date("YYYY-MM-DD")` parsed dates at UTC midnight ($00:00:00\text{Z}$). In western timezones (e.g. UTC-5, UTC-8), this rolled the date backwards by 24 hours to the previous calendar day.
2. **Ambiguous String Formats:** Inconsistent date representations (`YYYY-MM-DD`, `DD/MM/YYYY`, ISO-8601 strings) created interpretation errors across components.
3. **Double-Booking Vulnerability with Variable Durations:** The booking engine only evaluated exact string equality of appointment start times (`existing.time === req.body.time`). A 60-minute session starting at `10:00 AM` could be double-booked by an incoming `10:30 AM` request.
4. **Buffer Period Omission:** The system did not enforce clinical turnaround buffers (15 minutes), risking consecutive session overruns.
5. **Absence of Governance for Holidays & Automated Reminders:** The application lacked practice holiday management, daily session quota enforcement, structured rescheduling/cancellation reason tracking, and automated reminder dispatching in IST.

---

## 2. Root Cause

- **Lack of Centralized Timezone Anchor:** Components performed isolated `new Date()` operations without fixing the timezone to `Asia/Kolkata`.
- **String Matching Over Interval Math:** The backend did not compute interval intersections:
  $$\max(A_{\text{start}}, B_{\text{start}}) < \min(A_{\text{busy}}, B_{\text{busy}})$$
- **Missing Database-Level Partial Unique Indexes:** MongoDB schemas lacked partial filter unique constraints to block concurrent race conditions at the database engine level.
- **Incomplete Schema Fields:** The schemas lacked fields for turnaround buffers, practice horizons, rescheduling history, cancellation reasons, and reminder dispatch flags.

---

## 3. Files Modified & Created

| File | Type | Changes & Responsibility |
| :--- | :--- | :--- |
| [`src/utils/dateTime.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/utils/dateTime.js) | Created | Centralized IST date/time engine. Added `normalizeToISTDate`, `normalizeTo12HourTime`, `formatISTDate`, `formatISTTime`, `parseISTDateTimeToUTC`, `doAppointmentsOverlap`, `getISTWeekDays`. |
| [`src/components/LiveISTClock.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/LiveISTClock.jsx) | Created | Live ticking Indian Standard Time application clock widget. |
| [`src/components/Header.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/Header.jsx) | Modified | Integrated `<LiveISTClock />` in the top brand navigation area. |
| [`src/components/BookingEngine.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/BookingEngine.jsx) | Modified | Added Month/Week/Day calendar views, 30/45/60 min duration selector, practice buffer enforcement, holiday blocking, max horizon limiting, and visual state badges. |
| [`src/components/TherapistDashboard.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/TherapistDashboard.jsx) | Modified | Added Table/Week/Day schedule views, Reschedule modal (`PATCH /api/appointments/:id/reschedule`), and Cancellation reason modal. |
| [`src/components/AdminManagement.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/AdminManagement.jsx) | Modified | Added Subtab 4: **Practice Scheduling & IST Governance** with holiday management and automated reminder dispatching. |
| [`src/components/ClientPortal.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/ClientPortal.jsx) | Modified | Converted appointment history and care documents to `DD-MM-YYYY` and 12-hour AM/PM IST. |
| [`src/components/ClinicalRecords.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/ClinicalRecords.jsx) | Modified | Converted patient export filenames and MSE timestamps to IST. |
| [`src/components/AudioRecordings.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/AudioRecordings.jsx) | Modified | Converted consent and recording timestamps to `formatISTDateTimeWithZone`. |
| [`src/mockData.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/mockData.js) | Modified | Standardized mock appointments and blocked dates to `DD-MM-YYYY`. |
| [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) | Modified | Initialized `process.env.TZ = 'Asia/Kolkata'`, updated schemas with compound partial unique indexes, enhanced `POST /api/appointments`, implemented `PATCH /api/appointments/:id/reschedule`, `POST /api/appointments/process-reminders`, and admin config endpoints. |
| [`tests/run_tests.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/tests/run_tests.js) | Modified | Expanded test suite to 55 automated specifications covering all IST workflows, collisions, rescheduling, cancellation, and reminders. |

---

## 4. Implementation Details

### 4.1 Authoritative IST Standard & Clock Synchronization
- Global time zone established as `Asia/Kolkata` with zero Daylight Saving Time variance.
- Display format standardized across the application to `DD-MM-YYYY` and 12-hour AM/PM (`hh:mm A`).
- Real-time live ticking clock component (`<LiveISTClock />`) integrated in the platform header (`Tuesday, 03 November 2026 | 11:30 AM IST`).
- Server environment variable `process.env.TZ = 'Asia/Kolkata'` initialized at process startup.

### 4.2 Multi-View Calendar & Scheduling Interface
- Upgraded `src/components/BookingEngine.jsx` with **Month View**, **Week View**, and **Day View** toggles.
- Added variable consultation duration selector (`30 min`, `45 min`, `60 min`).
- Implemented accessible visual state badges: Available (Green), Selected (Gold), Booked (Gray), Blocked (Red).

### 4.3 Practice Scheduling Governance & Admin Controls
- Extended `availabilitySchema` with practice buffers, operating hours, break times, advance booking horizons, and official practice holidays.
- Implemented administrative endpoints: `GET /api/admin/scheduling-config` and `PUT /api/admin/scheduling-config`.
- Added the **Practice Scheduling & IST Governance** subtab in `src/components/AdminManagement.jsx` for intuitive practice management.

### 4.4 Robust Double-Booking Prevention & Buffer Management
- Implemented mathematical interval overlap checking:
  $$\max(A_{\text{start}}, B_{\text{start}}) < \min(A_{\text{busy}}, B_{\text{busy}})$$
- Enforced 15-minute practice buffer turnaround between consecutive clinical sessions.
- Enforced double-booking rejection at API (`POST /api/appointments`, `PATCH /api/appointments/:id/reschedule`) and database compound partial unique index levels.

### 4.5 Rescheduling, Cancellation Governance & Reminders
- Added `PATCH /api/appointments/:id/reschedule` endpoint with slot conflict detection, Brevo notification dispatch, and preservation of prior slot history in `rescheduledFrom` and `history`.
- Enhanced `PATCH /api/appointments/:id/status` to capture `cancellationReason` and record audit log entries.
- Added Reschedule and Cancellation dialogs to `src/components/TherapistDashboard.jsx`.
- Added `POST /api/appointments/process-reminders` to dispatch 24h and 1h email reminders.

---

## 5. API and Database Changes

### Database Schemas
- **`appointmentSchema`**:
  - `date`: Canonical `DD-MM-YYYY` in `Asia/Kolkata`.
  - `time`: Strict 12-hour `hh:mm A` in `Asia/Kolkata`.
  - `durationMinutes`: Number (default `60`).
  - `bufferMinutes`: Number (default `15`).
  - `appointmentUtc`: Date (UTC moment, indexed).
  - `cancellationReason`: String (default `''`).
  - `rescheduledFrom`: Object with previous `date`, `time`, `rescheduledAt`, `rescheduledBy`.
  - `history`: Array of audit events (`CREATED`, `RESCHEDULED`, `CONFIRMED`, `CANCELLED`).
  - `reminded24h`: Boolean (default `false`).
  - `reminded1h`: Boolean (default `false`).
  - Compound Index: `{ appointmentUtc: 1 }, { unique: true, partialFilterExpression: { status: { $ne: 'Cancelled' } } }`.

- **`availabilitySchema`**:
  - `workingDays`: `[Number]` (default `[1, 2, 3, 4, 5]`).
  - `blockedDates`: `[String]` (canonical `DD-MM-YYYY`).
  - `blockedRanges`: Array of `{ date, startTime, endTime, reason }`.
  - `startHour`: String (default `'09:00'`).
  - `endHour`: String (default `'17:00'`).
  - `breakStart`: String (default `'13:00'`).
  - `breakEnd`: String (default `'14:00'`).
  - `bufferMinutes`: Number (default `15`).
  - `defaultDurationMinutes`: Number (default `60`).
  - `permittedDurations`: `[Number]` (default `[30, 45, 60]`).
  - `minAdvanceHours`: Number (default `2`).
  - `maxAdvanceDays`: Number (default `60`).
  - `maxAppointmentsPerDay`: Number (default `8`).
  - `cancellationDeadlineHours`: Number (default `24`).
  - `reschedulingDeadlineHours`: Number (default `12`).
  - `holidays`: Array of `{ date, name, type }`.

### API Routes
1. `POST /api/appointments`: Interval overlap check with buffer, holiday check, daily quota check, UTC moment storage.
2. `PATCH /api/appointments/:id/reschedule`: Validates new slot, checks deadline, updates `rescheduledFrom` and `history`, sends Brevo email.
3. `PATCH /api/appointments/:id/status`: Captures `cancellationReason`, updates `history`, creates `AuditLog`.
4. `POST /api/appointments/process-reminders`: Dispatches 24h and 1h reminders for upcoming confirmed sessions.
5. `GET /api/admin/scheduling-config`: Returns complete practice governance configuration.
6. `PUT /api/admin/scheduling-config`: Updates practice governance configuration.

---

## 6. Tests Executed

| Test # | Test Description | Status |
| :---: | :--- | :---: |
| **Test 40** | DateTime utilities strictly adhere to `Asia/Kolkata` and `DD-MM-YYYY` | **PASSED** |
| **Test 41** | Appointment API stores `DD-MM-YYYY` and `hh:mm A`, persists `appointmentUtc`, and rejects duplicates | **PASSED** |
| **Test 42** | Double-booking engine prevents duration overlap and 15-minute buffer collisions | **PASSED** |
| **Test 43** | Rescheduling workflow validates slot, preserves `rescheduledFrom`, appends `history`, and sends alert | **PASSED** |
| **Test 44** | Cancellation governance captures `cancellationReason` and records audit history | **PASSED** |
| **Test 45** | Admin scheduling config allows Super Admin to view and update practice governance | **PASSED** |
| **Test 46** | Practice holidays blocks bookings on designated clinic closure dates | **PASSED** |
| **Test 47** | Automated reminder dispatcher evaluates upcoming confirmed sessions and triggers IST notices | **PASSED** |

---

## 7. Actual Test Results

- **Automated Test Suite:** **55 passed, 0 failed** (`node tests/run_tests.js`).
- **Vite Production Build:** Successfully generated production bundles in **1.16s** with zero errors.
- **Static Code Analysis:** Oxlint passed with zero warnings or errors.
- **Git Repository:** All modifications committed and pushed to `main` branch.

---

## 8. Remaining Limitations and Recommendations

1. **Automated Cron Daemon:** Deploy an automated recurring cron worker (e.g. AWS EventBridge or Google Cloud Scheduler) calling `POST /api/appointments/process-reminders` every 15 minutes.
2. **WhatsApp / SMS Integrations:** Supplement email reminders with Twilio SMS or WhatsApp messages for higher urgent notice visibility.
3. **Multi-Therapist Calendar Sync:** In future practice expansion phases, integrate bidirectional Google Calendar or Microsoft Outlook calendar synchronizations.
