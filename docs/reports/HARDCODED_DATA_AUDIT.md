# Hardcoded and Dummy Data Audit Report — Verdant Mind
**Platform:** Verdant Mind — Public Mental Health & Clinical Services Portal  
**Audit Date:** November 4, 2026  
**Scope:** Complete frontend (`src/`), backend (`server.js`), static assets (`public/`), and test suites (`tests/`).

---

## 1. Executive Summary
A comprehensive codebase scan was performed to identify any fake, dummy, static, or mock data across the application. Every occurrence was categorized according to the standard audit classification (Categories A through E).

**Key Conclusion:**
- **Zero fake production data exists.**
- All clinical records, patient profiles, appointment bookings, direct messages, audit logs, active user sessions, and security alerts are queried dynamically from the authoritative MongoDB database.
- Production mode (`isProd`) strictly disables all local mock database engines, development OAuth codes, and in-memory fallbacks.

---

## 2. Classification Criteria

| Category | Definition | Status / Action |
| :--- | :--- | :--- |
| **A** | **Legitimate Application Configuration** | Preserved. Required for core system operation (e.g. brand themes, practice operating hours, screener questions). |
| **B** | **Test-Only Data** | Isolated to `tests/run_tests.js`. Strictly prohibited from entering production data flows. |
| **C** | **Temporary Development Data** | Isolated in `local_db.json`. Only activated when `NODE_ENV !== 'production'` AND `MONGODB_URI` is unset. |
| **D** | **Fake Production Data** | **NONE FOUND.** All dashboards, tables, and statistics query live MongoDB collections. |
| **E** | **Legitimate Fallback / Default** | Preserved for graceful UX degradation (e.g. public landing page biography). |

---

## 3. Detailed Audit by Module

### 3.1 Public Portfolio Profile & Availability (`src/mockData.js`)
- **Found:**
  - `INITIAL_PROFILE`: Contains consultant psychologist name ("Sabuj Das"), title, location ("Kolkata, India"), credentials, bio, and 9 clinical specializations (ADHD, Addiction, Anger, Anxiety, Bipolar, Teen & Child, Depression, DBT, Assessments).
  - `INITIAL_AVAILABILITY`: Default working days (Monday–Friday, 09:00 to 17:00).
- **Classification:** **Category E (Legitimate Fallback)** & **Category A (Application Configuration)**.
- **Verification:**
  - `INITIAL_PROFILE` is used as initial state in `App.jsx` for rendering the public landing page hero and credentials section. It represents the actual clinical practitioner's public profile, not fake clinical records.
  - Availability is actively overridden by live database queries: when `GET /api/availability` responds, `setAvailability(availData)` dynamically replaces initial defaults.

### 3.2 Patient & Service User Records (`PatientProfileManager.jsx` & `server.js`)
- **Found:** Initial profile state is an empty array `profiles = []` with loading spinner.
- **Classification:** **Category D: NONE FOUND**.
- **Verification:**
  - On mount, `PatientProfileManager` executes `GET /api/profiles?page=1&limit=10&search=&category=&status=`.
  - When the database has 0 records, it renders a clean empty state:
    ```jsx
    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
      <Users size={36} />
      <p>No matching patient or service user records found.</p>
    </div>
    ```
  - No dummy patient names, fake students, or pre-populated clinical records are presented to users.

### 3.3 Dashboard Metrics & Statistics
- **Admin Dashboard (`AdminManagement.jsx`):**
  - Metrics (`totalUsers`, `activeUsers`, `inactiveUsers`, `auditsToday`, `failedLoginsToday`) are computed on the server via `GET /api/admin/metrics` using live Mongoose `User.countDocuments()` and `AuditLog.find()` aggregations.
- **Security Dashboard (`SecurityDashboard.jsx`):**
  - Metrics (`activeSessions`, `failedLogins24h`, `openAlerts`, `criticalAlerts`, `authTimeline`) are calculated in real time by `GET /api/admin/security/overview`.
- **Provider Dashboard (`TherapistDashboard.jsx`):**
  - Counts (`Total Consultations`, `Pending Requests`, `Confirmed Sessions`, `Cancelled`) are computed directly from the fetched `appointments` state array (`appointments.filter(a => a.status === 'Confirmed').length`).
- **Classification:** **Category D: NONE FOUND**. Dynamic database calculation confirmed.

