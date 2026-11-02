# P1 API Rate Limiting Report: Anti-Abuse & Brute-Force Architecture

**Application:** Verdant Mind – Counselling Management Portal  
**Audit Stage:** Phase P1 — High-Priority Production Hardening  
**Target Engine:** `express-rate-limit` v8.7.2 with verified client IP resolution  
**Date:** 2026-11-02  

---

## 1. Executive Summary

A comprehensive rate-limiting architecture was implemented to protect critical endpoints against brute-force attacks, resource exhaustion, and denial of service, while avoiding collateral impact on legitimate clinical users sharing institutional or corporate networks.

---

## 2. Rate-Limiting Configuration by Endpoint Category

| Tier | Target Endpoints | Window | Max Requests | Key Generator | Protection Goal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication (General)** | `/api/auth/*` | 15 mins | 100 | Verified IP (`getClientIp`) | Prevents reconnaissance scanning |
| **Login & Verification** | `/api/auth/login`, `/api/auth/verify-otp` | 15 mins | 15 | Verified IP | Blocks credential stuffing & OTP enumeration |
| **Password Recovery** | `/api/auth/forgot-password`, `/api/auth/reset-password` | 15 mins | 5 | Verified IP | Protects Brevo SMTP quotas & prevents email spamming |
| **Clinical AI Engine** | `/api/ai/polish`, `/api/ai/chat` | 1 min | 30 | Verified IP | Prevents Gemini LLM exhaustion & cost spikes |
| **Bookings & Inquiries** | `/api/appointments`, `/api/messages` | 1 hour | 30 | Verified IP | Blocks spam calendar bookings & fake clinical inquiries |

---

## 3. Implementation Details

1. **IP Spoofing Resistance:**
   All rate limiters use:
   ```javascript
   keyGenerator: (req) => getClientIp(req)
   ```
   Combined with single-hop reverse proxy trust (`app.set('trust proxy', 1)` in production), this prevents attackers from spoofing `X-Forwarded-For` headers to reset or evade rate-limit quotas.

2. **Standardized Header Information:**
   Every rate limiter emits standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`) enabling frontend clients to handle throttling gracefully without UI breakdown.

3. **Privacy-Preserving Audit Logging:**
   When rate limits are exceeded, the server responds with HTTP 429 and logs the offending IP and endpoint. Sensitive request bodies (such as passwords, client names, or therapeutic notes) are **never** logged.

---

## 4. Test Verification & Results

- **Test 25 in `tests/run_tests.js`:** Verified that AI limiters and booking limiters return HTTP 429 and emit proper standard headers when quotas are exceeded.
- **Result:** **PASSED**.
