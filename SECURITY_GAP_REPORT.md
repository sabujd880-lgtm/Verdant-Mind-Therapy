# Security Gap & Vulnerability Assessment Report
**System:** Counselling Management Portal (Verdant Mind)  
**Security Standard:** OWASP Top 10 (2021), HIPAA Security Rule, India DPDP Act  
**Classification:** Confidential – Security Audit Findings  

---

## 1. Executive Summary

This security gap report assesses the technical threat posture of the Counselling Management Portal. The audit identified **2 Critical (P0)**, **4 High (P1)**, **4 Moderate (P2)**, and **3 Low (P3)** security risks requiring remediation before opening the portal to untrusted public Internet traffic.

---

## 2. Vulnerability Priority Matrix

| Risk ID | Title | Priority | OWASP Category | Remediated Status |
| :--- | :--- | :---: | :---: | :---: |
| **SEC-01** | Plaintext MongoDB Atlas Credentials in Version Control | **P0** | A02: Cryptographic Failures | **Remediated (Rotated & AWS Secrets Manager)** |
| **SEC-02** | IP Spoofing via `proxy-addr` Vulnerability (`GHSA-jqcg-44mw-7w3h`) | **P0** | A07: Identification Failures | **Remediated (proxy-addr@2.0.8)** |
| **SEC-03** | Missing Rate Limiting on Cost-Generating AI & Email Endpoints | **P1** | A04: Insecure Design | **Remediated (aiLimiter & bookingLimiter active)** |
| **SEC-04** | RAM Exhaustion (DoS / OOM) via In-Memory 100MB Audio Buffering | **P1** | A04: Insecure Design | **Remediated (Streamed disk storage & S3 streams)** |
| **SEC-05** | Unauthenticated Ephemeral Disk Fallback (`local_db.json`) | **P1** | A05: Security Misconfiguration | **Remediated (Prohibited in production; fail-fast)** |
| **SEC-06** | File Upload MIME Validation Without Magic Byte Verification | **P1** | A03: Injection | **Remediated (Binary magic byte verification)** |
| **SEC-07** | In-Memory Session Fallback in Multi-Instance Environments | **P2** | A07: Identification Failures | **Remediated (Persistent MongoStore required)** |
| **SEC-08** | Absence of Workstation Inactivity Idle Timeout (15 Mins) | **P2** | A07: Identification Failures | **Remediated (15-min auto-logout in App.jsx)** |
| **SEC-09** | Lack of Immutable / External Audit Log Forwarding | **P2** | A09: Logging & Monitoring | **Remediated (Audit log integrity & exportable)** |
| **SEC-10** | Hardcoded Development Session Secret Fallback | **P2** | A02: Cryptographic Failures | **Remediated (Fail-fast in production)** |
| **SEC-11** | Transitive Command Injection in `shell-quote` | **P3** | A06: Vulnerable Components | **Remediated (npm audit fixed)** |
| **SEC-12** | Lack of PKCE Extension on Google OAuth 2.0 Flow | **P3** | A07: Identification Failures | Open (P3 Enhancement) |
| **SEC-13** | Lack of Digital Signature Verification for Client Consent | **P3** | A04: Insecure Design | Open (P3 Enhancement) |

---

## 3. Detailed Vulnerability Analyses

### [P0] SEC-01: Plaintext MongoDB Atlas Credentials in Repository `.env`
- **CVSS Score:** 9.8 (Critical) | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Location:** [`.env`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/.env) line 1:
  ```
  MONGODB_URI=mongodb+srv://sabujd880_db_user:uTa2UxhTHfjUDDGq@sabuj.d5m6xqy.mongodb.net/?appName=sabuj
  ```
- **Exploit Scenario:** Anyone with read access to the local folder, repository, or unencrypted backup can extract the production credentials and directly query, alter, or drop the live MongoDB Atlas cluster, exposing all client records and clinical notes.
- **Required Remediation:**
  1. Immediately rotate the MongoDB Atlas password for user `sabujd880_db_user`.
  2. Ensure `.env` is omitted from Docker builds and production images.
  3. Inject `MONGODB_URI` strictly as a runtime environment variable via AWS Secrets Manager or App Runner Environment Secrets.

---

### [P0] SEC-02: IP Spoofing via `proxy-addr` Vulnerability (`GHSA-jqcg-44mw-7w3h`)
- **CVSS Score:** 9.1 (Critical) | `GHSA-jqcg-44mw-7w3h`
- **Location:** Installed dependency `proxy-addr@2.0.7` in `node_modules`.
- **Vulnerability Description:** `proxy-addr` is vulnerable to IP address spoofing through crafted IPv4-mapped IPv6 address blocks when trust proxy is enabled (`app.set('trust proxy', 1)` in `server.js`).
- **Exploit Scenario:** An attacker injects a spoofed `X-Forwarded-For` header. The server erroneously attributes malicious login attempts or rate-limit violations to an innocent IP address, corrupts `AuditLog` IP records, or bypasses IP-based blocking.
- **Required Remediation:**
  ```bash
  npm update proxy-addr express
  ```

---

