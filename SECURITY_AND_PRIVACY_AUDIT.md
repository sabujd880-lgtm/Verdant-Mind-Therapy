# Security and Privacy Audit Report — Verdant Mind
**Platform:** Verdant Mind — Public Mental Health & Clinical Services Portal  
**Audit Standard:** Healthcare Privacy (HIPAA Alignment, DPDP Act 2023, GDPR Principles)  
**Audit Date:** November 4, 2026  
**Scope:** Authentication, authorization, session lifecycles, data protection, audit trails, and storage encryption.

---

## 1. Executive Summary
The Verdant Mind mental health portal was audited against leading clinical data security standards. The system implements multi-layered defense-in-depth protections designed to ensure patient confidentiality, prevent cross-patient data leakage (IDOR), maintain tamper-proof administrative audit logs, and enforce strict consent governance.

---

## 2. Authentication & Credential Security

### 2.1 Password Hashing Architecture
- **Algorithm:** Cryptographic `scrypt` key derivation function with 16-byte cryptographically secure random salt (`crypto.randomBytes(16)`), derived key length of 64 bytes.
- **Verification:** Constant-time comparison using `crypto.timingSafeEqual` prevents timing-based side-channel attacks:
  ```javascript
  function verifyPassword(password, storedHash) {
    if (!storedHash || !password) return false;
    if (storedHash.startsWith('scrypt:')) {
      const parts = storedHash.split(':');
      const salt = parts[1];
      const key = parts[2];
      const derivedKey = crypto.scryptSync(password, salt, 64);
      return crypto.timingSafeEqual(derivedKey, Buffer.from(key, 'hex'));
    }
    return safeStringCompare(password, storedHash);
  }
  ```
- **Automated Test:** `Client registration, scrypt password hashing, and OTP verification flow... ✓ PASSED`.

### 2.2 Google OAuth 2.0 Integration
- **CSRF Mitigation:** Every OAuth initiation generates a 24-byte cryptographically random state parameter (`crypto.randomBytes(24).toString('hex')`) bound to the server-side session:
  ```javascript
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  ```
- **State Validation:** The callback endpoint compares the returned `state` against `req.session.oauthState`. Mismatches immediately terminate the handshake with `400 Bad Request` ("OAuth state verification failed. Potential CSRF attempt").
- **Account Linking:** Verified Google email addresses safely link to existing Client accounts without account duplication or privilege escalation.
- **Automated Tests:**
  - `OAuth: Safe account linking matches verified Google email with existing Client record... ✓ PASSED`.
  - `OAuth: resolveGoogleCallbackUrl generates exact HTTPS redirect URI for Render production... ✓ PASSED`.

---

## 3. Authorization & Role-Based Access Control (RBAC)

### 3.1 Role Hierarchy
The portal enforces 5 distinct roles:
1. **Super Admin:** Full institutional oversight, staff creation, role assignment, system security policies, and theme governance.
2. **Administrator:** Staff management, user approvals, audit log inspection, threat alert resolution, and patient record oversight.
3. **Counsellor (Provider):** Authorized clinical staff. Access to assigned patient profiles, case histories, SOAP notes, MSE evaluations, and session audio.
4. **Viewer:** Read-only access to operational logs without clinical editing privileges.
5. **Client (Patient):** Self-service portal access restricted strictly to the user's own bookings, care receipts, and messages.

### 3.2 Pending Account Approval Workflow
- When a new practitioner or staff user registers via Google OAuth or signup, their account is initialized with:
  ```javascript
  role: 'Viewer',
  status: 'pending'
  ```
- New accounts **cannot access clinical dashboards** or patient records. Login attempts respond with `403 Forbidden` (`Your account is pending administrator approval`).
- Only a Super Admin or Administrator can promote an account to `Counsellor` or `Administrator` via `/api/admin/users/:id/approve`.
- Automated test: `Super Admin can pre-approve and add a Counsellor... ✓ PASSED`.

---

## 4. Session Security & Inactivity Governance

### 4.1 Session Cookies
- **Store:** Backed by MongoDB collection `app_sessions` via `connect-mongo`.
- **Flags:**
  - `httpOnly: true`: Prevents client-side script access, mitigating XSS session theft.
  - `secure: isProd`: Enforces HTTPS transmission in production.
  - `sameSite: isProd ? 'none' : 'lax'`: Protects against cross-site request forgery while enabling secure third-party auth callbacks.
  - `maxAge: 8 * 60 * 60 * 1000`: 8-hour absolute session ceiling.

