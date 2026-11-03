# Indian Standard Time (IST) Implementation Report

**Application:** Psychology Portfolio (Verdant Mind – Counselling Management Portal)  
**Authoritative Time Zone:** `Asia/Kolkata` (Indian Standard Time, UTC+05:30)  
**Authoritative Date Format:** `DD-MM-YYYY`  
**Time Display Format:** 12-hour AM/PM (`hh:mm A`)  
**Internal Timestamp Storage:** UTC (ISO-8601 representation in MongoDB)  
**Status:** Remediated, Hardened & Production Verified (55/55 Tests Passing)  

---

## 1. Original Issue and Symptoms

Prior to the implementation of the standardized Indian Standard Time (IST) architecture, the Verdant Mind counselling platform suffered from multiple temporal and timezone discrepancies across the frontend and backend layers:

1. **Client-Local Date Shifting (Off-by-One Day):** In the public booking engine and client portal, dates instantiated using standard JavaScript constructors (e.g. `new Date("2026-07-15")`) were interpreted as UTC midnight ($00:00:00\text{Z}$). In client browsers running in western timezones (e.g., UTC-5, UTC-8), this resulted in dates displaying as the previous calendar day (e.g., `14-07-2026`).
2. **Inconsistent Display Formats:** Dates were displayed variably as `YYYY-MM-DD`, `MM/DD/YYYY`, or unformatted ISO strings across the Therapist Dashboard, Client Portal, Clinical Records, and Audio Recordings.
3. **24-Hour vs. 12-Hour Inconsistencies:** The scheduling interface mixed 24-hour military notation (`14:00`) with 12-hour strings (`2:00 PM`), leading to parsing mismatches during appointment creation.
4. **Server Environment Timezone Drift:** The backend server relied on the underlying operating system or cloud provider's local clock (e.g. UTC in AWS/GCP or US/Pacific), leading to date calculation discrepancies during nocturnal hours in India.
5. **Absence of Real-Time Practice Clock:** Patients and staff had no visual anchor confirming the practice's active operational clock and timezone.

---

## 2. Root Cause

- **No Authoritative Timezone Anchor:** The application lacked a centralized timezone contract. Both client and server components relied on native date operations that defaulted to host/browser locales rather than `Asia/Kolkata`.
- **String Manipulation Over UTC Mathematical Conversion:** Appointments stored dates as naive strings without corresponding UTC moments (`appointmentUtc`), causing comparison failures when scheduling across different client environments.
- **Missing Global Locale Configuration:** Neither the Node.js runtime process nor the React application enforced `Intl.DateTimeFormat` with an explicit `timeZone: 'Asia/Kolkata'` setting.

---

## 3. Files Modified & Created

