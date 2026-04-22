import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import pendingQuoteService from "./pendingQuote.service.js";

// User submits a quote
const submitQuote = catchAsync(async (req, res) => {
  const result = await pendingQuoteService.submitQuote(req.user.userId, req.body);
  
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Quote submitted successfully. Awaiting admin approval.",
    data: result,
  });
});

// Admin gets all pending quotes
const getPendingQuotes = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || "";
  
  const result = await pendingQuoteService.getPendingQuotes(page, limit, search);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending quotes fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

// Admin approves a quote
const approveQuote = catchAsync(async (req, res) => {
  const { adminNote } = req.body;
  const result = await pendingQuoteService.approveQuote(req.params.id, adminNote);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote approved and added to main quotes",
    data: result,
  });
});

// Admin rejects a quote
const rejectQuote = catchAsync(async (req, res) => {
  const { adminNote } = req.body;
  const result = await pendingQuoteService.rejectQuote(req.params.id, adminNote);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote rejected",
    data: result,
  });
});

// Admin deletes a pending quote
const deletePendingQuote = catchAsync(async (req, res) => {
  await pendingQuoteService.deletePendingQuote(req.params.id);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending quote deleted successfully",
    data: null,
  });
});

const getMyQuotes = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  
  const result = await pendingQuoteService.getMyQuotes(req.user.userId, page, limit);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your quotes fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});


export default {
  submitQuote,
  getPendingQuotes,
  approveQuote,
  rejectQuote,
  deletePendingQuote,
  getMyQuotes,
};