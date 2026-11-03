# P1 Database Backup Report: Disaster Recovery & Automated Snapshot Strategy

**Application:** Verdant Mind – Counselling Management Portal  
**Database:** MongoDB Atlas (AWS Mumbai: `ap-south-1` cluster)  
**Scripts:** [`scripts/backup-db.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/scripts/backup-db.js), [`scripts/test-restore.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/scripts/test-restore.js)  
**Date:** 2026-11-02  

---

## 1. Executive Summary

A two-tier backup and disaster recovery architecture was implemented for MongoDB Atlas, providing automated snapshots, offsite encrypted replication, and verified restoration capabilities without altering the live production database.

---

## 2. Backup Architecture & Policies

### Tier 1: MongoDB Atlas Native Snapshots (Primary)
- **Snapshot Frequency:** Automated continuous cloud backups with daily snapshot checkpoints.
- **Point-in-Time Recovery (PITR):** Supported on Atlas dedicated clusters (`M10+`), enabling rollback to any second within a 7-day rolling window.
- **Retention Schedule:**
  - Hourly snapshots: Retained for 24 hours.
  - Daily snapshots: Retained for 30 days.
  - Monthly snapshots: Retained for 12 months.
  - Annual compliance archives: Retained for 7 years (medical record retention standard).

### Tier 2: Offsite Encrypted Gzip Snapshots (Secondary)
- **Engine:** [`scripts/backup-db.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/scripts/backup-db.js).
- **Format:** Timestamped, Gzip-compressed JSON archives (`counselling_backup_YYYY-MM-DDTHH-mm-ss.json.gz`).
- **Offsite Replication:** Exported archives are automatically mirrored to private AWS S3 (`s3://<bucket>/database_backups/`) with SSE-S3 AES-256 encryption.
- **Session Exclusion:** Ephemeral authentication sessions (`app_sessions`) are skipped to keep backups lean and prevent cryptographic key leakage.

---

## 3. Restoration Verification

A dedicated verification script ([`scripts/test-restore.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/scripts/test-restore.js)) was authored and executed.

```text
Loading backup archive: backups/counselling_backup_2026-11-02T11-42-05-296Z.json.gz
Backup archive verified. Archive generated at: 2026-11-02T11:42:05.297Z
Connecting to isolated test restoration sandbox database (test_counselling_restore_sandbox)...
Restoring records into sandbox...
  ✓ Verified 1 records restored in test collection clinicalcasehistories.
  ✓ Verified 1 records restored in test collection mentalstatusexams.
  ✓ Verified 1 records restored in test collection availabilities.
  ✓ Verified 1 records restored in test collection audiorecordings.
  ✓ Verified 2 records restored in test collection users.
  ✓ Verified 16 records restored in test collection auditlogs.

===========================================================
RESTORATION TEST PASSED: Successfully restored 22 records into sandbox.
Live production database was NOT altered.
===========================================================
Cleaned up test sandbox database.
```

- **Safety Guarantee:** Restoration was executed strictly against an isolated sandbox database (`test_counselling_restore_sandbox`). The live production database was **not** modified.

