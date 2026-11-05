const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const logger = require("./Utils/logger");
const connectToDB = require("./DataBase/db");
const {
  setSocketServer,
  registerSocketHandlers,
} = require("./Utils/socket-service");
const { startManualPaymentCleanupJob } = require("./Utils/manual-payment-cleanup");
const { startBankInboxWatcher } = require("./Utils/bank-email-watcher");
const { initAgingStockJob } = require("./Utils/aging-stock-job");
const { initRecommendationsJobs } = require("./Utils/recommendations-job");
const { initRecommendationsDigest } = require("./Utils/recommendations-digest");
const { initGuestPromoJob } = require("./Utils/guest-promo-job");
const { initCartAbandonmentJob } = require("./Utils/cart-abandonment-job");
const seedCategoryTaxonomy = require("./scripts/seed-category-taxonomy");
const { seedAboutSiteDefaults } = require("./Utils/seed-site-about-defaults");

const rawPort = process.env.PORT || process.env.BACKEND_PORT;
const PORT = Number(rawPort) || 5001;

const parseOriginList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();

const socketOrigins = new Set();

const addSocketOrigin = (value) => {
  const origin = normalizeOrigin(value);
  if (origin) socketOrigins.add(origin);
};

addSocketOrigin(process.env.CLIENT_URL);
addSocketOrigin(process.env.FRONTEND_URL);
parseOriginList(process.env.FRONTEND_URLS).forEach(addSocketOrigin);

if (process.env.NODE_ENV !== "production") {
  ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"].forEach(
    addSocketOrigin
  );
}

const socketOrigin = socketOrigins.size ? Array.from(socketOrigins) : undefined;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: socketOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  },
});

app.set("io", io);
setSocketServer(io);

io.on("connection", (socket) => {
  logger.info("Socket client connected", { socketId: socket.id });

  registerSocketHandlers(socket);

  socket.emit("server:connected", {
    success: true,
    socketId: socket.id,
  });

  socket.on("disconnect", () => {
    logger.info("Socket client disconnected", { socketId: socket.id });
  });

  socket.on("send_message", (data) => {
    logger.debug("Socket message received", {
      socketId: socket.id,
      data,
    });
    io.emit("receive_message", data);
  });
});

// Run background maintenance tasks after the server is already accepting traffic
const runDeferredStartupTasks = async () => {
  try {
    await seedCategoryTaxonomy();
  } catch (error) {
    logger.error("Category taxonomy seed failed", {
      error: error?.message || String(error),
    });
  }

  try {
    await seedAboutSiteDefaults();
  } catch (error) {
    logger.error("About site defaults seed failed", {
      error: error?.message || String(error),
    });
  }

  // Check if background jobs should be disabled (e.g. test environment or serverless)
  if (
    process.env.DISABLE_BACKGROUND_JOBS === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.VERCEL
  ) {
    logger.info("Background persistent worker jobs disabled for this runtime environment");
    return;
  }

  startManualPaymentCleanupJob();
  startBankInboxWatcher();
  initAgingStockJob();
  initRecommendationsJobs();
  initRecommendationsDigest();
  initGuestPromoJob();
  initCartAbandonmentJob();
};

const startServer = async () => {
  try {
    await connectToDB();

    server.listen(PORT, () => {
      logger.info("Server is listening", { port: PORT });
      runDeferredStartupTasks().catch((error) => {
        logger.error("Background startup task runner failed", {
          error: error?.message || String(error),
        });
      });
    });
  } catch (error) {
    logger.error("Server startup error", { error: error?.message || String(error) });
    process.exit(1);
  }
};

// ── process-level safety nets ────────────────────────────────────
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down", {
    message: err.message,
    stack: err.stack,
  });
  if (process.env.NODE_ENV !== "test") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
  if (process.env.NODE_ENV === "test") {
    return;
  }
  server.close(() => process.exit(1));
});

// ── graceful shutdown (SIGTERM from Docker/K8s, SIGINT from Ctrl+C) ─
let shuttingDown = false;
const gracefulShutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutdown signal received — closing connections", { signal });

  server.close((err) => {
    if (err) {
      logger.error("Error closing HTTP server", { error: err.message });
      process.exit(1);
    }
    io.close(() => {
      logger.info("Sockets closed; bye.");
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error("Forced shutdown after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
};

["SIGTERM", "SIGINT"].forEach((sig) => process.on(sig, () => gracefulShutdown(sig)));

// Only start the server automatically if executed directly as entrypoint
if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  server,
  io,
  startServer,
};
