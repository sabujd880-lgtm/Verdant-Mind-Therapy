# COUNSELLING MODULE WORKFLOW TEST REPORT
**Application:** Verdant Mind – Counselling Management Portal  
**Date:** November 2, 2026  
**Status:** ALL 6 CLINICAL MODULES AUDITED & VERIFIED

---

## 1. Module A: Client Management

- **Workflows Tested:**
  - Client Registration (`POST /api/auth/register` with name, email, phone, age group).
  - 6-Digit Email OTP Verification (`POST /api/auth/verify-otp`).
  - Staff Client Directory listing (`GET /api/clients`) with passwords and reset codes redacted.
  - Client Profile retrieval (`GET /api/clients/:email`) with assigned-counsellor verification.
  - Client Data Export (`GET /api/clients/:email/export`).
  - Client Data Purge (`DELETE /api/clients/:email/purge`) with mandatory confirmation token.
- **Verification Result:** PASS (Zero data leakage; sensitive credentials omitted from staff directory responses).

---

## 2. Module B: Clinical Records (Comprehensive Case History)

- **Workflows Tested:**
  - Case History creation (`POST /api/clinical/case-history`).
  - Longitudinal Case History retrieval (`GET /api/clinical/case-history/:clientEmail`).
  - Clinical Formulation: Verified Presenting Complaints, History of Illness, Risk Assessment (Suicide, Self-Harm, Harm to Others), and Treatment Goals.
  - IDOR Protection: Verified that counsellors cannot retrieve clinical formulations for clients not on their caseload.
- **Verification Result:** PASS (Clinical formulation data matches psychiatric intake specifications).

---

## 3. Module C: Appointment Management & Scheduling

- **Workflows Tested:**
  - Public Booking Engine (`POST /api/appointments` with rate limiting).
  - Conflict Check: Verified that requesting an already booked slot returns HTTP 409 Conflict.
  - Status Updates (`PATCH /api/appointments/:id/status`): Verified status transition (`Pending` → `Confirmed` → `Completed` / `Cancelled`).
  - Client Cancellation: Verified that clients can cancel only their own appointments.
  - Practice Availability (`GET /api/availability`, `PUT /api/availability`): Verified schedule updates are restricted to practice staff.
- **Verification Result:** PASS (Double-booking prevented; automated Brevo notification triggers validated).

---

## 4. Module D: Counselling Sessions & Consultation Notes

- **Workflows Tested:**
  - Session Notes Update (`PATCH /api/appointments/:id/notes`).
  - Authorized Author Check: Verified that only assigned counsellors, administrators, and super admins can author clinical notes.
  - Session Completion: Verified note persistence on the appointment object without overwriting previous metadata.
- **Verification Result:** PASS (Notes remain encrypted in transit and at rest).

---

## 5. Module E: Mental Status Examination (MSE)

- **Workflows Tested:**
  - Record Creation (`POST /api/clinical/mse`).
  - Chronological History Retrieval (`GET /api/clinical/mse/:clientEmail`).
  - Verified 8 Clinical Domains:
    1. Appearance and Behavior
    2. Speech and Communication
    3. Mood and Affect
    4. Thought Process and Content
    5. Perceptual Disturbances
    6. Cognition and Orientation
    7. Insight and Judgment
    8. Clinical Diagnostic Summary
- **Verification Result:** PASS (Longitudinal tracking operational across repeat consultations).

---

## 6. Module F: Audio Recordings & Encrypted Storage

- **Workflows Tested:**
  - Informed Consent Gate: Verified upload is rejected with 400 if `consentObtained !== 'true'`.
  - Binary Magic Byte Validation: Verified disguised executables, HTML, and scripts are rejected before storage.
  - Streamed Disk Ingestion: Multipart data is streamed to temporary disk storage to prevent RAM exhaustion.
  - AWS S3 Storage & Fallback: Uploads to private S3 bucket (or local AES-256 encrypted fallback).
  - Short-Lived Signed URL (`GET /api/recordings/:id/signed-url`): Generates 15-minute temporary URLs (`expiresInSeconds: 900`).
  - Direct Token Streaming (`GET /api/recordings/stream/:id`): Validates signed HMAC tokens.
  - Secure Deletion (`DELETE /api/recordings/:id`): Executes S3 object deletion and marks record soft-deleted with audit logging.
- **Verification Result:** PASS (Complete audio lifecycle adheres to clinical audio protection guidelines).
