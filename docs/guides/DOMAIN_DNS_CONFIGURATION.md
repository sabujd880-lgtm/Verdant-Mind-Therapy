# Custom Domain & DNS Configuration Guide
**System:** Counselling Management Portal (Verdant Mind)  
**Domains:** `counselling.YOURDOMAIN.com` & `api.YOURDOMAIN.com`

---

## 1. Domain Architecture

To maintain a clean separation of concerns and protect browser security contexts:
- **Frontend SPA Web Portal:** `https://counselling.YOURDOMAIN.com`
- **Backend API Gateway:** `https://api.YOURDOMAIN.com`
- **Google OAuth Callback:** `https://api.YOURDOMAIN.com/api/auth/google/callback`

---

## 2. SSL/TLS Certificate Provisioning (AWS Certificate Manager)

Before mapping custom domains in AWS:
1. Open **AWS Certificate Manager (ACM)** in region `us-east-1` (if using CloudFront) and region `ap-south-1` (if using App Runner / ALB).
2. Click **Request a certificate** > **Request a public certificate**.
3. Fully Qualified Domain Names:
   - `YOURDOMAIN.com`
   - `*.YOURDOMAIN.com` (Wildcard certificate covers `counselling` and `api`).
4. Validation method: **DNS validation** (Recommended).
5. Click **Request**.
6. Open your DNS provider (Route 53, Cloudflare, GoDaddy, etc.) and add the `CNAME` validation record provided by ACM:
   ```
   Name: _a7b8c9d0...yourdomain.com.
   Type: CNAME
   Value: _x1y2z3...acm-validations.aws.
   ```
7. Wait 2–5 minutes until Status turns **Issued**.

---

## 3. Required DNS Records Table

Add the following records in your DNS Management console:

| Record Type | Host / Name | Target / Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** or **ALIAS** | `counselling` | `d123456abcdef.cloudfront.net` (or App Runner custom domain endpoint) | 300s | Frontend Web Application |
| **CNAME** | `api` | `app-xyz123.ap-south-1.awsapprunner.com` | 300s | Backend Express API Gateway |
| **TXT** | `@` / `counselling` | `google-site-verification=...` | 3600s | Google Search Console & Verification |
| **CNAME** (Brevo) | `mail._domainkey` | `k1.domainkey.yourdomain.com` | 300s | DKIM Email Authentication |
| **TXT** (Brevo) | `@` | `v=spf1 include:spf.brevo.com ~all` | 300s | SPF Email Deliverability |
| **TXT** | `_dmarc` | `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@yourdomain.com` | 3600s | DMARC Anti-Phishing Policy |

---

## 4. Google Cloud Console Authorized URIs Update

Once your custom domains are active and responding over HTTPS, update your Google Cloud Console OAuth 2.0 Client:

1. Visit [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Click your OAuth 2.0 Client ID (`Verdant Mind Web Client`).
3. Under **Authorized JavaScript origins**, ensure you have:
   ```
   https://counselling.YOURDOMAIN.com
   https://api.YOURDOMAIN.com
   http://localhost:5173
   http://localhost:5000
   ```
4. Under **Authorized redirect URIs**, add:
   ```
   https://api.YOURDOMAIN.com/api/auth/google/callback
   http://localhost:5000/api/auth/google/callback
   ```
5. Click **Save**.

> [!NOTE]
> Changes to Google OAuth redirect URIs can take from 2 to 10 minutes to propagate across Google's edge cache.

---

## 5. Verifying Cross-Origin Requests & Cookies

Because the frontend is on `counselling.YOURDOMAIN.com` and the API is on `api.YOURDOMAIN.com`:
1. The backend automatically sets cookies with:
   - `SameSite=None`
   - `Secure=true`
   - `HttpOnly=true`
2. CORS is configured in `server.js` with:
   - `credentials: true`
   - `origin: https://counselling.YOURDOMAIN.com`
3. All frontend `fetch()` calls in `App.jsx` and components include `credentials: 'include'`.

