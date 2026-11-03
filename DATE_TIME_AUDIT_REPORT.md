# Date & Time Selection Audit Report

**Application:** Psychology Portfolio (Verdant Mind – Counselling Management Portal)  
**Authoritative Time Zone:** `Asia/Kolkata` (Indian Standard Time, UTC+05:30)  
**Authoritative Date Format:** `DD-MM-YYYY`  
**Time Display Format:** 12-hour AM/PM (`hh:mm A`)  
**Audit Scope:** Full Application Stack (Frontend, Backend, MongoDB, Admin Console, Counsellor Portal, Client Portal, Email Notifications)  
**Status:** Completed, Remediated & Verified (55/55 Tests Passing)  

---

## 1. Executive Summary & Original Issues

Prior to remediation, the Verdant Mind counselling platform was audited for temporal integrity, timezone resilience, and appointment conflict vulnerabilities. The audit revealed five critical defects:

1. **Client-Local Timezone Boundary Rollover:** Date conversions performed via `new Date("YYYY-MM-DD")` parsed dates at UTC midnight ($00:00:00\text{Z}$). In western timezones (e.g., UTC-5, UTC-8), this rolled the date backwards by 24 hours to the previous calendar day.
2. **Ambiguous String Formats:** Inconsistent date formats (`YYYY-MM-DD`, `DD/MM/YYYY`, ISO-8601 strings) created interpretation errors across components.
3. **Double-Booking Vulnerability with Variable Durations:** The booking engine only evaluated exact string equality of appointment start times (`existing.time === req.body.time`). A 60-minute session starting at `10:00 AM` could be double-booked by an incoming `10:30 AM` request.
4. **Buffer Period Omission:** The system did not enforce clinical turnaround buffers (15 minutes), risking consecutive session overruns.
5. **Absence of Governance for Holidays & Automated Reminders:** The application lacked practice holiday management, daily session quota enforcement, and automated reminder dispatching in IST.

---

## 2. Root Cause Analysis

- **Lack of Centralized Timezone Anchor:** Components performed isolated `new Date()` operations without fixing the timezone to `Asia/Kolkata`.
- **String Matching Over Interval Math:** The backend did not compute interval intersections:
  $$\max(A_{\text{start}}, B_{\text{start}}) < \min(A_{\text{busy}}, B_{\text{busy}})$$
- **Missing Database-Level Partial Unique Indexes:** MongoDB schemas lacked partial filter unique constraints to block concurrent race conditions at the database engine level.

---

## 3. Files Modified & Created

| File Path | Role & Changes Applied |
| :--- | :--- |
| [`src/utils/dateTime.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/utils/dateTime.js) | Centralized IST date/time engine. Added `normalizeToISTDate`, `normalizeTo12HourTime`, `formatISTDate`, `formatISTTime`, `parseISTDateTimeToUTC`, `doAppointmentsOverlap`, `getISTWeekDays`. |
| [`src/components/LiveISTClock.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/LiveISTClock.jsx) | Live ticking Indian Standard Time application clock widget. |
| [`src/components/Header.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/Header.jsx) | Integrated `<LiveISTClock />` in the top brand navigation area. |
| [`src/components/BookingEngine.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/BookingEngine.jsx) | Added Month/Week/Day calendar views, 30/45/60 min duration selector, practice buffer enforcement, holiday blocking, max horizon limiting, and visual state badges. |
| [`src/components/TherapistDashboard.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/TherapistDashboard.jsx) | Added Table/Week/Day schedule views, Reschedule modal (`PATCH /api/appointments/:id/reschedule`), and Cancellation reason modal. |
| [`src/components/AdminManagement.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/AdminManagement.jsx) | Added Subtab 4: **Practice Scheduling & IST Governance** with holiday management and automated reminder dispatching. |
| [`src/components/ClientPortal.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/ClientPortal.jsx) | Converted appointment history and care documents to `DD-MM-YYYY` and 12-hour AM/PM IST. |
| [`src/components/ClinicalRecords.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/ClinicalRecords.jsx) | Converted patient export filenames and MSE timestamps to IST. |
| [`src/components/AudioRecordings.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/AudioRecordings.jsx) | Converted consent and recording timestamps to `formatISTDateTimeWithZone`. |
| [`src/mockData.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/mockData.js) | Standardized mock appointments and blocked dates to `DD-MM-YYYY`. |
| [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) | Initialized `process.env.TZ = 'Asia/Kolkata'`, updated schemas with compound partial unique indexes, enhanced `POST /api/appointments`, implemented `PATCH /api/appointments/:id/reschedule`, `POST /api/appointments/process-reminders`, and admin config endpoints. |
| [`tests/run_tests.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/tests/run_tests.js) | Expanded test suite to 55 automated specifications covering all IST workflows, collisions, rescheduling, cancellation, and reminders. |

---

## 4. API & Database Schema Modifications

### 4.1 Database Schemas
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

### 4.2 API Route Updates
1. `POST /api/appointments`: Interval overlap check with buffer, holiday check, daily quota check, UTC moment storage.
2. `PATCH /api/appointments/:id/reschedule`: Validates new slot, checks deadline, updates `rescheduledFrom` and `history`, sends Brevo email.
3. `PATCH /api/appointments/:id/status`: Captures `cancellationReason`, updates `history`, creates `AuditLog`.
4. `POST /api/appointments/process-reminders`: Dispatches 24h and 1h reminders for upcoming confirmed sessions.
5. `GET /api/admin/scheduling-config`: Returns complete practice governance configuration.
6. `PUT /api/admin/scheduling-config`: Updates practice governance configuration.

---

## 5. Tests Executed & Actual Results

| Test # | Test Description | Status |
| :---: | :--- | :---: |
| **Test 40** | DateTime utilities strictly adhere to `Asia/Kolkata` and `DD-MM-YYYY` | **PASSED** |
| **Test 41** | Appointment API stores `DD-MM-YYYY` and 12-hour AM/PM and rejects duplicate slot | **PASSED** |
| **Test 42** | Double-Booking Engine prevents overlapping duration and buffer collision | **PASSED** |
| **Test 43** | Rescheduling workflow updates slot, logs history, and preserves previous record | **PASSED** |
| **Test 44** | Cancellation governance records cancellation reason and logs audit history | **PASSED** |
| **Test 45** | Admin Scheduling Config allows Super Admin to view and update governance | **PASSED** |
| **Test 46** | Practice Holidays rejects bookings on designated clinic closure dates | **PASSED** |
| **Test 47** | Reminder Dispatcher evaluates upcoming confirmed sessions and triggers IST notices | **PASSED** |

**Full Verification Suite:** **55 PASSED, 0 FAILED** (100% pass rate).

---

## 6. Remaining Limitations & Recommendations

1. **Automated Cron Daemon for Reminders:** The `/api/appointments/process-reminders` endpoint is currently triggered via administrative action or API call. For autonomous cloud operation, configure an external cron trigger (e.g., AWS CloudWatch Events or GitHub Actions schedule every 15 minutes).
2. **SMS Notification Integration:** Brevo SMTP currently handles email notices. Integration with an Indian SMS gateway (e.g., Twilio or MSG91) using DLT-approved templates is recommended for direct SMS alerts.
