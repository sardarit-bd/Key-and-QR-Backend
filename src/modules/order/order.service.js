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
import tagService from "../tag/tag.service.js";


const createOrder = async (userId, payload) => {
    const product = await productRepository.getProductById(payload.productId);

    if (!product) {
        throw new AppError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (product.stock < (Number(payload.quantity) || 1)) {
        throw new AppError(httpStatus.BAD_REQUEST, "Not enough stock available");
    }

    const purchaseType = payload.purchaseType || "self";

    const shippingAddress = {
        fullName: payload.fullName || null,
        email: payload.email || null,
        phone: payload.phone || null,
        address: payload.address || null,
        city: payload.city || null,
        postalCode: payload.postalCode || null,
        country: payload.country || null,
    };

    const order = await orderRepository.createOrder({
        user: userId,
        product: payload.productId,
        quantity: Number(payload.quantity) || 1,
        purchaseType,
        giftMessage: purchaseType === "gift" ? payload.giftMessage || null : null,
        giftMessageStatus: purchaseType === "gift" ? "pending" : "none",
        giftStatus: purchaseType === "gift" ? "pending_claim" : "none",
        shippingAddress,
    });

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


const createCheckout = async (userId, payload) => {
    let order;

    if (payload.orderId) {
        order = await orderRepository.findById(payload.orderId);

        if (!order) {
            throw new AppError(httpStatus.NOT_FOUND, "Order not found");
        }

        if (order.user.toString() !== userId.toString()) {
            throw new AppError(httpStatus.FORBIDDEN, "Unauthorized");
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
        }
    } else {
        order = await createOrder(userId, payload);
    }

    return createCheckoutSession(order._id);
};


// Create Stripe Checkout Session
const createCheckoutSession = async (orderId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
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
        metadata: {
            orderId: orderId.toString(),
        },
    });

    await orderRepository.updateOrder(orderId, { stripeSessionId: session.id });

    return session;
};


const confirmPaymentAndAssignTag = async (orderId, paymentIntentId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    const updateData = {
        paymentStatus: "paid",
        stripePaymentIntentId: paymentIntentId,
    };

    let availableTag = null;

    try {
        availableTag = await tagService.getUnusedTag();
    } catch (err) {
        console.warn("⚠️ No tag available for order:", orderId);
    }

    if (availableTag) {
        updateData.assignedTag = availableTag._id;
        updateData.fulfillmentStatus = "assigned";
    } else {
        updateData.fulfillmentStatus = "pending";
    }

    return orderRepository.updateOrder(orderId, updateData);
};

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



const getOrderById = async (id) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    return order;
};

const getUserOrders = async (userId, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    // Get total count
    const total = await Order.countDocuments({ user: userId });

    // Get paginated orders
    const orders = await Order.find({ user: userId })
        .populate("product", "name price image")
        .populate("assignedTag", "tagCode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    return {
        data: orders,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1
        }
    };
};

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
                    paymentStatus: "paid"
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productData"
                }
            },
            {
                $unwind: {
                    path: "$productData",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ["$productData.price", 0] },
                                { $ifNull: ["$quantity", 1] }
                            ]
                        }
                    }
                }
            }
        ]);

        return result[0]?.total || 0;
    } catch (error) {
        console.error("Error in getUserTotalSpent:", error);
        // Fallback to simple calculation
        try {
            const orders = await Order.find({
                user: userId,
                paymentStatus: "paid"
            }).populate("product", "price");

            return orders.reduce((sum, order) => {
                const price = order.product?.price || 0;
                const quantity = order.quantity || 1;
                return sum + (price * quantity);
            }, 0);
        } catch (fallbackError) {
            console.error("Fallback calculation also failed:", fallbackError);
            return 0;
        }
    }
};

const getAllOrders = async (page = 1, limit = 10, search = "", fulfillmentStatus = null) => {
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    if (fulfillmentStatus && fulfillmentStatus !== "all") {
        filter.fulfillmentStatus = fulfillmentStatus;
    }

    // Get all orders with populate
    let query = Order.find(filter)
        .populate("user", "name email")
        .populate("product", "name price image")
        .populate("assignedTag", "tagCode")
        .sort({ createdAt: -1 });

    let orders = await query.lean();
    let total = orders.length;

    // Apply search filter in JavaScript (after populate)
    if (search && search.trim() !== "") {
        const searchLower = search.toLowerCase().trim();
        orders = orders.filter(order => {
            // Search by order ID
            if (order._id.toString().toLowerCase().includes(searchLower)) return true;
            // Search by user name
            if (order.user?.name?.toLowerCase().includes(searchLower)) return true;
            // Search by user email
            if (order.user?.email?.toLowerCase().includes(searchLower)) return true;
            // Search by product name
            if (order.product?.name?.toLowerCase().includes(searchLower)) return true;
            // ✅ Search by shipping address
            if (order.shippingAddress?.address?.toLowerCase().includes(searchLower)) return true;
            if (order.shippingAddress?.fullName?.toLowerCase().includes(searchLower)) return true;
            return false;
        });
        total = orders.length;
    }

    // Apply pagination
    const paginatedOrders = orders.slice(skip, skip + limit);

    return {
        meta: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPage: Math.ceil(total / limit)
        },
        data: paginatedOrders
    };
};

