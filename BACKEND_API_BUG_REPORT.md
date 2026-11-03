# BACKEND API BUG REPORT & ENDPOINT SECURITY AUDIT
**Application:** Verdant Mind – Counselling Management Portal  
**Date:** November 2, 2026  
**Status:** ALL 43 ENDPOINTS AUDITED & VERIFIED

---

## 1. Complete API Route Audit Matrix (43 Endpoints)

| # | Method | Path | Auth Required | Role Enforced | IDOR Filter | Status |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| 1 | GET | `/api/health` | No | Public Probe | N/A | **VERIFIED** |
| 2 | GET | `/api/health/ready` | No | Public Probe | N/A | **VERIFIED** |
| 3 | GET | `/api/auth/google` | No | Public Flow | N/A | **VERIFIED** |
| 4 | GET | `/api/auth/google/callback` | No | Public Callback | N/A | **VERIFIED** |
| 5 | GET | `/api/auth/me` | No | Session Check | N/A | **VERIFIED** |
| 6 | POST | `/api/auth/logout` | Yes | All Authenticated | N/A | **VERIFIED** |
| 7 | GET | `/api/admin/users` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 8 | POST | `/api/admin/users` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 9 | PATCH | `/api/admin/users/:id/status` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 10 | PATCH | `/api/admin/users/:id/role` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 11 | POST | `/api/admin/users/:id/revoke-sessions` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 12 | GET | `/api/admin/audit-logs` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 13 | PATCH | `/api/admin/counsellors/:id/assignments` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 14 | POST | `/api/recordings/upload` | Yes | Super Admin, Administrator, Counsellor | Client Scoped | **VERIFIED** |
| 15 | GET | `/api/recordings/appointment/:appointmentId` | Yes | All Staff / Client | Client Scoped | **VERIFIED** |
| 16 | GET | `/api/recordings/:id/signed-url` | Yes | All Staff / Client | Client Scoped | **VERIFIED** |
| 17 | GET | `/api/recordings/stream/:id` | Signed Token | Public with Token | Token Scoped | **VERIFIED** |
| 18 | DELETE | `/api/recordings/:id` | Yes | Super Admin, Administrator | Global | **VERIFIED** |
| 19 | GET | `/api/clinical/case-history/:clientEmail` | Yes | All Staff | Assigned Client | **VERIFIED** |
| 20 | POST | `/api/clinical/case-history` | Yes | Staff Author | Assigned Client | **VERIFIED** |
| 21 | GET | `/api/clinical/mse/:clientEmail` | Yes | All Staff | Assigned Client | **VERIFIED** |
| 22 | POST | `/api/clinical/mse` | Yes | Staff Author | Assigned Client | **VERIFIED** |
| 23 | GET | `/api/clients/:email/export` | Yes | All Staff | Assigned Client | **VERIFIED** |
| 24 | DELETE | `/api/clients/:email/purge` | Yes | Super Admin Only | Global | **VERIFIED** |
| 25 | POST | `/api/auth/register` | No | Public Client | Self | **VERIFIED** |
| 26 | POST | `/api/auth/verify-otp` | No | Public Client | Self | **VERIFIED** |
| 27 | POST | `/api/auth/forgot-password` | No | Public Client | Self | **VERIFIED** |
| 28 | POST | `/api/auth/reset-password` | No | Public Client | Self | **VERIFIED** |
| 29 | POST | `/api/auth/login` | No | Public / Staff | Credentials | **VERIFIED** |
| 30 | GET | `/api/appointments` | Optional | Staff / Client Filter | Client Scoped | **VERIFIED** |
| 31 | POST | `/api/appointments` | No (Limiter) | Public Booking | Self Booking | **VERIFIED** |
| 32 | PATCH | `/api/appointments/:id/status` | Yes | Staff / Client (Cancel only) | Assigned Client | **VERIFIED** |
| 33 | PATCH | `/api/appointments/:id/notes` | Yes | Staff Author | Assigned Client | **VERIFIED** |
| 34 | GET | `/api/messages` | Yes | Staff / Client | Client Scoped | **VERIFIED** |
| 35 | POST | `/api/messages` | No (Limiter) | Public Inquiry | Self Inquiry | **VERIFIED** |
| 36 | PATCH | `/api/messages/:id/reply` | Yes | Staff Author | Assigned Client | **VERIFIED** |
| 37 | PATCH | `/api/messages/:id/status` | Yes | Staff Author | Assigned Client | **VERIFIED** |
| 38 | GET | `/api/documents` | Yes | Staff / Client | Client Scoped | **VERIFIED** |
| 39 | POST | `/api/documents` | Yes | Staff Author | Assigned Client | **VERIFIED** |
| 40 | GET | `/api/availability` | No | Public Schedule | Practice | **VERIFIED** |
| 41 | PUT | `/api/availability` | Yes | Staff Author | Practice | **VERIFIED** |
| 42 | POST | `/api/ai/polish` | No (Limiter) | Public / Staff | Note Polish | **VERIFIED** |
| 43 | POST | `/api/ai/chat` | No (Limiter) | Public Widget | Conversational | **VERIFIED** |

---

## 2. Remediated Backend Bugs Detailed

### 1. `GET /api/documents` Information Disclosure
- **Vulnerability:** Unauthenticated visitors could query `/api/documents` and receive all clinical care documents (invoices, prescriptions, and reports).
- **Remediation:** Enforced `requireAuth` middleware. If `user.role === 'client'`, records are strictly filtered to `doc.clientEmail === user.email`. For staff, `canAccessClientRecord` enforces assigned-client scoping.

### 2. `POST /api/documents` Missing Authorization
- **Vulnerability:** Unauthenticated callers could generate billing receipts and therapeutic guidance documents without authorization.
- **Remediation:** Added `requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor'])` and verified that the client is assigned to the authenticated counsellor.

### 3. `GET /api/messages` Data Exposure
- **Vulnerability:** Calling `/api/messages` without active session returned all private client inquiries.
- **Remediation:** Enforced `requireAuth`. Clients receive only their own inquiries; staff receive messages scoped to their caseload.

### 4. `PATCH /api/messages/:id/reply` & `PATCH /api/messages/:id/status`
- **Vulnerability:** Unauthenticated users could post official practitioner replies or alter message read status.
- **Remediation:** Added `requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor'])`.

### 5. `PATCH /api/appointments/:id/notes` Clinical Note Overwrite
- **Vulnerability:** Unauthenticated callers could overwrite therapist consultation notes.
- **Remediation:** Added `requireAuth` and restricted access strictly to clinical staff.

### 6. `PATCH /api/appointments/:id/status` Appointment Hijacking
- **Vulnerability:** Any caller could confirm or cancel appointments.
- **Remediation:** Enforced `requireAuth`. Restricted clients to cancelling only their own appointment; only staff can confirm or reschedule.

### 7. `POST /api/appointments` Double-Booking Vulnerability
- **Vulnerability:** Multiple clients could reserve the exact same date and time slot.
- **Remediation:** Added pre-query for existing non-cancelled appointments matching the requested `date` and `time`. Returns HTTP 409 Conflict if occupied.

### 8. `PUT /api/availability` Practice Schedule Tampering
- **Vulnerability:** Practice hours, working days, and blocked dates could be modified by anyone.
- **Remediation:** Guarded with `requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor'])`.

