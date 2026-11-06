# Database & Storage Audit Report — Verdant Mind
**Platform:** Verdant Mind — Public Mental Health & Clinical Services Portal  
**Database:** MongoDB Atlas Replica Set (Cluster `counselling_production`)  
**Object Storage:** AWS S3 Private Encrypted Bucket (with secure streaming fallback)  
**ORM / Driver:** Mongoose 9.7.4 / MongoDB Node Driver 6.x  
**Audit Date:** November 4, 2026  

---

## 1. Database Architecture & Health

### 1.1 Cluster Topology
- **Deployment:** MongoDB Atlas 3-node replica set (`atlas-113k67-shard-0`):
  - Primary / Secondary Shards: `ac-eejhtzj-shard-00-00.n22euv9.mongodb.net`, `01`, `02` (Port 27017).
- **TLS / SSL:** Enforced via `ssl=true`, TLS 1.3 encryption, SCRAM-SHA-256 authentication against the `admin` database.
- **Compression:** `compressors=zlib`.

### 1.2 Connection Pooling & Resiliency Settings
Configured in lines 1595–1605 of [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js):
```javascript
const mongoOptions = {
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '10', 10),
  serverSelectionTimeoutMS: process.env.NODE_ENV === 'test' ? 1500 : 20000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 20000,
  retryWrites: true,
  w: 'majority'
};
```
- **Connection Retry Logic:** `connectToMongoWithRetry()` executes up to 4 sequential attempts with exponential backoff ($3\text{s}, 6\text{s}, 9\text{s}$) to absorb transient cloud network spikes.
- **Fail-Fast Production Rule:** If connection attempts fail in production, the server logs an explicit troubleshooting guide and calls `process.exit(1)`. It is forbidden from falling back to ephemeral in-memory or JSON storage in production.

---

## 2. Collections, Schemas & Indexes

The application defines 17 structured Mongoose schemas with compound indexes to optimize query performance and enforce clinical integrity:

| # | Collection / Model | Purpose | Primary Indexes & Constraints |
| :--- | :--- | :--- | :--- |
| 1 | `users` (`User`) | Staff accounts & roles | `{ email: 1, status: 1 }` (unique) |
| 2 | `clients` (`Client`) | Patient accounts & OTP credentials | `{ email: 1 }` (unique) |
| 3 | `patientprofiles` (`PatientProfile`) | Clinical patient registry (Sections A–H) | `{ profileId: 1 }` (unique), `{ 'personalInfo.email': 1 }`, `{ 'assignedProvider.providerEmail': 1 }` |
| 4 | `appointments` (`Appointment`) | Consultation bookings | `{ appointmentUtc: 1 }` (unique partial filter: `{ status: { $ne: 'Cancelled' } }`) |
| 5 | `messages` (`Message`) | Direct patient-therapist inquiries | `{ status: 1, timestamp: -1 }` |
| 6 | `caredocuments` (`CareDocument`) | Payment invoices & clinical prescriptions | `{ counsellorEmail: 1, date: -1 }`, `{ docId: 1 }` (unique) |
| 7 | `availabilities` (`Availability`) | Clinic operating hours & blocked dates | Global singleton configuration |
| 8 | `themeconfigs` (`ThemeConfig`) | Brand themes & appearance audit history | Global singleton with audit history array |
| 9 | `auditlogs` (`AuditLog`) | Immutable security & administrative trail | Append-only (pre-hooks block update & delete) |
| 10 | `securityevents` (`SecurityEvent`) | SOC threat alerts & brute-force tracking | `{ status: 1, severity: 1, lastOccurred: -1 }` |
| 11 | `usersessions` (`UserSession`) | Active user session monitoring | `{ userEmail: 1, status: 1 }` |
| 12 | `consents` (`ConsentRecord`) | Patient informed consents & audit logs | `{ userEmail: 1, consentType: 1 }` |
| 13 | `privacyrequests` (`PrivacyRequest`) | DPDP/GDPR Data Subject Access Requests | `{ userEmail: 1, requestedAt: -1 }` |
| 14 | `securitysettings` (`SecuritySettings`) | Practice security governance policies | Global singleton policy controls |
| 15 | `audiorecordings` (`AudioRecording`) | Session recording metadata & signed URLs | `{ counsellorEmail: 1, isDeleted: 1 }`, `{ appointmentId: 1 }` |
| 16 | `casehistories` (`ClinicalCaseHistory`) | Psychological case history records | `{ clientEmail: 1 }` (unique) |
| 17 | `mserecords` (`MentalStatusExam`) | Mental Status Examination records | `{ clientEmail: 1, date: -1 }` |

---

## 3. Session Persistence Engine
- **Session Collection:** `app_sessions` managed by `connect-mongo`.
- **TTL:** 8 hours ($28,800\text{s}$) with automated document expiration via MongoDB TTL index.
- **Encryption:** Session payloads are encrypted with AES-256 using `SESSION_SECRET`.
- **Verification:** Verified that session records persist across server restarts when backed by MongoDB Atlas.

---

## 4. Object Storage & Clinical Audio Architecture

### 4.1 Storage Tiers
1. **Primary: Private AWS S3 Bucket**
   - Configured via `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.
   - All uploads enforce **Server-Side Encryption with Amazon S3 Managed Keys (`AES256`)**.
   - Direct streaming via Multer disk-backed buffers (`audioDiskStorage`) prevents Node process memory exhaustion (OOM crashes) on large audio uploads.
2. **Fallback: Private Server Storage**
   - Files stored in non-public directory `uploads/recordings/` outside the web root.
   - In production mode, if S3 is unconfigured, lines 3408–3410 of `server.js` trigger an explicit compliance warning:
     ```text
     [STORAGE ALERT] Audio recording saved to local filesystem in production mode. Render containers have ephemeral storage. Configure AWS S3 credentials (AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) to ensure persistent healthcare compliance storage.
     ```

### 4.2 Playback Security & Presigned URLs
- Audio files are **never served directly** or made publicly accessible via static web paths.
- Playback requires an active authenticated session (`requireAuth`) and passes through IDOR authorization checks (`canAccessClientRecord`).
- The server generates short-lived presigned URLs (`@aws-sdk/s3-request-presigner`) with a strict **15-minute expiration ceiling**. Once expired, links are invalid.

### 4.3 Content Verification & Data Retention
- **Magic Byte Verification:** Uploaded files must match valid audio container signatures (`EBML/WebM`, `RIFF/WAV`, `ID3/MP3`, `OggS`, `ftyp`). Executables, scripts, and disguised binaries are rejected before storage.
- **Healthcare Retention Policy:** Every recording record is stamped with a legal **7-Year Retention Expiration Date** (`retentionExpiryDate`) adhering to clinical document retention guidelines.
