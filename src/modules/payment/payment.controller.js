import httpStatus from "../../constants/httpStatus.js";
import PAYMENT_STATUS from "../../config/paymentStatus.js";
import AppError from "../../utils/AppError.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import paymentService from "./payment.service.js";
import orderService from "../order/order.service.js";

/**
 * Create Stripe Checkout Session
 */
const createCheckoutSession = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user?.userId || null;
    const isGuest = !userId;

    if (!orderId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order ID is required");
    }

    // Get order to verify ownership — use orderService (paymentService has no getOrderById)
    const order = await orderService.getOrderById(orderId);

    // Verify ownership
    if (!isGuest) {
        if (!userId) {
            throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
        }
        if (order.user?.toString() !== userId.toString()) {
            throw new AppError(httpStatus.FORBIDDEN, "You don't own this order");
        }
    } else {
        // Guest: verify by email (should be in request)
        if (order.guestCustomer?.email !== req.body?.guestEmail) {
            throw new AppError(httpStatus.FORBIDDEN, "Invalid guest access");
        }
    }

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
 * Get payment status
 */
const getPaymentStatus = catchAsync(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order ID is required");
    }

    const result = await paymentService.verifyPaymentStatus(orderId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment status retrieved",
        data: result,
    });
});

/**
 * Handle payment cancellation
 */
const cancelPayment = catchAsync(async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order ID is required");
    }

    const order = await paymentService.handleCancellation(orderId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment cancelled successfully",
        data: {
            orderId: order._id,
            paymentStatus: order.paymentStatus,
        },
    });
});

export default {
    createCheckoutSession,
    getPaymentStatus,
    cancelPayment,
};