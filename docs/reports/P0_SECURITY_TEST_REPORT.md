# P0 Security Test Report: Regression & Penetration Verification

**Application:** Verdant Mind – Counselling Management Portal  
**Test Suite:** `tests/run_tests.js` (Expanded 41-assertion automated test harness)  
**Execution Environment:** Node.js v22+ / MongoDB Atlas / Express 5.3.0  
**Test Date:** 2026-11-02  
**Result Status:** **41 PASSED, 0 FAILED (100% Pass Rate)**  

---

## 1. Test Suite Overview

A comprehensive regression and security assessment was executed against all authentication, authorization, clinical isolation, and infrastructure protection layers of the portal.

```text
===========================================================
STARTING COUNSELLING PORTAL SYSTEM VERIFICATION SUITE
In-Process Express Server running on: http://127.0.0.1:5099
===========================================================
TOTAL TEST ASSERTIONS: 41
PASSED: 41
FAILED: 0
COVERAGE: Authentication, RBAC, Admin Console, Caseload IDOR, Audio Storage,
          IP Spoofing, Indexing, Fail-Fast Startup, Secrets Loader
===========================================================
```

---

## 2. Test Execution Matrix by Security Domain

### Domain 1: Authentication & Session Lifecycle

| Test # | Description | Input / Vector | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 2** | `GET /api/auth/me` without session | No `Cookie` header | HTTP 401 Unauthorized | HTTP 401 (`Authentication required`) | **PASSED** |
| **Test 4** | `POST /api/auth/login` | Valid credentials | HTTP 200, sets `counselling_portal_sid` | Cookie issued with `HttpOnly` | **PASSED** |
| **Test 5** | `GET /api/auth/me` with session | Valid `counselling_portal_sid` | HTTP 200, user identity returned | Returns user email & role | **PASSED** |
| **Test 16** | `GET /api/auth/google` | OAuth initiation | Redirects to Google or dev mock | State CSRF token generated | **PASSED** |
| **Test 17** | `POST /api/auth/logout` | Active session cookie | Session destroyed, cookie cleared | HTTP 200, session revoked | **PASSED** |
| **Test 20** | Session Store Persistence | MongoDB connection | `app_sessions` collection populated | Persistent TTL storage verified | **PASSED** |
| **Test 33** | Google OAuth Mock Code in Prod | `code=dev_mock_code` + `isProd=true` | Dev mock execution rejected | Dev mock blocked in production | **PASSED** |

### Domain 2: Role-Based Access Control (RBAC) & Admin Console

| Test # | Description | Input / Vector | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 3** | `GET /api/admin/users` unauthorized | No session / Non-admin role | HTTP 401 / HTTP 403 Forbidden | HTTP 401 returned | **PASSED** |
| **Test 6** | Super Admin User Directory | Super Admin session cookie | HTTP 200, returns registered users | Full user roster retrieved | **PASSED** |
| **Test 7** | Super Admin Pre-Approve Counsellor | `POST /api/admin/users` | HTTP 200, user created as `approved` | Counsellor added to roster | **PASSED** |
| **Test 8** | Account Suspension & Reactivation | `PATCH /api/admin/users/:id/status` | Status transitions `suspended`/`approved` | State toggled & persisted | **PASSED** |
| **Test 9** | Session Revocation by Admin | `POST /api/admin/users/:id/revoke` | Revocation timestamp stored | Target user active sessions invalidated | **PASSED** |
| **Test 15** | Security Audit Logging | Sensitive actions (login, role update) | Logged to `auditlogs` collection | Actor, action, and timestamp logged | **PASSED** |

### Domain 3: Clinical Caseload Isolation & IDOR Protection

| Test # | Description | Input / Vector | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 10** | Clinical Case History Isolation | `POST/GET /api/case-history` | Only authorized clinicians access records | Case history saved & retrieved | **PASSED** |
| **Test 11** | Mental Status Examination (MSE) | `POST/GET /api/mse` | Structured 9-domain evaluation persisted | MSE record retrieved accurately | **PASSED** |
| **Test 28A** | Client Caseload Filter | Clinician querying client record | Clinician accesses assigned caseload only | Unassigned records filtered | **PASSED** |
| **Test 28E** | Messaging Inquiry Thread Isolation | `GET /api/messages` | Clients see only own threads | Cross-client leakage prevented | **PASSED** |
| **Test 28F** | Care Documents Access Scoping | `GET /api/documents` | Scoped to client email or assigned staff | Unauthorized access blocked | **PASSED** |
| **Test 28G** | Client Directory Data Sanitization | `GET /api/clients` | Passwords, tokens & salt redacted | Sensitive credentials excluded | **PASSED** |

