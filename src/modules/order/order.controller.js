import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import orderService from "./order.service.js";


// create + checkout
const createCheckout = catchAsync(async (req, res) => {
    const order = await orderService.createOrder(
        req.user.userId,
        req.body
    );

    const session = await orderService.createCheckoutSession(order._id);

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

export default {
    createCheckout,
    getOrderById,
    getUserOrders,
};