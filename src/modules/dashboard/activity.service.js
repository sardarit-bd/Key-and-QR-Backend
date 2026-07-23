import Activity from "../activity/activity.model.js";

/**
 * Activity Service
 * Logs user activities for dashboard recent activity feed
 */
class ActivityService {
    /**
     * Log an activity
     */
    async logActivity({ userId, type, targetType, targetId, description, metadata = {} }) {
        return Activity.create({
            user: userId,
            type,
            targetType,
            targetId,
            description,
            metadata,
            timestamp: new Date(),
        });
    }

    /**
     * Get recent activities for a user
     */
    async getRecentActivities(userId, limit = 10) {
        return Activity.find({ user: userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    }

    /**
     * Get activities by type
     */
    async getActivitiesByType(userId, type, limit = 10) {
        return Activity.find({ 
            user: userId, 
            type 
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    }

    /**
     * Get activity count for user
     */
    async getActivityCount(userId) {
        return Activity.countDocuments({ user: userId });
    }

    /**
     * Clean old activities (keep last 30 days)
     */
    async cleanOldActivities(days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return Activity.deleteMany({
            timestamp: { $lt: cutoffDate }
        });
    }
}

export default new ActivityService();