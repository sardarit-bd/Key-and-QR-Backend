import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderRepository from "./order.repository.js";
import tagRepository from "../tag/tag.repository.js";
import productRepository from "../product/product.repository.js";
import stripe from "../../config/stripe.js";
import env from "../../config/env.js";
import Order from "./order.model.js";
import mongoose from "mongoose";
import pendingQuoteRepository from "../pendingQuote/pendingQuote.repository.js";

// ============================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================

/**
 * Build shipping address from payload
 */
const buildShippingAddress = (payload) => ({
    fullName: payload.fullName || payload.shippingAddress?.fullName || null,
    email: payload.email || payload.shippingAddress?.email || null,
    phone: payload.phone || payload.shippingAddress?.phone || null,
    address: payload.address || payload.shippingAddress?.address || null,
    city: payload.city || payload.shippingAddress?.city || null,
    postalCode: payload.postalCode || payload.shippingAddress?.postalCode || null,
    country: payload.country || payload.shippingAddress?.country || null,
});

/**
 * Build guest customer data from payload
 */
const buildGuestCustomer = (payload) => ({
    fullName: payload.guestCustomer?.fullName || payload.fullName || null,
    email: payload.guestCustomer?.email || payload.email || null,
    phone: payload.guestCustomer?.phone || payload.phone || null,
});

/**
 * Ensure order tags are editable
 */
const ensureOrderTagsEditable = (order) => {
    if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            "Tags cannot be changed after the order has been shipped or delivered",
        );
    }

    if (["cancelled", "returned"].includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            "Tags cannot be manually changed for cancelled or returned orders",
        );
    }
};

/**
 * Get tag ID from various formats
 */
const getTagId = (item) => {
    const value = item?.tag || item;
    if (!value) return null;
    if (value._id) return value._id.toString();
    return value.toString();
};

/**
 * Build tag assignment status
 */
const buildTagAssignmentStatus = (assignedCount, requiredQty) => {
    if (assignedCount === 0) return "none";
    if (assignedCount < requiredQty) return "partial";
    return "complete";
};

/**
 * Ensure tag is available for order assignment
 */
const ensureTagAvailableForOrder = async (tagId, orderId, orderUserId) => {
    const tag = await tagRepository.findById(tagId);

    if (!tag) {
        throw new AppError(404, "Tag not found");
    }

    if (!tag.isActive) {
        throw new AppError(400, "This tag is disabled");
    }

    if (tag.owner && tag.owner.toString() !== orderUserId.toString()) {
        throw new AppError(
            400,
            "This tag is already assigned to another user/order",
        );
    }

    const existingOrderWithTag = await Order.findOne({
        _id: { $ne: orderId },
        fulfillmentStatus: { $nin: ["cancelled", "returned"] },
        $or: [{ assignedTag: tagId }, { "assignedTags.tag": tagId }],
    });

    if (existingOrderWithTag) {
        throw new AppError(
            400,
            "This tag is already assigned to another active order",
        );
    }

    return tag;
};

/**
 * Build checkout metadata for Stripe
 */
const buildCheckoutMetadata = (order) => {
    const metadata = {
        orderId: order._id.toString(),
    };

    if (order.user) {
        metadata.userId = order.user.toString();
    }

    if (order.isGuestOrder && order.guestCustomer) {
        metadata.guestEmail = order.guestCustomer.email;
        metadata.guestName = order.guestCustomer.fullName;
        metadata.isGuestOrder = "true";
    }

    return metadata;
};

/**
 * Get customer email for Stripe
 */
const getCustomerEmail = (order) => {
    return order.isGuestOrder
        ? order.guestCustomer?.email
        : order.user?.email;
};

/**
 * Handle existing order update for checkout
 */
