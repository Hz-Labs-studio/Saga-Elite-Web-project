# Phase 3 — MongoDB and Database Reliability Report

## 1. Executive Summary

In Phase 3, we hardened the database layer across the entire Saga Elite application. We resolved critical connection pooling vulnerabilities, eliminated cold-start connection duplication in Vercel Serverless environments, removed schema index duplication in Mongoose models, and introduced automatic URI normalization and credential masking for production logging.

All 28 models now pass index audits with zero duplicate indexes, zero collision warnings, and backward-compatible data schemas.

---

## 2. Architecture & Connection Lifecycle

### 2.1 Serverless Connection Caching
In serverless environments (AWS Lambda / Vercel Functions), concurrent requests during cold starts or warm container reuse can trigger multiple connection handshakes unless connection promises are memoized across container re-executions.

We implemented a global connection cache:
```javascript
let cached = global.__mongooseConnectionCache;
if (!cached) {
  cached = global.__mongooseConnectionCache = { conn: null, promise: null };
}
```
- **Hot Container Reuse:** If `mongoose.connection.readyState === 1`, the existing connection is returned instantly (0ms latency).
- **Concurrent In-Flight Cold Starts:** If a connection handshake is currently executing, subsequent requests await `cached.promise` rather than initiating redundant sockets.
- **Auto-Reconnection:** On disconnection or error, `cached.conn` and `cached.promise` reset to `null` so the next request reconnects transparently.

### 2.2 Connection Pooling & Timeouts
Configured options in `Server-side/DataBase/db.js`:
| Setting | Serverless (Vercel) | Persistent (Local/Docker) | Purpose |
|---|---|---|---|
| `maxPoolSize` | 5 | 10 | Prevents Atlas connection exhaustion under high concurrency |
| `minPoolSize` | 0 | 1 | Allows idle sockets to drain in frozen serverless containers |
| `serverSelectionTimeoutMS` | 5000 | 5000 | Fails fast (5s) instead of hanging 30s when cluster is unreachable |
| `connectTimeoutMS` | 10000 | 10000 | Bounds socket handshake timeout |
| `socketTimeoutMS` | 45000 | 45000 | Prevents orphaned queries from hanging indefinitely |
| `autoIndex` | `false` (in prod) | `true` (in dev) | Prevents slow startup index builds on cold starts |
| `bufferCommands` | `true` | `true` | Allows queries during initial 200ms connection handshake |

---

## 3. URI Normalization, Validation & Safe Logging

### 3.1 Normalization
Atlas connection strings frequently omit the database path (e.g. `mongodb+srv://cluster.net/?retryWrites=true`). `normalizeMongoUri()` ensures `/sagaelite` is cleanly inserted before query parameters without corrupting connection options.

### 3.2 Credential Masking
`sanitizeMongoUri()` replaces all credentials with `***:***` (e.g., `mongodb+srv://***:***@cluster.net/sagaelite?retryWrites=true`), preventing password leakage into Vercel log streams or monitoring tools.

### 3.3 Placeholder Detection
`validateMongoUri()` proactively identifies unconfigured placeholder tokens such as `<username>`, `<password>`, `<credentials>`, or `<db_password>` and throws a clear actionable error instead of failing with generic authentication or DNS errors.

---

## 4. Model Index Audit & Fixes

Audited all 28 Mongoose models in `Server-side/models/`:

| Model | Finding | Resolution |
|---|---|---|
| `Guest.js` | Duplicate index key `{"email": 1}` declared on property definition (`unique: true`) and redundant `guestSchema.index({ email: 1 })`. Redundant `index: true` on `guestToken`. | Removed duplicate index statement and redundant field index. |
| `ManualPayment.js` | Duplicate index key `{"expiresAt": 1}` declared both inline at property definition and via `manualPaymentSchema.index({ expiresAt: 1 })`. | Removed duplicate schema index statement. |
| `Customer.js` | Unique indexes on `email`, `guestId`, `userId`, `guestToken` verified using `partialFilterExpression` to prevent duplicate null key collisions (`E11000`). | Validated partial filter expressions. Retained safe migration script `migrate-customer-email-index.js`. |
| All 28 Models | Re-scanned after fixes. | **100% clean — zero duplicate index definitions.** |

---

## 5. Graceful Lifecycle & Test Helpers

Exported utility functions in `Server-side/DataBase/db.js`:
- `connectToDB()`: Resolves active or cached Mongoose connection.
- `disconnectDB()`: Cleanly disconnects and clears cache (used by Vitest/Jest integration tests and migration scripts).
- `getConnectionStatus()`: Returns `{ state, readyState, host, database }` for `/health` healthchecks.
- Process handlers for `SIGINT` and `SIGTERM` in persistent server mode close connections gracefully without leaving dangling sockets on MongoDB Atlas.

---

## 6. Recommended MongoDB Atlas Configuration

For production deployment on Vercel:

```env
MONGO_DB_URI="mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/sagaelite?retryWrites=true&w=majority"
```

- **Network Access:** Add `0.0.0.0/0` (Allow Access from Anywhere) in MongoDB Atlas Network Access settings, or use MongoDB Atlas AWS peering if using dedicated AWS infrastructure. Vercel serverless IP addresses are dynamic.
- **Database User:** Create a dedicated database user with `readWrite` access to the `sagaelite` database.