| File | Type | Changes & Responsibility |
| :--- | :--- | :--- |
| [`src/utils/dateTime.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/utils/dateTime.js) | Created | Centralized IST date/time engine. Normalizes strings to `DD-MM-YYYY`, converts 12h/24h times, parses IST inputs into UTC moments, performs interval overlap math, and computes practice week days. |
| [`src/components/LiveISTClock.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/LiveISTClock.jsx) | Created | Live ticking IST clock component rendering accessible time with pulse indicator (`Tuesday, 03 November 2026 \| 11:30 AM IST`). |
| [`src/components/Header.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/Header.jsx) | Modified | Integrated `<LiveISTClock />` in the top global navigation header. |
| [`src/components/BookingEngine.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/BookingEngine.jsx) | Modified | Migrated to canonical `DD-MM-YYYY` and 12-hour AM/PM formats. Added Month, Week, and Day views with midday IST anchoring to prevent date rollover. |
| [`src/components/TherapistDashboard.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/TherapistDashboard.jsx) | Modified | Display all consultation schedules, inquiry timestamps, and blocked dates in IST format. |
| [`src/components/ClientPortal.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/ClientPortal.jsx) | Modified | Formatted client appointment history, upcoming sessions, and care plans using `DD-MM-YYYY` and 12-hour AM/PM IST. |
| [`src/components/ClinicalRecords.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/ClinicalRecords.jsx) | Modified | Standardized MSE observation dates and client clinical record export filenames to `DD-MM-YYYY`. |
| [`src/components/AudioRecordings.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/components/AudioRecordings.jsx) | Modified | Formatted recording timestamps and patient consent timestamps with `formatISTDateTimeWithZone`. |
| [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) | Modified | Set `process.env.TZ = 'Asia/Kolkata'` on startup. Added `appointmentUtc` generation and IST normalization on incoming requests. |
| [`tests/run_tests.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/tests/run_tests.js) | Modified | Added automated test assertions for IST formatting, date normalization, midnight-to-noon conversions, and UTC moment storage. |

---

## 4. Implementation Details

### 4.1 Global Node.js Runtime Configuration
At the entry point of `server.js`, the process timezone is explicitly forced:
```javascript
// Force Indian Standard Time (IST - Asia/Kolkata) across the entire application runtime
process.env.TZ = 'Asia/Kolkata';
```
This guarantees that all backend cron jobs, log timestamps, and native `Date` formatting operations evaluate within UTC+05:30.

### 4.2 Centralized Date-Time Engine (`src/utils/dateTime.js`)
1. **`normalizeToISTDate(input)`**: Validates and converts legacy formats (`YYYY-MM-DD`, `DD/MM/YYYY`, ISO-8601) into canonical `DD-MM-YYYY`.
2. **`normalizeTo12HourTime(input)`**: Validates and transforms military/24-hour time strings (`"14:30"`) into standardized 12-hour format (`"02:30 PM"`).
3. **`parseISTDateTimeToUTC(dateStr, timeStr)`**: Combines canonical `DD-MM-YYYY` and `hh:mm A` into an ISO-8601 string anchored with explicit `+05:30` offset:
   ```javascript
   const istIso = `${yyyy}-${mm}-${dd}T${hhStr}:${mmStr}:00+05:30`;
   return new Date(istIso);
   ```
4. **`formatISTDate` & `formatISTTime`**: Utilize `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'` to guarantee deterministic presentation.
5. **`formatLiveISTClock(date)`**: Outputs the authoritative application clock:
   `Tuesday, 03 November 2026 | 11:30 AM IST`.

### 4.3 Real-Time Header Clock (`src/components/LiveISTClock.jsx`)
Mounted in `Header.jsx`, the live clock refreshes every 1,000 milliseconds using a React effect hook and renders a subtle pulse indicator to reassure users that appointments correspond to real-time Indian Standard Time.

---

## 5. API and Database Changes

### Database Updates
- **`appointmentSchema`**:
  - `date`: String, canonical `DD-MM-YYYY` (IST).
  - `time`: String, canonical `hh:mm A` (IST).
  - `appointmentUtc`: Date, UTC moment corresponding to IST selection (indexed).
  - `createdAt` / `updatedAt`: Automatic UTC timestamps managed by Mongoose.
- **`availabilitySchema`**:
  - `blockedDates`: Array of strings in canonical `DD-MM-YYYY`.
  - `startHour`: Default `'09:00'` (IST).
  - `endHour`: Default `'17:00'` (IST).
  - `breakStart`: Default `'13:00'` (IST).
  - `breakEnd`: Default `'14:00'` (IST).

### API Endpoint Updates
- **`GET /api/health`**: Returns system uptime, status, database connectivity, and authoritative IST time:
  ```json
  {
    "status": "UP",
    "version": "1.0.0",
    "timezone": "Asia/Kolkata",
    "currentTimeIST": "Tuesday, 03 November 2026 | 11:30 AM IST",
    "database": "CONNECTED"
  }
  ```
- **`POST /api/appointments`**: Normalizes incoming `date` and `time` into IST before calculating `appointmentUtc` and executing conflict checks.

---

## 6. Tests Executed

| Test Identifier | Description | Execution Method |
| :--- | :--- | :--- |
| **Test 40** | Unit test verifying `normalizeToISTDate`, `normalizeTo12HourTime`, and `parseISTDateTimeToUTC` under midnight, midday, and cross-month scenarios. | Automated via `tests/run_tests.js` |
| **Test 41** | API test submitting appointment at `11:00 AM IST` and asserting `appointmentUtc` is stored as `05:30:00.000Z`. | Automated via `tests/run_tests.js` |
| **Test 42** | Collision verification ensuring IST interval overlapping math catches variable durations. | Automated via `tests/run_tests.js` |
| **Test 48** | Health endpoint verification confirming `timezone: 'Asia/Kolkata'` and live IST timestamp format. | Automated via `tests/run_tests.js` |

---

## 7. Actual Test Results

```
TEST: Time Zone Standards: DateTime utilities strictly adhere to Asia/Kolkata and DD-MM-YYYY format... ✓ PASSED
TEST: Appointment API: Stores DD-MM-YYYY and 12-hour AM/PM and rejects collision... ✓ PASSED
TEST: Double-Booking Engine: Prevents overlapping duration and buffer collision... ✓ PASSED
TEST: P1 Monitoring: GET /api/health reports version 1.0.0, uptime, and Asia/Kolkata timezone... ✓ PASSED
```

- Total automated tests: **55 passed, 0 failed**.
- Vite production build completed in **1.16s** with zero errors.
- Oxlint static analysis completed with zero warnings or errors.

---

## 8. Remaining Limitations and Recommendations

1. **Client Device Clock Skew:** If a client's device clock is skewed by several minutes, the `<LiveISTClock />` displays the calculated time correctly, but browser time warnings should be surfaced if device drift exceeds $\pm 5$ minutes.
2. **International Patient Context:** For non-resident Indian (NRI) clients booking consultations from abroad, recommend displaying an optional dual-clock preview (e.g. `11:00 AM IST / 01:30 AM EST`) in the booking confirmation modal to eliminate client confusion.
3. **Database Indexing:** Ensure that compound indexes on `{ appointmentUtc: 1 }` are maintained in any future MongoDB cluster migrations.
