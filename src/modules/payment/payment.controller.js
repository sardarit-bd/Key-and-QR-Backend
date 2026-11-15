import httpStatus from "../../constants/httpStatus.js";
import PAYMENT_STATUS from "../../config/paymentStatus.js";
import AppError from "../../utils/AppError.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import paymentService from "./payment.service.js";
import orderService from "../order/order.service.js";
import { verifyGuestAccessToken } from "../../utils/jwt.js";

/**
 * Authorize order access for authenticated users, admins, or signed guest tokens.
 * Reuses the exact authorization model established in order.controller.js:getOrderById.
 */
const authorizeOrderAccess = (order, req) => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // 1. Admin can access any order
    if (userRole === "admin") {
        return true;
    }

    // 2. Authenticated user: verify ownership against database record
    if (userId && order.user && order.user.toString() === userId.toString()) {
        return true;
    }

    // 3. Guest order: verify cryptographically signed guest access token
    if (order.isGuestOrder) {
        const guestToken = req.query.token || req.headers["x-guest-token"] || req.body?.token;

        if (guestToken) {
            try {
                const decoded = verifyGuestAccessToken(guestToken);
                if (decoded && decoded.orderId === order._id.toString()) {
                    return true;
                }
            } catch (err) {
                throw new AppError(
                    httpStatus.FORBIDDEN,
                    "Invalid or expired guest access token"
                );
            }
        }

        if (!userId) {
            throw new AppError(
                httpStatus.UNAUTHORIZED,
                "Guest access token required"
            );
        }
    }

    // Unauthorized access attempt
    throw new AppError(
        httpStatus.FORBIDDEN,
        "Access denied. You don't own this order."
    );
};

/**
 * Create Stripe Checkout Session
 */
const createCheckoutSession = catchAsync(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order ID is required");
    }

    // Get order to verify ownership
    const order = await orderService.getOrderById(orderId);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Enforce strict authorization (Admin, Authenticated Owner, or Guest with signed token)
    authorizeOrderAccess(order, req);

    const userId = req.user?.userId || null;
    const isGuest = order.isGuestOrder || !userId;

    // Check if already paid
    if (order.paymentStatus === PAYMENT_STATUS.SUCCEEDED) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order is already paid");
    }

    // Check if order is in a non-payable fulfillment state
    const nonPayableStatuses = ["cancelled", "returned", "delivered"];
    if (nonPayableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            `Order cannot be paid in its current state: ${order.fulfillmentStatus}`
        );
    }

    // Build metadata
    const metadata = {};
    if (!isGuest && userId) {
        metadata.userId = userId.toString();
    }
    if (isGuest && order.guestCustomer) {
        metadata.guestEmail = order.guestCustomer.email;
        metadata.guestName = order.guestCustomer.fullName;
        metadata.isGuestOrder = "true";
    }

    // Get customer email
    const customerEmail = isGuest
        ? order.guestCustomer?.email
        : order.user?.email;

    // Create session
    const session = await paymentService.createCheckoutSession(
        orderId,
        customerEmail,
        metadata
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment session created successfully",
        data: {
            url: session.url,
            sessionId: session.id,
        },
    });
});

/**
 * Get payment status (SEC-03: Zero PII leakage + Ownership Enforcement)
 */
const getPaymentStatus = catchAsync(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order ID is required");
    }

    // Retrieve order to verify ownership before performing Stripe verification
    const order = await orderService.getOrderById(orderId);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Enforce strict authorization (Admin, Authenticated Owner, or Guest with signed token)
    authorizeOrderAccess(order, req);

    const result = await paymentService.verifyPaymentStatus(orderId);

    // SEC-03: Return strictly minimal status data, NEVER full order document or PII
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment status retrieved",
        data: {
            orderId: order._id,
            paymentStatus: result.status,
            verified: Boolean(result.verified),
        },
    });
});

/**
 * Handle payment cancellation (SEC-03: Strict Authorization + State Transition Guards)
 */
const cancelPayment = catchAsync(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order ID is required");
    }

    const order = await orderService.getOrderById(orderId);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Enforce strict authorization
    authorizeOrderAccess(order, req);

    // Prevent cancellation if already paid or completed
    if (
        order.paymentStatus === PAYMENT_STATUS.SUCCEEDED ||
        order.paymentStatus === "paid" ||
        order.paymentStatus === "succeeded"
    ) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Cannot cancel a completed payment"
        );
    }

    const updatedOrder = await paymentService.handleCancellation(orderId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment cancelled successfully",
        data: {
            orderId: updatedOrder._id,
            paymentStatus: updatedOrder.paymentStatus,
        },
    });
});

export default {
    createCheckoutSession,
    getPaymentStatus,
    cancelPayment,
};