const handleExistingOrder = async (userId, payload, isGuest) => {
    const order = await orderRepository.findById(payload.orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Authorization check
    if (!isGuest) {
        if (order.user.toString() !== userId.toString()) {
            throw new AppError(httpStatus.FORBIDDEN, "Unauthorized");
        }
    } else {
        if (order.guestCustomer?.email !== payload.guestCustomer?.email) {
            throw new AppError(httpStatus.FORBIDDEN, "Invalid guest access");
        }
    }

    if (order.paymentStatus === "paid") {
        throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");
    }

    // Update shipping address if provided
    if (payload.address || payload.fullName) {
        const shippingAddress = {
            fullName: payload.fullName || order.shippingAddress?.fullName,
            email: payload.email || order.shippingAddress?.email,
            phone: payload.phone || order.shippingAddress?.phone,
            address: payload.address || order.shippingAddress?.address,
            city: payload.city || order.shippingAddress?.city,
            postalCode: payload.postalCode || order.shippingAddress?.postalCode,
            country: payload.country || order.shippingAddress?.country,
        };
        await orderRepository.updateOrder(payload.orderId, { shippingAddress });

        // Also update guest customer if guest
        if (isGuest && payload.guestCustomer) {
            await orderRepository.updateOrder(payload.orderId, {
                guestCustomer: {
                    fullName: payload.guestCustomer.fullName || shippingAddress.fullName,
                    email: payload.guestCustomer.email || shippingAddress.email,
                    phone: payload.guestCustomer.phone || shippingAddress.phone,
                },
            });
        }
    }

    return order;
};

// ============================================================
// PUBLIC SERVICE FUNCTIONS
// ============================================================

/**
 * Create Order (Supports both Guest & Authenticated)
 */
const createOrder = async (userId, payload, isGuest = false) => {
    const product = await productRepository.getProductById(payload.productId);

    if (!product) {
        throw new AppError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (product.stock < (Number(payload.quantity) || 1)) {
        throw new AppError(httpStatus.BAD_REQUEST, "Not enough stock available");
    }

    const purchaseType = payload.purchaseType || "self";

    // Build shipping address
    const shippingAddress = buildShippingAddress(payload);

    // Build guest customer data (null for authenticated users)
    const guestCustomer = isGuest ? buildGuestCustomer(payload) : null;

    const orderData = {
        user: userId || null,
        guestCustomer,
        product: payload.productId,
        quantity: Number(payload.quantity) || 1,
        purchaseType,
        giftMessage: purchaseType === "gift" ? payload.giftMessage || null : null,
        giftMessageStatus: purchaseType === "gift" ? "pending" : "none",
        giftStatus: purchaseType === "gift" ? "pending_claim" : "none",
        shippingAddress,
        isGuestOrder: isGuest,
    };

    const order = await orderRepository.createOrder(orderData);

    // Handle gift message if applicable
    if (purchaseType === "gift" && payload.giftMessage) {
        await pendingQuoteRepository.createPendingQuote({
            text: payload.giftMessage,
            user: userId,
            order: order._id,
            status: "pending",
            category: "other",
        });
    }

    return order;
};

/**
 * Create Checkout (Supports both Guest & Authenticated)
 */
const createCheckout = async (userId, payload, isGuest = false) => {
    let order;

    if (payload.orderId) {
        // Handle existing order (for retry or update)
        order = await handleExistingOrder(userId, payload, isGuest);
    } else {
        // Create new order
        order = await createOrder(userId, payload, isGuest);
    }

    // Create Stripe checkout session
    return createCheckoutSession(order._id);
};

/**
 * Create Stripe Checkout Session
 */
const createCheckoutSession = async (orderId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Build metadata
    const metadata = buildCheckoutMetadata(order);
    const customerEmail = getCustomerEmail(order);

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: customerEmail,
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: order.product.name,
                    },
                    unit_amount: order.product.price * 100,
                },
                quantity: order.quantity || 1,
            },
        ],
        success_url: `${env.clientUrl}/success?orderId=${orderId}`,
        cancel_url: `${env.clientUrl}/cancel`,
        metadata: metadata,
    });

    await orderRepository.updateOrder(orderId, { stripeSessionId: session.id });

    return session;
};

/**
 * Confirm Payment & Assign Tags
 */
const confirmPaymentAndAssignTag = async (orderId, paymentIntentId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    const requiredQty = order.quantity || 1;

    // Decrease stock
    const updatedProduct = await productRepository.decreaseStock(
        order.product._id || order.product,
        requiredQty,
    );

    if (!updatedProduct) {
        throw new AppError(httpStatus.BAD_REQUEST, "Not enough stock available");
    }

    const updateData = {
        paymentStatus: "paid",
        stripePaymentIntentId: paymentIntentId,
    };

    // Assign tags
    let availableTags = [];

    try {
        availableTags = await tagRepository.findMultipleUnusedTags(requiredQty);
    } catch (err) {
        console.warn("⚠️ No tags available for order:", orderId);
    }

    const assignedTags = availableTags.map((tag) => ({
        tag: tag._id,
        assignedAt: new Date(),
        assignedBy: "auto",
    }));

    for (const tag of availableTags) {
        await tagRepository.updateTag(tag._id, {
            owner: order.user,
            isActivated: true,
            activatedAt: new Date(),
        });
    }

    updateData.assignedTags = assignedTags;

    // Backward compatibility: keep first tag in old assignedTag field
    if (assignedTags.length > 0) {
        updateData.assignedTag = assignedTags[0].tag;
    }

    // Update tag assignment status
    if (assignedTags.length === 0) {
        updateData.tagAssignmentStatus = "none";
        updateData.fulfillmentStatus = "pending";
    } else if (assignedTags.length < requiredQty) {
        updateData.tagAssignmentStatus = "partial";
        updateData.fulfillmentStatus = "pending";
    } else {
        updateData.tagAssignmentStatus = "complete";
        updateData.fulfillmentStatus = "assigned";
    }

    return orderRepository.updateOrder(orderId, updateData);
};

