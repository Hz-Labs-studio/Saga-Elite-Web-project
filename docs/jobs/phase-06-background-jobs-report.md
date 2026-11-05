# Phase 6 — Background Jobs and Real-Time Features Report

## 1. Executive Summary

Phase 6 reviewed all background processes, schedulers, workers, and real-time Socket.IO communication to establish a resilient architecture that supports both persistent servers (Docker / Local / VPS) and Vercel Serverless deployments.

Key implementations:
1. **Scheduled Cron Endpoints**: Created authenticated routes in `Server-side/Routes/cron-routes.js` mapped to `/api/v1/cron/*` for Vercel Cron execution.
2. **Cron Authentication**: Protected cron endpoints with `CRON_SECRET` Bearer token authentication and `x-vercel-cron` header validation.
3. **Continuous Worker Architecture (IMAP Bank Watcher)**: Provided dual execution paths: persistent `setInterval` poller for dedicated worker environments and single-sweep cron endpoint (`/api/v1/cron/bank-inbox-sweep`), plus the push-based webhook `/api/webhooks/bank-sms`.
4. **Socket.IO Graceful Degradation**: Enhanced `Client-Side/src/lib/socket.js` to enable HTTP long-polling fallback (`transports: ["polling", "websocket"]`), bounded reconnect attempts, and silent error handling when real-time services are unavailable.

---

## 2. Background Process Classification

| Process | Mode | Default Schedule | Serverless Execution Path |
|---|---|---|---|
| `cleanup-expired-payments` | Scheduled | Hourly (`0 * * * *`) | `/api/v1/cron/cleanup-expired-payments` |
| `aging-stock` | Scheduled | Daily 02:00 (`0 2 * * *`) | `/api/v1/cron/aging-stock` |
| `cart-abandonment` | Scheduled | Every 4h (`0 */4 * * *`) | `/api/v1/cron/cart-abandonment` |
| `guest-promo` | Scheduled | Daily 10:00 (`0 10 * * *`) | `/api/v1/cron/guest-promo` |
| `recommendations-digest` | Scheduled | Weekly Sunday 08:00 (`0 8 * * 0`) | `/api/v1/cron/recommendations-digest` |
| `bank-email-watcher` | Continuous / Polling | Every 2 min | External worker OR `/api/v1/cron/bank-inbox-sweep` |
| `bank-sms` | Event-Driven | On demand | Webhook: `/api/webhooks/bank-sms` |
| `payhere-notify` | Event-Driven | On demand | Webhook: `/api/webhooks/payhere` |

---

## 3. Vercel Cron Configuration

Declared in root `vercel.json` and `Server-side/vercel.json`:
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
    }
  ]
}
```

### Authorization
All cron endpoints require the `Authorization: Bearer <CRON_SECRET>` header in production.

---

## 4. Real-Time Communication (Socket.IO)

### 4.1 Serverless Safety
In `Server-side/Utils/socket-service.js`, all broadcast methods (`emitToAll`, `emitToUser`, `emitToAdmins`) safely verify `ioInstance`:
```javascript
const emitToAll = (eventName, payload) => {
  if (!ioInstance) return;
  ioInstance.emit(eventName, payload);
};
```
In serverless function instances where no WebSocket server is running, calls return silently without throwing unhandled exceptions.

### 4.2 Client Reconnection & Fallback
In `Client-Side/src/lib/socket.js`:
- `transports: ["polling", "websocket"]` allows graceful fallback to HTTP long-polling.
- `reconnectionAttempts: 5` stops aggressive connection looping in production when an external socket daemon is not configured.
- `connect_error` events are captured cleanly without polluting user-facing error boundaries.
