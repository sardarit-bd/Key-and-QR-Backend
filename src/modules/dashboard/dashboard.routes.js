import express from "express";
import dashboardController from "./dashboard.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All dashboard routes require authentication
router.use(auth());

/**
 * Dashboard overview — SINGLE aggregated endpoint
 * GET /api/v1/dashboard/overview
 * Returns everything the dashboard needs in one response
 */
router.get("/overview", dashboardController.getOverview);

/**
 * Dashboard home — SINGLE aggregated endpoint for the new User Dashboard
 * GET /api/v1/dashboard/home
 */
router.get("/home", dashboardController.getHome);

/**
 * Main dashboard endpoint (legacy)
 * GET /api/v1/dashboard
 */
router.get("/", dashboardController.getDashboard);

/**
 * Dashboard counts (lightweight)
 * GET /api/v1/dashboard/counts
 */
router.get("/counts", dashboardController.getDashboardCounts);

/**
 * Check if user has resources
 * GET /api/v1/dashboard/has-resources
 */
router.get("/has-resources", dashboardController.hasResources);

/**
 * Recent activity feed
 * GET /api/v1/dashboard/activity
 */
router.get("/activity", dashboardController.getRecentActivity);

export default router;
