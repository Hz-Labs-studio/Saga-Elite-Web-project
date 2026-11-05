const mongoose = require("mongoose");
const logger = require("../Utils/logger");

let cachedPromise = null;

const connectToDB = async () => {
  if (mongoose.connection.readyState === 1) {
    logger.debug("Using existing MongoDB connection");
    return mongoose.connection;
  }

  if (cachedPromise) {
    logger.debug("Reusing in-flight MongoDB connection promise");
    return cachedPromise;
  }

  let mongoUri = process.env.MONGO_DB_URI;

  const looksLikePlaceholder = (uri) =>
    typeof uri === "string" && /<.*>|<credentials>|<username>|<password>/.test(uri);

  if (!mongoUri || looksLikePlaceholder(mongoUri)) {
    if (process.env.NODE_ENV !== "production") {
      const fallback = "mongodb://127.0.0.1:27017/sagaelite";
      logger.warn(
        "MONGO_DB_URI is missing or looks like a placeholder; falling back to local MongoDB for development",
        { fallback }
      );
      mongoUri = fallback;
    } else {
      const err = new Error("MONGO_DB_URI is not defined in environment variables");
      logger.error(err.message);
      if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
        process.exit(1);
      }
      throw err;
    }
  }

  const hasDatabase = /\/[^/?]+(\?.*)?$/.test(mongoUri);
  if (!hasDatabase) {
    mongoUri = `${mongoUri.replace(/\/?$/, "")}/sagaelite`;
  }

  const safeUri = mongoUri.replace(/\/\/.*@/, "//<credentials>@");
  logger.info("Attempting to connect to MongoDB", { target: safeUri });

  const opts = {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: process.env.VERCEL ? 5 : 10,
    bufferCommands: false,
  };

  cachedPromise = mongoose
    .connect(mongoUri, opts)
    .then((m) => {
      logger.info("MongoDB connected successfully", {
        database: m.connection.db?.databaseName || "sagaelite",
        host: m.connection.host,
      });

      m.connection.on("error", (err) => {
        logger.error("MongoDB connection error", { error: err?.message || String(err) });
        cachedPromise = null;
      });

      m.connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected; will attempt to reconnect on next use");
        cachedPromise = null;
      });

      return m.connection;
    })
    .catch(async (error) => {
      cachedPromise = null;
      logger.error("MongoDB connection failed", {
        error: error.message,
        attemptedUri: safeUri,
      });

      if (
        process.env.NODE_ENV !== "production" &&
        mongoUri !== "mongodb://127.0.0.1:27017/sagaelite"
      ) {
        const localFallback = "mongodb://127.0.0.1:27017/sagaelite";
        logger.warn(
          "Attempting local MongoDB fallback after connection failure",
          { fallback: localFallback }
        );

        try {
          const fallbackConn = await mongoose.connect(localFallback, opts);
          logger.info("MongoDB fallback connected successfully", {
            database: fallbackConn.connection.db?.databaseName || "sagaelite",
            host: fallbackConn.connection.host,
          });
          return fallbackConn.connection;
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

  return cachedPromise;
};

module.exports = connectToDB;
