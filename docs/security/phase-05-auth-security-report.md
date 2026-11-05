# Phase 5 — Authentication, Payment, and Security Report

## 1. Executive Summary

Phase 5 audited and hardened authentication, payment processing, role-based access control (RBAC), and security middleware across the Saga Elite platform.

Key findings and fixes:
1. **Critical JWT Expiration Bug Fixed**: `signToken()` previously passed `expiresIn: process.env.JWT_EXPIRES_IN` without a fallback; if the environment variable was omitted, `jsonwebtoken` threw an uncaught TypeError that crashed auth routes. We added a safe `"7d"` fallback matching cookie expiration.
2. **Runtime Security Validation**: `validateRuntimeConfig()` verifies that `JWT_SECRET` is at least 32 characters in production, preventing weak secrets, while providing a safe fallback in local/test environments so tests do not crash without `.env`.
3. **PayHere Signature Validation**: Validated the complete MD5 double-hashing algorithm (`crypto.timingSafeEqual` constant-time comparison) preventing amount tampering and replay attacks.
4. **Rate Limiting Hardening**: Added test-environment bypass (`isTest ? 100000 : ...`) to prevent automated integration test suites from hitting HTTP 429 errors.
5. **RBAC & Granular Permissions**: Validated the permission hierarchy (`super_admin` > `admin` > `sub_admin` > `customer`) with individual permission flags (`products`, `orders`, `users`, `verifyPayments`).

---

## 2. Authentication Architecture

### 2.1 Dual Auth Transport Model
- **Mobile / SPA Direct Calls**: Transmit JWT via `Authorization: Bearer <token>` in request headers (stored in `localStorage.authToken`).
- **Web Browser Navigation**: Transmit JWT via HttpOnly cookies (`token` cookie with `sameSite: none` / `secure: true` in production, `sameSite: lax` in local dev).
- **Session Cleanup on Logout**: Sets cookie to `"loggedout"` with immediate expiry. `authMiddleware` rejects `"loggedout"` explicitly to avoid token parsing.

### 2.2 Token Expiration & Signing
In `Server-side/Utils/signin-token.js`:
```javascript
const signToken = (id) => {
    return jwt.sign(
        { id },
        process.env.JWT_SECRET || "development-jwt-secret-key-at-least-32-chars-long",
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        }
    );
};
```

---

## 3. PayHere Payment Integration

### 3.1 Double-Hash Verification
The PayHere integration validates callbacks using MD5 double-hashing:
$$\text{localSig} = \text{MD5}(\text{merchant\_id} + \text{order\_id} + \text{payhere\_amount} + \text{payhere\_currency} + \text{status\_code} + \text{MD5}(\text{secret}))$$

All signatures are checked via `crypto.timingSafeEqual` to prevent timing attacks.

### 3.2 Idempotency & Tampering Defense
- PayHere notify requests with amount or currency mismatches are rejected with HTTP 403.
- Duplicate notifications on already-verified orders update the audit payload and return HTTP 200 without duplicate credit or multiple emails.

---

## 4. Role-Based Access Control (RBAC)

Hierarchy defined in `Server-side/Utils/admin-roles.js`:
- `super_admin` / `superadmin`: Unrestricted access to all admin routes, system settings, and user management.
- `admin`: Standard administrator; access to catalog, orders, and customer management.
- `sub_admin`: Constrained administrator; gated by fine-grained boolean flags in `user.permissions`:
  - `products`, `orders`, `users`, `notifications`, `drops`, `verifyPayments`, `manageReviews`, `viewAnalytics`, `sendCampaigns`, `manageInventory`, `manageAdmins`.
- `customer` / `user`: Standard shoppers. Blocked from `/api/v1/admin/*` and `/api/v1/super-admin/*` with HTTP 403.

---

## 5. Security Middlewares

1. **Helmet**: Configured with `crossOriginOpenerPolicy: false` to allow popup-based Google OAuth while protecting against clickjacking, sniffing, and XSS.
2. **Rate Limiting**:
   - `authLimiter`: 60 requests per 15 minutes.
   - `loginLimiter`: 25 requests per 15 minutes.
   - `contactLimiter`: 15 requests per 60 minutes.
   - `generalLimiter`: 500 requests per 15 minutes.
   - Test mode bypass: 100,000 requests to support CI/CD runs.
3. **Payload Sanitization**: `express.json({ limit: "10kb" })` prevents memory exhaustion attacks on API routes.
