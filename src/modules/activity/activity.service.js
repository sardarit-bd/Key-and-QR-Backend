import Activity from "./activity.model.js";

/**
 * Activity Service
 * Handles all activity logging and retrieval operations
 */
class ActivityService {
    /**
     * Log an activity
     * @param {Object} data - Activity data
     * @param {string} data.userId - User ID
     * @param {string} data.type - Activity type (e.g., 'favorite_added')
     * @param {string} data.targetType - Target type (e.g., 'quote')
     * @param {string} data.targetId - Target ID
     * @param {string} data.description - Human-readable description
     * @param {Object} data.metadata - Additional metadata
     * @returns {Promise<Object>} Created activity
     */
    async logActivity({ userId, type, targetType, targetId, description, metadata = {} }) {
        try {
            if (!userId || !type || !targetType || !targetId) {
                console.warn('⚠️ Missing required fields for activity logging:', { userId, type, targetType, targetId });
                return null;
            }

            const activity = await Activity.create({
                user: userId,
                type,
                targetType,
                targetId,
                description,
                metadata,
                timestamp: new Date(),
            });

            return activity;
        } catch (error) {
            // Non-blocking: Log error but don't fail
            console.error('❌ Activity logging failed:', error.message);
            return null;
        }
    }

    /**
     * Get recent activities for a user
     * @param {string} userId - User ID
     * @param {number} limit - Number of activities to return
     * @returns {Promise<Array>} List of activities
     */
    async getRecentActivities(userId, limit = 10) {
        try {
            if (!userId) return [];

            const activities = await Activity.find({ user: userId })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();

            // Populate target data based on targetType
            const populatedActivities = await this.populateTargets(activities);
            
            return populatedActivities;
        } catch (error) {
            console.error('❌ Failed to get recent activities:', error.message);
            return [];
        }
    }

    /**
     * Get activities by type
     * @param {string} userId - User ID
     * @param {string} type - Activity type
     * @param {number} limit - Number of activities to return
     * @returns {Promise<Array>} List of activities
     */
    async getActivitiesByType(userId, type, limit = 10) {
        try {
            if (!userId || !type) return [];

            const activities = await Activity.find({ 
                user: userId, 
                type 
            })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();

            return await this.populateTargets(activities);
        } catch (error) {
            console.error('❌ Failed to get activities by type:', error.message);
            return [];
        }
    }

    /**
     * Get activities for a specific target
     * @param {string} targetId - Target ID
     * @param {string} targetType - Target type
     * @param {number} limit - Number of activities to return
     * @returns {Promise<Array>} List of activities
     */
    async getActivitiesByTarget(targetId, targetType, limit = 10) {
        try {
            if (!targetId || !targetType) return [];

            const activities = await Activity.find({ 
                targetId, 
                targetType 
            })
                .sort({ timestamp: -1 })
                .limit(limit)
                .populate('user', 'name email')
                .lean();

            return activities;
        } catch (error) {
            console.error('❌ Failed to get activities by target:', error.message);
            return [];
        }
    }

    /**
     * Get activity count for user
     * @param {string} userId - User ID
     * @returns {Promise<number>} Activity count
     */
    async getActivityCount(userId) {
        try {
            if (!userId) return 0;
            return await Activity.countDocuments({ user: userId });
        } catch (error) {
            console.error('❌ Failed to get activity count:', error.message);
            return 0;
        }
    }

