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

// Get random quote by category
const getRandomQuote = catchAsync(async (req, res) => {
  const category = req.query.category || "random";
  
  // Convert category for query
  let queryCategory = category;
  if (category === "random") {
    queryCategory = null;
  } else if (category === "gratitude") {
    // Map gratitude to hope or other existing category
    queryCategory = "hope";
  } else if (category === "healing") {
    queryCategory = "hope";
  }
  
  const result = await quoteService.getRandomQuote(queryCategory);
  
  if (!result) {
    // Fallback: get any active quote
    const fallbackResult = await quoteService.getRandomQuote(null);
    if (!fallbackResult) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: "No quotes found",
        data: null,
      });
    }
    
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      data: {
        _id: fallbackResult._id,
        text: fallbackResult.text,
        category: fallbackResult.category,
        author: "InspireTag",
      },
    });
  }
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: {
      _id: result._id,
      text: result.text,
      category: result.category,
      author: "InspireTag",
    },
  });
});

export default {
  createQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
  toggleQuoteActive,
  getRandomQuote,
};