const rateLimiting = require("express-rate-limit");

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const parsePositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const devMultiplier = parsePositiveNumber(
    process.env.RATE_LIMIT_DEV_MULTIPLIER,
    10
);

const getMaxRequests = (baseMax) => {
    if (isTest) {
        return 100000;
    }
    if (isProduction) {
        return baseMax;
    }

    return Math.max(1, Math.floor(baseMax * devMultiplier));
};

const createRateLimiting = (maxRequests, time) => {
    return rateLimiting({
        max: maxRequests,
        windowMs: time,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            message: `Too many requests. Limit is ${maxRequests} per ${time / 60000} minutes.`,
        },
    });
};

const loginMax = parsePositiveNumber(process.env.RATE_LIMIT_LOGIN_MAX, 25);
const loginWindow = parsePositiveNumber(
    process.env.RATE_LIMIT_LOGIN_WINDOW_MS,
    15 * 60 * 1000
);

const authMax = parsePositiveNumber(process.env.RATE_LIMIT_AUTH_MAX, 60);
const authWindow = parsePositiveNumber(
    process.env.RATE_LIMIT_AUTH_WINDOW_MS,
    15 * 60 * 1000
);

const generalMax = parsePositiveNumber(process.env.RATE_LIMIT_GENERAL_MAX, 500);
const generalWindow = parsePositiveNumber(
    process.env.RATE_LIMIT_GENERAL_WINDOW_MS,
    15 * 60 * 1000
);

const contactMax = parsePositiveNumber(process.env.RATE_LIMIT_CONTACT_MAX, 15);
const contactWindow = parsePositiveNumber(
    process.env.RATE_LIMIT_CONTACT_WINDOW_MS,
    60 * 60 * 1000
);

// Pre-configured limiters for different endpoint types
const loginLimiter = createRateLimiting(getMaxRequests(loginMax), loginWindow);
const authLimiter = createRateLimiting(getMaxRequests(authMax), authWindow);
const generalLimiter = createRateLimiting(
    getMaxRequests(generalMax),
    generalWindow
);
const contactLimiter = createRateLimiting(
    getMaxRequests(contactMax),
    contactWindow
);

module.exports = {
    createRateLimiting,
    loginLimiter,
    authLimiter,
    generalLimiter,
    contactLimiter,
};
