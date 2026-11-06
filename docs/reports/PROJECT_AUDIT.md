# Technical Audit Report: Counselling Management Portal (Verdant Mind)
**Document Version:** 1.0.0  
**Audit Date:** November 2026  
**System Status:** Pre-Upgrade Baseline Audit  

---

## 1. Executive Summary

This technical audit report documents the current architecture, data models, authentication mechanisms, and infrastructure components of the **Counselling Management Portal ("Verdant Mind")**. The portal is being upgraded into a secure, production-grade, Google-authenticated, role-governed healthcare web application ready for public cloud deployment.

---

## 2. Framework & Stack Identification

| Layer | Current Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | 19.2.7 | Single Page Application (SPA) user interface |
| **Build Tool & Bundler** | Vite | 8.1.1 | HMR dev server and optimized production build |
| **PWA Layer** | vite-plugin-pwa | 1.3.0 | Offline service workers and manifest caching |
| **Icons & Design System** | lucide-react, Vanilla CSS | 1.24.0 | Modern responsive healthcare design system |
| **Backend Runtime** | Node.js (ES Modules) | v22+ | Server execution environment |
| **Backend Framework** | Express | 5.2.1 | REST API gateway and static file serving |
| **Database ODM** | Mongoose | 9.7.4 | MongoDB Object Modeling with Atlas cloud cluster |
| **Fallback Storage** | Local JSON (`local_db.json`) | N/A | Offline dev fallback if Atlas is unreachable |
| **Email Service** | Brevo Transactional API | v3 | Direct REST SMTP notifications and OTP delivery |
| **AI Integration** | Google Gemini 1.5 Flash API | v1beta | Clinical note polishing and AI assistant ("Aura") |

---

## 3. Existing Project Architecture & File Inventory

```
psychology-portfolio/
├── .env                         # Environment variables (MongoDB, Brevo, Gemini, Provider)
├── .gitignore                   # Version control exclusion rules
├── index.html                   # HTML5 entry template with viewport & meta tags
├── local_db.json                # Local JSON fallback datastore for offline dev
├── package.json                 # Project dependencies and script definitions
├── server.js                    # Express 5 gateway backend, MongoDB models, REST endpoints
├── vite.config.js               # Vite configurations with React and PWA plugins
├── _backup_pre_upgrade/         # Pre-upgrade backup snapshot preserving original code
├── public/                      # Static assets (favicons, manifests, icons)
└── src/
    ├── App.css                  # Component-specific styles
    ├── App.jsx                  # Root component, routing, user state synchronization
    ├── index.css                # Global CSS variables, design tokens, responsive typography
    ├── main.jsx                 # React root renderer
    ├── mockData.js              # Initial demo profile, appointments, and messages
    ├── assets/                  # Brand images, therapist portraits, logos
    └── components/
        ├── AIBotWidget.jsx      # Aura AI virtual assistant chat widget
        ├── AssessmentTool.jsx   # Clinical screening tool (GAD/PHQ mental distress questions)
        ├── AuthPortal.jsx       # Client registration, OTP verification, password recovery, login
        ├── BookingEngine.jsx    # Appointment calendar, time slot selection, intake form
        ├── ClientPortal.jsx     # Client dashboard: active sessions, clinical plans, receipts
        ├── Header.jsx           # Top navigation bar, role toggles, sign-in CTA
        ├── Portfolio.jsx        # Public therapist portfolio, clinical specialties, testimonials
        ├── ReloadPrompt.jsx     # PWA update prompt
        └── TherapistDashboard.jsx # Provider dashboard: appointments, messages, care documents
```

---

## 4. API Endpoints & Data Models

### 4.1 Existing Mongoose Schemas (`server.js`)
1. **`Client`**: `email` (unique, lowercase), `password`, `name`, `phone`, `ageGroup`, `verified` (bool), `otpCode`, `otpExpires`, `resetOtpCode`, `resetOtpExpires`.
2. **`Appointment`**: `clientEmail`, `clientName`, `clientPhone`, `date`, `time`, `sessionMode`, `problemDescription`, `status` (`Pending` | `Confirmed` | `Cancelled`), `notes`.
3. **`Message`**: `senderName`, `senderEmail`, `subject`, `message`, `timestamp`, `status` (`unread` | `read` | `replied`), `replies` (`[{ id, message, timestamp }]`).
4. **`CareDocument`**: `clientEmail`, `clientName`, `type` (`receipt` | `prescription` | `report`), `date`, `data` (mixed).
5. **`Availability`**: `workingDays`, `blockedDates`, `startHour`, `endHour`.

