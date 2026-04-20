import express from "express";
import scanController from "./scan.controller.js";
import auth from "../../middlewares/auth.middleware.js";
import optionalAuth from "../../middlewares/optionalAuth.middleware.js";

const router = express.Router();

// Unlock tag - guest allowed
router.post("/unlock/:tagCode", optionalAuth(), scanController.unlockTag);

// Get last unlock for a specific tag
router.get("/last/:tagCode", auth(), scanController.getLastUnlock);

// Get user scan history (all tags)
router.get("/history", auth(), scanController.getUserScanHistory);

// Get user scan stats
router.get("/stats", auth(), scanController.getUserScanStats);

export default router;