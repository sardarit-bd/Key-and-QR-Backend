import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderRepository from "./order.repository.js";
import tagRepository from "../tag/tag.repository.js";
import productRepository from "../product/product.repository.js";
import stripe from "../../config/stripe.js";
import env from "../../config/env.js";
import Order from "./order.model.js";


const createOrder = async (userId, payload) => {
    const product = await productRepository.getProductById(payload.productId);

    if (!product) {
        throw new AppError(httpStatus.NOT_FOUND, "Product not found");
    }

    return orderRepository.createOrder({
        user: userId,
        product: payload.productId,
        purchaseType: payload.purchaseType || "self",
        giftMessage: payload.giftMessage || null,
    });
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
                quantity: 1,
            },
        ],

        success_url: `${env.clientUrl}/success?orderId=${orderId}`,
        cancel_url: `${env.clientUrl}/cancel`,

        metadata: {
            orderId: orderId.toString(),
        },
    });

    // Save session ID
    await orderRepository.updateOrder(orderId, { stripeSessionId: session.id });

    return session;
};

const confirmPaymentAndAssignTag = async (orderId, paymentIntentId = null) => {
    console.log("🔍 confirmPaymentAndAssignTag called for order:", orderId);

    const order = await orderRepository.findById(orderId);

    if (!order) {
        console.error("❌ Order not found:", orderId);
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }


    if (order.paymentStatus === "paid") {
        console.log("⚠️ Order already paid:", orderId);
        return order;
    }

    const tag = await tagRepository.findUnusedTag();

    if (!tag) {
        console.error("❌ No available tags found in database!");
        console.log("💡 Please insert some tags into the database");
        throw new AppError(httpStatus.BAD_REQUEST, "No available tags. Please contact support.");
    }


    const updatedTag = await tagRepository.updateTag(tag._id, {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
    });


    // Update order
    const updatedOrder = await orderRepository.updateOrder(orderId, {
        paymentStatus: "paid",
        fulfillmentStatus: "assigned",
        assignedTag: tag._id,
        stripePaymentIntentId: paymentIntentId,
    });

    return updatedOrder;
};


const getOrderById = async (id) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    return order;
};

const getUserOrders = async (userId) => {
    const orders = await orderRepository.findByUser(userId);
    return orders;
};

