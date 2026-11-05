const mongoose = require("mongoose");
const logger = require("../Utils/logger");

/**
 * Global connection cache to persist connection across serverless invocations
 * and hot-reloads within the same Node process.
 */
let cached = global.__mongooseConnectionCache;
if (!cached) {
  cached = global.__mongooseConnectionCache = { conn: null, promise: null };
}

/**
 * Masks sensitive user credentials from MongoDB connection URI for safe logging.
 * Example: mongodb+srv://admin:pass123@cluster.net/db -> mongodb+srv://***:***@cluster.net/db
 */
const sanitizeMongoUri = (uri) => {
  if (!uri || typeof uri !== "string") return "";
  return uri.replace(/\/\/[^@/]+@/, "//***:***@");
};

/**
 * Normalizes MongoDB URI by ensuring a default database name is present
 * before any connection query options.
 */
const normalizeMongoUri = (uri, defaultDb = "sagaelite") => {
  if (!uri || typeof uri !== "string") return uri;
  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/?#]+)(\/[^?#]*)?(\?.*)?$/i);
  if (!match) return uri;
  const base = match[1];
  let dbPath = match[2];
  const query = match[3] || "";
  if (!dbPath || dbPath === "/") {
    dbPath = `/${defaultDb}`;
  }
  return `${base}${dbPath}${query}`;
};

/**
 * Checks whether the URI contains unconfigured placeholder tokens like <password> or <username>.
 */
const hasPlaceholderTokens = (uri) => {
  if (!uri || typeof uri !== "string") return false;
  return /<.*>|<credentials>|<username>|<password>|<db_password>/.test(uri);
};

/**
 * Validates the MongoDB URI syntax and configuration.
 */
const validateMongoUri = (uri) => {
  if (!uri || typeof uri !== "string") {
    return { valid: false, reason: "MONGO_DB_URI is missing or not a string" };
  }
  if (!/^(mongodb|mongodb\+srv):\/\//i.test(uri)) {
    return { valid: false, reason: "MONGO_DB_URI must begin with mongodb:// or mongodb+srv://" };
  }
  if (hasPlaceholderTokens(uri)) {
    return { valid: false, reason: "MONGO_DB_URI contains unconfigured placeholder tokens (e.g., <password>)" };
  }
  return { valid: true };
};

/**
 * Connect to MongoDB with connection pooling, serverless caching, and retry logic.
 */
const connectToDB = async () => {
  // 1. If connection already open and ready, reuse it immediately
  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose.connection;
    return cached.conn;
  }

  // 2. If a connection attempt is in-flight, await the existing promise
  if (cached.promise) {
    logger.debug("Reusing in-flight MongoDB connection promise");
    cached.conn = await cached.promise;
    return cached.conn;
  }

  let mongoUri = process.env.MONGO_DB_URI;
  const validation = validateMongoUri(mongoUri);

  if (!validation.valid) {
    if (process.env.NODE_ENV !== "production") {
      const fallback = "mongodb://127.0.0.1:27017/sagaelite";
      logger.warn(
        `MONGO_DB_URI invalid (${validation.reason}); falling back to local MongoDB for development/testing`,
        { fallback }
      );
      mongoUri = fallback;
    } else {
      const err = new Error(`Database connection configuration error: ${validation.reason}`);
      logger.error(err.message);
      if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
        process.exit(1);
      }
      throw err;
    }
  }

  mongoUri = normalizeMongoUri(mongoUri);
  const safeUri = sanitizeMongoUri(mongoUri);

  logger.info("Attempting to connect to MongoDB", { target: safeUri });

  const isServerless = Boolean(process.env.VERCEL);
  const isProduction = process.env.NODE_ENV === "production";

  const opts = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: isServerless ? 5 : 10,
    minPoolSize: isServerless ? 0 : 1,
    autoIndex: !isProduction, // Disable automatic index builds in production for faster cold starts
    bufferCommands: true,
  };

  cached.promise = mongoose
    .connect(mongoUri, opts)
    .then((m) => {
      logger.info("MongoDB connected successfully", {
        database: m.connection.db?.databaseName || "sagaelite",
        host: m.connection.host,
      });

      // Bind connection event listeners once
      if (!m.connection.__listenersBound) {
        m.connection.__listenersBound = true;

        m.connection.on("error", (err) => {
          logger.error("MongoDB connection error", { error: err?.message || String(err) });
          cached.conn = null;
          cached.promise = null;
        });

        m.connection.on("disconnected", () => {
          logger.warn("MongoDB disconnected; will attempt to reconnect on next use");
          cached.conn = null;
          cached.promise = null;
        });

        m.connection.on("reconnected", () => {
          logger.info("MongoDB reconnected successfully");
          cached.conn = m.connection;
        });
      }

      cached.conn = m.connection;
      return cached.conn;
    })
    .catch(async (error) => {
      cached.conn = null;
      cached.promise = null;

      logger.error("MongoDB connection failed", {
        error: error.message,
        attemptedUri: safeUri,
      });

      // Non-production local fallback attempt
      if (
        process.env.NODE_ENV !== "production" &&
        mongoUri !== "mongodb://127.0.0.1:27017/sagaelite"
      ) {
        const localFallback = "mongodb://127.0.0.1:27017/sagaelite";
        logger.warn("Attempting local MongoDB fallback after connection failure", {
          fallback: localFallback,
        });

        try {
          const fallbackM = await mongoose.connect(localFallback, opts);
          logger.info("MongoDB local fallback connected successfully", {
            database: fallbackM.connection.db?.databaseName || "sagaelite",
            host: fallbackM.connection.host,
          });
          cached.conn = fallbackM.connection;
          return cached.conn;
        } catch (fallbackError) {
          logger.error("Local MongoDB fallback also failed", {
            error: fallbackError.message,
          });
        }
      }

      if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
        process.exit(1);
      }
      throw error;
    });

  cached.conn = await cached.promise;
  return cached.conn;
};

/**
 * Gracefully disconnect from MongoDB (used by tests, seeders, and shutdown handlers).
 */
const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
    logger.info("MongoDB disconnected gracefully");
  }
};

/**
 * Returns the current MongoDB connection status.
 */
const getConnectionStatus = () => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return {
    state: states[mongoose.connection.readyState] || "unknown",
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    database: mongoose.connection.db?.databaseName || null,
  };
};

// Graceful process termination handler for standalone server processes
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  const handleExit = async (signal) => {
    logger.info(`Received ${signal}, closing MongoDB connection...`);
    try {
      await mongoose.connection.close(false);
      logger.info("MongoDB connection closed through process termination");
    } catch (e) {
      logger.error("Error closing MongoDB connection on termination", { error: e.message });
    }
  };

  process.once("SIGINT", () => handleExit("SIGINT"));
  process.once("SIGTERM", () => handleExit("SIGTERM"));
}

module.exports = connectToDB;
module.exports.connectToDB = connectToDB;
module.exports.disconnectDB = disconnectDB;
module.exports.getConnectionStatus = getConnectionStatus;
module.exports.normalizeMongoUri = normalizeMongoUri;
module.exports.sanitizeMongoUri = sanitizeMongoUri;
module.exports.validateMongoUri = validateMongoUri;
