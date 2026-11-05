const logger = require("../Utils/logger");

module.exports = (err, req, res, _next) => {
    // Log the error with details
    logger.error({
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip || "unknown",
        userAgent: req.get('User-Agent'),
    });

    // Handle rate limiting errors specifically
    if (err.statusCode === 429) {
        err.message = 'Too many requests. Please try again later.';
        err.status = 'error';
    }

    // Handle Multer file-size or other upload errors explicitly
    if (err.name === "MulterError") {
        if (err.code === "LIMIT_FILE_SIZE") {
            err.statusCode = 400;
            err.message = "Each image must be 5 MB or smaller";
        } else {
            err.statusCode = 400;
            err.message = err.message || "File upload error";
        }
    }

    // Convert mongoose validation failures to 400 so client sees bad request
    if (err.name === 'ValidationError') {
        err.statusCode = 400;
        err.status = 'fail';
        // message already constructed by Mongoose
    }

    // Convert invalid ObjectId casting to a 400 bad request
    if (err.name === 'CastError') {
        err.statusCode = 400;
        err.status = 'fail';
        err.message = `Invalid ${err.path}: ${err.value}`;
    }

    // Convert auth token errors into 401 unauthorized responses
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        err.statusCode = 401;
        err.status = 'fail';
        err.message = 'Authentication failed. Please log in again.';
    }

    // Convert duplicate key errors into a client-friendly response
    if (err.code === 11000) {
        err.statusCode = 400;
        err.status = 'fail';
        const fields = Object.keys(err.keyValue || {}).join(', ');
        err.message = `Duplicate field value for ${fields}. Please use another value.`;
    }

    const isMongoConnectivityError =
        err.name === 'MongoServerSelectionError' ||
        err.name === 'MongoNetworkError' ||
        /server selection timed out|getaddrinfo|ECONNREFUSED|connection .* closed/i.test(err.message || '');

    if (isMongoConnectivityError) {
        err.statusCode = 503;
        err.status = 'error';
        err.message = 'Database connection is unavailable. Please try again shortly.';
    }

    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    res.status(err.statusCode).json({
        status: err.status,
        // Expose only necessary details to client
        message: err.message || "An error occurred",
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};
