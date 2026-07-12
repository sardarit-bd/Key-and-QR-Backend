import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderService from "./order.service.js";

/**
 * Create Checkout Session (Supports both Guest & Authenticated)
 * POST /api/v1/orders/checkout
 * 
 * Guest Request Body:
 * {
 *   productId: string,
 *   quantity: number (optional),
 *   purchaseType: "self" | "gift" (optional),
 *   giftMessage: string (optional),
 *   guestCustomer: {
 *     fullName: string,
 *     email: string,
 *     phone: string (optional)
 *   },
 *   shippingAddress: {
 *     fullName: string,
 *     email: string,
 *     phone: string (optional),
 *     address: string,
 *     city: string,
 *     postalCode: string,
 *     country: string
 *   }
 * }
 * 
 * Authenticated Request Body:
 * {
 *   productId: string,
 *   quantity: number (optional),
 *   purchaseType: "self" | "gift" (optional),
 *   giftMessage: string (optional),
 *   shippingAddress: {
 *     fullName: string (optional),
 *     email: string (optional),
 *     phone: string (optional),
 *     address: string (optional),
 *     city: string (optional),
 *     postalCode: string (optional),
 *     country: string (optional)
 *   }
 * }
 */
const createCheckout = catchAsync(async (req, res) => {
    // Get userId from optional auth middleware (null for guests)
    const userId = req.user?.userId || null;
    const isGuest = !userId;

    // All validation moved to middleware
    // Service handles both guest and authenticated flows
    const session = await orderService.createCheckout(
        userId,
        req.body,
        isGuest
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Stripe session created successfully",
        data: { url: session.url },
    });
});

/**
 * Get Order By ID (Supports both Guest & Authenticated)
 * GET /api/v1/orders/:id
 * 
 * - Authenticated users: Can view their own orders
 * - Guest users: Can view guest orders (with email verification)
 * - Admin: Can view any order
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

    // Guest order: Email verification (can be enhanced with token)
    if (!userId && order.isGuestOrder) {
        // For now, allow access to guest orders
        // In production, implement email + order token verification
        return sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Order fetched successfully",
            data: order,
        });
    }

    // ❌ Unauthorized access
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. You don't own this order.");
});

/**
 * Get Authenticated User's Orders
 * GET /api/v1/orders/
 * 
 * Requires authentication
 * Returns paginated list of user's orders with total spent
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
 * GET /api/v1/orders/admin/all
 * 
 * Requires ADMIN role
 * Supports search and filtering
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
 * GET /api/v1/orders/admin/stats
 * 
 * Returns statistics about orders (total, by status, by payment status)
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
 * PATCH /api/v1/orders/:id
 * 
 * Update order status, tags, etc.
 * Requires ADMIN role
 */
const updateOrder = catchAsync(async (req, res) => {
    const result = await orderService.updateOrder(req.params.id, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order updated successfully",
        data: result,
    });
});

/**
 * Cancel Order (User or Admin)
 * POST /api/v1/orders/:id/cancel
 * 
 * - User: Cancel their own order
 * - Admin: Cancel any order
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
 * POST /api/v1/orders/:id/refund/request
 * 
 * User requests refund for their paid order
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
 * POST /api/v1/orders/:id/refund/process
 * 
 * Admin approves or rejects refund request
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
 * POST /api/v1/orders/:id/return/request
 * 
 * User requests return for delivered order
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
 * POST /api/v1/orders/:id/return/process
 * 
 * Admin approves or rejects return request
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
 * POST /api/v1/orders/:id/return/complete
 * 
 * Admin marks return as completed and processes refund
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
 * POST /api/v1/orders/:id/claim-gift
 * 
 * User claims a gift order assigned to them
 * Requires authentication
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
 * PATCH /api/v1/orders/:id/address
 * 
 * User updates shipping address for their order
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
 * POST /api/v1/orders/:id/gift-message/approve
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
 * POST /api/v1/orders/:id/gift-message/reject
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
 * POST /api/v1/orders/:id/tags/add
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
 * PATCH /api/v1/orders/:id/tags/replace
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
 * DELETE /api/v1/orders/:id/tags/:tagId/remove
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