### 4.2 Inactivity Timeouts (15-Minute Healthcare Rule)
- Every incoming authenticated request checks `req.session.lastActivity`.
- Inactivity exceeding 15 minutes automatically invalidates the session and terminates the request with `401 Unauthorized`.
- The frontend [`App.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/App.jsx) listens for user activity events (`mousemove`, `keydown`, `touchstart`, `scroll`) and throttles keep-alive pings to `/api/auth/keep-alive`. If idle for 13 minutes, a 2-minute countdown warning modal appears.
- Automated tests:
  - `P2 Session Security: POST /api/auth/keep-alive updates lastActivity... ✓ PASSED`.
  - `P2 Session Security: Inactivity over 15 minutes terminates session with 401... ✓ PASSED`.

---

## 5. Prevention of Insecure Direct Object References (IDOR)

### 5.1 Clinical Record Boundary Enforcement
- All clinical endpoints (`/api/case-history`, `/api/mse`, `/api/recordings/appointment/:id`, `/api/clients/:email/export`) enforce access boundaries via `canAccessClientRecord(user, clientEmail)`.
- A client attempting to access records for another email address receives `403 Forbidden`.
- In client self-views (`GET /api/profiles/me`), `stripClinicalFields()` automatically redacts internal clinical notes, diagnostic codes, risk assessments, and internal provider identifiers.
- Automated tests:
  - `Staff can access Client Directory with sensitive fields redacted... ✓ PASSED`.
  - `PatientProfile: GET /api/profiles/me returns student profile and strips clinical notes... ✓ PASSED`.

---

## 6. Audit Logging & Immutability

### 6.1 Tamper-Proof Audit Trail
- Every security-sensitive operation (logins, failed authentications, role updates, account suspensions, DSAR requests, record purges, audio uploads/deletions) writes to `AuditLog`.
- **Append-Only Immutability:** Mongoose schema pre-hooks explicitly intercept and reject any `updateOne`, `updateMany`, `deleteOne`, or `deleteMany` calls targeting the `AuditLog` collection:
  ```javascript
  auditLogSchema.pre('updateOne', function() { throw new Error('AuditLog records are append-only and cannot be modified.'); });
  auditLogSchema.pre('deleteOne', function() { throw new Error('AuditLog records are append-only and cannot be deleted.'); });
  ```
- Automated test: `Security: Audit logs enforce append-only immutability (reject updates & deletes)... ✓ PASSED`.

---

## 7. Data Subject Access Rights (DSAR) & Data Privacy

### 7.1 Informed Consent Tracking
- Granular consent tracking via `ConsentRecord` schema captures explicit opt-in/opt-out states for:
  - Session Audio Recording
  - Clinical Treatment Agreement
  - Emergency Contact Disclosure
  - Telehealth Data Processing
- Every consent change records client IP, user agent, and timestamp.

### 7.2 Consolidated Export & Right to be Forgotten (Purge)
- **Data Portability:** `GET /api/clients/:email/export` aggregates appointments, messages, care documents, case history, and MSE evaluations into an encrypted, downloadable JSON bundle.
- **Right to Erasure:** `DELETE /api/clients/:email/purge` cascades deletion across appointments, messages, documents, and client records. To prevent accidental data loss, the caller must supply `confirmationText: "PERMANENTLY_DELETE_PATIENT"`.
- Automated tests:
  - `Patient Data Export: GET /api/clients/:email/export produces consolidated clinical record... ✓ PASSED`.
  - `Patient Data Purge: DELETE /api/clients/:email/purge cascades deletion with confirmation... ✓ PASSED`.

---

## 8. Network Security & Threat Mitigation

### 8.1 Multi-Tier Rate Limiting
1. `authLimiter`: 100 requests / 15 minutes across `/api/auth/`.
2. `loginBruteForceLimiter`: 15 consecutive login attempts / 15 minutes.
3. `passwordResetLimiter`: 5 OTP requests / 15 minutes.
4. `aiLimiter`: 30 AI triage interactions / minute.
5. `bookingLimiter`: 30 public appointment submissions / hour.

### 8.2 Audio Magic Byte Inspection
- To prevent disguised malware or shell scripts from being uploaded under audio extensions, `isValidAudioMagicBytes()` inspects the raw file buffer on disk, verifying legitimate audio signatures (`EBML/WebM`, `RIFF/WAV`, `ID3/MP3`, `OggS`, `ftyp`). Disguised executables are immediately rejected with `400 Bad Request`.
- Automated test: `Audio Upload: Rejects disguised malware/scripts via magic byte verification... ✓ PASSED`.
