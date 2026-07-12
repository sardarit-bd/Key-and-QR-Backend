import express from "express";
import dashboardController from "./dashboard.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All dashboard routes require authentication
router.use(auth());

/**
 * Main dashboard endpoint
 * GET /api/v1/dashboard
 * Returns complete dashboard data
 */
router.get("/", dashboardController.getDashboard);

/**
 * Dashboard counts (lightweight)
 * GET /api/v1/dashboard/counts
 * Returns counts only for navbar/header
 */
router.get("/counts", dashboardController.getDashboardCounts);

/**
 * Check if user has resources
 * GET /api/v1/dashboard/has-resources
 * For onboarding flow
 */
router.get("/has-resources", dashboardController.hasResources);

/**
 * Recent activity feed
 * GET /api/v1/dashboard/activity
 * Returns recent user actions
 */
router.get("/activity", dashboardController.getRecentActivity);

export default router;