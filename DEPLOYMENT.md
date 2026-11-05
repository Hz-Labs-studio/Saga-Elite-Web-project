# Saga Elite — Production Vercel Deployment Guide

This guide provides definitive, production-grade instructions for deploying Saga Elite to **Vercel** for both Frontend and Backend, backed by **MongoDB Atlas**, **Cloudinary**, and **PayHere**.

---

## 1. Architecture & Hosting Topology

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

| Layer | Platform | Architecture | Configuration File |
|---|---|---|---|
| **Frontend** | Vercel | Single Page Application (React 19 + Vite + Tailwind) | `Client-Side/vercel.json` |
| **Backend** | Vercel | Serverless Express Function (`api/index.js`) | `vercel.json` |
| **Database** | MongoDB Atlas | M0 / Dedicated Managed Replica Set | `Server-side/DataBase/db.js` |
| **Media Storage** | Cloudinary | Asset Upload & CDN Delivery | `Server-side/Utils/image-upload.js` |
| **Payments** | PayHere | Card Gateway + Webhook Verification | `Server-side/Utils/payhere-service.js` |
| **Cron Jobs** | Vercel Cron | Scheduled Invocations (Crons array in `vercel.json`) | `Server-side/Routes/cron-routes.js` |

---

## 2. Prerequisites & Pre-Deployment Checklist

