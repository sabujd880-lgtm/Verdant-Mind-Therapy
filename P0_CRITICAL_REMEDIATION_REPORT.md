# P0 Critical Security Remediation Report

**Application:** Verdant Mind – Counselling Management Portal  
**Repository:** `psychology-portfolio`  
**Execution Date:** 2026-11-02  
**Audit Stage:** Phase P0 — Critical Security & Production Blocker Remediation  

---

## Executive Summary

Phase P0 addressed four critical security vulnerabilities and production deployment blockers in the Verdant Mind portal:
1. **Exposed Database Credentials & Secret Sprawl:** Eradication of plaintext credentials across markdown documentation and Git working tree; enforcement of `.gitignore` exclusion for `.env`; verification of AWS Secrets Manager production loader; credential rotation advisory.
2. **`proxy-addr` Vulnerability (CVE-2026-90711) & Reverse Proxy Trust Hardening:** Patching `proxy-addr` to `2.0.8` via npm package overrides; eliminating wildcard `trust proxy = true` in production; preventing client IP address spoofing through forged `X-Forwarded-For` headers.
3. **Production Fail-Fast Architecture:** Strictly prohibiting silent fallback to local file-based JSON storage (`local_db.json`) or in-memory session storage in production; halting process startup immediately if `MONGODB_URI` or custom `SESSION_SECRET` is missing.
4. **CORS & OAuth Production Hardening:** Blocking cross-origin requests from unapproved origins in production; strictly forbidding developer mock OAuth callbacks (`code=dev_mock_code`) in production mode.

---

## Detailed Remediation Items

### Item 1: MongoDB Credential Exposure & Secret Management

#### Original Finding
- An active MongoDB connection string with credentials (`sabujd880_db_user:<password-redacted>`) was previously recorded in markdown audit files (`SECURITY_GAP_REPORT.md` and `PRODUCTION_READINESS_AUDIT.md`) and committed in Git history (commit `a93739c`).
- In addition, database user credentials and a MongoDB Model API Key were shared in user session chat inputs and stored in the local untracked `.env` file.

#### Root Cause
Development onboarding templates and audit reports logged raw environment strings without cryptographic masking or automated redaction hooks.

