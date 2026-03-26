import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import quoteService from "./quote.service.js";

const createQuote = catchAsync(async (req, res) => {
  const result = await quoteService.createQuote(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Quote created successfully",
    data: result,
  });
});

const getAllQuotes = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || "";
  const category = req.query.category || "all";

  const result = await quoteService.getAllQuotes(page, limit, search, category);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quotes fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getQuoteById = catchAsync(async (req, res) => {
  const result = await quoteService.getQuoteById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote fetched successfully",
    data: result,
  });
});

const updateQuote = catchAsync(async (req, res) => {
  const result = await quoteService.updateQuote(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote updated successfully",
    data: result,
  });
});

const deleteQuote = catchAsync(async (req, res) => {
  await quoteService.deleteQuote(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote deleted successfully",
    data: null,
  });
});

const toggleQuoteActive = catchAsync(async (req, res) => {
  const result = await quoteService.toggleQuoteActive(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Quote ${result.isActive ? "activated" : "deactivated"} successfully`,
    data: result,
  });
});

export default {
  createQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
  toggleQuoteActive,
};