const getAllOrders = async (page = 1, limit = 10, search = "", fulfillmentStatus = null) => {
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    if (fulfillmentStatus && fulfillmentStatus !== "all") {
        filter.fulfillmentStatus = fulfillmentStatus;
    }

    if (search) {
        filter.$or = [
            { _id: { $regex: search, $options: "i" } },
            { "user.name": { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
            { "product.name": { $regex: search, $options: "i" } }
        ];
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate("user", "name email")
            .populate("product", "name price image")
            .populate("assignedTag", "tagCode")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(filter)
    ]);

    return {
        meta: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPage: Math.ceil(total / limit)
        },
        data: orders
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

    if (payload.assignedTag) {
        payload.fulfillmentStatus = "assigned";
    }

    if (payload.fulfillmentStatus === "assigned" && !order.assignedTag && !payload.assignedTag) {
        throw new AppError(400, "Assign tag first");
    }

    const allowedTransitions = {
        pending: ["assigned", "cancelled"],
        assigned: ["shipped", "cancelled"],
        shipped: ["delivered", "returned"],
        delivered: ["returned"],
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

    // Add timestamps for specific statuses
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

    // Check if order can be cancelled
    const cancellableStatuses = ["pending", "assigned"];
    if (!cancellableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(400, `Order cannot be cancelled in ${order.fulfillmentStatus} status`);
    }

    // Check if user owns the order (for user cancellation)
    if (cancelledBy === "user" && order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to cancel this order");
    }

    // If paid, need to process refund
    let refundProcessed = false;
    if (order.paymentStatus === "paid" && order.stripePaymentIntentId) {
        try {
            const refund = await stripe.refunds.create({
                payment_intent: order.stripePaymentIntentId,
                reason: "requested_by_customer",
            });
            refundProcessed = true;
        } catch (error) {
            console.error("Refund failed:", error);
            throw new AppError(500, "Refund failed. Please contact support.");
        }
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        fulfillmentStatus: "cancelled",
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancelledBy: cancelledBy,
        ...(refundProcessed && { paymentStatus: "refunded" }),
    });

    // If tag was assigned, free it up
    if (order.assignedTag) {
        await tagRepository.updateTag(order.assignedTag._id, {
            owner: null,
            isActivated: false,
            activatedAt: null,
        });
    }

    return updatedOrder;
};

// Request refund
const requestRefund = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    // Check if user owns the order
    if (order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to request refund for this order");
    }

    // Check if refund is possible
    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be refunded");
    }

    if (order.refundStatus !== "none") {
        throw new AppError(400, "Refund already requested or processed");
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        refundStatus: "requested",
        refundReason: reason,
        refundRequestedAt: new Date(),
    });

    return updatedOrder;
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
        // Reject refund
        return orderRepository.updateOrder(orderId, {
            refundStatus: "rejected",
            refundReason: rejectReason || "Refund request rejected",
        });
    }

    // Process refund via Stripe
    if (!order.stripePaymentIntentId) {
        throw new AppError(400, "No payment intent found for this order");
    }

    try {
        const refund = await stripe.refunds.create({
            payment_intent: order.stripePaymentIntentId,
            amount: order.product.price * 100, // Full refund
            reason: "requested_by_customer",
        });

        const updatedOrder = await orderRepository.updateOrder(orderId, {
            refundStatus: "completed",
            paymentStatus: "refunded",
            refundProcessedAt: new Date(),
            refundTransactionId: refund.id,
            fulfillmentStatus: "cancelled",
            cancelledAt: new Date(),
            cancelledBy: "admin",
            cancellationReason: "Refund processed",
        });

        // Free up the tag if assigned
        if (order.assignedTag) {
            await tagRepository.updateTag(order.assignedTag._id, {
                owner: null,
                isActivated: false,
                activatedAt: null,
            });
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

    // Check if user owns the order
    if (order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to request return for this order");
    }

    // Check if return is possible (only shipped or delivered orders)
    const returnableStatuses = ["shipped", "delivered"];
    if (!returnableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(400, `Order cannot be returned in ${order.fulfillmentStatus} status`);
    }

    if (order.returnStatus !== "none") {
        throw new AppError(400, "Return already requested or processed");
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        returnStatus: "requested",
        returnReason: reason,
        returnRequestedAt: new Date(),
    });

    return updatedOrder;
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
        // Reject return
        return orderRepository.updateOrder(orderId, {
            returnStatus: "rejected",
            returnReason: rejectReason || "Return request rejected",
        });
    }

    // Approve return
    let updateData = {
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

    if (order.returnStatus !== "shipped") {
        throw new AppError(400, "Return not in shipped status");
    }

    // Process refund if payment was paid
    let refundProcessed = false;
    if (order.paymentStatus === "paid" && order.stripePaymentIntentId) {
        try {
            await stripe.refunds.create({
                payment_intent: order.stripePaymentIntentId,
                reason: "returned_item",
            });
            refundProcessed = true;
        } catch (error) {
            console.error("Refund failed:", error);
        }
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        returnStatus: "completed",
        returnReceivedAt: new Date(),
        fulfillmentStatus: "returned",
        ...(refundProcessed && { paymentStatus: "refunded" }),
    });

    // Free up the tag if assigned
    if (order.assignedTag) {
        await tagRepository.updateTag(order.assignedTag._id, {
            owner: null,
            isActivated: false,
            activatedAt: null,
        });
    }

    return updatedOrder;
};

export default {
    createOrder,
    createCheckoutSession,
    confirmPaymentAndAssignTag,
    getOrderById,
    getUserOrders,
    getAllOrders,
    getOrderStats,
    updateOrder,
    cancelOrder,
    requestRefund,
    processRefund,
    requestReturn,
    processReturn,
    completeReturn,
};