const express = require("express");
const logger = require("../Utils/logger");
const {
  markExpiredManualPayments,
  markExpiredCardOrders,
} = require("../Utils/manual-payment-cleanup");
const { checkAgingStock } = require("../Utils/aging-stock-job");
const { runCartAbandonmentBatch } = require("../Utils/cart-abandonment-job");
const { runGuestPromoBatch } = require("../Utils/guest-promo-job");
const { sendDigestNow } = require("../Utils/recommendations-digest");
const { sweepInbox } = require("../Utils/bank-email-watcher");

const router = express.Router();

/**
 * Authorization middleware for Vercel Cron routes.
 * Verifies CRON_SECRET Bearer token or Vercel internal cron signature.
 */
const verifyCronAuth = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers["x-vercel-cron"] === "1";

  // In production, require either valid CRON_SECRET or verified Vercel Cron header
  if (process.env.NODE_ENV === "production") {
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return next();
    }
    if (isVercelCron) {
      return next();
    }
    logger.warn("Unauthorized attempt to trigger cron endpoint", {
      path: req.originalUrl,
      ip: req.ip,
    });
    return res.status(401).json({
      success: false,
      message: "Unauthorized. Valid CRON_SECRET Bearer token required.",
    });
  }

  // Non-production allows manual triggering for testing
  next();
};

router.use(verifyCronAuth);

/**
 * Cleanup expired manual payments and card orders, releasing reserved stock.
 * Schedule: Hourly (0 * * * *)
 */
router.all("/cleanup-expired-payments", async (_req, res) => {
  logger.info("[Cron] Running expired payments cleanup");
  try {
    const expiredPayments = await markExpiredManualPayments();
    const expiredCards = await markExpiredCardOrders();
    res.status(200).json({
      success: true,
      job: "cleanup-expired-payments",
      timestamp: new Date().toISOString(),
      result: {
        expiredPaymentsCount: expiredPayments?.length || 0,
        expiredCardOrdersCount: expiredCards?.length || 0,
      },
    });
  } catch (error) {
    logger.error("[Cron] Expired payments cleanup failed", { error: error.message });
    res.status(500).json({
      success: false,
      job: "cleanup-expired-payments",
      error: error.message,
    });
  }
});

/**
 * Aging stock clearance detection and promotional offer generation.
 * Schedule: Daily at 02:00 (0 2 * * *)
 */
router.all("/aging-stock", async (_req, res) => {
  logger.info("[Cron] Running aging stock detection");
  try {
    const result = await checkAgingStock();
    res.status(200).json({
      success: true,
      job: "aging-stock",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    logger.error("[Cron] Aging stock job failed", { error: error.message });
    res.status(500).json({
      success: false,
      job: "aging-stock",
      error: error.message,
    });
  }
});

/**
 * Cart abandonment reminder notifications and recovery discounts.
 * Schedule: Every 4 hours
 */
router.all("/cart-abandonment", async (_req, res) => {
  logger.info("[Cron] Running cart abandonment recovery batch");
  try {
    const result = await runCartAbandonmentBatch();
    res.status(200).json({
      success: true,
      job: "cart-abandonment",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    logger.error("[Cron] Cart abandonment job failed", { error: error.message });
    res.status(500).json({
      success: false,
      job: "cart-abandonment",
      error: error.message,
    });
  }
});

/**
 * Guest promotion reminders and first-order coupon delivery.
 * Schedule: Daily at 10:00 (0 10 * * *)
 */
router.all("/guest-promo", async (_req, res) => {
  logger.info("[Cron] Running guest promo batch");
  try {
    const result = await runGuestPromoBatch();
    res.status(200).json({
      success: true,
      job: "guest-promo",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    logger.error("[Cron] Guest promo job failed", { error: error.message });
    res.status(500).json({
      success: false,
      job: "guest-promo",
      error: error.message,
    });
  }
});

/**
 * Weekly/Monthly personalized product recommendations digest emails.
 * Schedule: Weekly on Sunday at 08:00 (0 8 * * 0)
 */
router.all("/recommendations-digest", async (_req, res) => {
  logger.info("[Cron] Running recommendations digest dispatch");
  try {
    const result = await sendDigestNow();
    res.status(200).json({
      success: true,
      job: "recommendations-digest",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (error) {
    logger.error("[Cron] Recommendations digest failed", { error: error.message });
    res.status(500).json({
      success: false,
      job: "recommendations-digest",
      error: error.message,
    });
  }
});

/**
 * Single-sweep IMAP inbox check for bank confirmation emails.
 * Triggerable on-demand or via scheduled timer.
 */
router.all("/bank-inbox-sweep", async (_req, res) => {
  logger.info("[Cron] Running on-demand bank inbox sweep");
  try {
    const result = await sweepInbox();
    res.status(200).json({
      success: true,
      job: "bank-inbox-sweep",
      timestamp: new Date().toISOString(),
      result: result || { message: "Sweep completed" },
    });
  } catch (error) {
    logger.error("[Cron] Bank inbox sweep failed", { error: error.message });
    res.status(500).json({
      success: false,
      job: "bank-inbox-sweep",
      error: error.message,
    });
  }
});

module.exports = router;
