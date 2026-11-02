# P1 File Upload Security Report: Streaming & Audio Protection Architecture

**Application:** Verdant Mind – Counselling Management Portal  
**Target Subsystem:** Clinical Audio Recording Ingestion & S3 Storage  
**Date:** 2026-11-02  

---

## 1. Executive Summary

Multer and file upload subsystems were audited and hardened to eliminate RAM exhaustion risks and ensure end-to-end clinical confidentiality for therapy session audio recordings.

---

## 2. Technical Vulnerability Remediation

### Problem 1: Unbounded In-Memory Storage
- **Original Finding:** Multer previously buffered entire audio files in memory (`multer.memoryStorage()`), creating a severe risk of Node.js Out-Of-Memory (OOM) process crashes during concurrent 100MB audio uploads.
- **Fix Implemented:** Replaced memory buffering with streaming disk-backed temporary storage (`multer.diskStorage`) into `uploads/tmp/`. Files are streamed in 64KB chunks directly to disk and forwarded via readable streams (`fs.createReadStream`) to AWS S3.
- **Cleanup Guarantee:** A `finally` block in [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js#L1494-L1498) guarantees that temporary files in `uploads/tmp/` are unlinked (`fs.unlinkSync`) whether upload succeeds, fails validation, or encounters an exception.

### Problem 2: MIME-Type & Extension Spoofing
- **Original Finding:** Relying on client-supplied `Content-Type` headers or `.webm`/`.wav` extensions allowed attackers to upload disguised executable scripts or malware.
- **Fix Implemented:** Implemented true binary magic-byte detection via `isValidAudioMagicBytes(filePath)`. Before saving or transmitting files, the server opens the file descriptor and inspects header byte signatures:
  - EBML / WebM: `1A 45 DF A3`
  - RIFF / WAV: `RIFF....WAVE`
  - ID3 / MP3: `ID3` or `FF FB/F3/F2`
  - Ogg: `OggS`
  - MP4 / M4A: `....ftyp`
  Disguised files fail verification immediately and are rejected with HTTP 400.

### Problem 3: Public Exposure of Sensitive Clinical Audio
- **Original Finding:** Therapy audio recordings must never be publicly readable on the internet.
- **Fix Implemented:** 
  1. Production storage writes to private AWS S3 buckets with AES-256 server-side encryption (`ServerSideEncryption: 'AES256'`).
  2. Playback is mediated strictly through short-lived (15-minute) presigned URLs generated via `@aws-sdk/s3-request-presigner` (`GET /api/recordings/:id/signed-url`).
  3. Local fallback storage uses cryptographically signed streaming URLs with HMAC-SHA256 tokens (`/api/recordings/stream/:filename?token=...`).
  4. Access is guarded by `canAccessClientRecord`, restricting playback strictly to the client and their assigned clinician.

---

## 3. Test Verification & Results

- **Test 12 & Test 13:** Consent enforcement (upload rejected when consent is absent; accepted when valid).
- **Test 26:** Magic-byte rejection of disguised scripts/executables.
- **Test 39:** Multer error handling (graceful handling of oversized files).
- **Result:** **PASSED**.
