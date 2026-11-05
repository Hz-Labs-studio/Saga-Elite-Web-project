const jwt = require("jsonwebtoken");
const catchAsync = require("../Utils/catchAsync");
const AppError = require("../Utils/appError");
const User = require("../Models/User");

const authMiddleware = catchAsync(async (req, res, next) => {
    let token;

    // 1) Check if token is in headers (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }
    // 2) Check if token is in cookies
    else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        return next(new AppError("User not authenticated. Please login first", 401));
    }

    // Reject the placeholder cookie value set on logout
    if (token === "loggedout") {
        return next(new AppError("Session expired. Please login again", 401));
    }

    let decodedToken;
    try {
        const secret =
            process.env.JWT_SECRET || "development-jwt-secret-key-at-least-32-chars-long";
        decodedToken = jwt.verify(token, secret);
    } catch (_err) {
        return next(new AppError("Invalid or expired session. Please login again.", 401));
    }

    const user = await User.findById(decodedToken.id);

    if (!user) {
        return next(new AppError("User no longer exists.", 401));
    }

    if (!user.isActive) {
        return next(new AppError("Your account has been deactivated. Please contact support.", 403));
    }

    req.userInfo = user;

    next();
});

module.exports = authMiddleware;
