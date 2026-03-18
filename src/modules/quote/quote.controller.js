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
  const result = await quoteService.getAllQuotes();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quotes fetched successfully",
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

export default {
  createQuote,
  getAllQuotes,
  updateQuote,
  deleteQuote,
};