/**
 * Claim Gift Order
 */
const claimGiftOrder = async (orderId, userId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    if (order.purchaseType !== "gift") {
        throw new AppError(httpStatus.BAD_REQUEST, "This order is not a gift order");
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(httpStatus.BAD_REQUEST, "Gift order is not paid yet");
    }

    if (!order.assignedTag) {
        throw new AppError(httpStatus.BAD_REQUEST, "No tag assigned to this gift order");
    }

    if (order.giftStatus === "claimed") {
        throw new AppError(httpStatus.BAD_REQUEST, "This gift has already been claimed");
    }

    const tag = await tagRepository.findById(order.assignedTag);

    if (!tag) {
        throw new AppError(httpStatus.NOT_FOUND, "Assigned tag not found");
    }

    if (tag.owner) {
        throw new AppError(httpStatus.BAD_REQUEST, "This gift tag is already owned by someone");
    }

    await tagRepository.updateTag(tag._id, {
        owner: userId,
        isActivated: true,
        activatedAt: new Date(),
    });

    return orderRepository.updateOrder(orderId, {
        giftStatus: "claimed",
        giftClaimedBy: userId,
        giftClaimedAt: new Date(),
    });
};

/**
 * Get Order By ID
 */
const getOrderById = async (id) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    return order;
};

/**
 * Get Authenticated User's Orders with Pagination
 */
const getUserOrders = async (userId, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    const total = await Order.countDocuments({ user: userId });

    const orders = await Order.find({ user: userId })
        .populate("product", "name price image")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return {
        data: orders,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
        },
    };
};

/**
 * Get User's Total Spent
 */
const getUserTotalSpent = async (userId) => {
    try {
        // Convert string ID to ObjectId safely
        let objectId;
        try {
            objectId = new mongoose.Types.ObjectId(userId);
        } catch (err) {
            console.error("Invalid userId format:", userId);
            return 0;
        }

        const result = await Order.aggregate([
            {
                $match: {
                    user: objectId,
                    paymentStatus: "paid",
                },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productData",
                },
            },
            {
                $unwind: {
                    path: "$productData",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ["$productData.price", 0] },
                                { $ifNull: ["$quantity", 1] },
                            ],
                        },
                    },
                },
            },
        ]);

        return result[0]?.total || 0;
    } catch (error) {
        console.error("Error in getUserTotalSpent:", error);
        // Fallback to simple calculation
        try {
            const orders = await Order.find({
                user: userId,
                paymentStatus: "paid",
            }).populate("product", "price");

            return orders.reduce((sum, order) => {
                const price = order.product?.price || 0;
                const quantity = order.quantity || 1;
                return sum + price * quantity;
            }, 0);
        } catch (fallbackError) {
            console.error("Fallback calculation also failed:", fallbackError);
            return 0;
        }
    }
};

/**
 * Get All Orders (Admin) with Search & Filter
 */
