# Deleted & Relocated Files Report — Verdant Mind

**Platform:** Verdant Mind — Public Mental Health & Clinical Services Portal  
**Date:** November 6, 2026  
**Auditor:** Antigravity Autonomous Pair Programmer  

---

## 1. Overview of Deletions and Relocations

This report details every file that was permanently removed from the repository or relocated to a dedicated directory during the pre-deployment cleanup, including the justification, prior reference check, and safety assessment.

---

## 2. Permanently Removed Files

| File Path | Original Size | Category | Justification & Reference Check | Safety Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `src/App.css` | 184 lines (~3.8 KB) | Boilerplate CSS | Starter template styles for Vite (`.counter`, `#next-steps`, `.hero`). Checked all files in `src/`—never imported by `App.jsx`, `main.jsx`, or `index.html`. All portal styles live in `src/index.css` and `src/styles/`. | **Zero Impact.** Zero broken styles. |
| `src/assets/hero.png` | 13.0 KB | Obsolete Asset | Prototype hero image from early development. Checked whole repository via `git grep "hero.png"`—zero references. Public hero section utilizes custom CSS gradients and responsive typographic layouts. | **Zero Impact.** Image was dead weight. |
| `src/assets/react.svg` | 4.1 KB | Boilerplate Asset | Default React starter icon from Vite scaffolding. Zero references in any JSX or CSS file. | **Zero Impact.** Unused template file. |
| `src/assets/vite.svg` | 8.7 KB | Boilerplate Asset | Default Vite starter icon from Vite scaffolding. Zero references in any JSX or CSS file. | **Zero Impact.** Unused template file. |
| `src/styles/themes/botanical-theme.css` | 124 lines (~3.9 KB) | Abandoned Theme | Exploratory green/purple theme from early design phase. Unlisted in `src/styles/theme-config.js` (`THEMES = { CLASSIC: 'classic', LAVENDER_ROSE: 'lavender-rose' }`) and unimported in `src/index.css`. | **Zero Impact.** Application uses lavender-rose as authoritative theme with classic as backup. |

---

## 3. Relocated Files (Optimization & Archival)

### A. Public Assets Relocated Out of Production Distribution
| File Path (Before) | New Destination | Size | Reason for Relocation |
| :--- | :--- | :--- | :--- |
| `public/favicon-original-backup.png` | `scripts/favicon-original-backup.png` | 327.6 KB | Moving this backup image out of `public/` prevents Vite from copying 327 KB of redundant data into `dist/`. Updated `scripts/generate-favicons.cjs` to reference `path.join(__dirname, 'favicon-original-backup.png')`. |

### B. Operational Guides Relocated from Root to `docs/guides/`
| File Name | New Location | Description |
| :--- | :--- | :--- |
| `ADMIN_ACCESS_GUIDE.md` | `docs/guides/ADMIN_ACCESS_GUIDE.md` | Comprehensive admin role and credential management manual |
| `AWS_DEPLOYMENT_GUIDE.md` | `docs/guides/AWS_DEPLOYMENT_GUIDE.md` | S3 encrypted bucket and Secrets Manager deployment guide |
| `DATABASE_BACKUP_GUIDE.md` | `docs/guides/DATABASE_BACKUP_GUIDE.md` | MongoDB Atlas and local archive backup instructions |
| `DOMAIN_DNS_CONFIGURATION.md` | `docs/guides/DOMAIN_DNS_CONFIGURATION.md` | Custom DNS CNAME and SSL certificate verification manual |
| `ENVIRONMENT_VARIABLES.md` | `docs/guides/ENVIRONMENT_VARIABLES.md` | Production environment variable dictionary and guidelines |
| `GOOGLE_AUTH_SETUP.md` | `docs/guides/GOOGLE_AUTH_SETUP.md` | Google Cloud Console OAuth 2.0 configuration guide |
| `SECURITY_CHECKLIST.md` | `docs/guides/SECURITY_CHECKLIST.md` | Pre-launch security hardening and verification checklist |

