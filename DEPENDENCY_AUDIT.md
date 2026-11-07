# Dependency Audit Report — Verdant Mind

**Platform:** Verdant Mind — Public Mental Health & Clinical Services Portal  
**Date:** November 7, 2026  
**Auditor:** Antigravity Autonomous Pair Programmer  

---

## 1. Executive Summary

A comprehensive dependency audit was performed on `package.json` and `package-lock.json` to ensure the project has no unneeded packages, zero known security vulnerabilities, minimal container build times, and clean separation between production runtime requirements and developer utilities.

### Audit Actions Taken
1. **Renamed Package Identity:** Package manifest name updated to `verdant-mind`.
2. **Removed `cors` from `dependencies`:** `server.js` implements its own granular Origin validation, pre-flight header handling, and credentials management natively; `cors` was completely unused.
3. **Relocated `sharp` from `dependencies` to `devDependencies`:** `sharp` is only used by `scripts/generate-favicons.cjs` for generating PWA icons locally. Moving it to `devDependencies` reduces production container build overhead and eliminates native libvips compilation requirements in container runtimes.
4. **Preserved Security Overrides:** Maintained transitive package overrides for `proxy-addr`, `glob`, `minimatch`, and `deepmerge` to guarantee zero high/critical CVEs.

---

## 2. Production Runtime Dependencies (`dependencies`)

| Package | Version | Justification & Usage in Production |
| :--- | :--- | :--- |
| `@aws-sdk/client-s3` | `^3.1161.0` | Secure storage of encrypted clinical session audio recordings |
| `@aws-sdk/client-secrets-manager` | `^3.1161.0` | Automatic loading of production credentials from AWS Secrets Manager |
| `@aws-sdk/s3-request-presigner` | `^3.1161.0` | Generates short-lived, authenticated presigned URLs for client/provider audio access |
| `@vitejs/plugin-react` | `^6.0.3` | React 19 JSX compilation and fast refresh during production asset build |
| `connect-mongo` | `^6.0.0` | Distributed, persistent session store in MongoDB Atlas collection `app_sessions` |
| `cookie-parser` | `^1.4.7` | Parses session and auth cookies securely |
| `dotenv` | `^17.4.2` | Loads local environment variables for development and testing |
| `express` | `^5.3.0` | Core backend HTTP framework and REST API router |
| `express-rate-limit` | `^8.7.2` | Protects AI polishing and public booking endpoints from brute-force floods |
| `express-session` | `^1.19.0` | HTTP session management with `HttpOnly`, `SameSite=Lax`, and `Secure` cookies |
| `helmet` | `^8.3.0` | Injects security headers (Content Security Policy, X-Frame-Options, HSTS) |
| `lucide-react` | `^1.24.0` | Professional icon library utilized across patient and provider dashboards |
| `mongoose` | `^9.7.4` | MongoDB Object Data Modeling (ODM) with connection pooling and schema validation |
| `multer` | `^2.5.0` | Handles multipart file streaming for audio session uploads |
| `react` | `^19.2.7` | Core frontend reactive user interface library |
| `react-dom` | `^19.2.7` | DOM rendering and portal integration for React 19 |
| `vite` | `^8.1.1` | Modern frontend build tool and development server |
| `vite-plugin-pwa` | `^1.3.0` | Generates service worker precache manifests and PWA webmanifest assets |

---

## 3. Developer & Build Dependencies (`devDependencies`)

| Package | Version | Usage |
| :--- | :--- | :--- |
| `@cloudflare/vite-plugin` | `^1.67.0` | Cloudflare Workers & Pages deployment build integration |
| `@types/react` | `^19.2.17` | TypeScript definitions for React components and JSX |
| `@types/react-dom` | `^19.2.3` | TypeScript definitions for React DOM methods |
| `concurrently` | `^10.0.3` | Runs Vite frontend and Express server concurrently in local development (`npm run dev`) |
| `nodemon` | `^3.1.14` | Hot-reloading development server for Node.js (`npm run dev:all`) |
| `oxlint` | `^1.71.0` | High-speed Rust-based code linter for checking syntax and unused variables (`npm run lint`) |
| `png-to-ico` | `^3.0.2` | Converts PNG icons to multi-resolution `favicon.ico` in `scripts/generate-favicons.cjs` |
| `sharp` | `^0.35.5` | High-performance image processing engine used solely for favicon generation |
| `wrangler` | `^4.158.0` | Cloudflare Workers CLI for deployment and previews |

---

## 4. Security Overrides (`overrides`)

| Package | Pinned Version | Security Reason |
| :--- | :--- | :--- |
| `proxy-addr` | `2.0.8` | Mitigates IP spoofing vulnerabilities by strictly parsing trusted proxies |
| `glob` | `^14.0.3` | Replaces vulnerable legacy globbing dependencies |
| `minimatch` | `^11.0.1` | Prevents ReDoS (Regular Expression Denial of Service) in pattern matching |
| `deepmerge` | `4.1.2` | Protects against prototype pollution vulnerabilities |

---

## 5. Security & Vulnerability Audit Results

Running `npm audit` against the synchronized lockfile reports:
```
up to date, audited 512 packages in 2s
found 0 vulnerabilities
```
* **Critical Vulnerabilities:** 0
* **High Vulnerabilities:** 0
* **Moderate Vulnerabilities:** 0
* **Low Vulnerabilities:** 0
