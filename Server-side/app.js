const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
require("dotenv").config();

const { configureCors } = require("./Config/cors-config");
const { validateRuntimeConfig } = require("./Config/runtime-config");
const {
  authLimiter,
  generalLimiter,
} = require("./Middlewares/rateLimitinMiddleware");
const { requestLogger } = require("./Middlewares/customMiddleware");
const maintenanceMode = require("./Middlewares/maintenance-mode");
const globalErrorController = require("./Controllers/errorController");
const guestTrackingMiddleware = require("./Middlewares/guest-tracking-middleware");
const { identifyCustomer } = require("./Middlewares/customer-middleware");

// Validate runtime environment configuration
validateRuntimeConfig();

const app = express();

// Trust reverse proxy (Vercel, AWS, etc.) for X-Forwarded-For headers
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  app.set("trust proxy", 1);
}

// Security, parsing, and compression middlewares
app.use(
  helmet({
    crossOriginOpenerPolicy: false,
  })
);

app.use(cookieParser());
app.use(configureCors());
app.use(compression());

// Healthcheck endpoint placed early — responds immediately without DB buffering
app.get("/health", (_req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Serve local uploads if folder exists, with fallthrough enabled
app.use(
  "/Uploads",
  express.static(path.resolve(__dirname, "Uploads"), {
    fallthrough: true,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  })
);

app.use(
  express.json({
    limit: "10kb",
  })
);

// Allow popup-based OAuth flows
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

// Customer and Guest identification for application routes
app.use(guestTrackingMiddleware);
app.use(identifyCustomer);

// Rate limiting & logging
app.use("/api/v1/auth", authLimiter);
app.use(generalLimiter);
app.use(requestLogger);
app.use(maintenanceMode);

/* ================== API ROUTES ================== */
const authRoutes = require("./Routes/authRoutes");
const whatsappWebhookRoutes = require("./Routes/whatsapp-webhook-routes");
const googleAuthRoute = require("./Routes/google-routes");
const facebookAuthRoute = require("./Routes/facebook-routes");
const productRoutes = require("./Routes/product-routes");
const categoryRoutes = require("./Routes/category-routes");
const imageRoutes = require("./Routes/image-routes");
const dropRoutes = require("./Routes/drop-routes");
const orderRoutes = require("./Routes/order-routes");
const bannerRoutes = require("./Routes/banner-routes");
const dealRoutes = require("./Routes/deal-routes");
const manualPaymentRoutes = require("./Routes/manualPaymentRoutes");
const userRoutes = require("./Routes/userRoutes");
const notificationRoutes = require("./Routes/notification-routes");
const contactRoutes = require("./Routes/contactRoutes");
const reviewRoutes = require("./Routes/reviewRoutes");
const superAdminRoutes = require("./Routes/super-admin-routes");
const adminRoutes = require("./Routes/admin-routes");
const newsletterRoutes = require("./Routes/newsletterRoutes");
const siteConfigRoutes = require("./Routes/siteConfigRoutes");
const offerRoutes = require("./Routes/offer-routes");
const couponRoutes = require("./Routes/coupon-routes");
const influencerRoutes = require("./Routes/influencer-routes");
const shippingZoneRoutes = require("./Routes/shipping-zone-routes");
const guestRoutes = require("./Routes/guestRoutes");
const customerRoutes = require("./Routes/customerRoutes");
const eventRoutes = require("./Routes/eventRoutes");
const statsRoutes = require("./Routes/stats-routes");

// Webhooks
app.use("/api/webhooks/whatsapp", whatsappWebhookRoutes);
app.use("/api/webhooks/bank-sms", require("./Routes/bank-sms-webhook-routes"));
app.use("/api/webhooks/payhere", require("./Routes/payhere-webhook-routes"));
app.use("/api/v1/payhere/notify", require("./Routes/payhere-webhook-routes"));

// Dev-only routes
if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
  app.use("/api/v1/dev", require("./Routes/dev-routes"));
}

// Domain API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/banners", bannerRoutes);
app.use("/api/v1/deals", dealRoutes);
app.use("/api/v1/google", googleAuthRoute);
app.use("/api/v1/facebook", facebookAuthRoute);
app.use("/api/v1/image", imageRoutes);
app.use("/api/v1/drops", dropRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1", manualPaymentRoutes);
app.use("/api/v1/guest", guestRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/contact", contactRoutes);
app.use("/api/v1/reviews", reviewRoutes.userRouter);
app.use("/api/v1/admin/reviews", reviewRoutes.adminRouter);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/super-admin", superAdminRoutes);
app.use("/api/v1/newsletter", newsletterRoutes);
app.use("/api/v1/site-config", siteConfigRoutes);
app.use("/api/v1/offers", offerRoutes);
app.use("/api/v1/coupons", couponRoutes);
app.use("/api/v1/influencers", influencerRoutes);
app.use("/api/v1/shipping-zones", shippingZoneRoutes);
app.use("/api/v1/customer", customerRoutes);
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/stats", statsRoutes);

// Global Error Handler
app.use(globalErrorController);

module.exports = app;
