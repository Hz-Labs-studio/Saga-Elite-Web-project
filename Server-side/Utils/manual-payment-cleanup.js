const mongoose = require("mongoose");
const ManualPayment = require("../Models/ManualPayment");
const Order = require("../Models/Order");
const { createNotification } = require("./notification-service");
const sendEmail = require("./send-mail");
const buildEmailTemplate = require("./email-template");
const { cleanPhoneNumber, sendWhatsAppMessage } = require("./whatsapp-service");
const logger = require("./logger");

let cleanupJobStarted = false;

const getCustomerEmail = (payment) => payment.orderId?.user?.email || payment.userId?.email || null;

const buildExpiryEmail = (payment) =>
  buildEmailTemplate(
    "Payment reference expired",
    `<p>Your bank transfer reference <strong>${payment.referenceNumber}</strong> expired because no proof was submitted within 24 hours.</p>
     <p>Please place a new bank transfer order if you still want to complete this purchase.</p>`
  );

const markExpiredManualPayments = async () => {
  if (mongoose.connection.readyState !== 1) {
    logger.warn("[cleanup] Skipping markExpiredManualPayments: database is disconnected");
    return 0;
  }

  const now = new Date();

  const expiringPayments = await ManualPayment.find({
    status: "pending_payment",
    expiresAt: { $lte: now },
  })
    .populate({
      path: "orderId",
      populate: {
        path: "user",
        select: "email role profilePicture",
      },
    })
    .populate("userId", "email role profilePicture");

  for (const payment of expiringPayments) {
    payment.status = "expired";
    payment.expiredAt = now;
    payment.adminNotes = payment.adminNotes || "Automatically expired after 24 hours without proof.";
    await payment.save({ validateModifiedOnly: true });

    const order = payment.orderId;

    if (order && order.status !== "confirmed") {
      order.status = "cancelled";
      order.paymentStatus = "failed";
      await order.save({ validateModifiedOnly: true });

      const customerUserId = order.user?._id || order.user;
      if (customerUserId) {
        await createNotification({
          userId: customerUserId,
          type: "order",
          title: "Payment reference expired",
          message: `Your payment reference ${payment.referenceNumber} expired because no proof was submitted within 24 hours.`,
          entityRef: order._id,
          entityType: "Order",
          meta: {
            orderId: order._id,
            referenceNumber: payment.referenceNumber,
            status: "cancelled",
          },
        });
      }

      const customerEmail = getCustomerEmail(payment);
      if (customerEmail) {
        try {
          await sendEmail({
            email: customerEmail,
            subject: "Your Saga Elite payment reference expired",
            html: buildExpiryEmail(payment),
          });
        } catch (emailError) {
          logger.error("Failed to send expiry email", { emailError });
        }
      }

      const phone = cleanPhoneNumber(order.shippingAddress?.phone || payment.guestPhone);
      if (phone) {
        try {
          await sendWhatsAppMessage({
            to: phone,
            templateName: "payment_expired",
            variables: [payment.referenceNumber],
          });
        } catch (waError) {
          logger.error("Failed to send expiry WhatsApp message", { waError });
        }
      }
    }
  }

  return expiringPayments.length;
};

const markExpiredCardOrders = async () => {
  if (mongoose.connection.readyState !== 1) {
    logger.warn("[cleanup] Skipping markExpiredCardOrders: database is disconnected");
    return 0;
  }

  const now = new Date();

  const expiredOrders = await Order.find({
    paymentMethod: "card",
    status: "pending_payment",
    expiresAt: { $lte: now },
  }).populate("user", "email");

  for (const order of expiredOrders) {
    order.status = "cancelled";
    order.paymentStatus = "failed";
    order.cancellationReason = "Card payment not completed within 24 hours.";
    order.cancelledAt = now;
    await order.save({ validateModifiedOnly: true });

    const customerUserId = order.user?._id || order.user;
    if (customerUserId) {
      await createNotification({
        userId: customerUserId,
        type: "order",
        title: "Order expired — payment not completed",
        message: `Order ${order._id} was cancelled because card payment was not completed in time.`,
        entityRef: order._id,
        entityType: "Order",
        meta: { orderId: order._id, status: "cancelled" },
      });
    }

    const customerEmail = order.user?.email || order.guestEmail || null;
    if (customerEmail) {
      try {
        await sendEmail({
          email: customerEmail,
          subject: "Your Saga Elite order expired",
          html: buildEmailTemplate(
            "Order expired",
            `<p>Your order <strong>${order._id}</strong> was cancelled because card payment was not completed within 24 hours.</p>
             <p>Please place a new order if you'd still like to purchase.</p>`
          ),
        });
      } catch (emailError) {
        logger.error("Failed to send card order expiry email", { emailError });
      }
    }
  }

  return expiredOrders.length;
};

const pruneExpiredManualPayments = async () => {
  if (mongoose.connection.readyState !== 1) {
    return 0;
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await ManualPayment.deleteMany({
    status: "expired",
    expiredAt: { $lte: cutoff },
  });

  return result.deletedCount || 0;
};

const startManualPaymentCleanupJob = () => {
  if (cleanupJobStarted) {
    return;
  }

  cleanupJobStarted = true;

  const runSweep = async () => {
    try {
      await markExpiredManualPayments();
      await markExpiredCardOrders();
      await pruneExpiredManualPayments();
    } catch (error) {
      logger.error("Manual payment cleanup job failed", { error });
    }
  };

  runSweep();
  setInterval(runSweep, 15 * 60 * 1000);
  setInterval(async () => {
    try {
      await pruneExpiredManualPayments();
    } catch (error) {
      logger.error("Manual payment prune job failed", { error });
    }
  }, 24 * 60 * 60 * 1000);
};

module.exports = {
  markExpiredManualPayments,
  markExpiredCardOrders,
  pruneExpiredManualPayments,
  startManualPaymentCleanupJob,
};
