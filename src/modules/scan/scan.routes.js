import express from "express";
import scanController from "./scan.controller.js";
import auth from "../../middlewares/auth.middleware.js";
import optionalAuth from "../../middlewares/optionalAuth.middleware.js";
import { publicScanLimiter } from "../../middlewares/rateLimiter.js";

const router = express.Router();

// ===============================
// PUBLIC QR SCAN - No Auth Required
// ===============================

/**
 * PUBLIC: Scan QR code and get quote
 * GET /api/v1/scan/public/:tagCode
 * 
 * No authentication required
 * Rate limited to prevent abuse
 * Returns ONLY public data
 */
router.get(
    "/public/:tagCode",
    publicScanLimiter, 
    optionalAuth(),
    scanController.publicScan
);

// ===============================
// EXISTING ROUTES (Maintained)
// ===============================

// Unlock tag - guest allowed (kept for backward compatibility)
router.post("/unlock/:tagCode", optionalAuth(), scanController.unlockTag);

// Get last unlock for a specific tag
router.get("/last/:tagCode", auth(), scanController.getLastUnlock);

// Get user scan history (all tags)
router.get("/history", auth(), scanController.getUserScanHistory);

// Get user scan stats
router.get("/stats", auth(), scanController.getUserScanStats);

export default router;