// Get order stats
const getOrderStats = async () => {
    const orders = await Order.find();

    const stats = {
        total: orders.length,
        pending: orders.filter(o => o.fulfillmentStatus === "pending").length,
        assigned: orders.filter(o => o.fulfillmentStatus === "assigned").length,
        shipped: orders.filter(o => o.fulfillmentStatus === "shipped").length,
        delivered: orders.filter(o => o.fulfillmentStatus === "delivered").length,
        cancelled: orders.filter(o => o.fulfillmentStatus === "cancelled").length,
        returned: orders.filter(o => o.fulfillmentStatus === "returned").length,
        paid: orders.filter(o => o.paymentStatus === "paid").length,
        unpaid: orders.filter(o => o.paymentStatus === "pending").length,
        refunded: orders.filter(o => o.paymentStatus === "refunded").length,
    };

    return stats;
};

const updateOrder = async (id, payload) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    // Check if order is cancelled - can't update cancelled orders
    if (order.fulfillmentStatus === "cancelled") {
        throw new AppError(400, "Cannot update a cancelled order");
    }

    // Check if order is returned - can't update returned orders
    if (order.fulfillmentStatus === "returned") {
        throw new AppError(400, "Cannot update a returned order");
    }

    // Tag assign validation
    if (payload.assignedTag) {
        // Check if tag exists
        const tag = await tagRepository.findById(payload.assignedTag);

        if (!tag) {
            throw new AppError(404, "Tag not found");
        }

        // CRITICAL: Check if tag already has an owner
        if (tag.owner) {
            throw new AppError(400, "This tag is already assigned to another user/order");
        }

        // CRITICAL: Check if tag is already assigned to any active order
        const existingOrderWithTag = await Order.findOne({
            assignedTag: payload.assignedTag,
            fulfillmentStatus: { $nin: ["cancelled", "returned"] }
        });

        if (existingOrderWithTag && existingOrderWithTag._id.toString() !== id) {
            throw new AppError(400, "This tag is already assigned to another active order");
        }

        // If tag is being assigned, set owner and activation
        await tagRepository.updateTag(tag._id, {
            owner: order.user,
            isActivated: true,
            activatedAt: new Date()
        });

        payload.fulfillmentStatus = "assigned";
    }

    // Check if trying to assign assigned status without tag
    if (payload.fulfillmentStatus === "assigned" && !order.assignedTag && !payload.assignedTag) {
        throw new AppError(400, "Assign tag first");
    }

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
        !allowedTransitions[order.fulfillmentStatus]?.includes(payload.fulfillmentStatus)
    ) {
        throw new AppError(400, `Invalid status transition from ${order.fulfillmentStatus} to ${payload.fulfillmentStatus}`);
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

// Cancel order (user or admin)
const cancelOrder = async (orderId, userId, reason, cancelledBy = "user") => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    const cancellableStatuses = ["pending", "assigned"];
    if (!cancellableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(400, `Order cannot be cancelled in ${order.fulfillmentStatus} status`);
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

    if (order.paymentStatus === "paid" && order.fulfillmentStatus !== "cancelled") {
        await productRepository.increaseStock(
            order.product._id,
            order.quantity || 1
        );
    }

    if (order.assignedTag) {
        await tagRepository.resetTag(order.assignedTag._id);
    }

    return updatedOrder;
};

// Request refund
const requestRefund = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to request refund for this order");
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be refunded");
    }

    if (order.refundStatus !== "none") {
        throw new AppError(400, "Refund already requested or processed");
    }

    if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        throw new AppError(400, "For shipped or delivered orders, please request a return first");
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

// Process refund (admin)
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

        if (["pending", "assigned", "cancelled"].includes(order.fulfillmentStatus)) {
            updatePayload.fulfillmentStatus = "cancelled";
            updatePayload.cancelledAt = new Date();
            updatePayload.cancelledBy = "admin";
            updatePayload.cancellationReason = "Refund processed";
        }

        const updatedOrder = await orderRepository.updateOrder(orderId, updatePayload);

        if (["pending", "assigned"].includes(order.fulfillmentStatus)) {
            await productRepository.increaseStock(
                order.product._id,
                order.quantity || 1
            );
        }

        if (order.assignedTag && ["assigned"].includes(order.fulfillmentStatus)) {
            await tagRepository.resetTag(order.assignedTag._id);
        }

        return updatedOrder;
    } catch (error) {
        console.error("Stripe refund failed:", error);
        throw new AppError(500, "Refund processing failed. Please try again or contact support.");
    }
};

// Request return
const requestReturn = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to request return for this order");
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be returned");
    }

    const returnableStatuses = ["delivered"];
    if (!returnableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(400, `Order cannot be returned in ${order.fulfillmentStatus} status`);
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
        throw new AppError(400, `Return request is allowed only within ${returnWindowDays} days of delivery`);
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

// Process return (admin)
const processReturn = async (orderId, approve = true, trackingNumber = null, rejectReason = null) => {
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

// Complete return (when item received)
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

    // Paid order hole refund MUST succeed before marking return completed
    if (order.paymentStatus === "paid") {
        if (!order.stripePaymentIntentId) {
            throw new AppError(
                400,
                "No payment intent found for this order. Cannot complete return without refund."
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

    await productRepository.increaseStock(
        order.product._id,
        order.quantity || 1
    );

    if (order.assignedTag) {
        await tagRepository.resetTag(order.assignedTag._id);
    }

    return updatedOrder;
};

const updateShippingAddress = async (orderId, userId, shippingAddress) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Check if user owns the order
    if (order.user.toString() !== userId) {
        throw new AppError(httpStatus.FORBIDDEN, "You don't have permission to update this order");
    }

    // Check if address can be updated (only before shipping)
    const uneditableStatuses = ["shipped", "delivered", "cancelled", "returned"];
    if (uneditableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(httpStatus.BAD_REQUEST, `Cannot update address when order status is ${order.fulfillmentStatus}`);
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
        }
    });

    return updatedOrder;
};

// Approve gift message
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

// Reject gift message
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
};