Before deploying to Vercel, ensure you have:
1. A **Vercel** account (<https://vercel.com>).
2. A **MongoDB Atlas** cluster with Network Access configured (0.0.0.0/0 or AWS region peering).
3. A **Cloudinary** account with API Key and Secret.
4. A **PayHere** Merchant Account (Merchant ID & Secret).
5. A generated 32+ character string for `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
6. A generated 32+ character string for `CRON_SECRET`.

---

## 3. Backend Deployment (Vercel Serverless Function)

The backend runs as a serverless Node.js Express 5 function defined in `api/index.js` and configured via root `vercel.json`.

### 3.1 Project Settings in Vercel
- **Project Name:** `saga-elite-backend` (or custom name)
- **Framework Preset:** Other
- **Root Directory:** `./` (Repository root)
- **Node.js Version:** `20.x` or `22.x`
- **Build Command:** *(leave empty)*
- **Output Directory:** *(leave empty)*

### 3.2 Backend Environment Variables Matrix

| Variable | Description | Required? | Production Value / Example |
|---|---|---|---|
| `NODE_ENV` | Environment mode | **Yes** | `production` |
| `MONGO_DB_URI` | MongoDB Atlas Connection String | **Yes** | `mongodb+srv://<user>:<password>@cluster.mongodb.net/sagaelite?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret key for JWT signing (>= 32 chars) | **Yes** | *(generated 64-char hex)* |
| `JWT_EXPIRES_IN` | Access token lifespan | No | `7d` (default: 7d) |
| `FRONTEND_URL` | Canonical origin of your Frontend | **Yes** | `https://sagaelite.com` |
| `FRONTEND_URLS` | Comma-separated preview / alternate domains | No | `https://saga-elite-web-project.vercel.app` |
| `CRON_SECRET` | Bearer token for Vercel Cron authentication | **Yes** | *(generated secret string)* |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | **Yes** | `saga-elite` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | **Yes** | `918273645123456` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | **Yes** | `AbCdEf123456` |
| `PAYHERE_MERCHANT_ID` | PayHere Merchant Identifier | **Yes** | `1234567` |
| `PAYHERE_MERCHANT_SECRET` | PayHere Merchant Secret | **Yes** | *(from PayHere portal)* |
| `PAYHERE_SANDBOX` | Use PayHere sandbox gateway | No | `false` (in live prod) / `true` (in staging) |
| `PAYHERE_NOTIFY_URL` | Public callback URL for PayHere IPN | **Yes** | `https://api.sagaelite.com/api/webhooks/payhere` |
| `SMTP_HOST` | SMTP Host for transactional emails | Optional | `smtp.resend.com` / `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP Port | Optional | `587` |
| `SMTP_USER` | SMTP Username | Optional | `resend` |
| `SMTP_PASS` | SMTP Password / API Key | Optional | *(SMTP key)* |
| `FROM_EMAIL` | Sender email address | Optional | `noreply@sagaelite.com` |
| `FROM_NAME` | Sender display name | Optional | `Saga Elite Atelier` |
| `ANTHROPIC_API_KEY` | Claude API key for AI Insights | Optional | *(Anthropic API Key)* |

---

## 4. Frontend Deployment (Vercel SPA)

The frontend is a Vite + React 19 application located in the `Client-Side/` workspace.

### 4.1 Project Settings in Vercel
- **Project Name:** `saga-elite-frontend`
- **Framework Preset:** Vite
- **Root Directory:** `Client-Side`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### 4.2 Frontend Environment Variables

| Variable | Description | Value / Example |
|---|---|---|
| `VITE_API_URL` | Base URL pointing to the deployed Backend API | `https://api.sagaelite.com/api` (or `/api` if using reverse proxy rewrite) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Web Client ID | `123456-abc.apps.googleusercontent.com` |
| `VITE_FACEBOOK_APP_ID` | Facebook App ID (Optional) | `1234567890` |

---

## 5. MongoDB Atlas Connection Pooling & Reliability

Because Vercel executes the backend as serverless functions, database connections must be pooled and cached across invocations within the same Lambda container:

- **Connection Caching:** Configured in `Server-side/DataBase/db.js` using `global.__mongooseConnectionCache`.
- **Pool Sizing:**
  - `maxPoolSize: 5` (for serverless to avoid exhausting Atlas M0/M10 connection limits).
  - `minPoolSize: 0` (allows idle serverless containers to spin down without holding sockets).
- **Timeouts:**
  - `serverSelectionTimeoutMS: 5000`
  - `connectTimeoutMS: 10000`
  - `socketTimeoutMS: 45000`
- **Automatic Retries:** Enabled with connection state detection (`readyState === 1`).

---

## 6. PayHere Webhook Configuration

PayHere sends IPN (Instant Payment Notification) server-to-server callbacks when a customer pays via card:

1. **Callback Route:**
   - Both `/api/webhooks/payhere` and `/api/v1/payhere/notify` are active.
2. **Signature Verification:**
   - Handled with `crypto.timingSafeEqual` against the MD5 hash generated with `PAYHERE_MERCHANT_SECRET`.
3. **Notify URL Setup in PayHere Merchant Portal:**
   - Navigate to **PayHere Merchant Portal → Settings → Domains & Credentials**.
   - Set **Notification URL** to:
     `https://<your-backend-domain>/api/webhooks/payhere`

---

## 7. Vercel Cron Jobs Setup

Vercel Crons trigger scheduled background workers at declared intervals via HTTP calls.

### 7.1 Schedules in `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/v1/cron/cleanup-expired-payments",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/v1/cron/aging-stock",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/v1/cron/cart-abandonment",
      "schedule": "0 */4 * * *"
    },
    {
      "path": "/api/v1/cron/guest-promo",
      "schedule": "0 10 * * *"
    },
    {
      "path": "/api/v1/cron/recommendations-digest",
      "schedule": "0 8 * * 0"
    }
  ]
}
```

### 7.2 Authorization
All cron endpoints require either:
- The standard `x-vercel-cron: "1"` header attached automatically by Vercel's Cron scheduler.
- An `Authorization: Bearer <CRON_SECRET>` header matching the environment variable `CRON_SECRET`.

---

## 8. Custom Domains & DNS Setup

To connect custom domains:

1. **Backend API (`api.sagaelite.com`):**
   - Vercel Dashboard → `saga-elite-backend` → Settings → Domains.
   - Add `api.sagaelite.com`.
   - Add DNS `CNAME` record pointing `api` to `cname.vercel-dns.com`.

2. **Frontend Storefront (`sagaelite.com`):**
   - Vercel Dashboard → `saga-elite-frontend` → Settings → Domains.
   - Add `sagaelite.com` and `www.sagaelite.com`.
   - Add DNS `A` record pointing `@` to `76.76.21.21` and `CNAME` for `www` to `cname.vercel-dns.com`.

---

## 9. Rollback & Troubleshooting Procedures

### 9.1 Immediate Rollback
1. Go to **Vercel Dashboard → Deployments**.
2. Locate the last stable deployment.
3. Click the three dots menu `...` → **Instant Rollback**.
4. Traffic is rerouted in < 3 seconds without a rebuild.

### 9.2 Common Errors & Fixes
- **500 `JWT_SECRET is required` or `< 32 characters`:** Ensure `JWT_SECRET` is set in Vercel project environment variables and contains at least 32 characters.
- **504 Gateway Timeout:** Check MongoDB Atlas Network Access; ensure `0.0.0.0/0` is whitelisted.
- **CORS Rejected on Preview Deployments:** Ensure preview domains match `https://saga-elite*.vercel.app` (handled automatically by `Config/cors-config.js`).
- **PayHere 403 Invalid Signature:** Verify `PAYHERE_MERCHANT_SECRET` in Vercel matches your PayHere Merchant portal setting exactly.
