# PRODUCTION CONFIGURATION & CLOUD DEPLOYMENT REPORT
**Application:** Verdant Mind – Counselling Management Portal  
**Primary Production URL:** `https://verdant-mind.onrender.com`  
**Date:** November 2, 2026  
**Status:** CONFIGURATION VERIFIED & DOCUMENTED

---

## 1. Cloud Infrastructure Architecture

Verdant Mind is deployed across a secure, low-latency multicloud topology:

1. **Application Gateway & Frontend Host (Render Blueprint / AWS App Runner):**
   - Web Service: `verdant-mind` on Node.js 22 runtime.
   - Region: Singapore (`singapore`) / Mumbai (`ap-south-1`).
   - Configuration File: `render.yaml` & `Dockerfile`.
   - Build Command: `npm ci && npm run build`
   - Start Command: `node server.js`
   - Health Probe: `GET /api/health` (HTTP 200 threshold).

2. **Database Engine (MongoDB Atlas Cloud):**
   - Cluster: `cluster0.n22euv9.mongodb.net` (Replica set: `atlas-113k67-shard-0`).
   - Authentication: SCRAM-SHA-256 with dedicated database user `sabujd880_db_user`.
   - Network Access: Encrypted TLS 1.3 with public DNS resolvers (`8.8.8.8`, `1.1.1.1`).
   - Sessions Collection: `app_sessions` with 8-hour TTL index.

3. **Secure Storage (AWS S3 / Encrypted Local Disk):**
   - Private bucket for therapeutic audio consultations.
   - Presigned URLs with 15-minute expiration (`expiresIn: 900`).

---

## 2. Production Environment Variable Specification

| Variable Name | Required | Sensitivity | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Yes | Low | Must be `production` |
| `PORT` | Yes | Low | Default `10000` on Render, `5000` on AWS |
| `FRONTEND_URL` | Yes | Low | `https://verdant-mind.onrender.com` |
| `API_URL` | Yes | Low | `https://verdant-mind.onrender.com` |
| `MONGODB_URI` | Yes | **HIGH** | MongoDB Atlas connection string |
| `SESSION_SECRET` | Yes | **HIGH** | Cryptographic 256-bit session encryption key |
| `GOOGLE_CLIENT_ID` | Yes | Low | Google OAuth 2.0 Web Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | **HIGH** | Google OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | Yes | Low | `https://verdant-mind.onrender.com/api/auth/google/callback` |
| `BOOTSTRAP_ADMIN_EMAIL`| Yes | Medium | Super Admin email (`sabujd880@gmail.com`) |
| `BREVO_API_KEY` | Optional | **HIGH** | Transactional email delivery API key |
| `GEMINI_API_KEY` | Optional | **HIGH** | Google Gemini Generative AI API key |
| `AWS_ACCESS_KEY_ID` | Optional | **HIGH** | AWS S3 audio recording access key |
| `AWS_SECRET_ACCESS_KEY`| Optional | **HIGH** | AWS S3 audio recording secret key |
| `AWS_S3_BUCKET` | Optional | Medium | Private audio storage bucket name |
| `AWS_REGION` | Optional | Low | `ap-south-1` (Mumbai) |

---

## 3. Production Health Probes & Monitoring

1. **Liveness Probe (`GET /api/health`):**
   - Returns HTTP 200 when the process is running.
   - Provides process uptime, RSS memory, heap allocation, and database connectivity status.
2. **Readiness Probe (`GET /api/health/ready`):**
   - Evaluates `mongoose.connection.readyState === 1`.
   - Returns HTTP 200 when ready to accept traffic; returns 503 during startup or connection interruptions.
3. **Docker Container Probe:**
   - Evaluates `wget --spider http://localhost:5000/api/health` every 30 seconds with 3 retries.