#### Files Modified
- [`SECURITY_GAP_REPORT.md`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/SECURITY_GAP_REPORT.md): Redacted plaintext MongoDB URI to placeholder format.
- [`PRODUCTION_READINESS_AUDIT.md`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/PRODUCTION_READINESS_AUDIT.md): Redacted legacy credentials from findings text.
- [`.gitignore`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/.gitignore): Verified active exclusion rule `*.env` on line 19; `.env` is confirmed untracked by Git (`git check-ignore -v .env`).
- [`src/config/secrets.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/src/config/secrets.js): Verified AWS Secrets Manager integration (`@aws-sdk/client-secrets-manager`) to inject secrets into `process.env` at boot time without disk persistence.

#### Fix Implemented
1. All plaintext passwords in repository files were immediately replaced with `<password-redacted>`.
2. Verified that `.env` is not tracked by Git (`git ls-files .env` returns empty).
3. Configured production runtime to prioritize AWS Secrets Manager (`AWS_SECRET_NAME`).
4. **Critical Rule Enforced:** Removing a secret from the current file does **NOT** invalidate an already exposed credential. A mandatory operational advisory has been issued to rotate the MongoDB Atlas user password in the MongoDB Atlas Console immediately.

#### Tests Executed
- Git tracking verification: `git check-ignore -v .env` and `git ls-files "*env*"`.
- Tracked file scan: `git grep -i "sabujd880_db_user:"` across all branches.
- AWS Secrets Manager integration test (Test 21 & Test 34).

#### Actual Test Result
- `git ls-files .env`: Verified untracked.
- `git grep`: Zero plaintext passwords remain in tracked files.
- Test 34: AWS Secrets Manager loader safely initializes and passes without credential leakage.

#### Remaining Risks
- The old password committed in commit `a93739c` remains in immutable Git commit history until the repository history is purged or the credential is rotated in MongoDB Atlas.
- **Remediation Action Required by Administrator:** Rotate the user password for `sabujd880_db_user` in MongoDB Atlas Console under Database Access, and update the secret value in AWS Secrets Manager.

---

### Item 2: Critical `proxy-addr` Vulnerability (CVE-2026-90711) & Reverse Proxy Configuration

#### Original Finding
- `proxy-addr` versions prior to `2.0.8` contain a critical vulnerability (CVE-2026-90711, CVSS 9.3) allowing IP address spoofing when parsing IPv4-mapped IPv6 subnets, causing applications to trust untrusted clients and accept forged `X-Forwarded-For` headers.
- `server.js` had permissive fallback logic where setting `TRUST_PROXY=true` in production would blindly trust arbitrary upstream proxy hops.

#### Root Cause
Transitive dependency through `express` (v5.3.0) and lack of strict proxy hop enforcement in `server.js`.

#### Files Modified
- [`package.json`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/package.json): Enforced `"overrides": { "proxy-addr": "2.0.8" }`.
- [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js): Rewrote proxy trust configuration (lines 35-56) to strictly reject wildcard `true` in production mode and enforce 1-hop upstream termination (e.g., AWS ALB or Render reverse proxy).

#### Fix Implemented
```javascript
let trustProxyConfig = false;
if (process.env.TRUST_PROXY !== undefined) {
  const tp = process.env.TRUST_PROXY.trim();
  if (tp === 'false') {
    trustProxyConfig = false;
  } else if (tp === 'true') {
    if (isProd) {
      console.warn('[SECURITY WARNING] TRUST_PROXY=true (wildcard trust) is insecure in production. Defaulting to 1 hop.');
      trustProxyConfig = 1;
    } else {
      trustProxyConfig = true;
    }
  } else if (!isNaN(Number(tp))) {
    trustProxyConfig = Number(tp);
  } else {
    trustProxyConfig = tp;
  }
} else {
  trustProxyConfig = isProd ? 1 : false;
}
app.set('trust proxy', trustProxyConfig);
```
In `getClientIp(req)`, the application strictly evaluates the sanitized `req.ip` processed by Express and strips `::ffff:` IPv4-mapped prefixes without honoring untrusted headers.

#### Tests Executed
- Dependency verification: `npm list proxy-addr`.
- In-process test (Test 18 & Test 30): Injected forged `X-Forwarded-For: 198.51.100.42, 203.0.113.1` headers and validated that `getClientIp(req)` returns the direct connecting socket address (`127.0.0.1`), strictly rejecting the spoofed IP.

#### Actual Test Result
- `proxy-addr@2.0.8 overridden` confirmed installed.
- Test 18 & Test 30: **PASSED**. Spoofed headers cannot alter client IP resolution.

#### Remaining Risks
- If deployed behind a multi-tier proxy architecture (e.g., CloudFront -> ALB -> App Runner), `TRUST_PROXY` must be set to `2` or explicit CIDRs to correctly identify edge client IPs without over-trusting.

---

### Item 3: Production Deployment Blocker & Silent Local Fallback Elimination

#### Original Finding
- If MongoDB Atlas connectivity was interrupted or `MONGODB_URI` was missing, the application had legacy logic to fall back to `local_db.json` (mock file-based storage) and in-memory session management, which causes silent clinical data loss, multi-tenant contamination, and ephemeral data wiping on container restarts.

#### Root Cause
Development fallback logic designed for offline local prototyping was not strictly partitioned from production startup sequences.

#### Files Modified
- [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js):
  - In `setupLocalDBFallback()`: Added immediate `process.exit(1)` if `NODE_ENV === 'production'`.
  - In `mongoose.connect()` catch block: Added immediate process termination in production.
  - In MongoStore initialization: Added `process.exit(1)` if persistent session store cannot be created in production.
  - In `SESSION_SECRET` validator: Added fail-fast halt if custom secret is not configured.
- [`Dockerfile`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/Dockerfile): Updated production stage to use `RUN npm ci --omit=dev`.

#### Fix Implemented
Every fallback pathway now evaluates `if (isProd)` and issues a `[FATAL]` diagnostic log before terminating with exit code 1. No mock data, in-memory collections, or local JSON files can be created or queried when running in production.

#### Tests Executed
- Test 22: Production Fail-Fast prohibits `local_db.json` fallback and halts when `MONGODB_URI` is missing.
- Test 31: Production startup halts if default/insecure `SESSION_SECRET` is detected.
- Test 32: Local JSON database is strictly disabled in production mode.

#### Actual Test Result
- All fail-fast security tests **PASSED**.

#### Remaining Risks
- MongoDB Atlas cluster must be reachable via outbound TCP port 27017 and DNS SRV resolution (`dns.setServers(['8.8.8.8', '1.1.1.1'])`). If security groups block port 27017, the container will cleanly halt instead of silently corrupting data.

---

### Item 4: CORS Origin Verification & Google OAuth Dev Mock Guarding

#### Original Finding
- CORS configuration in `server.js` previously called `callback(null, true)` for unauthorized origins, allowing arbitrary websites to make credentialed cross-origin requests.
- Google OAuth callback permitted `code=dev_mock_code` without strictly asserting that `NODE_ENV !== 'production'`.

#### Root Cause
Development convenience fallbacks were left active without environment fencing.

#### Files Modified
- [`server.js`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/server.js):
  - Line 75-85: Added CORS policy rejection for unapproved origins in production.
  - Line 922: Enforced `!isProd && code === 'dev_mock_code'` guard.

#### Fix Implemented
In production, CORS requests from origins not explicitly enumerated in `allowedOrigins` or `FRONTEND_URL` are rejected with an explicit security error. Dev mock OAuth flows are completely unreachable in production.

#### Tests Executed
- Test 16: Google OAuth initiation and dev mock isolation.
- Test 33: Google OAuth dev mock rejected when `isProd === true`.

#### Actual Test Result
- Both tests **PASSED**.

---

## Verification Summary Table

| Category | Finding | Patch / Remediated File | Test Assertion | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Credentials** | Plaintext MongoDB URI in markdown files | `SECURITY_GAP_REPORT.md`, `PRODUCTION_READINESS_AUDIT.md` | `git grep` secret scan | **PASSED** (0 secrets found) |
| **Credentials** | `.env` file tracking risk | `.gitignore` rule `*.env` verified | `git check-ignore -v .env` | **PASSED** (Untracked) |
| **Vulnerability** | `proxy-addr` CVE-2026-90711 IP Spoofing | `package.json` (override 2.0.8) | `npm list proxy-addr` | **PASSED** (2.0.8 installed) |
| **Proxy Trust** | Wildcard `trust proxy = true` in production | `server.js` (lines 35-56) | Test 18 & Test 30 | **PASSED** (Spoofing blocked) |
| **Fail-Fast** | Silent fallback to `local_db.json` | `server.js` (lines 617-635, 706-722) | Test 22 & Test 32 | **PASSED** (Exit 1 enforced) |
| **Session** | Default/weak `SESSION_SECRET` | `server.js` (lines 146-149) | Test 31 | **PASSED** (Exit 1 enforced) |
| **CORS** | Permissive origin reflection | `server.js` (lines 75-85) | Production CORS guard | **PASSED** (Rejects untrusted) |
| **OAuth** | `dev_mock_code` usable in prod | `server.js` (line 922) | Test 33 | **PASSED** (Prod guard enforced) |

