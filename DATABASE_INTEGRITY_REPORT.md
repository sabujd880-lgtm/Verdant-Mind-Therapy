# DATABASE INTEGRITY & INDEXING REPORT
**Application:** Verdant Mind – Counselling Management Portal  
**Database:** MongoDB Atlas (Replica Set: atlas-113k67-shard-0)  
**Date:** November 2, 2026  
**Status:** VERIFIED & HARDENED

---

## 1. Schema Inventory & Compound Index Optimization

The database layer consists of 10 Mongoose schemas optimized for query performance and data isolation:

### 1. `User` Collection
- **Primary Schema:** `email`, `name`, `picture`, `googleId`, `role`, `status`, `assignedClients`, `createdAt`, `lastLoginAt`, `lastLoginIp`
- **Indexes:**
  - `email`: Unique, sparse, lowercase index (`{ email: 1 }`).
  - `status`: Index for admin user approval queue queries (`{ status: 1 }`).

### 2. `Client` Collection
- **Primary Schema:** `email`, `password`, `name`, `phone`, `ageGroup`, `verified`, `otpCode`, `resetOtpCode`
- **Indexes:**
  - `email`: Unique index (`{ email: 1 }`).

### 3. `Appointment` Collection
- **Primary Schema:** `clientEmail`, `clientName`, `clientPhone`, `date`, `time`, `sessionMode`, `problemDescription`, `status`, `notes`, `counsellorEmail`
- **Compound Indexes:**
  - `{ clientEmail: 1, date: -1 }`: Optimizes client appointment history retrieval.
  - `{ counsellorEmail: 1, status: 1 }`: Optimizes therapist schedule and pending inquiry queries.
  - `{ date: 1, time: 1, status: 1 }`: Supports fast double-booking conflict detection.

### 4. `Message` Collection
- **Primary Schema:** `senderName`, `senderEmail`, `subject`, `message`, `timestamp`, `status`, `replies`
- **Compound Indexes:**
  - `{ senderEmail: 1, timestamp: -1 }`: Speeds up client inbox message thread retrieval.
  - `{ status: 1, timestamp: -1 }`: Speeds up therapist unread inquiry counters.

### 5. `CareDocument` Collection
- **Primary Schema:** `clientEmail`, `clientName`, `type`, `date`, `data`, `counsellorEmail`
- **Compound Indexes:**
  - `{ clientEmail: 1, type: 1 }`: Accelerates invoice/prescription retrieval by document type.
  - `{ counsellorEmail: 1, date: -1 }`: Supports chronological clinical document generation.

### 6. `ClinicalCaseHistory` Collection
- **Primary Schema:** `clientEmail`, `clientName`, `counsellorEmail`, `presentingProblems`, `historyOfPresentIllness`, `medicalPsychiatricHistory`, `riskAssessment`, `formulation`, `treatmentGoals`, `updatedAt`
- **Indexes:**
  - `{ clientEmail: 1 }`: Unique index to enforce single canonical clinical formulation per patient.

### 7. `MentalStatusExam` Collection
- **Primary Schema:** `clientEmail`, `clientName`, `counsellorEmail`, `date`, 8 clinical MSE fields, `clinicalSummary`, `createdAt`
- **Compound Indexes:**
  - `{ clientEmail: 1, date: -1 }`: Optimizes longitudinal MSE assessment retrieval.

### 8. `AudioRecording` Collection
- **Primary Schema:** `appointmentId`, `clientEmail`, `clientName`, `counsellorEmail`, `title`, `storageType`, `s3Bucket`, `storageKey`, `mimeType`, `fileSizeBytes`, `durationSeconds`, `consentObtained`, `consentDate`, `isDeleted`
- **Compound Indexes:**
  - `{ appointmentId: 1, isDeleted: 1 }`: Accelerates appointment recording lookup.
  - `{ clientEmail: 1, isDeleted: 1 }`: Enables fast client session audio inventory and purge operations.

### 9. `AuditLog` Collection
- **Primary Schema:** `actorEmail`, `actorRole`, `action`, `targetResource`, `details`, `ipAddress`, `userAgent`, `timestamp`
- **Compound Indexes:**
  - `{ timestamp: -1 }`: Powers real-time security event streaming in Admin Console.
  - `{ actorEmail: 1, timestamp: -1 }`: Enables user-specific forensic investigation.

### 10. `app_sessions` Collection (MongoStore)
- **Primary Schema:** Managed by `connect-mongo`.
- **TTL Index:** Automatic expiration on `expires` field (`ttl: 28800` = 8 hours).

---

## 2. Connection Pooling & Production Reliability

- **Driver:** Mongoose 9.7.4 with MongoDB Native Driver v6.
- **Connection Parameters:**
  - `minPoolSize`: `10` connections pre-warmed.
  - `maxPoolSize`: `50` concurrent pooled connections.
  - `serverSelectionTimeoutMS`: `5000` ms fail-fast threshold.
  - `socketTimeoutMS`: `45000` ms socket keep-alive.
  - `dns.setServers(['8.8.8.8', '1.1.1.1'])`: Explicit public DNS resolution prevents Atlas SRV resolution failures on restricted hosting providers.

---

## 3. Data Integrity & Fail-Safe Mechanisms

1. **Production Fail-Fast Enforcement:**
   - In production (`NODE_ENV === 'production'`), if `MONGODB_URI` is missing or Atlas cannot be reached, the server process halts immediately (`process.exit(1)`).
   - Local JSON fallback (`local_db.json`) is strictly prohibited in production mode.
2. **Session Persistence:**
   - Sessions are encrypted with AES-256 via `connect-mongo` crypto salt before being written to `app_sessions`.
   - In-memory fallback (`MemoryStore`) is strictly rejected in production.
3. **Automated Database Backups:**
   - Script: `scripts/backup-db.js`.
   - Creates timestamped, gzip-compressed mongodumps (`backups/dump_*.gz`).
   - Backup retention policy: 30 days retention with automated prune.
