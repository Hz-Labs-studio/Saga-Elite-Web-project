const path = require("path");
const winston = require("winston");

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);
const isProduction = process.env.NODE_ENV === "production";

// Redact sensitive keys from log metadata to prevent leaking credentials
const SENSITIVE_KEYS = new Set([
  "password",
  "confirmpassword",
  "currentpassword",
  "newpassword",
  "token",
  "jwt",
  "jwt_secret",
  "secret",
  "authorization",
  "cookie",
  "payhere_secret",
  "smtp_pass",
  "cloudinary_api_secret",
]);

const maskSensitiveData = winston.format((info) => {
  const sanitize = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 4) return obj;
    if (Array.isArray(obj)) return obj.map((item) => sanitize(item, depth + 1));
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        result[key] = sanitize(value, depth + 1);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  return sanitize(info);
});

const transports = [];

// In Serverless or Production, ALWAYS use structured Console logging
if (isServerless || isProduction) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        maskSensitiveData(),
        winston.format.json()
      ),
    })
  );
} else {
  // Local development: Pretty console logging
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "HH:mm:ss" }),
        maskSensitiveData(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const details = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
          return `${timestamp} ${level}: ${message}${details}`;
        })
      ),
    })
  );

  // Optional local file transport ONLY when not in serverless and running locally
  try {
    const fs = require("fs");
    const logsDir = path.resolve(__dirname, "../logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, "error.log"),
        level: "error",
      }),
      new winston.transports.File({
        filename: path.join(logsDir, "combined.log"),
      })
    );
  } catch (_e) {
    // If directory creation fails (e.g. read-only filesystem), console logging continues unaffected
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  defaultMeta: { service: "saga-elite-api" },
  transports,
});

module.exports = logger;
