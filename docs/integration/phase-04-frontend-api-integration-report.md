# Phase 4 — Frontend and Backend API Integration Report

## 1. Executive Summary

Phase 4 addressed the communication and contract boundary between the React 19 frontend and the Node.js Express 5 backend across all deployment targets:
- Local Development (Vite Dev Server + local backend process)
- Vercel Preview Deployments (dynamic `*.vercel.app` branches)
- Vercel Production (`sagaelite.lk` or custom production domain)

Key fixes implemented:
1. **Vite Dev Server Proxy Trailing Slash Issue**: Changed restrictive `/api/v1/` proxy pattern to catch-all `/api` and `/health`, preventing 404s on webhook and un-versioned API routes.
2. **CORS Allowlist for Vercel Previews**: Added dynamic validation for Vercel preview URLs (`https://saga-elite*.vercel.app`) and Vercel system environment variables (`VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`).
3. **CORS Header Whitelist Fix**: Identified that `x-payment-email` (required by card payments) and `x-webhook-secret` were absent from `allowedHeaders`, which caused preflight rejections. Added both along with standard request headers.
4. **Error Handling & User Messaging**: Attached standardized `error.userMessage` to Axios errors to avoid empty or undefined toast notifications.

---

## 2. Vite Proxy Configuration

In `Client-Side/vite.config.js`, the proxy was previously declared as:
```javascript
// BEFORE (Bug: misses /api/webhooks, /api/v1 without slash, /health)
proxy: {
  '/api/v1/': { target: backendTarget, changeOrigin: true },
  '/socket.io': { target: backendTarget, changeOrigin: true, ws: true },
  '/Uploads': { target: backendTarget, changeOrigin: true },
}
```

Updated to:
```javascript
// AFTER (All backend routes correctly proxied)
proxy: {
  '/api': { target: backendTarget, changeOrigin: true },
  '/health': { target: backendTarget, changeOrigin: true },
  '/socket.io': { target: backendTarget, changeOrigin: true, ws: true },
  '/Uploads': { target: backendTarget, changeOrigin: true },
}
```

---

## 3. CORS Configuration & Header Whitelist

In `Server-side/Config/cors-config.js`:

### 3.1 Vercel Preview URLs
Vercel generates dynamic subdomains for every pull request (e.g. `https://saga-elite-web-project-git-fix-phase-02-xxx.vercel.app`).
We added `isVercelOrigin()` to safely validate that incoming requests with a `.vercel.app` domain originate from the authorized repository namespace:
```javascript
const isVercelOrigin = (origin) => {
  if (!origin || typeof origin !== "string") return false;
  const match = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/i.exec(origin);
  if (!match) return false;
  const subdomain = match[1].toLowerCase();
  return (
    subdomain.startsWith("saga-elite") ||
    subdomain.includes("sagaelite") ||
    subdomain.includes("hz-labs-studio")
  );
};
```

### 3.2 Whitelisted Headers
Added custom headers required by application features:
```javascript
allowedHeaders: [
  "Content-Type",
  "Authorization",
  "Accept",
  "Accept-Version",
  "X-Requested-With",
  "x-payment-email",    // Used by card payment and guest status checks
  "x-webhook-secret",   // Used by bank SMS and PayHere webhooks
  "x-guest-token",      // Used by guest session tracking
  "x-customer-id",      // Used by behavioral tracking
  "x-session-id",
]
```

---

## 4. Authentication & Axios Client Handling

`Client-Side/src/api/axiosInstance.js` and `Client-Side/src/lib/api.js`:
- Bearer tokens stored in `localStorage.getItem("authToken")` are automatically attached to outgoing requests.
- `withCredentials: true` ensures HttpOnly refresh cookies are also transmitted when available.
- 401 handling selectively invalidates tokens only when the session itself is dead (token expired or user deleted), preserving the user's session when business validation errors occur (e.g. incorrect password or expired coupon).
- Added `error.userMessage` to provide clear feedback on network or API failures.

---

## 5. File Upload Verification

Audited file upload flows in `Client-Side`:
- `uploadManualPaymentProof` (`/image/upload-receipt`)
- `submitManualPaymentReceipt` (`/manual-payment/submit-with-receipt`)
- `ImageUpload.jsx` (`/image/upload-image`)

All upload forms use `FormData` objects and stream directly to Cloudinary with fallbacks in non-serverless environments.

---

## 6. Environment Variable Mapping Matrix

| Variable | Scope | Description | Default / Example |
|---|---|---|---|
| `VITE_API_URL` | Frontend | Target API root for build | `/api` (or `https://backend.vercel.app/api`) |
| `VITE_BACKEND_TARGET` | Frontend (Dev) | Vite proxy target | `http://localhost:5001` |
| `VITE_SOCKET_URL` | Frontend | Socket.IO server URL | `http://localhost:5001` (or production URL) |
| `FRONTEND_URL` | Backend | Primary allowed CORS origin | `http://localhost:5173` |
| `FRONTEND_URLS` | Backend | Comma-separated CORS origins | `https://sagaelite.lk,https://www.sagaelite.lk` |
| `VERCEL_URL` | Platform | Auto-populated by Vercel | Dynamic preview URL |