### C. Historical Audit & Debugging Reports Relocated to `docs/reports/`
The following 47 historical debugging and audit reports were moved from the root folder into `docs/reports/` to preserve auditability while maintaining a clean root workspace:
1. `APPOINTMENT_WORKFLOW_TEST_REPORT.md`
2. `AUTHENTICATION_DEBUG_REPORT.md`
3. `BACKEND_API_BUG_REPORT.md`
4. `CHANGES_AND_FIXES.md`
5. `CODEBASE_DEBUG_AUDIT.md`
6. `COMPLETE_APPLICATION_DEBUG_REPORT.md`
7. `COMPLETE_TECHNICAL_AUDIT.md`
8. `COUNSELLING_MODULE_TEST_REPORT.md`
9. `COUNSELLOR_AVAILABILITY_REPORT.md`
10. `DATABASE_AND_STORAGE_AUDIT.md`
11. `DATABASE_INTEGRITY_REPORT.md`
12. `DATE_TIME_AUDIT_REPORT.md`
13. `DATE_TIME_IMPLEMENTATION_SUMMARY.md`
14. `DATE_TIME_REGRESSION_TEST_REPORT.md`
15. `DEPLOYMENT_GAP_REPORT.md`
16. `DOUBLE_BOOKING_SECURITY_REPORT.md`
17. `FINAL_REGRESSION_TEST_REPORT.md`
18. `FRONTEND_BUG_REPORT.md`
19. `HARDCODED_DATA_AUDIT.md`
20. `IST_TIMEZONE_IMPLEMENTATION_REPORT.md`
21. `MISSING_FEATURES_REPORT.md`
22. `MOBILE_RESPONSIVENESS_REPORT.md`
23. `P0_CRITICAL_REMEDIATION_REPORT.md`
24. `P0_DEPENDENCY_UPDATE_REPORT.md`
25. `P0_PRODUCTION_BLOCKER_REPORT.md`
26. `P0_SECURITY_TEST_REPORT.md`
27. `P1_API_RATE_LIMITING_REPORT.md`
28. `P1_DATABASE_BACKUP_REPORT.md`
29. `P1_DATABASE_INDEX_OPTIMIZATION_REPORT.md`
30. `P1_FILE_UPLOAD_SECURITY_REPORT.md`
31. `P1_HEALTH_MONITORING_REPORT.md`
32. `P1_IMPLEMENTATION_SUMMARY.md`
33. `P1_REGRESSION_TEST_REPORT.md`
34. `PERFORMANCE_OPTIMIZATION_REPORT.md`
35. `PHASE_1_SECURITY_REMEDIATION_REPORT.md`
36. `PHASE_2_PRODUCTION_HARDENING_REPORT.md`
37. `PRODUCTION_CONFIGURATION_REPORT.md`
38. `PRODUCTION_DEPLOYMENT_STATUS.md`
39. `PRODUCTION_IMPLEMENTATION_ROADMAP.md`
40. `PRODUCTION_READINESS_AUDIT.md`
41. `PRODUCTION_TEST_REPORT.md`
42. `PRODUCTION_TEST_RESULTS.md`
43. `PROJECT_AUDIT.md`
44. `SCHEDULING_CONFIGURATION_REPORT.md`
45. `SECURITY_AND_PRIVACY_AUDIT.md`
46. `SECURITY_GAP_REPORT.md`
47. `SECURITY_VULNERABILITY_REPORT.md`

---

## 4. Protected Files Intentionally Retained

The following sensitive and mission-critical files were audited and deliberately preserved:
* `server.js`: Complete production Express application and API routing.
* `render.yaml`: Production blueprint with IPv4 DNS ordering and domain resolution.
* `Dockerfile` & `docker-compose.yml`: Container definitions.
* `package.json` & `package-lock.json`: Production dependencies manifest and lockfile.
* `vite.config.js`: PWA manifest, service worker caching, and local API proxying.
* `.env.example`: Sanitized environment template for onboarding.
* `src/assets/sabuj-das.png`: Practitioner official profile portrait.
* `public/` web assets: `favicon.ico`, `favicon.png`, `apple-touch-icon.png`, `android-chrome-*.png`, `pwa-*.png`, `manifest.webmanifest`.
* `src/components/*`: All 16 healthcare UI and EMR components.
* `tests/run_tests.js`: 85-point automated verification suite.
* `.env`: Excluded by `.gitignore`; never committed to source control.
