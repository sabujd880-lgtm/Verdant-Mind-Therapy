# Administrator Management & Role-Based Access Control (RBAC) Guide
**Project:** Counselling Management Portal (Verdant Mind)  
**Access Level:** Confidential – Clinical Practice Administration

---

## 1. Role Hierarchy & Permission Matrix

The application implements strict server-side RBAC across 4 staff tiers and client portal users:

| Permission / Capability | Super Admin | Administrator | Counsellor | Viewer | Client |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Manage Users & Approvals** | Full | Partial (No Super Admin) | ✗ | ✗ | ✗ |
| **Assign Roles** | Any role | Counsellor / Viewer | ✗ | ✗ | ✗ |
| **Revoke Active Sessions** | ✓ | ✓ | ✗ | ✗ | ✗ |
| **View Audit Logs & Login History**| ✓ | ✓ | ✗ | ✗ | ✗ |
| **Manage Practice Availability** | ✓ | ✓ | ✓ | ✗ | ✗ |
| **View Client Records** | All | All | Assigned Only | Assigned Only | Self Only |
| **Edit Clinical Case History & MSE**| ✓ | ✓ | Assigned Only | ✗ (Read-Only) | ✗ |
| **Upload Session Audio Recordings** | ✓ | ✓ | Assigned Only | ✗ | ✗ |
| **Play Session Audio (Signed URLs)** | ✓ | ✓ | Assigned Only | Assigned Only | ✗ |
| **Delete Session Audio Recordings** | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Inquire & Message Counsellor** | ✓ | ✓ | ✓ | ✗ | Own inbox |

---

## 2. Initial Super Admin Provisioning (Bootstrap)

To prevent chicken-and-egg lockouts during fresh deployment:
1. When the backend gateway boots up, `initializeSuperAdmin()` inspects the `User` collection.
2. If no approved Super Admin exists, it automatically provisions the user designated by `BOOTSTRAP_ADMIN_EMAIL` (`sabujd880@gmail.com`).
3. If this email logs in via Google OAuth, it is instantly elevated to `Super Admin` with status `approved`.
4. **Anti-Tampering Rule:** Normal users cannot grant themselves administrator privileges. Only an active Super Admin can elevate another user to Super Admin.

---

## 3. Administrative Workflows

### 3.1 Pre-approving a New Counsellor or Staff Member
1. Sign in as `Super Admin` or `Administrator`.
2. Open the **Clinic Dashboard** and navigate to the **Admin Governance** tab.
3. Click the **+ Add / Pre-Approve User** button in the top right.
4. Input:
   - **Full Name**: e.g. `Dr. Ananya Sen`
   - **Google Email Address**: e.g. `ananya.sen@gmail.com`
   - **Role**: Select `Counsellor` or `Viewer`
   - **Assigned Clients**: Optional list of client emails (e.g. `client1@example.com, client2@example.com`).
5. Click **Pre-Approve Account**.
6. When the practitioner signs in via Google OAuth with that email, their account is instantly recognized, approved, and granted immediate clinical access.

### 3.2 Reviewing & Approving Self-Registered Google Users
If an uninvited user signs in via Google OAuth:
1. The portal registers their identity with status `pending`.
2. The user sees an "Account Awaiting Approval" status banner on their screen.
3. The Administrator visits **Admin Governance** > **Registered Users**.
4. The user appears highlighted with a yellow `pending` status badge.
5. Click **Approve** to activate the account or **Reject** to deny access.

### 3.3 Suspending and Reactivating Users
1. Under **Admin Governance** > **Registered Users**, locate the target user.
2. Click **Suspend**.
3. **Automated Protection:** Suspending a user immediately updates their `revokedSessionsBefore` timestamp to the current millisecond, which invalidates all active session cookies on the backend.
4. To restore access later, click **Reactivate**.

### 3.4 Insecure Direct Object Reference (IDOR) & Client Isolation
- Every request to `/api/appointments`, `/api/documents`, `/api/clinical/*`, and `/api/recordings/*` runs through `canAccessClientRecord()` on the server:
  - If a Counsellor attempts to query `GET /api/clinical/case-history/other_client@example.com` who is not assigned to them, the server terminates the request with `HTTP 403 Forbidden`.
  - Client portal users querying `/api/appointments` only ever receive their own appointments.

### 3.5 Security Audit Trail & Incident Response
1. Go to **Admin Governance** > **Security Audit Logs**.
2. Real-time entries track:
   - `GOOGLE_OAUTH_LOGIN`
   - `UNAPPROVED_OAUTH_REGISTRATION`
   - `USER_STATUS_APPROVED` / `USER_STATUS_SUSPENDED`
   - `USER_ROLE_CHANGED`
   - `SESSIONS_REVOKED`
   - `CASE_HISTORY_SAVED`
   - `AUDIO_RECORDING_UPLOADED`
   - `AUDIO_RECORDING_STREAM_REQUESTED`
   - `AUDIO_RECORDING_DELETED`
3. Each record logs the actor email, role, target resource, client IP address, user agent, and timestamp.

