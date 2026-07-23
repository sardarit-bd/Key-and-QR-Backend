import Order from "../order/order.model.js";
import QuoteAssignment from "../quoteAssignment/quoteAssignment.model.js";
import scanRepository from "../scan/scan.repository.js";
import Tag from "../tag/tag.model.js";
import Quote from "../quote/quote.model.js";
import Favorite from "../favorite/favorite.model.js";
import Subscription from "../subscription/subscription.model.js";
import heroRepository from "../hero/hero.repository.js";
import activityService from "./activity.service.js";
import authRepository from "../auth/auth.repository.js";
import logger from "../../utils/logger.js";

/**
 * Dashboard Service
 * Provides unified dashboard data for authenticated users
 */
class DashboardService {
    /**
     * Get complete dashboard overview — SINGLE aggregated endpoint
     * Returns everything the dashboard needs in one response
     */
    async getOverview(userId) {
        const [user, orders, tags, assignedQuotes, scanStats, recentActivity, favorites, subscription, hero, scanHistory] = await Promise.all([
            authRepository.findUserById(userId),
            Order.find({ user: userId }).populate("product", "name price image").sort({ createdAt: -1 }).limit(5).lean(),
            Tag.find({ owner: userId }).sort({ createdAt: -1 }).lean(),
            this.getAssignedQuotes(userId),
            scanRepository.getUserScanStats(userId),
            this.getRecentActivity(userId),
            Favorite.countDocuments({ user: userId, isDeleted: false }),
            Subscription.findOne({ user: userId, status: { $in: ["active", "trialing", "past_due"] } }).lean(),
            heroRepository.getHeroContent().catch(() => null),
            scanRepository.getUserScanHistory(userId, 1, 5),
        ]);

        // Build greeting
        const greeting = this.buildGreeting(user?.name);

        // Build streak from scan history
        const streak = this.calculateStreak(scanHistory?.data || []);

        // Determine subscription plan
        const plan = this.getPlan(subscription);

        // Build categories with counts
        const categories = this.buildCategories(assignedQuotes);

        // Build recent quotes from scan history
        const recentQuotes = (scanHistory?.data || []).map(scan => ({
            _id: scan._id,
            text: scan.quote?.text || "Quote viewed",
            category: scan.category || scan.quote?.category || "faith",
            author: scan.quote?.author || null,
            scannedAt: scan.createdAt,
        }));

        return {
            greeting,
            user: user ? {
                _id: user._id,
                name: user.name,
                email: user.email,
                profileImage: user.profileImage?.url || user.profileImage || null,
                createdAt: user.createdAt,
            } : null,
            subscription: {
                plan,
                status: subscription?.status || null,
                currentPeriodEnd: subscription?.currentPeriodEnd || null,
            },
            banner: hero ? {
                quote: hero.title || "Welcome to InspireTag",
                subtitle: hero.subtitle || "",
                ctaText: hero.buttonText || "Start Scanning",
            } : {
                quote: "Welcome to InspireTag",
                subtitle: "Scan your tag to receive daily inspiration",
                ctaText: "Start Scanning",
            },
            streak,
            recentQuotes,
            statistics: {
                totalQuotes: assignedQuotes.length,
                favorites,
                scans: scanStats.totalScans || 0,
                tags: tags.length,
            },
            categories,
            orders: orders.length,
            premium: {
                isPremium: plan === "subscriber" || plan === "premium",
                plan,
            },
            recentActivity,
        };
    }

    /**
     * Build time-based greeting
     */
    buildGreeting(name) {
        const hour = new Date().getHours();
        let timeGreeting;
        if (hour < 5) timeGreeting = "Good Night";
        else if (hour < 12) timeGreeting = "Good Morning";
        else if (hour < 17) timeGreeting = "Good Afternoon";
        else if (hour < 21) timeGreeting = "Good Evening";
        else timeGreeting = "Good Night";

        return {
            text: timeGreeting,
            name: name || "there",
            full: `${timeGreeting}, ${name || "there"}!`,
        };
    }

    /**
     * Calculate streak from scan history
     * Backend-only calculation — frontend just displays
     */
    calculateStreak(scans) {
        if (!scans || scans.length === 0) {
            return { current: 0, longest: 0, lastScanDate: null, weekActivity: [false, false, false, false, false, false, false] };
        }

        // Extract unique scan dates (YYYY-MM-DD)
        const scanDates = [...new Set(
            scans.map(s => new Date(s.createdAt).toISOString().split("T")[0])
        )].sort().reverse();

        if (scanDates.length === 0) {
            return { current: 0, longest: 0, lastScanDate: null, weekActivity: [false, false, false, false, false, false, false] };
        }

        // Build weekActivity: Monday=0 through Sunday=6
        const scanDateSet = new Set(scanDates);
        const weekActivity = [];
        const now = new Date();
        // Find Monday of current week
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);

