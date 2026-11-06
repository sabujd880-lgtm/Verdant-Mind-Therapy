# Production Environment Variables Reference
**Project:** Counselling Management Portal (Verdant Mind)  
**Security Classification:** Highly Sensitive – Operational Credentials

---

## 1. Environment Variable Catalog

| Variable Name | Required | Default / Example | Purpose & Placement |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` | Enables production optimizations, secure cookies, and strict HTTPS rules. |
| `PORT` | **Yes** | `5000` | Port on which the Express gateway server listens. |
| `FRONTEND_URL` | **Yes** | `https://counselling.YOURDOMAIN.com` | Allowed CORS origin for browser requests and OAuth redirect destination. |
| `API_URL` | **Yes** | `https://api.YOURDOMAIN.com` | Public base URL of backend API endpoints. |
| `MONGODB_URI` | **Yes** | `mongodb+srv://user:pass@cluster...` | Primary MongoDB Atlas replica set connection string with TLS. |
| `SESSION_SECRET` | **Yes** | (64-character hex string) | Cryptographic key used to sign and verify HTTP-only session cookies. |
| `GOOGLE_CLIENT_ID` | **Yes** | `xxxx.apps.googleusercontent.com` | OAuth 2.0 Client ID obtained from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | **Yes** | `GOCSPX-xxxx` | OAuth 2.0 Client Secret used during server-side token exchange. |
| `GOOGLE_CALLBACK_URL` | **Yes** | `https://api.YOURDOMAIN.com/api/auth/google/callback` | Exact registered redirect URI matching Google Console configuration. |
| `BOOTSTRAP_ADMIN_EMAIL` | **Yes** | `sabujd880@gmail.com` | Email address automatically provisioned as `Super Admin` on first boot. |
| `AWS_REGION` | **Yes** | `ap-south-1` | AWS Mumbai region for S3 buckets, App Runner, and ECS tasks. |
| `AWS_S3_BUCKET` | Optional | `counselling-recordings-private-prod` | Dedicated private AWS S3 bucket for clinical audio recordings. |
| `AWS_ACCESS_KEY_ID` | Optional | `AKIA...` | IAM user or task role credential with `PutObject`, `GetObject`, `DeleteObject`. |
| `AWS_SECRET_ACCESS_KEY` | Optional | `wJalrX...` | Secret key associated with IAM user or task role. |
| `BREVO_API_KEY` | Optional | `xkeysib-...` | Brevo REST API v3 key for transactional booking and OTP email delivery. |
| `SENDER_EMAIL` | Optional | `sabujd880@gmail.com` | Verified transactional email sender address in Brevo. |
| `SENDER_NAME` | Optional | `Sabuj Das \| Verdant Mind` | Display sender name shown in client inboxes. |
| `GEMINI_API_KEY` | Optional | `AIzaSy...` | Google Gemini API key powering Aura AI Chat and clinical note polisher. |
| `PROVIDER_EMAIL` | Optional | `sabuj.admin@counseling.com` | Legacy administrative email login fallback. |
| `PROVIDER_PASSWORD` | Optional | `SabujCare#2026!` | Legacy administrative password fallback. |

---

## 2. Generating Strong Cryptographic Secrets

Generate a cryptographically secure `SESSION_SECRET`:
```bash
# Using OpenSSL (Terminal)
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Storage & Configuration in AWS Secrets Manager

For enterprise production hosting, store credentials in AWS Secrets Manager:

1. Open AWS Secrets Manager in `ap-south-1` (Mumbai).
2. Choose **Store a new secret** > **Other type of secret**.
3. Add Key/Value pairs corresponding to the table above.
4. Secret Name: `production/counselling/credentials`.
5. In your App Runner or ECS Task execution role, attach policy `secretsmanager:GetSecretValue` targeting this ARN.
6. Reference secrets dynamically or inject as container environment variables during deployment.