### 3.4 Interactive Clinical Screener (`AssessmentTool.jsx`)
- **Found:** 4 validated clinical questions based on the PHQ-4 (Patient Health Questionnaire-4 / GAD-2 + PHQ-2).
- **Classification:** **Category A (Legitimate Clinical Instrument)**.
- **Verification:** The 4 questions and 4-point Likert response scale (`Not at all`, `Several days`, `More than half the days`, `Nearly every day`) are standard psychological screening protocols. Scoring dynamically computes anxiety and depression sub-scores and submits results directly to `/api/messages` for therapist review.

### 3.5 Development-Only Fallback Engine (`server.js`)
- **Found:** `MockModel` and `local_db.json` file-based fallback system (lines 1247–1485 of `server.js`).
- **Classification:** **Category C (Temporary Development Data)**.
- **Security Guardrail:**
  - Lines 1656–1667 of `server.js` enforce strict fail-fast behavior:
    ```javascript
    if (isProd) {
      console.error('[FATAL] Database connection failed in production. Halting server process.');
      process.exit(1);
    }
    ```
  - In production mode (`NODE_ENV === 'production'`), if MongoDB Atlas is unavailable or `MONGODB_URI` is unset, the process **halts immediately with exit code 1**. It is structurally impossible for production to silently switch to local JSON data.

### 3.6 Google OAuth Mock Flow (`server.js`)
- **Found:** `dev_mock_code` handler on lines 1994–2045 of `server.js`.
- **Classification:** **Category C (Development-Only Helper)**.
- **Security Guardrail:**
  - Line 2034 strictly restricts this to development:
    ```javascript
    if (!isProd && code === 'dev_mock_code' && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET))
    ```
  - In production (`isProd === true`), any attempt to pass `dev_mock_code` is rejected with `400 Bad Request` or an error redirect. Verified by automated test: `P0 Security: Google OAuth dev mock flow is strictly prohibited in production... ✓ PASSED`.

### 3.7 Localhost URLs
- **Found:** CORS allowed origins array in `server.js` contains `http://localhost:5173`, `http://localhost:5000`, `http://127.0.0.1:5173`, and `https://verdant-mind.onrender.com`.
- **Classification:** **Category A (Legitimate Development & Production Origins)**.
- **Verification:**
  - `resolveFrontendUrl()` and `resolveGoogleCallbackUrl()` explicitly check `if (isCloudOrProd && (envFrontend.includes('localhost') || envFrontend.includes('127.0.0.1')))` and strip any localhost values in production mode to prevent external redirect vulnerabilities.
  - Verified by automated tests: `resolveGoogleCallbackUrl generates exact HTTPS redirect URI for Render production... ✓ PASSED` and `resolveFrontendUrl returns clean origin without trailing slashes or localhost leakage... ✓ PASSED`.

---

## 4. Summary Table of Audit Results

| Data Instance | Location | Category | Production Safe? | Real Data Connection |
| :--- | :--- | :--- | :--- | :--- |
| Therapist Bio & Credentials | `src/mockData.js` | E (Fallback) | Yes | Initial landing page presentation |
| Practice Operating Hours | `src/mockData.js` | E (Fallback) | Yes | Overridden by `GET /api/availability` |
| Patient Directory | `PatientProfileManager.jsx` | N/A | Yes | Dynamic MongoDB query via `GET /api/profiles` |
| Consultation Bookings | `TherapistDashboard.jsx` | N/A | Yes | Dynamic MongoDB query via `GET /api/appointments` |
| Direct Inquiries & Messages | `ClientPortal.jsx` | N/A | Yes | Dynamic MongoDB query via `GET /api/messages` |
| Security Threat Alerts | `SecurityDashboard.jsx` | N/A | Yes | Dynamic MongoDB query via `GET /api/admin/security/events` |
| Immutable Audit Logs | `AuditLogManager.jsx` | N/A | Yes | Dynamic MongoDB query via `GET /api/admin/audit-logs` |
| DSAR Requests | `PrivacyManagement.jsx` | N/A | Yes | Dynamic MongoDB query via `GET /api/privacy/requests` |
| PHQ-4 Screener Instrument | `AssessmentTool.jsx` | A (Config) | Yes | Evaluated dynamically; posted to `/api/messages` |
| `local_db.json` Fallback | `server.js:1247` | C (Dev Only) | Yes | Blocked by `if (isProd) process.exit(1)` |
| `dev_mock_code` Auth Flow | `server.js:1994` | C (Dev Only) | Yes | Blocked by `if (!isProd)` guardrail |
