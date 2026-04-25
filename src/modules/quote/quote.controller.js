import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import quoteService from "./quote.service.js";

const createQuote = catchAsync(async (req, res) => {
  const image = req.file || null;
  
  console.log("Request body:", req.body);
  console.log("Image file:", req.file);

  const result = await quoteService.createQuote(req.body, image);

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
  const isActive =
    req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;
  const allowReuse =
    req.query.allowReuse !== undefined ? req.query.allowReuse === "true" : undefined;

  const result = await quoteService.getAllQuotes({
    page,
    limit,
    search,
    category,
    isActive,
    allowReuse,
  });

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
  const image = req.file || null;

  const result = await quoteService.updateQuote(req.params.id, req.body, image);

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

  let queryCategory = category;
  if (category === "random") {
    queryCategory = null;
  } else if (category === "gratitude") {
    queryCategory = "hope";
  } else if (category === "healing") {
    queryCategory = "hope";
  }

  const result = await quoteService.getRandomQuote(queryCategory);

  if (!result) {
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
        author: fallbackResult.author || "InspireTag",
        description: fallbackResult.description || null,
        image: fallbackResult.image || null,
        theme: fallbackResult.theme || null,
        allowReuse:
          typeof fallbackResult.allowReuse === "boolean"
            ? fallbackResult.allowReuse
            : true,
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
      author: result.author || "InspireTag",
      description: result.description || null,
      image: result.image || null,
      theme: result.theme || null,
      allowReuse:
        typeof result.allowReuse === "boolean" ? result.allowReuse : true,
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