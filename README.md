# Saga Elite — Rare Fit Forever
*Sri Lankan Luxury Limited-Edition Streetwear & Atelier E-Commerce Platform*

[![CI Pipeline](https://github.com/Hz-Labs-studio/Saga-Elite-Web-project/actions/workflows/ci.yml/badge.svg)](https://github.com/Hz-Labs-studio/Saga-Elite-Web-project/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

---

## 1. Project Overview

**Saga Elite** is a modern full-stack fashion e-commerce platform built for high-demand, drop-based luxury streetwear collections in Sri Lanka. It combines high-performance storefront browsing with an enterprise-grade administrative suite covering inventory management, drops, real-time live drop notifications, bank transfer OCR receipt parsing, automated payment reconciliation, and granular role-based access control.

### Architecture Topology

```
                                  [ User Browser ]
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                 [ Vercel Frontend ]             [ Vercel Backend ]
                  React 19 / Vite SPA            Express 5 Serverless
               (https://sagaelite.com)        (https://api.sagaelite.com)
                         │                               │
                         │                   ┌───────────┼───────────┐
                         │                   ▼           ▼           ▼
                         │              [ MongoDB ] [Cloudinary] [PayHere]
                         │                Atlas       Media      Gateway
                         │                                           │
                         └───────────────── Webhook Callback ────────┘
```

---

## 2. Technology Stack

### Storefront & Admin Frontend (`Client-Side/`)
- **React 19** & **Vite 7** with Fast Refresh
- **Tailwind CSS 3.4** for custom luxury atelier design system
- **Redux Toolkit** for state management (auth, cart, catalog, live drops)
- **Framer Motion** for drop animations and page transitions
- **Socket.IO Client** with automatic polling fallback for serverless edge routers
- **Lucide React** icon library

### Serverless API Backend (`Server-side/`)
- **Node.js** (v18, v20, v22 compatible)
- **Express 5** decoupled application (`app.js` + `api/index.js`)
- **Mongoose 9** with global serverless connection pooling & index optimization
- **Winston** structured JSON logger with credential masking & Vercel console compatibility
- **Tesseract.js** & **pdf-parse** for automated bank transfer receipt OCR verification
- **Nodemailer** for transactional emails & notifications

### Infrastructure & Integrations
- **Hosting:** Vercel (Frontend SPA & Serverless Functions)
- **Database:** MongoDB Atlas (Managed Replica Set)
- **Media Storage:** Cloudinary
- **Payment Gateway:** PayHere (Credit/Debit Card) & Manual Bank Transfers
- **Scheduled Workers:** Vercel Cron (`/api/v1/cron/*`) secured with `CRON_SECRET`
- **AI Engine:** Anthropic Claude (Admin AI Insights & review sentiment moderation)

---

## 3. Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (>= 18.0.0; recommended: 20.x or 22.x)
- [npm](https://www.npmjs.com/) (>= 9.0.0)
- [Git](https://git-scm.com/)
- Local MongoDB or MongoDB Atlas cluster URI

### Step 1: Clone and Install Dependencies
This project uses **npm workspaces** to manage both packages from the repository root:
```bash
git clone https://github.com/Hz-Labs-studio/Saga-Elite-Web-project.git
cd Saga-Elite-Web-project
npm install
```

### Step 2: Configure Environment Variables
Copy the root example template:
```bash
cp .env.example .env
```
Ensure the minimum required variables are configured:
```ini
NODE_ENV=development
PORT=5001
MONGO_DB_URI=mongodb://127.0.0.1:27017/sagaelite
JWT_SECRET=development-jwt-secret-key-at-least-32-chars-long
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

### Step 3: Seed Database Fixtures
Seed the database with initial categories, demo admin accounts, and legal policies:
```bash
# Seed demo admin credentials (super_admin, admin, order_manager, etc.)
npm run seed:demo-admins

# Seed legal policies (Terms, Privacy, Refund, Shipping)
npm run seed:legal

# Optional: Seed category taxonomy and dummy reviews
npm --prefix Server-side run seed:categories
npm --prefix Server-side run seed:reviews
```

### Step 4: Run Development Servers
Start both backend (port 5001) and frontend (port 5173) concurrently:
```bash
npm run dev
```
- Storefront & Admin: <http://localhost:5173>
- Backend API Healthcheck: <http://localhost:5001/health>

---

## 4. Testing Suite Guide

Saga Elite includes a comprehensive, multi-tiered testing battery with **100% pass rate**:

### Run Unit Tests
Executes 35 isolated unit tests across backend models, auth signing, PayHere hashes, and frontend Redux stores:
```bash
npm run test:unit
```

### Run API Integration Tests
Executes 24 Supertest integration tests verifying Express routes, authentication guards, RBAC permissions, PayHere webhooks, error handling, and Vercel Cron jobs:
```bash
npm run test:integration
```

### Run All Tests (Unit + Integration)
```bash
npm test
```

### Run End-to-End Tests (Playwright)
Executes browser smoke tests and permission gating across real Chromium instances:
```bash
npm run test:e2e
```

### Run Linter
Validates code quality and formatting with ESLint v9:
```bash
npm run lint
```

### Build Production Bundle
Tests the Vite production bundling:
```bash
npm run build
```

---

## 5. API Overview

| Method | Endpoint | Description | Auth Required? |
|---|---|---|---|
| `GET` | `/health` | High-speed serverless health & DB status | No |
| `POST` | `/api/v1/auth/register` | Customer account registration | No |
| `POST` | `/api/v1/auth/login` | Email/password login | No |
| `GET` | `/api/v1/user/me` | Fetch active user profile | Bearer Token / Cookie |
| `GET` | `/api/v1/products` | Paginated product catalog | No |
| `GET` | `/api/v1/drops` | Active & upcoming drops | No |
| `POST` | `/api/v1/orders` | Create an order | Customer / Guest |
| `POST` | `/api/webhooks/payhere` | PayHere server-to-server IPN | MD5 Signature Verified |
| `POST` | `/api/v1/cron/*` | Scheduled jobs (cleanup, reminders) | `Bearer <CRON_SECRET>` or `x-vercel-cron` |
| `GET` | `/api/v1/admin/*` | Administrative endpoints | Admin Role & Permissions |
| `GET` | `/api/v1/super-admin/*` | Super Admin operations | `super_admin` Role |

---

## 6. Vercel Deployment

For complete, step-by-step production deployment instructions, refer to **[DEPLOYMENT.md](DEPLOYMENT.md)**.

Quick deployment summary:
1. **Backend:** Deploy repository root to Vercel as `saga-elite-backend`. Root `vercel.json` automatically configures `api/index.js` as the serverless function handler and establishes cron schedules.
2. **Frontend:** Deploy `Client-Side/` to Vercel as `saga-elite-frontend`. `Client-Side/vercel.json` provides SPA routing rewrites.
3. Configure environment variables in the Vercel dashboard according to the [Environment Variable Matrix](DEPLOYMENT.md#32-backend-environment-variables-matrix).

---

## 7. Mandatory Git Workflow & Branch Strategy

The repository operates on a strict multi-tier branch model:

```
[ Feature / Fix Branch ] ──────(PR & Checks)──────> [ Development ] ──────(Release)──────> [ main ]
```

- **`main`**: Production-ready, stable deployments only.
- **`Development`**: Central integration branch. All phase branches merge here via pull requests.
- **Never push directly to `main` or `Development` without testing and review.**
- Commit messages follow the **Conventional Commits** specification (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

---

## 8. License & Authors

Developed by **Hajith Mohamed** for **Saga Elite Limited Edition Fashion**.  
Licensed under the ISC License.
