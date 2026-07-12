import rateLimit from "express-rate-limit";

// Existing API limiter
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

// Public scan limiter - Stricter for public endpoints
export const publicScanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 scans per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many scan attempts. Please try again later.",
        data: null,
    },
});

// Guest checkout limiter (existing)
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

export default apiLimiter;