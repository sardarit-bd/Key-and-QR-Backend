import mongoose from "mongoose";
import User from "../../models/user.model.js";
import Order from "../order/order.model.js";
import Tag from "../tag/tag.model.js";
import Product from "../../models/product.model.js";
import Quote from "../quote/quote.model.js";
import PendingQuote from "../../models/pendingQuote.model.js";
import Subscription from "../subscription/subscription.model.js";
import Category from "../category/category.model.js";

const createAdmin = async (payload) => {
    return User.create(payload);
};

const getAllUsers = async ({ search, role, status, sort, page, limit } = {}) => {
    const filter = { isDeleted: false };

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
        ];
    }

    if (role && role !== "all") {
        filter.role = role;
    }

    if (status && status !== "all") {
        if (status === "active") {
            filter.isSuspended = false;
        } else if (status === "suspended") {
            filter.isSuspended = true;
        }
    }

    const sortOption = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [data, total] = await Promise.all([
        User.find(filter)
            .select("-password -passwordResetToken -passwordResetExpires -refreshToken")
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit)),
        User.countDocuments(filter),
    ]);

    return {
        users: data,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalItems: total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

const getUsersStats = async () => {
    const [totalUsers, activeUsers, suspendedUsers, adminCount, moderatorCount] = await Promise.all([
        User.countDocuments({ isDeleted: false }),
        User.countDocuments({ isDeleted: false, isSuspended: false }),
        User.countDocuments({ isDeleted: false, isSuspended: true }),
        User.countDocuments({ role: "admin", isDeleted: false }),
        User.countDocuments({ role: "moderator", isDeleted: false }),
    ]);

    return {
        totalUsers,
        activeUsers,
        suspendedUsers,
        adminCount,
        moderatorCount,
    };
};

const getUserById = async (id) => {
    try {
        const userId = id?.toString();
        if (!mongoose.Types.ObjectId.isValid(userId)) return null;
        return await User.findById(userId);
    } catch (error) {
        return null;
    }
};

const updateUserRole = async (id, role) => {
    return User.findByIdAndUpdate(id, { role }, { new: true });
};

const updateAdminProfile = async (id, payload) => {
    return User.findByIdAndUpdate(id, payload, { returnDocument: 'after' });
};

const deleteUser = async (id) => {
    return User.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
};

const suspendUser = async (id) => {
    return User.findByIdAndUpdate(id, { isSuspended: true }, { new: true }).select("-password -passwordResetToken -passwordResetExpires -refreshToken");
};

const activateUser = async (id) => {
    return User.findByIdAndUpdate(id, { isSuspended: false, isDeleted: false }, { new: true }).select("-password -passwordResetToken -passwordResetExpires -refreshToken");
};

const updateUser = async (id, updates) => {
    return User.findByIdAndUpdate(id, updates, { new: true }).select("-password -passwordResetToken -passwordResetExpires -refreshToken");
};

/**
 * Resolves Date Range boundaries and granularity for time-series analytics.
 */
function resolveDateRange({ range = "30d", startDate, endDate }) {
    const now = new Date();
    let start, end, prevStart, prevEnd, granularity;

    if (range === "today") {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        prevStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        prevEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        granularity = "hour";
    } else if (range === "yesterday") {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        prevStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        prevEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        granularity = "hour";
    } else if (range === "7d") {
        end = now;
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevEnd = start;
        prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
        granularity = "day";
    } else if (range === "this_month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = now;
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const dayOfMonth = now.getDate();
        prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth, now.getHours(), now.getMinutes());
        granularity = "day";
    } else if (range === "last_month") {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
        prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
        granularity = "day";
    } else if (range === "3m") {
        end = now;
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        prevEnd = start;
        prevStart = new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000);
        granularity = "week";
    } else if (range === "1y") {
        end = now;
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        prevEnd = start;
        prevStart = new Date(start.getTime() - 365 * 24 * 60 * 60 * 1000);
        granularity = "month";
    } else if (range === "custom" && startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
        const duration = end.getTime() - start.getTime();
        prevEnd = new Date(start.getTime() - 1);
        prevStart = new Date(prevEnd.getTime() - duration);
        granularity = duration > 120 * 24 * 60 * 60 * 1000 ? "month" : duration > 30 * 24 * 60 * 60 * 1000 ? "week" : "day";
    } else {
        // Default 30d
        end = now;
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevEnd = start;
        prevStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
        granularity = "day";
    }

    return { start, end, prevStart, prevEnd, granularity };
}