        for (let i = 0; i < 7; i++) {
            const checkDate = new Date(monday);
            checkDate.setDate(monday.getDate() + i);
            const dateStr = checkDate.toISOString().split("T")[0];
            weekActivity.push(scanDateSet.has(dateStr));
        }

        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

        // Current streak: count consecutive days ending today or yesterday
        let current = 0;
        let checkDate = new Date();

        // If no scan today, start from yesterday
        if (scanDates[0] !== today) {
            if (scanDates[0] !== yesterday) {
                return { current: 0, longest: 0, lastScanDate: scanDates[0], weekActivity };
            }
            checkDate = new Date(Date.now() - 86400000);
        }

        for (const dateStr of scanDates) {
            const expected = checkDate.toISOString().split("T")[0];
            if (dateStr === expected) {
                current++;
                checkDate = new Date(checkDate.getTime() - 86400000);
            } else if (dateStr < expected) {
                break;
            }
        }

        // Longest streak from all scan dates
        let longest = 0;
        let streak = 1;
        for (let i = 1; i < scanDates.length; i++) {
            const prev = new Date(scanDates[i - 1]);
            const curr = new Date(scanDates[i]);
            const diffDays = (prev - curr) / 86400000;
            if (diffDays === 1) {
                streak++;
            } else {
                longest = Math.max(longest, streak);
                streak = 1;
            }
        }
        longest = Math.max(longest, streak);

        return { current, longest, lastScanDate: scanDates[0], weekActivity };
    }

    /**
     * Determine subscription plan
     */
    getPlan(subscription) {
        if (!subscription) return "free";
        if (["active", "trialing"].includes(subscription.status)) return "subscriber";
        if (subscription.status === "past_due") return "subscriber";
        return "free";
    }

    /**
     * Build categories with quote counts
     */
    buildCategories(assignedQuotes) {
        const categoryMap = {};
        for (const item of assignedQuotes) {
            const cat = item.quote?.category || "faith";
            categoryMap[cat] = (categoryMap[cat] || 0) + 1;
        }
        return Object.entries(categoryMap).map(([name, count]) => ({ name, count }));
    }

    /**
     * Get assigned quotes for user
     */
    async getAssignedQuotes(userId) {
        const tags = await Tag.find({ owner: userId }).lean();
        if (tags.length === 0) return [];

        const tagIds = tags.map(tag => tag._id);

        const [tagAssignments, userAssignments] = await Promise.all([
            QuoteAssignment.find({
                tag: { $in: tagIds },
                assignmentType: "tag",
                isActive: true,
            }).populate("quote", "text category author image theme allowReuse").populate("tag", "tagCode").sort({ priority: -1, createdAt: -1 }).lean(),
            QuoteAssignment.find({
                user: userId,
                assignmentType: "user",
                isActive: true,
            }).populate("quote", "text category author image theme allowReuse").populate("tag", "tagCode").sort({ priority: -1, createdAt: -1 }).lean(),
        ]);

        const allAssignments = [...tagAssignments, ...userAssignments];
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
     * Get recent activity
     */
    async getRecentActivity(userId) {
        const [orders, scans, favorites] = await Promise.all([
            Order.find({ user: userId }).sort({ createdAt: -1 }).limit(5).lean(),
            scanRepository.getUserScanHistory(userId, 1, 5),
            activityService.getRecentActivities(userId, 5),
        ]);

        const activities = [];

        for (const order of orders) {
            activities.push({
                type: "order",
                title: `Order #${order._id.toString().slice(-6)}`,
                description: order.product?.name || "Product ordered",
                date: order.createdAt,
            });
        }

        if (scans?.data) {
            for (const scan of scans.data) {
                activities.push({
                    type: "scan",
                    title: "Quote Scanned",
                    description: scan.quote?.text?.substring(0, 60) || "Quote viewed",
                    date: scan.createdAt,
                });
            }
        }

        for (const activity of favorites) {
            activities.push({
                type: activity.type,
                title: activity.type === "favorite_added" ? "Quote Saved" : "Quote Removed",
                description: activity.description || "",
                date: activity.timestamp || activity.createdAt,
            });
        }

        activities.sort((a, b) => new Date(b.date) - new Date(a.date));
        return activities.slice(0, 10);
    }

    /**
     * Get all orders for a user
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
     */
    async getTags(userId) {
        return Tag.find({ owner: userId }).sort({ createdAt: -1 });
    }

    /**
     * Get scan statistics for a user
     */
    async getScanStats(userId) {
        return scanRepository.getUserScanStats(userId);
    }

    /**
     * Check if user has any resources
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
