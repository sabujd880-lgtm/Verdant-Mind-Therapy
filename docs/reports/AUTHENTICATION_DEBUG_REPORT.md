# AUTHENTICATION & SESSION MANAGEMENT DEBUG REPORT
**Application:** Verdant Mind – Counselling Management Portal  
**Date:** November 2, 2026  
**Status:** VERIFIED & HARDENED

---

## 1. Authentication Architecture Overview

Verdant Mind utilizes a dual-channel authentication architecture tailored to clinical workflows:

1. **Staff & Clinician Access (Google OAuth 2.0):**
   - High-security OpenID Connect flow using Google Identity Services.
   - Enforces pre-approval: Unregistered Google users are automatically placed in `status: 'pending'` and denied immediate access until approved by a Super Admin.
   - Bootstrap administrator (`sabujd880@gmail.com`) is auto-provisioned with full Super Admin privileges.

2. **Client Portal Access (Email + Password + OTP):**
   - Self-registration with 6-digit email OTP verification via Brevo.
   - Password reset via encrypted reset tokens.
   - Credentials authenticated against bcrypt-hashed passwords.

---

## 2. Google OAuth 2.0 Workflow Verification (13 Steps)

| Step | Operation | Implementation File | Verification Finding | Status |
| :---: | :--- | :--- | :--- | :---: |
| 1 | **Sign-In Trigger** | `AuthPortal.jsx` | Google Sign-In button redirects to `/api/auth/google` | **VERIFIED** |
| 2 | **CSRF State Generation** | `server.js:859` | Generates 24-byte random crypto hex string; stores in `req.session.oauthState` | **VERIFIED** |
| 3 | **OAuth Authorization** | Google Identity | Redirects caller to `accounts.google.com/o/oauth2/v2/auth` | **VERIFIED** |
| 4 | **Callback Processing** | `server.js:880` | Handles `/api/auth/google/callback` with `code` and `state` | **VERIFIED** |
| 5 | **CSRF Verification** | `server.js:890` | Validates `state === req.session.oauthState`; halts on mismatch | **VERIFIED** |
| 6 | **Token Exchange** | `server.js:913` | Exchanges authorization code with `oauth2.googleapis.com/token` | **VERIFIED** |
| 7 | **Identity Verification** | `server.js:934` | Queries `googleapis.com/oauth2/v3/userinfo`; checks `email_verified: true` | **VERIFIED** |
| 8 | **Directory Matching** | `server.js:952` | Queries `User` collection by normalized email | **VERIFIED** |
| 9 | **Approval Gate** | `server.js:1003` | Enforces `status === 'approved'`; rejects pending/suspended/rejected accounts | **VERIFIED** |
| 10 | **Session Regeneration** | `server.js:1014` | Calls `req.session.regenerate()` to eradicate session fixation vectors | **VERIFIED** |
| 11 | **Session Persistence** | `server.js:127` | Writes encrypted session payload to MongoDB `app_sessions` collection | **VERIFIED** |
| 12 | **Client State Recovery** | `App.jsx:44` | Evaluates `/api/auth/me` on startup; restores authenticated view | **VERIFIED** |
| 13 | **Session Revocation** | `server.js:1052` | `POST /api/auth/logout` destroys session in MongoStore and clears cookie | **VERIFIED** |

---

## 3. Role-Based Access Control (RBAC) Matrix

| Permission Tier | Super Admin | Administrator | Counsellor | Viewer | Client |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Manage Users & Approvals** | Full | Partial (No Super Admin) | ✗ | ✗ | ✗ |
| **Assign Roles** | Any role | Counsellor / Viewer | ✗ | ✗ | ✗ |
| **Revoke Active Sessions** | ✓ | ✓ | ✗ | ✗ | ✗ |
| **View Audit Logs & Login IPs** | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Manage Practice Availability** | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Create Clinical Records / MSE** | ✓ | ✓ | ✓ (Assigned) | ✗ | ✗ |
| **Read Clinical Records / MSE** | ✓ | ✓ | ✓ (Assigned) | ✓ (Assigned) | ✗ |
| **Upload Session Audio** | ✓ | ✓ | ✓ (Assigned) | ✗ | ✗ |
| **Listen to Session Audio** | ✓ | ✓ | ✓ (Assigned) | ✗ | ✗ |
| **Purge Patient Data (GDPR)** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **View Own Client Portal** | ✗ | ✗ | ✗ | ✗ | ✓ (Own only) |

---

## 4. Session Security Attributes

- **Cookie Name:** `counselling_portal_sid`
- **HTTPOnly Flag:** `true` (Prevents XSS session extraction)
- **SameSite Flag:** `none` (in production behind HTTPS) / `lax` (in development)
- **Secure Flag:** `true` in production
- **TTL Duration:** 8 hours (`maxAge: 28800000`)
- **Idle Auto-Lock:** 15 minutes of user inactivity triggers automatic logout in `App.jsx`
- **Session Revocation:** Administrator can invalidate all active sessions for any user ID via `POST /api/admin/users/:id/revoke-sessions`