/**
 * Calculates percentage growth between current and previous values.
 */
function calculateGrowth(current, previous) {
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (prev === 0) {
        return cur > 0 ? 100 : 0;
    }
    return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/**
 * Generates continuous time-series buckets for charts.
 */
function generateTimeBuckets(start, end, granularity) {
    const buckets = [];
    const current = new Date(start);

    while (current <= end) {
        let key = "";
        let label = "";

        if (granularity === "hour") {
            key = current.toISOString().slice(0, 13) + ":00";
            label = current.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
            current.setHours(current.getHours() + 1);
        } else if (granularity === "day") {
            key = current.toISOString().slice(0, 10);
            label = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            current.setDate(current.getDate() + 1);
        } else if (granularity === "week") {
            key = current.toISOString().slice(0, 10);
            label = "Wk " + current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            current.setDate(current.getDate() + 7);
        } else if (granularity === "month") {
            key = current.toISOString().slice(0, 7);
            label = current.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            current.setMonth(current.getMonth() + 1);
        }

        buckets.push({ key, label, revenue: 0, orders: 0, aov: 0, prevRevenue: 0, prevOrders: 0, completedOrders: 0, cancelledOrders: 0, newCustomers: 0 });
    }

    return buckets;
}

/**
 * Complete Admin Dashboard Analytics & Overview Aggregation
 */
const getDashboardAnalytics = async ({ range = "30d", startDate, endDate } = {}) => {
    const { start, end, prevStart, prevEnd, granularity } = resolveDateRange({ range, startDate, endDate });

    // 1. Current & Previous Period KPI Aggregations
    const [
        currentRevenueAgg,
        prevRevenueAgg,
        currentOrdersCount,
        prevOrdersCount,
        currentUsersCount,
        prevUsersCount,
        totalUsersAllTime,
        totalProductsCount,
        totalQuotesCount,
        pendingQuotesCount,
        tagsAgg,
        productsStockAgg,
        ordersStatusAgg,
        paymentStatusAgg,
        topProductsAgg,
        categorySalesAgg,
        activeSubscriptionsCount,
        recentOrdersList,
        recentUsersList,
        timeSeriesOrdersCurrent,
        timeSeriesOrdersPrev,
        timeSeriesUsersCurrent,
    ] = await Promise.all([
        // Current Period Revenue
        Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end }, paymentStatus: { $in: ["paid", "succeeded"] } } },
            { $group: { _id: null, totalRevenue: { $sum: "$grandTotal" }, paidOrdersCount: { $sum: 1 } } },
        ]),
        // Previous Period Revenue
        Order.aggregate([
            { $match: { createdAt: { $gte: prevStart, $lte: prevEnd }, paymentStatus: { $in: ["paid", "succeeded"] } } },
            { $group: { _id: null, totalRevenue: { $sum: "$grandTotal" }, paidOrdersCount: { $sum: 1 } } },
        ]),
        // Current Orders Count
        Order.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        // Prev Orders Count
        Order.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
        // Current New Users
        User.countDocuments({ createdAt: { $gte: start, $lte: end }, isDeleted: false }),
        // Prev New Users
        User.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd }, isDeleted: false }),
        // Total Users All Time
        User.countDocuments({ isDeleted: false }),
        // Total Products
        Product.countDocuments({ isActive: true, deletedAt: null }),
        // Total Quotes
        Quote.countDocuments({ isActive: true }),
        // Pending Quotes
        PendingQuote.countDocuments({ status: "pending" }),
        // Tags Status Aggregation
        Tag.aggregate([
            {
                $group: {
                    _id: {
                        isActivated: "$isActivated",
                        hasOwner: { $gt: ["$owner", null] },
                        hasOrder: { $gt: ["$assignedOrderId", null] },
                    },
                    count: { $sum: 1 },
                },
            },
        ]),
        // Products Stock Status
        Product.aggregate([
            { $match: { isActive: true, deletedAt: null } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$stock", 0] },
                            "out_of_stock",
                            { $cond: [{ $lte: ["$stock", 10] }, "low_stock", "in_stock"] },
                        ],
                    },
                    count: { $sum: 1 },
                    products: { $push: { _id: "$_id", name: "$name", stock: "$stock", image: "$image.url", price: "$price" } },
                },
            },
        ]),
        // Orders Status Aggregation
        Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: "$fulfillmentStatus",
                    count: { $sum: 1 },
                    totalValue: { $sum: "$grandTotal" },
                },
            },
        ]),
        // Payment Health Status Aggregation
        Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: "$paymentStatus",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$grandTotal" },
                },
            },
        ]),
        // Top Products Aggregation
        Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end }, paymentStatus: { $in: ["paid", "succeeded"] } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.product",
                    unitsSold: { $sum: "$items.quantity" },
                    revenue: { $sum: "$items.subtotal" },
                },
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "categories",
                    localField: "productDetails.categoryId",
                    foreignField: "_id",
                    as: "categoryDetails",
                },
            },
            { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
        ]),
        // Category Sales Aggregation
        Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end }, paymentStatus: { $in: ["paid", "succeeded"] } } },
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.product",
                    foreignField: "_id",
                    as: "product",
                },
            },
            { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$product.categoryId",
                    revenue: { $sum: "$items.subtotal" },
                    unitsSold: { $sum: "$items.quantity" },
                },
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "category",
                },
            },
            { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        ]),
        // Active Subscriptions
        Subscription.countDocuments({ status: { $in: ["active", "trialing"] } }),
        // Recent 5 Orders
        Order.find()
            .populate("user", "name email profileImage")
            .populate("product", "name price image")
            .populate("items.product", "name price image")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
        // Recent 5 Users
        User.find({ isDeleted: false })
            .select("name email profileImage role createdAt isSuspended")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
        // Time series current orders
        Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            {
                $project: {
                    createdAt: 1,
                    grandTotal: 1,
                    paymentStatus: 1,
                    fulfillmentStatus: 1,
                    isPaid: { $in: ["$paymentStatus", ["paid", "succeeded"]] },
                },
            },
        ]),
        // Time series prev orders
        Order.aggregate([
            { $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
            {
                $project: {
                    createdAt: 1,
                    grandTotal: 1,
                    paymentStatus: 1,
                    isPaid: { $in: ["$paymentStatus", ["paid", "succeeded"]] },
                },
            },
        ]),
        // Time series users current
        User.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end }, isDeleted: false } },
            { $project: { createdAt: 1 } },
        ]),
    ]);

    // Format KPIs
    const curRevenue = currentRevenueAgg[0]?.totalRevenue || 0;
    const prevRevenue = prevRevenueAgg[0]?.totalRevenue || 0;
    const revenueGrowth = calculateGrowth(curRevenue, prevRevenue);

    const ordersGrowth = calculateGrowth(currentOrdersCount, prevOrdersCount);

    const curPaidOrdersCount = currentRevenueAgg[0]?.paidOrdersCount || 0;
    const prevPaidOrdersCount = prevRevenueAgg[0]?.paidOrdersCount || 0;

    const curAOV = curPaidOrdersCount > 0 ? Math.round((curRevenue / curPaidOrdersCount) * 100) / 100 : 0;
    const prevAOV = prevPaidOrdersCount > 0 ? Math.round((prevRevenue / prevPaidOrdersCount) * 100) / 100 : 0;
    const aovGrowth = calculateGrowth(curAOV, prevAOV);

    const customersGrowth = calculateGrowth(currentUsersCount, prevUsersCount);

    // Build continuous time-series buckets
    const timeBuckets = generateTimeBuckets(start, end, granularity);
    const bucketMap = new Map();
    timeBuckets.forEach((b) => bucketMap.set(b.key, b));

    // Populate Current Period Orders & Revenue
    timeSeriesOrdersCurrent.forEach((ord) => {
        const d = new Date(ord.createdAt);
        let key = "";
        if (granularity === "hour") key = d.toISOString().slice(0, 13) + ":00";
        else if (granularity === "day") key = d.toISOString().slice(0, 10);
        else if (granularity === "week") key = d.toISOString().slice(0, 10);
        else if (granularity === "month") key = d.toISOString().slice(0, 7);

        let bucket = bucketMap.get(key);
        if (!bucket) {
            // Find closest bucket
            const keys = Array.from(bucketMap.keys());
            key = keys.find((k) => k <= key) || keys[0];
            bucket = bucketMap.get(key);
        }

        if (bucket) {
            bucket.orders += 1;
            if (ord.isPaid) {
                bucket.revenue += Number(ord.grandTotal) || 0;
            }
            if (ord.fulfillmentStatus === "delivered" || ord.fulfillmentStatus === "completed") {
                bucket.completedOrders += 1;
            }
            if (ord.fulfillmentStatus === "cancelled") {
                bucket.cancelledOrders += 1;
            }
        }
    });

    // Populate Previous Period Orders & Revenue for comparison
    const prevDuration = end.getTime() - start.getTime();
    timeSeriesOrdersPrev.forEach((ord) => {
        const d = new Date(new Date(ord.createdAt).getTime() + prevDuration);
        let key = "";
        if (granularity === "hour") key = d.toISOString().slice(0, 13) + ":00";
        else if (granularity === "day") key = d.toISOString().slice(0, 10);
        else if (granularity === "week") key = d.toISOString().slice(0, 10);
        else if (granularity === "month") key = d.toISOString().slice(0, 7);

        const bucket = bucketMap.get(key);
        if (bucket) {
            bucket.prevOrders += 1;
            if (ord.isPaid) {
                bucket.prevRevenue += Number(ord.grandTotal) || 0;
            }
        }
    });

    // Populate New Customers
    timeSeriesUsersCurrent.forEach((u) => {
        const d = new Date(u.createdAt);
        let key = "";
        if (granularity === "hour") key = d.toISOString().slice(0, 13) + ":00";
        else if (granularity === "day") key = d.toISOString().slice(0, 10);
        else if (granularity === "week") key = d.toISOString().slice(0, 10);
        else if (granularity === "month") key = d.toISOString().slice(0, 7);

        const bucket = bucketMap.get(key);
        if (bucket) {
            bucket.newCustomers += 1;
        }
    });

    // Calculate AOV for each bucket
    timeBuckets.forEach((b) => {
        b.revenue = Math.round(b.revenue * 100) / 100;
        b.prevRevenue = Math.round(b.prevRevenue * 100) / 100;
        b.aov = b.orders > 0 ? Math.round((b.revenue / b.orders) * 100) / 100 : 0;
    });

    // Process Orders By Status
    const ordersByStatusMap = {
        pending: { name: "Pending", count: 0, value: 0, color: "#f59e0b" },
        processing: { name: "Processing", count: 0, value: 0, color: "#eab308" },
        assigned: { name: "Assigned", count: 0, value: 0, color: "#3b82f6" },
        shipped: { name: "Shipped", count: 0, value: 0, color: "#14b8a6" },
        delivered: { name: "Delivered", count: 0, value: 0, color: "#10b981" },
        cancelled: { name: "Cancelled", count: 0, value: 0, color: "#ef4444" },
        returned: { name: "Returned", count: 0, value: 0, color: "#8b5cf6" },
    };

    let totalOrdersWithStatus = 0;
    ordersStatusAgg.forEach((item) => {
        const rawStatus = (item._id || "pending").toLowerCase();
        const key = rawStatus === "completed" ? "delivered" : rawStatus === "pending_assignment" ? "pending" : rawStatus;
        if (ordersByStatusMap[key]) {
            ordersByStatusMap[key].count += item.count;
            ordersByStatusMap[key].value += item.totalValue || 0;
            totalOrdersWithStatus += item.count;
        }
    });

    const ordersByStatusList = Object.values(ordersByStatusMap).map((s) => ({
        ...s,
        value: Math.round(s.value * 100) / 100,
        percentage: totalOrdersWithStatus > 0 ? Math.round((s.count / totalOrdersWithStatus) * 1000) / 10 : 0,
    }));

    // Process Payment Health
    const paymentHealthMap = {
        paid: { name: "Paid", count: 0, amount: 0, color: "#10b981" },
        pending: { name: "Pending", count: 0, amount: 0, color: "#f59e0b" },
        failed: { name: "Failed", count: 0, amount: 0, color: "#ef4444" },
        refunded: { name: "Refunded", count: 0, amount: 0, color: "#6b7280" },
    };

    let totalPaymentCount = 0;
    paymentStatusAgg.forEach((item) => {
        const raw = (item._id || "pending").toLowerCase();
        const key = raw === "succeeded" ? "paid" : raw === "partially_refunded" ? "refunded" : raw;
        if (paymentHealthMap[key]) {
            paymentHealthMap[key].count += item.count;
            paymentHealthMap[key].amount += item.totalAmount || 0;
            totalPaymentCount += item.count;
        }
    });

    const paymentHealthList = Object.values(paymentHealthMap).map((p) => ({
        ...p,
        amount: Math.round(p.amount * 100) / 100,
        percentage: totalPaymentCount > 0 ? Math.round((p.count / totalPaymentCount) * 1000) / 10 : 0,
    }));

    const failedPaymentsCount = paymentHealthMap.failed.count;

    // Process Inventory Health
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let lowStockProducts = [];

    productsStockAgg.forEach((item) => {
        if (item._id === "in_stock") inStockCount += item.count;
        else if (item._id === "low_stock") {
            lowStockCount += item.count;
            lowStockProducts.push(...item.products);
        } else if (item._id === "out_of_stock") {
            outOfStockCount += item.count;
            lowStockProducts.push(...item.products);
        }
    });

    const totalStockProducts = inStockCount + lowStockCount + outOfStockCount;
    const inventoryHealthList = [
        { name: "In Stock", count: inStockCount, percentage: totalStockProducts > 0 ? Math.round((inStockCount / totalStockProducts) * 1000) / 10 : 0, color: "#10b981" },
        { name: "Low Stock", count: lowStockCount, percentage: totalStockProducts > 0 ? Math.round((lowStockCount / totalStockProducts) * 1000) / 10 : 0, color: "#f59e0b" },
        { name: "Out of Stock", count: outOfStockCount, percentage: totalStockProducts > 0 ? Math.round((outOfStockCount / totalStockProducts) * 1000) / 10 : 0, color: "#ef4444" },
    ];

    // Process QR Tag Status
    let availableTagsCount = 0;
    let assignedTagsCount = 0;
    let activatedTagsCount = 0;

    tagsAgg.forEach((t) => {
        if (t._id.isActivated) {
            activatedTagsCount += t.count;
        } else if (t._id.hasOwner || t._id.hasOrder) {
            assignedTagsCount += t.count;
        } else {
            availableTagsCount += t.count;
        }
    });

    const totalTagsCount = availableTagsCount + assignedTagsCount + activatedTagsCount;
    const tagStatusList = [
        { name: "Available", count: availableTagsCount, percentage: totalTagsCount > 0 ? Math.round((availableTagsCount / totalTagsCount) * 1000) / 10 : 0, color: "#10b981" },
        { name: "Assigned", count: assignedTagsCount, percentage: totalTagsCount > 0 ? Math.round((assignedTagsCount / totalTagsCount) * 1000) / 10 : 0, color: "#3b82f6" },
        { name: "Activated", count: activatedTagsCount, percentage: totalTagsCount > 0 ? Math.round((activatedTagsCount / totalTagsCount) * 1000) / 10 : 0, color: "#8b5cf6" },
    ];

    // Process Top Products
    const topProducts = topProductsAgg.map((p) => ({
        id: p._id,
        name: p.productDetails?.name || "Product",
        price: p.productDetails?.price || 0,
        image: p.productDetails?.image?.url || null,
        unitsSold: p.unitsSold,
        revenue: Math.round(p.revenue * 100) / 100,
        categoryName: p.categoryDetails?.name || "General",
    }));

    // Process Category Sales
    let totalCategoryRevenue = 0;
    categorySalesAgg.forEach((c) => (totalCategoryRevenue += c.revenue || 0));

    const categorySales = categorySalesAgg.map((c) => ({
        id: c._id,
        name: c.category?.name || "Other",
        slug: c.category?.slug || "other",
        revenue: Math.round((c.revenue || 0) * 100) / 100,
        unitsSold: c.unitsSold || 0,
        percentage: totalCategoryRevenue > 0 ? Math.round(((c.revenue || 0) / totalCategoryRevenue) * 1000) / 10 : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    // Quote Moderation
    const quoteModeration = [
        { name: "Pending", count: pendingQuotesCount, color: "#f59e0b" },
        { name: "Approved", count: totalQuotesCount, color: "#10b981" },
    ];

    // Subscription Analytics
    const subscriptionAnalytics = {
        activeSubscribers: activeSubscriptionsCount,
        monthlyRevenue: Math.round(activeSubscriptionsCount * 4.99 * 100) / 100,
        statusBreakdown: [
            { name: "Active", count: activeSubscriptionsCount, color: "#10b981" },
        ],
    };

    // Action Required Alerts
    const pendingOrdersCount = ordersByStatusMap.pending.count + ordersByStatusMap.assigned.count;
    const actionRequired = {
        pendingOrdersCount,
        failedPaymentsCount,
        lowStockCount: lowStockCount + outOfStockCount,
        pendingQuotesCount,
        unassignedTagsCount: availableTagsCount,
        hasAlerts: pendingOrdersCount > 0 || failedPaymentsCount > 0 || outOfStockCount > 0 || pendingQuotesCount > 0,
    };

    // Recent Activities synthetic / real stream
    const recentActivity = [
        ...recentOrdersList.slice(0, 3).map((ord) => ({
            _id: `ord_${ord._id}`,
            type: ord.paymentStatus === "paid" ? "order_paid" : "order_created",
            message: `Order #${ord._id.toString().slice(-6).toUpperCase()} by ${ord.user?.name || "Guest"}`,
            details: `$${Number(ord.grandTotal || 0).toFixed(2)} · ${ord.items?.[0]?.product?.name || "Product"}`,
            createdAt: ord.createdAt,
        })),
        ...recentUsersList.slice(0, 2).map((u) => ({
            _id: `user_${u._id}`,
            type: "user_registered",
            message: `New customer registered: ${u.name || u.email}`,
            details: u.email,
            createdAt: u.createdAt,
        })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
        range,
        period: {
            start,
            end,
            prevStart,
            prevEnd,
            granularity,
        },
        stats: {
            totalRevenue: curRevenue,
            revenueGrowth,
            prevRevenue,
            totalOrders: currentOrdersCount,
            ordersGrowth,
            prevOrders: prevOrdersCount,
            averageOrderValue: curAOV,
            aovGrowth,
            prevAOV,
            newCustomers: currentUsersCount,
            customersGrowth,
            prevCustomers: prevUsersCount,
            totalUsersAllTime,
            totalProducts: totalProductsCount,
            totalQuotes: totalQuotesCount,
            pendingQuotesCount,
            activeTagsCount: activatedTagsCount,
            availableTagsCount,
        },
        charts: {
            salesTrend: timeBuckets,
            ordersTrend: timeBuckets.map((b) => ({
                date: b.key,
                label: b.label,
                totalOrders: b.orders,
                completedOrders: b.completedOrders,
                cancelledOrders: b.cancelledOrders,
            })),
            customerGrowth: timeBuckets.map((b) => ({
                date: b.key,
                label: b.label,
                newCustomers: b.newCustomers,
            })),
            aovTrend: timeBuckets.map((b) => ({
                date: b.key,
                label: b.label,
                aov: b.aov,
                revenue: b.revenue,
                orders: b.orders,
            })),
            ordersByStatus: ordersByStatusList,
            paymentHealth: paymentHealthList,
            inventoryHealth: inventoryHealthList,
            tagStatus: tagStatusList,
            topProducts,
            categorySales,
            quoteModeration,
            subscriptionAnalytics,
        },
        actionRequired,
        recentOrders: recentOrdersList.map((ord) => ({
            _id: ord._id,
            user: ord.user,
            product: ord.items?.[0]?.product || ord.product,
            total: ord.grandTotal || 0,
            paymentStatus: ord.paymentStatus,
            fulfillmentStatus: ord.fulfillmentStatus,
            createdAt: ord.createdAt,
        })),
        recentUsers: recentUsersList,
        recentActivity,
    };
};

export default {
    createAdmin,
    getAllUsers,
    getUsersStats,
    getUserById,
    updateUserRole,
    updateAdminProfile,
    deleteUser,
    suspendUser,
    activateUser,
    updateUser,
    getDashboardAnalytics,
};