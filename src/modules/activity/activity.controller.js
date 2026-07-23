import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import activityService from "./activity.service.js";

/**
 * Get user activity feed
 * GET /api/v1/activity/feed
 */
const getActivityFeed = catchAsync(async (req, res) => {
    const userId = req.user.userId;
    const { limit = 10 } = req.query;

    const activities = await activityService.getActivityFeed(
        userId,
        parseInt(limit)
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Activity feed fetched successfully",
        data: activities,
    });
});

/**
 * Get activity statistics
 * GET /api/v1/activity/stats
 */
const getActivityStats = catchAsync(async (req, res) => {
    const userId = req.user.userId;

    const stats = await activityService.getActivityStats(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Activity stats fetched successfully",
        data: stats,
    });
});

/**
 * Get recent activities
 * GET /api/v1/activity/recent
 */
const getRecentActivities = catchAsync(async (req, res) => {
    const userId = req.user.userId;
    const { limit = 10 } = req.query;

    const activities = await activityService.getRecentActivities(
        userId,
        parseInt(limit)
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Recent activities fetched successfully",
        data: activities,
    });
});

/**
 * Get activities by type
 * GET /api/v1/activity/type/:type
 */
const getActivitiesByType = catchAsync(async (req, res) => {
    const userId = req.user.userId;
    const { type } = req.params;
    const { limit = 10 } = req.query;

    const activities = await activityService.getActivitiesByType(
        userId,
        type,
        parseInt(limit)
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Activities of type "${type}" fetched successfully`,
        data: activities,
    });
});

/**
 * Clean old activities (Admin only)
 * DELETE /api/v1/activity/clean
 */
const cleanOldActivities = catchAsync(async (req, res) => {
    const { days = 30 } = req.query;

    const result = await activityService.cleanOldActivities(parseInt(days));

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Old activities cleaned successfully`,
        data: {
            deletedCount: result.deletedCount || 0,
            daysKept: parseInt(days),
        },
    });
});

export default {
    getActivityFeed,
    getActivityStats,
    getRecentActivities,
    getActivitiesByType,
    cleanOldActivities,
};