const getAllOrders = async (
    page = 1,
    limit = 10,
    search = "",
    fulfillmentStatus = null,
) => {
    const skip = (page - 1) * limit;

    const filter = {};

    if (fulfillmentStatus && fulfillmentStatus !== "all") {
        filter.fulfillmentStatus = fulfillmentStatus;
    }

    let query = Order.find(filter)
        .populate("user", "name email")
        .populate("product", "name price image")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 });

    let orders = await query.lean();
    let total = orders.length;

    if (search && search.trim() !== "") {
        const searchLower = search.toLowerCase().trim();

        orders = orders.filter((order) => {
            if (order._id.toString().toLowerCase().includes(searchLower)) return true;
            if (order.user?.name?.toLowerCase().includes(searchLower)) return true;
            if (order.user?.email?.toLowerCase().includes(searchLower)) return true;
            if (order.product?.name?.toLowerCase().includes(searchLower)) return true;
            if (order.shippingAddress?.address?.toLowerCase().includes(searchLower))
                return true;
            if (order.shippingAddress?.fullName?.toLowerCase().includes(searchLower))
                return true;

            // Search by assigned tag codes
            if (order.assignedTag?.tagCode?.toLowerCase().includes(searchLower))
                return true;

            const matchedAssignedTags = order.assignedTags?.some((item) =>
                item.tag?.tagCode?.toLowerCase().includes(searchLower),
            );

            if (matchedAssignedTags) return true;

            // Search guest orders by guest email
            if (order.isGuestOrder && order.guestCustomer?.email?.toLowerCase().includes(searchLower))
                return true;

            return false;
        });

        total = orders.length;
    }

    const paginatedOrders = orders.slice(skip, skip + limit);

    return {
        meta: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPage: Math.ceil(total / limit),
        },
        data: paginatedOrders,
    };
};

/**
 * Get Order Stats (Admin)
 */
const getOrderStats = async () => {
    const orders = await Order.find();

    const stats = {
        total: orders.length,
        pending: orders.filter((o) => o.fulfillmentStatus === "pending").length,
        assigned: orders.filter((o) => o.fulfillmentStatus === "assigned").length,
        shipped: orders.filter((o) => o.fulfillmentStatus === "shipped").length,
        delivered: orders.filter((o) => o.fulfillmentStatus === "delivered").length,
        cancelled: orders.filter((o) => o.fulfillmentStatus === "cancelled").length,
        returned: orders.filter((o) => o.fulfillmentStatus === "returned").length,
        paid: orders.filter((o) => o.paymentStatus === "paid").length,
        unpaid: orders.filter((o) => o.paymentStatus === "pending").length,
        refunded: orders.filter((o) => o.paymentStatus === "refunded").length,
        guestOrders: orders.filter((o) => o.isGuestOrder === true).length,
        authenticatedOrders: orders.filter((o) => o.isGuestOrder === false || o.user !== null).length,
    };

    return stats;
};

/**
 * Get Guest Orders by Email
 */
const getGuestOrdersByEmail = async (email, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    const filter = {
        isGuestOrder: true,
        "guestCustomer.email": email,
    };

    const [data, total] = await Promise.all([
        Order.find(filter)
            .populate("product", "name price image")
            .populate("assignedTag", "tagCode")
            .populate("assignedTags.tag", "tagCode")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(filter),
    ]);

    return {
        data,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
        },
    };
};

/**
 * Update Order (Admin)
 */
