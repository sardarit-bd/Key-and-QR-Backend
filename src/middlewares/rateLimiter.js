import rateLimit from "express-rate-limit";

// ===============================
// GLOBAL API LIMITER
// ===============================

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests from this IP, please try again later.",
        data: null,
    },
});

// ===============================
// PUBLIC SCAN LIMITER
// ===============================

export const publicScanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many scan attempts. Please try again later.",
        data: null,
    },
});

// ===============================
// GUEST CHECKOUT LIMITER
// ===============================

export const guestCheckoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return req.user && req.user.userId;
    },
    message: {
        success: false,
        message: "Too many guest checkout attempts. Please create an account or try again later.",
        data: null,
    },
});

// ===============================
// AUTH-SPECIFIC LIMITERS
// ===============================

// Login: 10 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many login attempts. Please try again in 15 minutes.",
        data: null,
    },
});

// Register: 5 attempts per 15 minutes per IP
export const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many registration attempts. Please try again in 15 minutes.",
        data: null,
    },
});

// Password reset request: 3 attempts per 15 minutes per IP
export const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many password reset requests. Please try again in 15 minutes.",
        data: null,
    },
});

export default apiLimiter;