### Domain 4: Audio Recording Storage & Magic-Byte Validation

| Test # | Description | Input / Vector | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 12** | Upload without Client Consent | `consentGiven: false` | HTTP 400 Consent Required | HTTP 400 returned, upload halted | **PASSED** |
| **Test 13** | Upload with Valid Consent | Valid WebM/WAV + consent | Stored securely, signed playback URL | Cryptographically signed URL issued | **PASSED** |
| **Test 14** | Admin Recording Deletion | `DELETE /api/recordings/:id` | File removed from disk/S3, metadata purged | Storage purged, DB unlinked | **PASSED** |
| **Test 26** | Disguised Malware / Script Upload | `.exe` or `.js` file with `.webm` name | Rejected via magic-byte buffer scan | HTTP 400 Invalid Audio File | **PASSED** |

### Domain 5: Anti-Spoofing, Fail-Fast, & Infrastructure Protection

| Test # | Description | Input / Vector | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Test 18** | Direct Client Connection IP | Connecting IP `127.0.0.1` | Returns `127.0.0.1` | Resolved accurately | **PASSED** |
| **Test 30** | Forged `X-Forwarded-For` Injections | `X-Forwarded-For: 198.51.100.42` | Returns connecting socket IP, not spoofed | Spoofed header ignored | **PASSED** |
| **Test 22** | Production Local Fallback Ban | `isProd=true` + missing MongoDB | Halts startup with `process.exit(1)` | Silent fallback prevented | **PASSED** |
| **Test 31** | Insecure Default `SESSION_SECRET` | Default hardcoded session secret | Halts startup in production | Hardcoded secret rejected | **PASSED** |
| **Test 32** | Local JSON DB in Production | `setupLocalDBFallback()` in prod | Throws fatal error, halts process | Mock database blocked | **PASSED** |
| **Test 34** | AWS Secrets Manager Loader | Unconfigured AWS credentials locally | Gracefully logs without leaking keys | Zero key leakage | **PASSED** |
| **Test 29** | Database Compound Indexes | Appointment, Message, CareDocument | Compound indexes active | Query performance guaranteed | **PASSED** |

---

## 3. Detailed Security Findings & Resolution

### Finding S1: Forged Forwarded IP Address Injection
- **Vector:** An untrusted client sends `X-Forwarded-For: 203.0.113.195` to bypass IP-based rate limiting or poison security audit logs.
- **Verification:** Evaluated `getClientIp(mockReq)` with spoofed headers.
- **Result:** `getClientIp` strictly references `req.ip` compiled by Express through `proxy-addr` (version `2.0.8`) with single-hop upstream proxy enforcement (`app.set('trust proxy', 1)` in production; `false` in development). The forged IP is ignored; the true connecting IP `127.0.0.1` is returned.

### Finding S2: Accidental Secret Leakage via Audit Documentation
- **Vector:** Previous audit reports stored raw MongoDB connection strings with usernames and passwords.
- **Verification:** Ran `git grep -i "sabujd880_db_user:"` across the entire repository.
- **Result:** 0 plaintext secrets remain in tracked files.

### Finding S3: Silent Data Loss via Ephemeral Fallback
- **Vector:** When MongoDB Atlas goes offline, the server silently creates `local_db.json`, causing clinical appointments and records to be saved in an unencrypted local JSON file that is destroyed on container redeployment.
- **Verification:** Executed Test 22 & Test 32 simulating MongoDB disconnection in production.
- **Result:** `setupLocalDBFallback()` immediately triggers `process.exit(1)`, logging `[FATAL] Local JSON database fallback is strictly prohibited in production mode. Halting server.`

---

## 4. Remaining Risks & Operational Requirements

1. **MongoDB Atlas Password Rotation:** The password previously committed in commit `a93739c` must be rotated in the MongoDB Atlas Console.
2. **AWS Secrets Manager Deployment:** In the production environment (AWS Mumbai `ap-south-1`), set `AWS_SECRET_NAME=counselling/production/secrets` to inject all production variables dynamically at container initialization.