const updateOrder = async (id, payload) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.fulfillmentStatus === "cancelled") {
        throw new AppError(400, "Cannot update a cancelled order");
    }

    if (order.fulfillmentStatus === "returned") {
        throw new AppError(400, "Cannot update a returned order");
    }

    // Backward compatibility: single assignedTag manual assign
    if (payload.assignedTag) {
        const tag = await tagRepository.findById(payload.assignedTag);

        if (!tag) {
            throw new AppError(404, "Tag not found");
        }

        if (tag.owner && tag.owner.toString() !== order.user.toString()) {
            throw new AppError(
                400,
                "This tag is already assigned to another user/order",
            );
        }

        const existingOrderWithTag = await Order.findOne({
            $or: [
                { assignedTag: payload.assignedTag },
                { "assignedTags.tag": payload.assignedTag },
            ],
            fulfillmentStatus: { $nin: ["cancelled", "returned"] },
            _id: { $ne: id },
        });

        if (existingOrderWithTag) {
            throw new AppError(
                400,
                "This tag is already assigned to another active order",
            );
        }

        await tagRepository.updateTag(tag._id, {
            owner: order.user,
            isActivated: true,
            activatedAt: new Date(),
        });

        const existingAssignedTags = order.assignedTags || [];
        const alreadyExists = existingAssignedTags.some(
            (item) =>
                item.tag?._id?.toString() === tag._id.toString() ||
                item.tag?.toString() === tag._id.toString(),
        );

        if (!alreadyExists) {
            payload.assignedTags = [
                ...existingAssignedTags.map((item) => ({
                    tag: item.tag?._id || item.tag,
                    assignedAt: item.assignedAt || new Date(),
                    assignedBy: item.assignedBy || "admin",
                })),
                {
                    tag: tag._id,
                    assignedAt: new Date(),
                    assignedBy: "admin",
                },
            ];
        }

        payload.assignedTag = order.assignedTag || tag._id;
    }

    const finalAssignedCount =
        payload.assignedTags?.length ||
        order.assignedTags?.length ||
        (payload.assignedTag || order.assignedTag ? 1 : 0);

    const requiredQty = order.quantity || 1;

    if (finalAssignedCount === 0) {
        payload.tagAssignmentStatus = "none";
    } else if (finalAssignedCount < requiredQty) {
        payload.tagAssignmentStatus = "partial";
    } else {
        payload.tagAssignmentStatus = "complete";
    }

    if (
        ["assigned", "shipped", "delivered"].includes(payload.fulfillmentStatus) &&
        finalAssignedCount < requiredQty
    ) {
        throw new AppError(
            400,
            `Assign all required tags before changing fulfillment status. Required: ${requiredQty}, Assigned: ${finalAssignedCount}`,
        );
    }

    if (
        payload.fulfillmentStatus === "assigned" &&
        finalAssignedCount < requiredQty
    ) {
        throw new AppError(400, "Assign all required tags first");
    }

    // Status transition validation
    const allowedTransitions = {
        pending: ["assigned", "cancelled"],
        assigned: ["shipped", "cancelled"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
        returned: [],
    };

    if (
        payload.fulfillmentStatus &&
        !allowedTransitions[order.fulfillmentStatus]?.includes(
            payload.fulfillmentStatus,
        )
    ) {
        throw new AppError(
            400,
            `Invalid status transition from ${order.fulfillmentStatus} to ${payload.fulfillmentStatus}`,
        );
    }

    if (
        payload.fulfillmentStatus === "shipped" &&
        order.paymentStatus !== "paid"
    ) {
        throw new AppError(400, "Order must be paid before shipping");
    }

    if (payload.fulfillmentStatus === "delivered") {
        payload.deliveredAt = new Date();
    }

    if (payload.fulfillmentStatus === "cancelled") {
        payload.cancelledAt = new Date();
    }

    return orderRepository.updateOrder(id, payload);
};

/**
 * Cancel Order (User or Admin)
 */
const cancelOrder = async (orderId, userId, reason, cancelledBy = "user") => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    const cancellableStatuses = ["pending", "assigned"];
    if (!cancellableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            `Order cannot be cancelled in ${order.fulfillmentStatus} status`,
        );
    }

    if (cancelledBy === "user" && order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to cancel this order");
    }

    let refundProcessed = false;
    let refundTransactionId = null;
    const refundAmount = (order.product.price || 0) * (order.quantity || 1);

    if (order.paymentStatus === "paid" && order.stripePaymentIntentId) {
        try {
            const refund = await stripe.refunds.create({
                payment_intent: order.stripePaymentIntentId,
                reason: "requested_by_customer",
            });
            refundProcessed = true;
            refundTransactionId = refund.id;
        } catch (error) {
            console.error("Refund failed:", error);
            throw new AppError(500, "Refund failed. Please contact support.");
        }
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        fulfillmentStatus: "cancelled",
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancelledBy,
        ...(refundProcessed && {
            paymentStatus: "refunded",
            refundStatus: "completed",
            refundProcessedAt: new Date(),
            refundTransactionId,
            refundAmount,
        }),
    });

    if (
        order.paymentStatus === "paid" &&
        order.fulfillmentStatus !== "cancelled"
    ) {
        await productRepository.increaseStock(
            order.product._id,
            order.quantity || 1,
        );
    }

    if (order.assignedTag) {
        await tagRepository.resetTag(order.assignedTag._id);
    }

    return updatedOrder;
};

/**
 * Request Refund (User)
 */
const requestRefund = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.user.toString() !== userId) {
        throw new AppError(
            403,
            "You are not authorized to request refund for this order",
        );
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be refunded");
    }

    if (order.refundStatus !== "none") {
        throw new AppError(400, "Refund already requested or processed");
    }

    if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            "For shipped or delivered orders, please request a return first",
        );
    }

    if (order.fulfillmentStatus === "returned") {
        throw new AppError(400, "This order is already returned");
    }

    return orderRepository.updateOrder(orderId, {
        refundStatus: "requested",
        refundReason: reason,
        refundRequestedAt: new Date(),
    });
};

/**
 * Process Refund (Admin)
 */
