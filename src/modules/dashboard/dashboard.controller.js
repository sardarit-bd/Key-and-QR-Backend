import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import dashboardService from "./dashboard.service.js";

/**
 * Get dashboard overview — SINGLE aggregated endpoint
 * GET /api/v1/dashboard/overview
 */
const getOverview = catchAsync(async (req, res) => {
    const userId = req.user.userId;
    const overview = await dashboardService.getOverview(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Dashboard overview fetched successfully",
        data: overview,
    });
});

/**
 * Get complete dashboard data (legacy)
 * GET /api/v1/dashboard
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

/**
 * Get dashboard home data — SINGLE aggregated endpoint for the new User Dashboard
 * GET /api/v1/dashboard/home
 */
const getHome = catchAsync(async (req, res) => {
    const userId = req.user.userId;
    const homeData = await dashboardService.getHomeData(userId, req);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Dashboard home data fetched successfully",
        data: homeData,
    });
});

export default {
    getOverview,
    getDashboard,
    getDashboardCounts,
    hasResources,
    getRecentActivity,
    getHome,
};