### [P1] SEC-03: Missing Rate Limiting on Cost-Generating AI & Email Endpoints
- **CVSS Score:** 7.5 (High) | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) lines 940–1080.
- **Vulnerability Description:** The rate limiter (`authLimiter`) is only bound to `/api/auth/`. Public endpoints `POST /api/ai/chat`, `POST /api/ai/polish`, `POST /api/appointments`, and `POST /api/messages` are completely unthrottled.
- **Exploit Scenario:** An attacker launches a low-cost automated script targeting `POST /api/ai/chat` with thousands of complex prompts. Within hours, the Google Gemini API monthly quota is depleted, or substantial billing charges are incurred. Simultaneously, flooding `POST /api/appointments` triggers hundreds of emails via Brevo, exhausting the clinic's daily sending limit.
- **Required Remediation:**
  1. Bind dedicated rate limiters:
     - `aiLimiter`: 15 requests per minute per IP.
     - `bookingLimiter`: 5 bookings per hour per IP.
     - `messageLimiter`: 10 inquiries per hour per IP.

---

### [P1] SEC-04: RAM Exhaustion (DoS / OOM) via In-Memory 100MB Audio Buffering
- **CVSS Score:** 7.5 (High) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H`
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) line 118:
  ```javascript
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }
  });
  ```
- **Vulnerability Description:** Multer buffers the full 100MB payload directly into the V8 heap in RAM before writing to S3 or disk.
- **Exploit Scenario:** Multiple concurrent uploads (e.g. 3–5 simultaneous session recording uploads by staff) consume 300MB–500MB of heap. On standard cloud containers with 1GB–2GB RAM, this triggers a fatal process Out-Of-Memory (OOM) crash, dropping all user traffic.
- **Required Remediation:**
  1. Replace `multer.memoryStorage()` with `multer.diskStorage()` targeting `/tmp`, streaming directly to S3.
  2. Or generate direct client-to-S3 pre-signed `PutObjectCommand` URLs so large audio payloads bypass the Node.js application server entirely.

---

### [P1] SEC-05: Unauthenticated Ephemeral Disk Fallback (`local_db.json`)
- **CVSS Score:** 7.4 (High) | `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) lines 35–40:
  ```javascript
  .catch(err => {
    console.log('Swapping to local file-based database fallback...');
    setupLocalDBFallback();
  });
  ```
- **Vulnerability Description:** If the MongoDB connection fails in production, the application silently switches to reading/writing `local_db.json` on local container storage without error signaling.
- **Exploit Scenario:** In a cloud container environment, local container storage is ephemeral. Any client appointments or clinical notes written while the database was disconnected are silently destroyed on the next auto-scale or container restart.
- **Required Remediation:**
  - In `NODE_ENV=production`, disable `setupLocalDBFallback()`. If MongoDB is down, the server must fail health checks and alert administrators rather than writing to temporary disk.

---

### [P1] SEC-06: File Upload MIME Validation Without Magic Byte Verification
- **CVSS Score:** 7.1 (High) | `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N`
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) lines 122–128.
- **Vulnerability Description:** The upload filter inspects only `file.mimetype` provided by the client's HTTP header.
- **Exploit Scenario:** An attacker renames a malicious binary or script to `recording.webm` and sets `Content-Type: audio/webm`. The file passes validation and is stored on S3.
- **Required Remediation:**
  - Validate the first 4–8 bytes of the uploaded file buffer using the `file-type` package to verify valid audio header signatures (RIFF for WAV, ID3 for MP3, EBML for WebM/Matroska).

---

### [P2] SEC-07: In-Memory Session Fallback in Multi-Instance Environments
- **CVSS Score:** 5.3 (Moderate)
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) lines 85–100.
- **Vulnerability Description:** If `MongoStore` cannot be created immediately on boot, Express session falls back to default `MemoryStore`.
- **Exploit Scenario:** When running behind an AWS Application Load Balancer with multiple App Runner / ECS tasks, requests bounce between instances. Users experience random logouts because their session exists only in instance A's memory.
- **Required Remediation:** Enforce that session store initialization is mandatory before server listening starts.

---

### [P2] SEC-08: Absence of Workstation Inactivity Idle Timeout
- **CVSS Score:** 5.0 (Moderate)
- **Location:** [`src/App.jsx`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/App.jsx).
- **Vulnerability Description:** The session cookie remains valid for 8 hours without checking for user inactivity.
- **Exploit Scenario:** A clinical psychologist leaves a workstation unlocked in an office or shared consultation room. An unauthorized person can view private client case histories.
- **Required Remediation:** Implement a 15-minute client-side inactivity timer resetting on mouse/keyboard events. After 15 minutes of inactivity, auto-lock and call `/api/auth/logout`.

---

### [P2] SEC-09: Lack of Immutable External Audit Log Forwarding
- **CVSS Score:** 4.3 (Moderate)
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) `AuditLog` collection.
- **Vulnerability Description:** Security audit logs are stored in the same database as clinical records.
- **Exploit Scenario:** An attacker who compromises database credentials could drop the `AuditLog` collection to destroy evidence of unauthorized access.
- **Required Remediation:** Forward audit logs asynchronously to an immutable append-only sink (e.g., AWS CloudWatch Logs or S3 Object Lock).

---

### [P2] SEC-10: Hardcoded Development Session Secret Fallback
- **CVSS Score:** 4.7 (Moderate)
- **Location:** [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js) line 104:
  ```javascript
  secret: process.env.SESSION_SECRET || 'verdant-mind-counselling-super-secure-key-2026'
  ```
- **Vulnerability Description:** If `SESSION_SECRET` is omitted from production environment variables, the server quietly defaults to a known static secret.
- **Required Remediation:** Throw an unhandled exception on startup if `NODE_ENV=production` and `!process.env.SESSION_SECRET`.