const processRefund = async (orderId, approve = true, rejectReason = null) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.refundStatus !== "requested") {
        throw new AppError(400, "No pending refund request");
    }

    if (!approve) {
        return orderRepository.updateOrder(orderId, {
            refundStatus: "rejected",
            refundReason: rejectReason || "Refund request rejected",
        });
    }

    if (!order.stripePaymentIntentId) {
        throw new AppError(400, "No payment intent found for this order");
    }

    try {
        const refundAmount = (order.product.price || 0) * (order.quantity || 1);

        const refund = await stripe.refunds.create({
            payment_intent: order.stripePaymentIntentId,
            amount: refundAmount * 100,
            reason: "requested_by_customer",
        });

        const updatePayload = {
            refundStatus: "completed",
            paymentStatus: "refunded",
            refundProcessedAt: new Date(),
            refundTransactionId: refund.id,
            refundAmount,
        };

        if (
            ["pending", "assigned", "cancelled"].includes(order.fulfillmentStatus)
        ) {
            updatePayload.fulfillmentStatus = "cancelled";
            updatePayload.cancelledAt = new Date();
            updatePayload.cancelledBy = "admin";
            updatePayload.cancellationReason = "Refund processed";
        }

        const updatedOrder = await orderRepository.updateOrder(
            orderId,
            updatePayload,
        );

        if (["pending", "assigned"].includes(order.fulfillmentStatus)) {
            await productRepository.increaseStock(
                order.product._id,
                order.quantity || 1,
            );
        }

        if (order.assignedTag && ["assigned"].includes(order.fulfillmentStatus)) {
            await tagRepository.resetTag(order.assignedTag._id);
        }

        return updatedOrder;
    } catch (error) {
        console.error("Stripe refund failed:", error);
        throw new AppError(
            500,
            "Refund processing failed. Please try again or contact support.",
        );
    }
};

/**
 * Request Return (User)
 */
const requestReturn = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.user.toString() !== userId) {
        throw new AppError(
            403,
            "You are not authorized to request return for this order",
        );
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be returned");
    }

    const returnableStatuses = ["delivered"];
    if (!returnableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            `Order cannot be returned in ${order.fulfillmentStatus} status`,
        );
    }

    if (!order.deliveredAt) {
        throw new AppError(400, "Delivery date not found");
    }

    const returnWindowDays = 3;
    const now = new Date();
    const deliveredAt = new Date(order.deliveredAt);
    const diffTime = now - deliveredAt;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays > returnWindowDays) {
        throw new AppError(
            400,
            `Return request is allowed only within ${returnWindowDays} days of delivery`,
        );
    }

    if (order.returnStatus !== "none") {
        throw new AppError(400, "Return already requested or processed");
    }

    return orderRepository.updateOrder(orderId, {
        returnStatus: "requested",
        returnReason: reason,
        returnRequestedAt: new Date(),
    });
};

/**
 * Process Return (Admin)
 */
const processReturn = async (
    orderId,
    approve = true,
    trackingNumber = null,
    rejectReason = null,
) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.returnStatus !== "requested") {
        throw new AppError(400, "No pending return request");
    }

    if (!approve) {
        return orderRepository.updateOrder(orderId, {
            returnStatus: "rejected",
            returnReason: rejectReason || "Return request rejected",
        });
    }

    const updateData = {
        returnStatus: "approved",
        returnApprovedAt: new Date(),
    };

    if (trackingNumber) {
        updateData.returnTrackingNumber = trackingNumber;
        updateData.returnStatus = "shipped";
        updateData.returnShippedAt = new Date();
    }

    return orderRepository.updateOrder(orderId, updateData);
};

/**
 * Complete Return (Admin)
 */
const completeReturn = async (orderId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (!["approved", "shipped", "received"].includes(order.returnStatus)) {
        throw new AppError(400, "Return is not ready to complete");
    }

    const refundAmount = (order.product.price || 0) * (order.quantity || 1);
    let refundTransactionId = null;

    // Paid order must be refunded before marking return completed
    if (order.paymentStatus === "paid") {
        if (!order.stripePaymentIntentId) {
            throw new AppError(
                400,
                "No payment intent found for this order. Cannot complete return without refund.",
            );
        }

        try {
            const refund = await stripe.refunds.create({
                payment_intent: order.stripePaymentIntentId,
                amount: refundAmount * 100,
                reason: "requested_by_customer",
            });

            refundTransactionId = refund.id;
        } catch (error) {
            console.error("Refund failed:", error);
            throw new AppError(500, "Refund failed while completing return");
        }
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        returnStatus: "completed",
        returnReceivedAt: new Date(),
        fulfillmentStatus: "returned",
        ...(order.paymentStatus === "paid" && {
            paymentStatus: "refunded",
            refundStatus: "completed",
            refundProcessedAt: new Date(),
            refundTransactionId,
            refundAmount,
        }),
    });

    await productRepository.increaseStock(order.product._id, order.quantity || 1);

    if (order.assignedTag) {
        await tagRepository.resetTag(order.assignedTag._id);
    }

    return updatedOrder;
};

