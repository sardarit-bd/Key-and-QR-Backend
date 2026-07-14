import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import dashboardService from "./dashboard.service.js";

/**
 * Get complete dashboard data
 * GET /api/v1/dashboard
 * 
 * Requires authentication
 * Returns all user resources in one unified response
 */
const getDashboard = catchAsync(async (req, res) => {
    const userId = req.user.userId;

    const dashboardData = await dashboardService.getDashboard(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Dashboard data fetched successfully",
        data: dashboardData,
    });
});

/**
 * Get dashboard summary counts
 * GET /api/v1/dashboard/counts
 * 
 * Lightweight endpoint for navbar/header
 */
const getDashboardCounts = catchAsync(async (req, res) => {
    const userId = req.user.userId;

    const counts = await dashboardService.getResourceCounts(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Dashboard counts fetched successfully",
        data: counts,
    });
});

/**
 * Check if user has resources
 * GET /api/v1/dashboard/has-resources
 * 
 * Used for onboarding flow
 */
const hasResources = catchAsync(async (req, res) => {
    const userId = req.user.userId;

    const hasResources = await dashboardService.hasResources(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        data: { hasResources },
    });
});

/**
 * Get recent activity
 * GET /api/v1/dashboard/activity
 * 
 * Returns recent actions in chronological order
 */
const getRecentActivity = catchAsync(async (req, res) => {
    const userId = req.user.userId;

    const activities = await dashboardService.getRecentActivity(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Recent activity fetched successfully",
        data: activities,
    });
});

export default {
    getDashboard,
    getDashboardCounts,
    hasResources,
    getRecentActivity,
};