### 4.2 Existing REST API Routes
- `POST /api/auth/register` — Register unverified client account and email 6-digit OTP.
- `POST /api/auth/verify-otp` — Verify client email OTP code.
- `POST /api/auth/forgot-password` — Generate and email recovery password OTP.
- `POST /api/auth/reset-password` — Update password with verified reset OTP.
- `POST /api/auth/login` — Sign in (checks provider credentials in env or client credentials in MongoDB).
- `GET /api/appointments` — Fetch appointments (optionally filtered by `clientEmail`).
- `POST /api/appointments` — Submit session inquiry and dispatch dual notification emails.
- `PATCH /api/appointments/:id/status` — Confirm or cancel appointment status.
- `PATCH /api/appointments/:id/notes` — Update private session notes.
- `GET /api/messages` — Fetch client messages.
- `POST /api/messages` — Submit message inquiry to therapist inbox.
- `PATCH /api/messages/:id/reply` — Submit provider reply and send client email.
- `PATCH /api/messages/:id/status` — Mark message read/unread.
- `GET /api/documents` — Retrieve receipts, care plans, or reports.
- `POST /api/documents` — Create document and send formatted email.
- `GET /api/availability` — Retrieve booking schedule parameters.
- `PUT /api/availability` — Update working days, hours, and blocked dates.
- `POST /api/ai/polish` — AI-driven clinical note polishing using Gemini.
- `POST /api/ai/chat` — Aura AI counseling assistant with crisis safety prompts.

---

## 5. Security & Authentication Analysis (Baseline State)

### Identified Gaps in Baseline:
1. **Authentication Mechanism:**
   - Provider was authenticated via an email/password comparison against `.env` variables (`PROVIDER_EMAIL`, `PROVIDER_PASSWORD`).
   - No Google OAuth 2.0 existed.
   - Client sessions were saved in frontend `localStorage` under `therapist_current_user`.
   - No server-side HTTP-only session cookies or session invalidation/revocation on logout.
2. **Access Control (RBAC) & IDOR Protection:**
   - Routes relied solely on client query parameters (`?clientEmail=...`) without cryptographic session verification on the backend.
   - Any client could theoretically query `/api/appointments` or `/api/documents` without an email parameter and view all appointments/documents.
   - Multi-counsellor isolation was absent (all therapist views accessed the global pool).
3. **Audio Recording & Storage:**
   - "Audio Session" was present as a session format option, but clinical session audio recording capture, private S3 bucket storage, client consent recording, and pre-signed temporary URLs were not yet implemented.
4. **User & Administrator Governance:**
   - No administrator panel existed to approve, reject, suspend, or assign roles to practitioners and users.
   - No audit trail or login history logging existed.

---

## 6. Upgrade Roadmap Alignment

The upgrade will enhance `server.js` and the frontend while **strictly preserving all existing functionality**:
- Add Google OAuth 2.0 server-side authorization code flow (`/api/auth/google`, `/api/auth/google/callback`, `/api/auth/me`, `/api/auth/logout`).
- Implement `User` model with roles: `Super Admin`, `Administrator`, `Counsellor`, `Viewer`, and approval status (`approved`, `pending`, `suspended`, `rejected`).
- Implement `AuditLog` model to track logins, account approvals, role changes, session access, and recording access.
- Implement server-side session management (`express-session` backed by MongoDB / MemoryStore) with HTTP-only, secure, SameSite cookies.
- Implement `AudioRecording` schema and AWS S3 integration for encrypted private audio uploads and short-lived signed playback URLs.
- Implement Clinical Case History, Mental Status Examination (MSE), and Session Records with strict counsellor-level access control.
- Enforce server-side RBAC middleware (`requireAuth`, `requireRole`, `requireClientAccess`) preventing IDOR across all endpoints.
- Provide production-grade cloud deployment artifacts (Docker, ECS/App Runner architecture, CloudFront/S3, AWS Secrets Manager, and custom domain DNS guides).

---
*Audit completed and verified against baseline commit `99ed623`.*

