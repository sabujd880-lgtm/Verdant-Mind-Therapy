# Verdant Mind — Clinical Psychology & Mental Health Portal

> **Professional mental health platform & Electronic Medical Record (EMR) system for Sabuj Das, Consultant Psychologist.**

[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-brightgreen.svg)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-19.2-blue.svg)](https://react.dev/)
[![Express Version](https://img.shields.io/badge/Express-5.3-lightgrey.svg)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Mongoose-emerald.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

---

## 1. Overview

**Verdant Mind** is an end-to-end clinical psychological practice management portal and patient engagement platform. It seamlessly bridges public therapeutic portfolio discovery, self-service consultation scheduling, real-time client communication, and rigorous clinical workflows for practitioners.

### Core Capabilities
* **Public Practice Showcase & Patient Education:** Clinical specializations (ADHD, Anxiety, Depression, Dialectical Behavior Therapy, Addiction Treatment, Youth Therapy).
* **Smart Booking Engine:** Real-time Indian Standard Time (IST) calendar slot scheduling with automated anti-collision locking and instant confirmation emails.
* **Client Self-Service Portal:** View booked sessions, download official clinical prescriptions and payment receipts, message assigned therapists, and submit Data Subject Access Requests (DSAR).
* **Provider & Staff Dashboard:** Comprehensive consultation review, real-time appointment triage, client messaging, and dynamic letterhead Document Composer with walk-in entry support.
* **Clinical Records & EMR (MSE / SOAP):** 9-domain comprehensive psychiatric history, Mental Status Examination (MSE), clinical case formulations, and encrypted session audio recordings.
* **Security & Administrative Governance:** Granular Role-Based Access Control (RBAC), tamper-resistant immutable audit trails, automated brute-force IP rate limiting, active session termination, and practice calendar holiday governance.

---

## 2. Technical Architecture

```
psychology-portfolio/
├── .github/workflows/         # CI/CD deployment automation pipelines
├── docs/                      # Technical documentation & audit archive
│   ├── guides/                # Operational guides (DNS, Admin, AWS, Backup, OAuth)
│   └── reports/               # Historical security, performance, & testing audits
├── infrastructure/            # CloudFormation & Terraform infrastructure templates
├── public/                    # Production static assets (PWA icons, favicon, manifest)
├── scripts/                   # Database backup, restore verification, & cloud setup tools
├── src/                       # Frontend React 19 application
│   ├── assets/                # Optimized branding and practitioner portrait
│   ├── components/            # UI modules (Portals, Dashboards, EMR, Booking)
│   ├── config/                # Cloud secrets manager integration
│   ├── styles/                # CSS architecture & brand themes (Lavender-Rose, Classic)
│   └── utils/                 # API client wrapper & IST datetime formatting engines
├── tests/                     # Automated end-to-end and regression test suite
├── Dockerfile                 # Multi-stage production container definition
├── docker-compose.yml         # Local containerized orchestration
├── render.yaml                # Render Cloud Native Infrastructure Blueprint
├── server.js                  # Production Express backend & API gateway
└── vite.config.js             # Vite bundler, PWA service worker, and proxy rules
```

---

## 3. Technology Stack

* **Frontend:** React 19, Vite 8, Lucide React icons, Progressive Web App (PWA) with offline precaching (`vite-plugin-pwa`, Workbox).
* **Backend:** Express 5, Node.js (with `--dns-result-order=ipv4first`), Helmet, cookie-parser, express-session, multer, express-rate-limit.
* **Database & Storage:** MongoDB Atlas via Mongoose 9 (with automated local mock-engine fallback during development/testing), MongoStore session store, AWS S3 private encrypted audio bucket.
* **Security:** scrypt password hashing, timing-safe equality comparison, AES-256-GCM / HMAC integrity checks, strict CORS whitelist reflection, content security policies (CSP).
* **Timezone Governance:** Native `Asia/Kolkata` (IST) normalization across scheduling, appointment slot generation, and audit timestamps.

---

## 4. Getting Started

### Prerequisites
* **Node.js:** v18.0.0 or higher (v20+ recommended)
* **npm:** v9.0.0 or higher
* **MongoDB:** Local MongoDB instance or MongoDB Atlas cluster connection string

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sabujd880-lgtm/Verdant-Mind-Therapy.git
   cd Verdant-Mind-Therapy
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment template:
   ```bash
   cp .env.example .env
   ```
   Fill in your configuration settings (see [`docs/guides/ENVIRONMENT_VARIABLES.md`](docs/guides/ENVIRONMENT_VARIABLES.md) for detailed descriptions).

---

## 5. Development & Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs both Vite frontend dev server and Express API server concurrently |
| `npm run build` | Compiles optimized production bundle into `dist/` |
| `npm run start` | Launches production Express server with IPv4 DNS ordering |
| `npm run build:start` | Builds frontend assets and starts production server |
| `npm run lint` | Runs ultra-fast code inspection via Oxlint |
| `npm test` or `node tests/run_tests.js` | Executes the 85-point automated verification suite |
| `npm run generate:favicons` | Regenerates PWA icons and favicons from master graphic |

---

## 6. Testing & Quality Assurance

Verdant Mind includes a comprehensive 85-point end-to-end verification suite covering:
* Authentication, RBAC permission matrices, session revocation, and password resets.
* Public booking anti-collision (409 conflict on double-booking) and IST date validation.
* Tamper-resistant immutable audit logging and DSAR privacy workflows.
* Static cross-origin asset serving with strict MIME types and missing-asset 404 guards.
* File upload security with magic byte header validation against malware masquerading.

Run the test suite locally:
```bash
node tests/run_tests.js
```

---

## 7. Cloud Deployment

### Render Blueprint (Recommended)
The repository includes a production-ready [`render.yaml`](render.yaml) blueprint:
* **Service Type:** Node.js Web Service
* **Build Command:** `npm run build`
* **Start Command:** `npm run start`
* **Environment Variables:** Automatic HTTPS domain reflection with zero CORS leakage.

### Docker Deployment
Build and run using the included container configuration:
```bash
docker-compose up --build -d
```

---

## 8. Documentation Index

Detailed operational guides are organized in the [`docs/`](docs/) directory:
* [Administrator Access & Roles Guide](docs/guides/ADMIN_ACCESS_GUIDE.md)
* [AWS Deployment & S3 Storage Architecture](docs/guides/AWS_DEPLOYMENT_GUIDE.md)
* [Database Backup & Disaster Recovery Guide](docs/guides/DATABASE_BACKUP_GUIDE.md)
* [Custom Domain & DNS Configuration](docs/guides/DOMAIN_DNS_CONFIGURATION.md)
* [Environment Variable Specifications](docs/guides/ENVIRONMENT_VARIABLES.md)
* [Google OAuth Setup & Callback URL Configuration](docs/guides/GOOGLE_AUTH_SETUP.md)
* [Production Security & Hardening Checklist](docs/guides/SECURITY_CHECKLIST.md)

---

## 9. Security & Responsible Disclosure

This platform manages sensitive psychological and healthcare data. For vulnerability reporting or security inquiries, please follow the guidelines in [docs/guides/SECURITY_CHECKLIST.md](docs/guides/SECURITY_CHECKLIST.md).
