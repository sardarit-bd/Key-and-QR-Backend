import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import orderService from "./order.service.js";


// create + checkout
const createCheckout = catchAsync(async (req, res) => {
    const session = await orderService.createCheckout(
        req.user.userId,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Stripe session created",
        data: { url: session.url },
    });
});


const getOrderById = catchAsync(async (req, res) => {
    const result = await orderService.getOrderById(req.params.id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order fetched successfully",
        data: result,
    });
});

const getUserOrders = catchAsync(async (req, res) => {
    const result = await orderService.getUserOrders(req.user.userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Orders fetched successfully",
        data: result,
    });
});

const getAllOrders = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const fulfillmentStatus = req.query.fulfillmentStatus || null;

    const result = await orderService.getAllOrders(page, limit, search, fulfillmentStatus);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "All orders fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// Get order stats
const getOrderStats = catchAsync(async (req, res) => {
    const stats = await orderService.getOrderStats();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order stats fetched successfully",
        data: stats,
    });
});

const updateOrder = catchAsync(async (req, res) => {
    const result = await orderService.updateOrder(req.params.id, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order updated successfully",
        data: result,
    });
});

// Cancel order
const cancelOrder = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const cancelledBy = req.user.role === "admin" ? "admin" : "user";

    const result = await orderService.cancelOrder(id, req.user.userId, reason, cancelledBy);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order cancelled successfully",
        data: result,
    });
});

// Request refund
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

// Process refund (admin only)
const processRefund = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { approve, rejectReason } = req.body;

    const result = await orderService.processRefund(id, approve, rejectReason);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: approve ? "Refund processed successfully" : "Refund request rejected",
        data: result,
    });
});

// Request return
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

// Process return (admin only)
const processReturn = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { approve, trackingNumber, rejectReason } = req.body;

    const result = await orderService.processReturn(id, approve, trackingNumber, rejectReason);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: approve ? "Return request approved" : "Return request rejected",
        data: result,
    });
});

// Complete return (admin only)
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

export default {
    createCheckout,
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