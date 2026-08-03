import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import receivedQuoteService from "./receivedQuote.service.js";

const getHistory = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.getHistory(
    req.validatedQuery || req.query,
    req.user.userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Received quotes fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getLatest = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.getLatestQuote(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Latest received quote fetched successfully",
    data: result,
  });
});

const getToday = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.getTodayHistory(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Today's received quotes fetched successfully",
    data: result,
  });
});

const getStatistics = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.getStatistics(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Received quote statistics fetched successfully",
    data: result,
  });
});

const getById = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.getReceivedQuoteById(
    req.params.id,
    req.user.userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Received quote fetched successfully",
    data: result,
  });
});

const receive = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.receiveDashboardQuote(
    req.user.userId,
    req.body.categorySlug
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Quote received successfully",
    data: result,
  });
});

const readAgain = catchAsync(async (req, res) => {
  const result = await receivedQuoteService.readAgain(
    req.params.id,
    req.user.userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote fetched successfully",
    data: result,
  });
});

export default {
  getHistory,
  getLatest,
  getToday,
  getStatistics,
  getById,
  receive,
  readAgain,
};
