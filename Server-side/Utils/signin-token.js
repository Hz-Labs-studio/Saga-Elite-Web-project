const jwt = require("jsonwebtoken");

const signToken = (id) => {
    return jwt.sign(
        { id },
        process.env.JWT_SECRET || "development-jwt-secret-key-at-least-32-chars-long",
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        }
    );
};

module.exports = signToken;
