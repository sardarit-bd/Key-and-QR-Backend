import Order from "../order/order.model.js";
import orderRepository from "../order/order.repository.js";
import QuoteAssignment from "../quoteAssignment/quoteAssignment.model.js";
import scanRepository from "../scan/scan.repository.js";
import Tag from "../tag/tag.model.js";


/**
 * Dashboard Service
 * Provides unified dashboard data for authenticated users
 * All data automatically includes claimed guest resources
 */
class DashboardService {
    /**
     * Get complete dashboard data for a user
     * One unified response with all user resources
     */
    async getDashboard(userId) {
        // Run queries in parallel for performance
        const [
            orders,
            tags,
            assignedQuotes,
            scanStats,
            recentActivity,
        ] = await Promise.all([
            this.getOrders(userId),
            this.getTags(userId),
            this.getAssignedQuotes(userId),
            this.getScanStats(userId),
            this.getRecentActivity(userId),
        ]);

        return {
            summary: {
                totalOrders: orders.length,
                totalTags: tags.length,
                totalQuotes: assignedQuotes.length,
                totalScans: scanStats.totalScans || 0,
            },
            orders,
            tags,
            quotes: assignedQuotes,
            scanStats,
            recentActivity,
        };
    }

    /**
     * Get all orders for a user
     * Includes claimed guest orders automatically
     * Order.find({ user: userId }) works after claim
     */
    async getOrders(userId) {
        return Order.find({ user: userId })
            .populate("product", "name price image")
            .populate("assignedTag", "tagCode")
            .populate("assignedTags.tag", "tagCode")
            .sort({ createdAt: -1 });
    }

    /**
     * Get all tags for a user
     * Includes claimed guest tags automatically
     * Tag.find({ owner: userId }) works after claim
     */
    async getTags(userId) {
        return Tag.find({ owner: userId })
            .sort({ createdAt: -1 });
    }

    /**
     * Get all assigned quotes for a user
     * Quotes are assigned via Tag → QuoteAssignment → Quote
     * Need to find through tags and assignments
     */
    async getAssignedQuotes(userId) {
        // 1. Get all tags owned by user
        const tags = await Tag.find({ owner: userId });

        if (tags.length === 0) {
            return [];
        }

        const tagIds = tags.map(tag => tag._id);

        // 2. Find quote assignments for these tags
        const assignments = await QuoteAssignment.find({
            tag: { $in: tagIds },
            assignmentType: "tag",
            isActive: true,
        })
            .populate("quote", "text category author image theme allowReuse")
            .populate("tag", "tagCode")
            .sort({ priority: -1, createdAt: -1 });

        // 3. Also check user-level assignments (for user-specific quotes)
        const userAssignments = await QuoteAssignment.find({
            user: userId,
            assignmentType: "user",
            isActive: true,
        })
            .populate("quote", "text category author image theme allowReuse")
            .populate("tag", "tagCode")
            .sort({ priority: -1, createdAt: -1 });

        // 4. Combine and deduplicate
        const allAssignments = [...assignments, ...userAssignments];

        // 5. Return unique quotes with assignment context
        const uniqueQuotes = [];
        const quoteMap = new Map();

        for (const assignment of allAssignments) {
            if (!assignment.quote) continue;

            const quoteId = assignment.quote._id.toString();

            if (!quoteMap.has(quoteId)) {
                quoteMap.set(quoteId, {
                    quote: assignment.quote,
                    tags: [],
                    assignmentType: assignment.assignmentType,
                });
            }

            if (assignment.tag) {
                quoteMap.get(quoteId).tags.push(assignment.tag.tagCode);
            }
        }

        return Array.from(quoteMap.values());
    }

    /**
     * Get scan statistics for a user
     * Includes scans from before claim (if recorded)
     */
    async getScanStats(userId) {
        return scanRepository.getUserScanStats(userId);
    }

    /**
     * Get recent activity for dashboard
     * Last 10 activities across all resources
     */
    async getRecentActivity(userId) {
        const [orders, scans, tagActivations, favorites] = await Promise.all([
            // ✅ Recent orders
            Order.find({ user: userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),

            // ✅ Recent scans
            scanRepository.getUserScanHistory(userId, 1, 5),

            // ✅ Recent tag activations
            Tag.find({
                owner: userId,
                activatedAt: { $ne: null }
            })
                .sort({ activatedAt: -1 })
                .limit(5)
                .lean(),

            // ✅ Recent favorite activities
            activityService.getRecentActivities(userId, 5),
        ]);

        // Combine and sort by date
        const activities = [];

        // Add orders
        for (const order of orders) {
            activities.push({
                type: 'order',
                title: `Order #${order._id.toString().slice(-6)}`,
                description: `Product: ${order.product?.name || 'Unknown'}`,
                date: order.createdAt,
                metadata: { orderId: order._id },
            });
        }

        // Add scans
        if (scans.data && scans.data.length > 0) {
            for (const scan of scans.data) {
                activities.push({
                    type: 'scan',
                    title: 'QR Code Scanned',
                    description: scan.quote?.text || 'Quote viewed',
                    date: scan.createdAt,
                    metadata: { scanId: scan._id },
                });
            }
        }

        // Add tag activations
        for (const tag of tagActivations) {
            activities.push({
                type: 'tag_activation',
                title: `Tag Activated`,
                description: `Tag Code: ${tag.tagCode}`,
                date: tag.activatedAt,
                metadata: { tagId: tag._id },
            });
        }

        // Add favorite activities
        for (const activity of favorites) {
            const typeMap = {
                'favorite_added': 'Added to favorites',
                'favorite_removed': 'Removed from favorites',
            };

            activities.push({
                type: activity.type,
                title: typeMap[activity.type] || activity.type,
                description: activity.description,
                date: activity.timestamp || activity.createdAt,
                metadata: activity.metadata,
            });
        }

        // Sort by date (newest first) and limit to 10
        activities.sort((a, b) => new Date(b.date) - new Date(a.date));
        return activities.slice(0, 10);
    }

    /**
     * Check if user has any resources
     * Used for onboarding/welcome message
     */
    async hasResources(userId) {
        const [orderCount, tagCount] = await Promise.all([
            Order.countDocuments({ user: userId }),
            Tag.countDocuments({ owner: userId }),
        ]);

        return orderCount > 0 || tagCount > 0;
    }

    /**
     * Get resource count summary
     * Lightweight summary for navbar/header
     */
    async getResourceCounts(userId) {
        const [orderCount, tagCount, scanCount] = await Promise.all([
            Order.countDocuments({ user: userId }),
            Tag.countDocuments({ owner: userId }),
            scanRepository.getUserScanCount(userId),
        ]);

        return {
            orders: orderCount,
            tags: tagCount,
            scans: scanCount || 0,
        };
    }
}

export default new DashboardService();