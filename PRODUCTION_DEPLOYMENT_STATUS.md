# Production Deployment Status & Infrastructure Report — Verdant Mind
**Platform:** Verdant Mind — Public Mental Health & Clinical Services Portal  
**Repository:** https://github.com/sabujd880-lgtm/Verdant-Mind-Therapy  
**Branch:** `main`  
**Hosting Provider:** Render Web Services (Singapore Region — `singapore`)  
**Database:** MongoDB Atlas Replica Set (Cluster `counselling_production`)  
**Report Date:** November 4, 2026  

---

## 1. Deployment Configuration Summary

The deployment is managed declaratively via Render's Blueprint specification ([`render.yaml`](file:///c:/Users/CUAPDC03/Downloads/Sabujdas880/psychology-portfolio/render.yaml)):

```yaml
services:
  - type: web
    name: verdant-mind
    runtime: node
    plan: standard # or free
    region: singapore # Closest low-latency region to India / APAC
    buildCommand: npm ci --include=dev && npm run build
    startCommand: node --dns-result-order=ipv4first server.js
    healthCheckPath: /api/health
    autoDeploy: true
```

### Key Infrastructure Checks
1. **Repository Connection:** Connected to `https://github.com/sabujd880-lgtm/Verdant-Mind-Therapy.git`.
2. **Production Branch:** `main` (auto-deploy triggers on every push to `main`).
3. **Build Execution:** `npm ci --include=dev && npm run build` installs locked dependencies and runs Vite production compilation, generating minified chunks and PWA service workers in `dist/`.
4. **Start Command:** `node --dns-result-order=ipv4first server.js` forces Node to resolve Atlas hostnames via IPv4, preventing connection timeouts on Linux container networks.
5. **Port Binding:** Express listens on `0.0.0.0:${PORT}` where `PORT` defaults to Render's container port (`10000`).
6. **Health Check:** `/api/health` reports system uptime, memory metrics, and live database connection state.

---

## 2. Root Cause Analysis: Deploy Error `Exited with status 1`

### 2.1 The Symptom in Render Logs
```text
[MONGODB WARN] Connection attempt 1/4 failed: Could not connect to any servers in your MongoDB Atlas cluster.
[SYSTEM WARN] Background unhandled rejection intercepted: ... SSL routines:ssl3_read_bytes:tlsv1 alert internal error ... SSL alert number 80
==> No open ports detected, continuing to scan...
==> Exited with status 1
```

### 2.2 Deep Root Cause Investigation
1. **OpenSSL `SSL alert number 80` (`tlsv1 alert internal error`):**
   - In MongoDB Atlas, when a client attempts a TLS connection from an IP address that is **not explicitly permitted in Network Access**, the Atlas firewall drops the connection abruptly during the TLS handshake instead of completing the TCP/TLS exchange.
   - The Node.js / OpenSSL engine surfaces this sudden termination as `SSL alert number 80`.
2. **Local vs. Cloud Network Discrepancy:**
   - **Local Machine Test:** Directly verified by running a connection script from the local developer machine:
     ```text
     Testing MONGODB_URI connection from this machine...
     CONNECTED in 394 ms!
     ```
     The credentials, replica set configuration, and database are **100% active and healthy**. The local machine connects because the user's local IP address was previously whitelisted in Atlas.
   - **Render Cloud Network:** Render spins up web service containers across dynamic cloud virtual machines. Each deploy or build container receives a dynamic egress IP address that changes on every boot. Because MongoDB Atlas did not have `0.0.0.0/0` ("Allow Access From Anywhere") enabled, every connection attempt from Render was dropped.
3. **Fail-Fast Production Architecture:**
   - Lines 1656–1659 of `server.js` enforce clinical data safety:
     ```javascript
     if (isProd) {
       console.error('[FATAL] Database connection failed in production. Halting server process.');
       process.exit(1);
     }
     ```
   - In production, the server will never bind port 10000 without an active database connection to prevent accepting client consultation requests that could be dropped.
   - After 4 retry attempts (~60 seconds of backoff), the server called `process.exit(1)`, causing Render to register `Exited with status 1`.