/**
 * Update Shipping Address (User)
 */
const updateShippingAddress = async (orderId, userId, shippingAddress) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Check if user owns the order
    if (order.user.toString() !== userId) {
        throw new AppError(
            httpStatus.FORBIDDEN,
            "You don't have permission to update this order",
        );
    }

    // Check if address can be updated (only before shipping)
    const uneditableStatuses = ["shipped", "delivered", "cancelled", "returned"];
    if (uneditableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            `Cannot update address when order status is ${order.fulfillmentStatus}`,
        );
    }

    // Update shipping address
    const updatedOrder = await orderRepository.updateOrder(orderId, {
        shippingAddress: {
            fullName: shippingAddress.fullName || order.shippingAddress?.fullName,
            phone: shippingAddress.phone || order.shippingAddress?.phone,
            address: shippingAddress.address || order.shippingAddress?.address,
            city: shippingAddress.city || order.shippingAddress?.city,
            postalCode: shippingAddress.postalCode || order.shippingAddress?.postalCode,
            country: shippingAddress.country || order.shippingAddress?.country,
        },
    });

    return updatedOrder;
};

/**
 * Approve Gift Message (Admin)
 */
const approveGiftMessage = async (orderId, adminNote = null) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (!order.giftMessage) {
        throw new AppError(400, "No gift message found");
    }

    if (order.giftMessageStatus === "approved") {
        throw new AppError(400, "Gift message already approved");
    }

    if (order.giftMessageStatus === "rejected") {
        throw new AppError(400, "Gift message already rejected");
    }

    return orderRepository.updateOrder(orderId, {
        giftMessageStatus: "approved",
        giftMessageReviewedAt: new Date(),
        giftMessageAdminNote: adminNote,
    });
};

/**
 * Reject Gift Message (Admin)
 */
const rejectGiftMessage = async (orderId, adminNote = null) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (!order.giftMessage) {
        throw new AppError(400, "No gift message found");
    }

    if (order.giftMessageStatus === "rejected") {
        throw new AppError(400, "Gift message already rejected");
    }

    if (order.giftMessageStatus === "approved") {
        throw new AppError(400, "Gift message already approved");
    }

    return orderRepository.updateOrder(orderId, {
        giftMessageStatus: "rejected",
        giftMessageReviewedAt: new Date(),
        giftMessageAdminNote: adminNote,
    });
};

/**
 * Add Tag to Order (Admin)
 */
const addTagToOrder = async (orderId, tagId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    ensureOrderTagsEditable(order);

    const requiredQty = order.quantity || 1;
    const existingAssignedTags = order.assignedTags || [];

    if (existingAssignedTags.length >= requiredQty) {
        throw new AppError(400, "All required tags are already assigned");
    }

    const alreadyExists = existingAssignedTags.some(
        (item) => getTagId(item) === tagId.toString(),
    );

    if (alreadyExists) {
        throw new AppError(400, "This tag is already assigned to this order");
    }

    const tag = await ensureTagAvailableForOrder(tagId, orderId, order.user);

    await tagRepository.updateTag(tag._id, {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
    });

    const updatedAssignedTags = [
        ...existingAssignedTags.map((item) => ({
            tag: item.tag?._id || item.tag,
            assignedAt: item.assignedAt || new Date(),
            assignedBy: item.assignedBy || "admin",
        })),
        {
            tag: tag._id,
            assignedAt: new Date(),
            assignedBy: "admin",
        },
    ];

    const tagAssignmentStatus = buildTagAssignmentStatus(
        updatedAssignedTags.length,
        requiredQty,
    );

    return orderRepository.updateOrder(orderId, {
        assignedTags: updatedAssignedTags,
        assignedTag: order.assignedTag || tag._id,
        tagAssignmentStatus,
        fulfillmentStatus: tagAssignmentStatus === "complete" ? "assigned" : "pending",
    });
};

