const mongoose = require("mongoose");
const Customer = require("../Models/Customer");
const { getOrCreateCustomer } = require("../Services/migration-service");
const logger = require("../Utils/logger");

const identifyCustomer = async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return next();
  }

  try {
    const customer = await getOrCreateCustomer(req);
    if (customer) {
      req.customer = customer;
      req.customerId = customer._id;
    }
  } catch (err) {
    logger.error("[customer-middleware] identification failed", {
      error: err.message,
    });
  }
  next();
};

const requireCustomer = async (req, res, next) => {
  if (req.customerId) return next();

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Database unavailable, unable to identify customer",
    });
  }

  try {
    const customer = await getOrCreateCustomer(req);
    if (customer) {
      req.customer = customer;
      req.customerId = customer._id;
      return next();
    }
  } catch (err) {
    logger.error("[customer-middleware] requireCustomer failed", {
      error: err.message,
    });
  }

  return res.status(400).json({
    success: false,
    message: "Unable to identify customer",
  });
};

module.exports = { identifyCustomer, requireCustomer };
