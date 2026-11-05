const cors = require("cors");
const logger = require("../Utils/logger");

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const normalizeOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();

const isLocalDevOrigin = (origin) => {
  const match = /^https?:\/\/(localhost|127\.0\.0\.1)(?::(\d{1,5}))?$/i.exec(origin);
  if (!match) return false;
  if (!match[2]) return true;
  const port = Number(match[2]);
  return port >= 1 && port <= 65535;
};

/**
 * Validates Vercel preview and deployment origins securely.
 * Matches *.vercel.app subdomains belonging to Saga Elite or the repository organization.
 */
const isVercelOrigin = (origin) => {
  if (!origin || typeof origin !== "string") return false;
  const normalized = normalizeOrigin(origin);
  const match = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/i.exec(normalized);
  if (!match) return false;
  const subdomain = match[1].toLowerCase();
  return (
    subdomain.startsWith("saga-elite") ||
    subdomain.includes("sagaelite") ||
    subdomain.includes("hz-labs-studio")
  );
};

const getConfiguredOrigins = () => {
  const envList = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URLS,
    process.env.CLIENT_URL,
    process.env.CORS_ORIGIN,
    process.env.ALLOWED_ORIGINS,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
  ];

  return envList
    .filter(Boolean)
    .flatMap((val) => val.split(","))
    .map(normalizeOrigin)
    .filter(Boolean);
};

const configureCors = () => {
  const configured = getConfiguredOrigins();
  const allowedOriginsSet = new Set(
    process.env.NODE_ENV === "production"
      ? configured
      : [...configured, ...defaultOrigins.map(normalizeOrigin)]
  );

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, payment webhooks)
      if (!origin) {
        return callback(null, true);
      }

      const normalized = normalizeOrigin(origin);

      if (
        allowedOriginsSet.has(normalized) ||
        isLocalDevOrigin(origin) ||
        isVercelOrigin(origin)
      ) {
        return callback(null, true);
      }

      logger.warn("CORS rejected origin", {
        origin,
        allowedOrigins: [...allowedOriginsSet],
      });
      return callback(new Error("Not allowed by CORS"));
    },

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Accept-Version",
      "X-Requested-With",
      "x-payment-email",
      "x-webhook-secret",
      "x-guest-token",
      "x-customer-id",
      "x-session-id",
    ],

    exposedHeaders: ["X-Total-Count", "Content-Range"],

    credentials: true,
    preflightContinue: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
};

module.exports = {
  configureCors,
  normalizeOrigin,
  isLocalDevOrigin,
  isVercelOrigin,
};