    /**
     * Get activity statistics for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Activity statistics
     */
    async getActivityStats(userId) {
        try {
            if (!userId) return { total: 0, byType: {} };

            const stats = await Activity.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: '$type',
                        count: { $sum: 1 }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$count' },
                        byType: {
                            $push: {
                                type: '$_id',
                                count: '$count'
                            }
                        }
                    }
                }
            ]);

            if (stats.length === 0) {
                return { total: 0, byType: {} };
            }

            // Convert to object
            const byType = {};
            stats[0].byType.forEach(item => {
                byType[item.type] = item.count;
            });

            return {
                total: stats[0].total,
                byType,
            };
        } catch (error) {
            console.error('❌ Failed to get activity stats:', error.message);
            return { total: 0, byType: {} };
        }
    }

    /**
     * Populate target data for activities
     * @param {Array} activities - List of activities
     * @returns {Promise<Array>} Activities with populated targets
     */
    async populateTargets(activities) {
        const populated = [];
        
        for (const activity of activities) {
            const item = { ...activity };
            
            // Populate based on target type
            try {
                switch (activity.targetType) {
                    case 'quote': {
                        const Quote = await import('../quote/quote.model.js').then(m => m.default);
                        const target = await Quote.findById(activity.targetId)
                            .select('text category author image');
                        if (target) {
                            item.target = {
                                _id: target._id,
                                text: target.text,
                                category: target.category,
                                author: target.author,
                            };
                        }
                        break;
                    }
                    case 'order': {
                        const Order = await import('../order/order.model.js').then(m => m.default);
                        const target = await Order.findById(activity.targetId)
                            .select('orderNumber grandTotal paymentStatus fulfillmentStatus');
                        if (target) {
                            item.target = {
                                _id: target._id,
                                orderNumber: target.orderNumber,
                                grandTotal: target.grandTotal,
                                paymentStatus: target.paymentStatus,
                            };
                        }
                        break;
                    }
                    case 'tag': {
                        const Tag = await import('../tag/tag.model.js').then(m => m.default);
                        const target = await Tag.findById(activity.targetId)
                            .select('tagCode isActivated');
                        if (target) {
                            item.target = {
                                _id: target._id,
                                tagCode: target.tagCode,
                                isActivated: target.isActivated,
                            };
                        }
                        break;
                    }
                    case 'product': {
                        const Product = await import('../product/product.model.js').then(m => m.default);
                        const target = await Product.findById(activity.targetId)
                            .select('name price image');
                        if (target) {
                            item.target = {
                                _id: target._id,
                                name: target.name,
                                price: target.price,
                            };
                        }
                        break;
                    }
                    default:
                        break;
                }
            } catch (error) {
                // Skip population if model doesn't exist
                console.debug(`⚠️ Could not populate target for ${activity.targetType}:`, error.message);
            }
            
            populated.push(item);
        }
        
        return populated;
    }

    /**
     * Clean old activities (keep last 30 days)
     * @param {number} days - Number of days to keep
     * @returns {Promise<Object>} Deletion result
     */
    async cleanOldActivities(days = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            const result = await Activity.deleteMany({
                timestamp: { $lt: cutoffDate }
            });
            
            console.log(`🧹 Cleaned ${result.deletedCount} old activities (older than ${days} days)`);
            return result;
        } catch (error) {
            console.error('❌ Failed to clean old activities:', error.message);
            return { deletedCount: 0 };
        }
    }

    /**
     * Delete all activities for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteUserActivities(userId) {
        try {
            if (!userId) return { deletedCount: 0 };
            return await Activity.deleteMany({ user: userId });
        } catch (error) {
            console.error('❌ Failed to delete user activities:', error.message);
            return { deletedCount: 0 };
        }
    }

    /**
     * Get activity feed for dashboard
     * @param {string} userId - User ID
     * @param {number} limit - Number of activities
     * @returns {Promise<Array>} Formatted activity feed
     */
    async getActivityFeed(userId, limit = 10) {
        const activities = await this.getRecentActivities(userId, limit);
        
        // Format for display
        return activities.map(activity => ({
            id: activity._id,
            type: activity.type,
            description: activity.description,
            timeAgo: activity.timeAgo || this.getTimeAgo(activity.timestamp),
            timestamp: activity.timestamp,
            target: activity.target || null,
            metadata: activity.metadata || {},
        }));
    }

    /**
     * Helper: Get time ago string
     */
    getTimeAgo(timestamp) {
        const now = new Date();
        const diffMs = now - new Date(timestamp);
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        const diffMonth = Math.floor(diffDay / 30);
        const diffYear = Math.floor(diffMonth / 12);
        
        if (diffYear > 0) return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
        if (diffMonth > 0) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
        if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
        if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
        if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
        return 'Just now';
    }
}

export default new ActivityService();