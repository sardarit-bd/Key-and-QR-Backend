import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderService from "./order.service.js";
import { verifyGuestAccessToken } from "../../utils/jwt.js";

const createCheckout = catchAsync(async (req, res) => {
    // Get userId from optional auth middleware (null for guests)
    const userId = req.user?.userId || null;
    const isGuest = !userId;

    // All validation moved to middleware
    // Service handles both guest and authenticated flows
    const order = await orderService.createCheckout(
        userId,
        req.body,
        isGuest
    );

    //  Create the actual Stripe Checkout Session for this order
    const session = await orderService.createCheckoutSession(order._id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Stripe session created successfully",
        data: { url: session.url },
    });
});

/**
 * Get Order By ID (Supports both Guest & Authenticated)
 */
const getOrderById = catchAsync(async (req, res) => {
    const order = await orderService.getOrderById(req.params.id);
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // Admin can access any order
    if (userRole === "admin") {
        return sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Order fetched successfully",
            data: order,
        });
    }

    // Authenticated user: Check ownership
    if (userId && order.user && order.user.toString() === userId) {
        return sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Order fetched successfully",
            data: order,
        });
    }

    // Guest order: Require signed guest access token
    if (!userId && order.isGuestOrder) {
        const guestToken = req.query.token;

        if (!guestToken) {
            throw new AppError(
                httpStatus.UNAUTHORIZED,
                "Guest access token required"
            );
        }

        try {
            const decoded = verifyGuestAccessToken(guestToken);

            // Verify token is for this order
            if (decoded.orderId !== order._id.toString()) {
                throw new Error("Token order mismatch");
            }

            return sendResponse(res, {
                statusCode: httpStatus.OK,
                success: true,
                message: "Order fetched successfully",
                data: order,
            });
        } catch (error) {
            throw new AppError(
                httpStatus.FORBIDDEN,
                "Invalid or expired guest access token"
            );
        }
    }

    // ❌ Unauthorized access
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. You don't own this order.");
});

/**
 * Get Authenticated User's Orders
 */
const getUserOrders = catchAsync(async (req, res) => {
    // Authentication required
    if (!req.user?.userId) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await orderService.getUserOrders(req.user.userId, page, limit);
    const totalSpent = await orderService.getUserTotalSpent(req.user.userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Orders fetched successfully",
        data: {
            orders: result.data,
            pagination: result.pagination,
            totalSpent: totalSpent,
        },
    });
});

/**
 * Admin: Get All Orders
 */
const getAllOrders = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fulfillmentStatus = req.query.fulfillmentStatus || null;

    const result = await orderService.getAllOrders(
        page,
        limit,
        search,
        fulfillmentStatus,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "All orders fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

/**
 * Admin: Get Order Stats
 */
const getOrderStats = catchAsync(async (req, res) => {
    const stats = await orderService.getOrderStats();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order stats fetched successfully",
        data: stats,
    });
});

/**
 * Admin: Update Order
 */
const updateOrder = catchAsync(async (req, res) => {
    const result = await orderService.updateOrder(req.params.id, req.body, null, req.user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order updated successfully",
        data: result,
    });
});

/**
 * Cancel Order (User or Admin)
 */
const cancelOrder = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const cancelledBy = req.user.role === "admin" ? "admin" : "user";

    const result = await orderService.cancelOrder(
        id,
        req.user.userId,
        reason,
        cancelledBy,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order cancelled successfully",
        data: result,
    });
});

/**
 * Request Refund (User)
 */
const requestRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await orderService.requestRefund(id, req.user.userId, reason);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Refund request submitted successfully",
        data: result,
    });
});

/**
 * Process Refund (Admin)
 */
const processRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { approve, rejectReason } = req.body;

    const result = await orderService.processRefund(id, approve, rejectReason);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: approve
            ? "Refund processed successfully"
            : "Refund request rejected",
        data: result,
    });
});

/**
 * Request Return (User)
 */
const requestReturn = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await orderService.requestReturn(id, req.user.userId, reason);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Return request submitted successfully",
        data: result,
    });
});

/**
 * Process Return (Admin)
 */
const processReturn = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { approve, trackingNumber, rejectReason } = req.body;

    const result = await orderService.processReturn(
        id,
        approve,
        trackingNumber,
        rejectReason,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: approve ? "Return request approved" : "Return request rejected",
        data: result,
    });
});

/**
 * Complete Return (Admin)
 */
const completeReturn = catchAsync(async (req, res) => {
    const { id } = req.params;

    const result = await orderService.completeReturn(id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Return completed and refund processed",
        data: result,
    });
});

/**
 * Claim Gift Order (User)
 */
const claimGiftOrder = catchAsync(async (req, res) => {
    const result = await orderService.claimGiftOrder(
        req.params.id,
        req.user.userId,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Gift claimed successfully",
        data: result,
    });
});

/**
 * Update Shipping Address (User)
 */
const updateShippingAddress = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { shippingAddress } = req.body;

    const result = await orderService.updateShippingAddress(
        id,
        req.user.userId,
        shippingAddress,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Shipping address updated successfully",
        data: result,
    });
});

/**
 * Approve Gift Message (Admin)
 */
const approveGiftMessage = catchAsync(async (req, res) => {
    const result = await orderService.approveGiftMessage(req.params.id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Gift message approved",
        data: result,
    });
});

/**
 * Reject Gift Message (Admin)
 */
const rejectGiftMessage = catchAsync(async (req, res) => {
    const result = await orderService.rejectGiftMessage(req.params.id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Gift message rejected",
        data: result,
    });
});

/**
 * Add Tag to Order (Admin)
 */
const addTagToOrder = catchAsync(async (req, res) => {
    const result = await orderService.addTagToOrder(
        req.params.id,
        req.body.tagId,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Tag added successfully",
        data: result,
    });
});

/**
 * Replace Order Tag (Admin)
 */
const replaceOrderTag = catchAsync(async (req, res) => {
    const { oldTagId, newTagId } = req.body;

    const result = await orderService.replaceOrderTag(
        req.params.id,
        oldTagId,
        newTagId,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Tag replaced successfully",
        data: result,
    });
});

/**
 * Remove Tag from Order (Admin)
 */
const removeTagFromOrder = catchAsync(async (req, res) => {
    const result = await orderService.removeTagFromOrder(
        req.params.id,
        req.params.tagId,
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Tag removed successfully",
        data: result,
    });
});

export default {
    createCheckout,
    getOrderById,
    getUserOrders,
    getAllOrders,
    getOrderStats,
    updateShippingAddress,
    updateOrder,
    cancelOrder,
    requestRefund,
    processRefund,
    requestReturn,
    processReturn,
    completeReturn,
    claimGiftOrder,
    approveGiftMessage,
    rejectGiftMessage,
    addTagToOrder,
    replaceOrderTag,
    removeTagFromOrder,
};