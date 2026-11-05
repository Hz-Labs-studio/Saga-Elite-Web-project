# SAGA ELITE — PHASE 0 COMPLETE REPOSITORY AUDIT REPORT

**Date:** 2026-11-05  
**Repository:** https://github.com/Hz-Labs-studio/Saga-Elite-Web-project.git  
**Branch:** `chore/phase-00-repository-audit`  
**Target Architecture:** Frontend (Vercel) + Backend (Vercel Serverless / API) + Database (MongoDB Atlas) + Media (Cloudinary) + Payments (PayHere & Manual Bank Transfer)

---

## 1. Executive Summary

A comprehensive architectural and code audit of the Saga Elite repository was conducted across the root workspace, frontend client (`Client-Side`), backend service (`Server-side`), end-to-end test suite (`e2e`), CI workflows (`.github`), and documentation.

The core business logic of Saga Elite — product catalog, cart, checkout, manual payment receipt OCR, PayHere signatures, RBAC, and client UI — is functionally rich and well-structured. However, critical hosting incompatibilities, configuration errors, broken CI checks, committed build artifacts, and an absence of automated unit/integration tests prevent stable production deployment on Vercel.

---

## 2. Classification of Findings

### 2.1 Confirmed Errors

| # | Component | Location | Issue Description | Root Cause / Impact |
|---|---|---|---|---|
| **E1** | Backend Logging | `Server-side/Utils/logger.js`, `errorController.js`, `image-controller.js` | Direct calls to `fs.mkdirSync(logsDir)` and Winston `File` transports. | On Vercel, the filesystem is read-only (`EROFS`). Server crashes immediately on cold boot or first error. |
| **E2** | Backend Entrypoint | `Server-side/server.js` | Server calls `server.listen(PORT)` immediately on evaluation and does not export `app` or a serverless handler. | Incompatible with Vercel Serverless Functions; cannot be imported in test suites without occupying ports and starting listeners. |
| **E3** | Database Lifecycle | `Server-side/DataBase/db.js` | `connectToDB` calls `process.exit(1)` on connection failure; lacks connection promise caching across lambda invocations. | Crashes serverless execution environments; spawns redundant connection handshakes under concurrent traffic. |
| **E4** | Destructive Startup Tasks | `Server-side/server.js` (lines 280-305) | `runDeferredStartupTasks()` unconditionally executes `dropIndex("email_1")`, `deleteMany` on customers, and `syncIndexes()` on every server boot. | Risk of data loss and index thrashing on production startup; violates serverless stateless execution model. |
| **E5** | ESLint Script Failure | `Server-side/package.json` | Script `"lint": "eslint . --ext .js --ignore-path ../.gitignore"` fails on ESLint v9 (`--ext` and `--ignore-path` removed). | CI and local linting immediately terminate with exit code 1. |
| **E6** | Client ESLint Configuration | `Client-Side/eslint.config.js` | Only ignores `dist`. Does not ignore `.vite`, `node_modules`, or root configs; lacks Node environment globals for `vite.config.js` and `tailwind.config.js`. | Generates 827+ lint errors on committed `.vite` cache and build tools. |
| **E7** | Playwright Config Variable Shadowing | `e2e/playwright.config.js` (lines 8-15) | `const BASE_URL = process.env.E2E_BASE_URL;` is assigned before the fallback `process.env.E2E_BASE_URL` is assigned on line 14. | `BASE_URL` is `undefined` when running tests without an explicit shell env var, causing Playwright to fail navigating. |
| **E8** | Vite Dev Proxy Omissions | `Client-Side/vite.config.js` | Proxy only handles `/api/v1/`, `/socket.io`, `/Uploads`. Does not proxy `/api/webhooks/` or `/health`. | Local frontend requests to non-v1 API routes fail with 404. |
| **E9** | CI Error Suppression | `.github/workflows/ci.yml` | CI uses `|| true` on security audits and `|| echo "No tests configured"` on test steps. | Broken tests and high-severity security vulnerabilities pass silently. |
| **E10** | Missing Tests | `Server-side/package.json`, `Client-Side/package.json` | Server test script is dummy (`echo "No tests implemented yet"`). Client has no test script or framework. | Zero unit or integration test coverage for authentication, orders, or payments. |

---

### 2.2 Confirmed Unnecessary Files & Folders