/**
 * Remove Tag from Order (Admin)
 */
const removeTagFromOrder = async (orderId, tagId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    ensureOrderTagsEditable(order);

    const targetTagId = tagId.toString();
    const existingAssignedTags = order.assignedTags || [];

    const existsInAssignedTags = existingAssignedTags.some(
        (item) => getTagId(item) === targetTagId,
    );

    const existsInAssignedTag = getTagId(order.assignedTag) === targetTagId;

    if (!existsInAssignedTags && !existsInAssignedTag) {
        throw new AppError(404, "Tag is not assigned to this order");
    }

    await tagRepository.resetTag(targetTagId);

    const updatedAssignedTags = existingAssignedTags
        .filter((item) => getTagId(item) !== targetTagId)
        .map((item) => ({
            tag: getTagId(item),
            assignedAt: item.assignedAt || new Date(),
            assignedBy: item.assignedBy || "admin",
        }));

    const requiredQty = order.quantity || 1;

    const tagAssignmentStatus = buildTagAssignmentStatus(
        updatedAssignedTags.length,
        requiredQty,
    );

    return orderRepository.updateOrder(orderId, {
        assignedTags: updatedAssignedTags,
        assignedTag: updatedAssignedTags[0]?.tag || null,
        tagAssignmentStatus,
        fulfillmentStatus: tagAssignmentStatus === "complete" ? "assigned" : "pending",
    });
};

/**
 * Replace Order Tag (Admin)
 */
const replaceOrderTag = async (orderId, oldTagId, newTagId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    ensureOrderTagsEditable(order);

    const targetOldTagId = oldTagId.toString();
    const targetNewTagId = newTagId.toString();

    if (targetOldTagId === targetNewTagId) {
        throw new AppError(400, "Old tag and new tag cannot be the same");
    }

    const existingAssignedTags = order.assignedTags || [];

    const oldExistsInAssignedTags = existingAssignedTags.some(
        (item) => getTagId(item) === targetOldTagId,
    );

    const oldExistsInAssignedTag = getTagId(order.assignedTag) === targetOldTagId;

    if (!oldExistsInAssignedTags && !oldExistsInAssignedTag) {
        throw new AppError(404, "Old tag is not assigned to this order");
    }

    const newTag = await ensureTagAvailableForOrder(
        targetNewTagId,
        orderId,
        order.user,
    );

    await tagRepository.resetTag(targetOldTagId);

    await tagRepository.updateTag(newTag._id, {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
    });

    let updatedAssignedTags = existingAssignedTags.map((item) => {
        if (getTagId(item) === targetOldTagId) {
            return {
                tag: newTag._id,
                assignedAt: new Date(),
                assignedBy: "admin",
            };
        }

        return {
            tag: getTagId(item),
            assignedAt: item.assignedAt || new Date(),
            assignedBy: item.assignedBy || "admin",
        };
    });

    if (!oldExistsInAssignedTags && oldExistsInAssignedTag) {
        updatedAssignedTags = [
            {
                tag: newTag._id,
                assignedAt: new Date(),
                assignedBy: "admin",
            },
            ...updatedAssignedTags,
        ];
    }

    const requiredQty = order.quantity || 1;

    const tagAssignmentStatus = buildTagAssignmentStatus(
        updatedAssignedTags.length,
        requiredQty,
    );

    return orderRepository.updateOrder(orderId, {
        assignedTags: updatedAssignedTags,
        assignedTag: oldExistsInAssignedTag
            ? newTag._id
            : order.assignedTag || updatedAssignedTags[0]?.tag,
        tagAssignmentStatus,
        fulfillmentStatus: tagAssignmentStatus === "complete" ? "assigned" : "pending",
    });
};

// ============================================================
// EXPORTS
// ============================================================

export default {
    createOrder,
    createCheckout,
    createCheckoutSession,
    confirmPaymentAndAssignTag,
    claimGiftOrder,
    getOrderById,
    getUserOrders,
    getUserTotalSpent,
    getAllOrders,
    getOrderStats,
    getGuestOrdersByEmail,
    updateOrder,
    cancelOrder,
    requestRefund,
    processRefund,
    requestReturn,
    processReturn,
    completeReturn,
    updateShippingAddress,
    approveGiftMessage,
    rejectGiftMessage,
    addTagToOrder,
    replaceOrderTag,
    removeTagFromOrder,
};