import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import subscriptionService from "./subscription.service.js";

const getPlans = catchAsync(async (req, res) => {
  const result = await subscriptionService.getPlans();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription plans fetched successfully",
    data: result,
  });
});

const getMySubscriptions = catchAsync(async (req, res) => {
  const result = await subscriptionService.getMySubscriptions(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My subscriptions fetched successfully",
    data: result,
  });
});

const createCheckoutSession = catchAsync(async (req, res) => {
  const result = await subscriptionService.createCheckoutSession(
    req.user.userId,
    req.body.tagCode
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription checkout session created successfully",
    data: result,
  });
});

const cancelMySubscription = catchAsync(async (req, res) => {
  const result = await subscriptionService.cancelMySubscription(
    req.user.userId,
    req.body.tagCode
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription will be canceled at period end",
    data: result,
  });
});

export default {
  getPlans,
  getMySubscriptions,
  createCheckoutSession,
  cancelMySubscription,
};