| Path | Type | Size | Justification for Removal |
|---|---|---|---|
| `Client-Side/.vite/` | Directory | ~8.4 MB | Accidental git commit of local Vite dependency cache (`@reduxjs_toolkit.js`, `lucide-react.js`, sourcemaps). Should be ignored in `.gitignore`. |
| `Client-Side/build_output.txt` | File | 6.3 KB | Stale terminal build output log (UTF-16LE). Not referenced in code or scripts. |
| `Client-Side/build_output2.txt` | File | 5.8 KB | Stale terminal build output log (UTF-16LE). Not referenced in code or scripts. |
| `Client-Side/fix.cjs` | File | 348 B | One-off scratch script to strip markdown code fences from `MainHeader.jsx`. |
| `Client-Side/extract_components.cjs` | File | 1.6 KB | Temporary scratch script containing hardcoded local Copilot cache paths (`C:\Users\Admin\AppData\...`). |
| `Client-Side/prompt.txt` | File | 54.1 KB | Development prompt artifact containing 1,144 lines of raw text. Not code or asset. |
| `.netlify/` | Directory | ~100 B | Legacy Netlify CLI state (`state.json`). Obsolete for Vercel deployment. |
| `railway.json` | File | 306 B | Legacy Railway builder blueprint. Replaced by Vercel hosting. |
| `netlify.toml` | File | 1.5 KB | Legacy Netlify redirects and build config. Replaced by Vercel hosting. |
| `test-results/` | Directory | ~1 KB | Local test runner output (`.last-run.json`). Generated test artifact. |

---

### 2.3 Potential Issues Requiring Verification

| # | Item | Investigation Path | Resolution Plan |
|---|---|---|---|
| **P1** | `Server-side/eng.traineddata` (5.2 MB) | Tesseract OCR language training data. Check whether Tesseract.js loads this file locally or requires it offline. | Verify with OCR unit tests: if Tesseract.js requires local data path in offline/sandbox environments, configure path safely; if Tesseract.js uses internal cache, remove from git tracking. |
| **P2** | Socket.IO on Vercel | Vercel Serverless Functions do not support long-lived persistent WebSocket connections. | Assess whether real-time notifications require polling fallback, Pusher/Ably, or an external WebSocket daemon, while keeping socket service graceful on Vercel. |
| **P3** | Background Jobs in Serverless | `node-cron` and `setInterval` in `server.js` do not run persistently in frozen serverless functions. | Convert scheduled jobs (`aging-stock`, `cart-abandonment`, `recommendations`, `guest-promo`) into authenticated Vercel Cron API endpoints (`/api/cron/...`). |
| **P4** | Bank Inbox IMAP Watcher | `imapflow` connection loop in `bank-email-watcher.js` requires a continuous TCP socket. | Document external worker / daemon requirement, or provide a scheduled polling sync endpoint for bank reconciliation. |
| **P5** | Local Image Upload Fallback | `storeLocalImage` writes to local disk `Server-side/Uploads`. | Disable local disk fallback on production Vercel (`NODE_ENV === "production"`) and ensure Cloudinary credentials are strictly verified. |

---

### 2.4 Required Improvements

| Area | Scope of Improvement |
|---|---|
| **Vercel Backend Hosting** | Add root `vercel.json` or `Server-side/vercel.json` configuring Vercel serverless functions, URL rewrites (`/api/(.*)` -> `/Server-side/api/index.js`), Node 20 runtime, and environment passthrough. |
| **Database Connection** | Implement reusable serverless MongoDB connection pattern: cache `mongoose.connection` promise, set sensible serverless timeouts (`serverSelectionTimeoutMS: 5000`, `maxPoolSize: 5`), handle disconnects gracefully without calling `process.exit()`. |
| **CORS & Environment** | Ensure CORS allowlist dynamically handles preview Vercel domains (`https://*.vercel.app`) as well as production custom domains and local dev. |
| **Testing Architecture** | 1. Setup Vitest + Supertest + `mongodb-memory-server` for backend unit and integration tests.<br>2. Setup Vitest + React Testing Library for frontend unit tests.<br>3. Fix Playwright E2E configuration and expand scenarios for customer checkout, order tracking, and admin catalog management. |
| **CI/CD Pipeline** | Modernize `.github/workflows/ci.yml` using Actions v4, run linting, backend/frontend unit tests, integration tests against isolated MongoDB, production build, and Playwright E2E with artifact uploads. Remove all error suppression (`|| true`). |
| **Documentation** | Rewrite `README.md` and `DEPLOYMENT.md` for clean Vercel deployment, environment variable specifications, local dev commands, and architecture diagrams. |

---

### 2.5 Existing Working Functionality (Preserve Intact)

The following core business capabilities are confirmed functional and must be preserved:
1. **Catalog & Drops:** Category taxonomy, dynamic filters, brand identity, drops countdown, and product variants.
2. **Checkout & Cart:** Shipping zone calculations, coupon application, customer guest tracking, and cart persistence.
3. **Payments:** PayHere payment integration, checksum verification, manual bank transfer proof uploads, and automated receipt OCR analysis.
4. **Administration:** Role-based access control (Super Admin, Product Manager, Order Manager, Inventory Manager, Marketing Manager, Support Admin), bulk operations, and audit logs.
5. **AI Features:** Anthropic Claude review classification and recommendations digest.

---

## 3. Phase Completion Checklist

- [x] Initial full-repository inspection completed.
- [x] Confirmed errors, unnecessary files, potential issues, and working functionality documented.
- [x] Branch `chore/phase-00-repository-audit` created from `Development`.
- [x] Audit report added to repository.