---

## 3. Required User Actions in External Dashboards

To achieve a green, fully running production deployment, perform the following two dashboard steps:

### Step 1: Whitelist All Cloud IPs in MongoDB Atlas (2 Minutes)
1. Navigate to **[MongoDB Atlas](https://cloud.mongodb.com/)** and log in.
2. In the left navigation menu under **Security**, click **Network Access**.
3. Inspect the **IP Access List**:
   - If `0.0.0.0/0` is not listed or shows as inactive:
   - Click the green **`+ ADD IP ADDRESS`** button.
   - Click **`ALLOW ACCESS FROM ANYWHERE`** (this automatically populates `0.0.0.0/0` in the IP address field).
   - Enter an entry comment, e.g. `Render Web Service Gateway`.
   - Click **Confirm**.
4. > [!IMPORTANT]
   > Wait **60 to 90 seconds** until the status badge for `0.0.0.0/0` turns **`Active`** (green dot). MongoDB Atlas must propagate this rule across all 3 replica shards (`ac-eejhtzj-shard-00-00`, `01`, `02`).

### Step 2: Confirm Cluster Status
1. In the Atlas left navigation menu, click **Database**.
2. Verify that your cluster (`counselling_production`) is **Active**:
   - If the cluster says **`PAUSED`** (M0 free-tier clusters auto-pause after periods of inactivity), click **Resume** and wait 2–3 minutes for the nodes to restart.

### Step 3: Trigger Deploy in Render Dashboard
1. Go to your **[Render Dashboard](https://dashboard.render.com/)**.
2. Select the **`verdant-mind`** web service.
3. Click **Deploys** $\rightarrow$ **Manual Deploy** $\rightarrow$ **Clear build cache & deploy** (or **Deploy latest commit**).
4. Monitor the deploy logs:
   - Build completes in ~60s (`npm run build`).
   - `node --dns-result-order=ipv4first server.js` initializes.
   - Connection to MongoDB Atlas succeeds on attempt 1 in $< 500\text{ms}$.
   - Express binds to port `10000`.
   - Render marks the deploy **Live** (green).

---

## 4. Environment Variables Checklist (Render Dashboard)

| Variable Name | Required | Description / Recommended Value |
| :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | **Yes** | `10000` (Render default) |
| `FRONTEND_URL` | **Yes** | `https://verdant-mind.onrender.com` |
| `BACKEND_URL` | **Yes** | `https://verdant-mind.onrender.com` |
| `API_URL` | **Yes** | `https://verdant-mind.onrender.com` |
| `GOOGLE_CALLBACK_URL` | **Yes** | `https://verdant-mind.onrender.com/api/auth/google/callback` |
| `BOOTSTRAP_ADMIN_EMAIL` | **Yes** | `sabujd880@gmail.com` |
| `SESSION_SECRET` | **Yes** | Strong 64-char random hex string |
| `MONGODB_URI` | **Yes** | Full Atlas connection string with URL-encoded password |
| `BREVO_API_KEY` | Optional | For automated booking confirmation & password reset emails |
| `SENDER_EMAIL` | Optional | Verified Brevo sender email (`sabujd880@gmail.com`) |
| `SENDER_NAME` | Optional | `Verdant Mind Therapy` |
| `GEMINI_API_KEY` | Optional | For interactive AI clinical triage assistant (`AIBotWidget`) |
| `AWS_S3_BUCKET` | Optional | For durable cloud storage of session audio recordings |
| `AWS_ACCESS_KEY_ID` | Optional | AWS IAM credential for S3 access |
| `AWS_SECRET_ACCESS_KEY` | Optional | AWS IAM secret for S3 access |
| `AWS_REGION` | Optional | Default: `ap-south-1` (Mumbai) |
