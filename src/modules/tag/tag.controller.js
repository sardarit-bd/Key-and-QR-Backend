import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import tagService from "./tag.service.js";
import quoteService from "../quote/quote.service.js";
import quoteAssignmentService from "../quoteAssignment/quoteAssignment.service.js";

const createTag = catchAsync(async (req, res) => {
  const result = await tagService.createTag(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Tag created successfully",
    data: result,
  });
});

const getAllTags = catchAsync(async (req, res) => {
  const result = await tagService.getAllTags(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tags fetched successfully",
    data: result,
  });
});

const getTagByCode = catchAsync(async (req, res) => {
  const result = await tagService.getTagByCode(req.params.tagCode);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tag fetched successfully",
    data: result,
  });
});

const updateTag = catchAsync(async (req, res) => {
  const result = await tagService.updateTag(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tag updated successfully",
    data: result,
  });
});

const activateTag = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { tagCode } = req.params;

  const result = await tagService.activateTag(tagCode, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tag activated successfully",
    data: result,
  });
});

const resolveTag = catchAsync(async (req, res) => {
  const { tagCode } = req.params;

  const tag = await tagService.getTagByCode(tagCode);

  let status = "READY_FOR_UNLOCK";
  let needsAuth = false;

  if (!tag.isActive) {
    status = "DISABLED";
  } else if (!tag.isActivated) {
    status = "NEEDS_ACTIVATION";
    needsAuth = true;
  }

  const isLoggedIn = req.user && req.user.userId ? true : false;

  let quote = null;
  let quoteSource = "random";

  // 1. First check quote assigned directly to this tag
  const tagAssignment = await quoteAssignmentService.getTopAssignmentByTag(tag._id);

  if (tagAssignment?.quote) {
    quote = tagAssignment.quote;
    quoteSource = "tag_assignment";
  }

  // 2. If no tag assignment, check quote assigned to tag owner/user
  if (!quote && tag.owner) {
    const userAssignment = await quoteAssignmentService.getTopAssignmentByUser(tag.owner);

    if (userAssignment?.quote) {
      quote = userAssignment.quote;
      quoteSource = "user_assignment";
    }
  }

  // 3. If no assignment found, fallback to random quote
  if (!quote) {
    quote = await quoteService.getRandomQuote(null);
    quoteSource = "random";
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tag resolved successfully",
    data: {
      status,
      tagCode: tag.tagCode,
      tagId: tag._id,
      isActivated: tag.isActivated,
      isActive: tag.isActive,
      isLoggedIn,
      needsAuth,
      subscriptionType: tag.subscriptionType,
      hasPersonalMessage: !!tag.personalMessage,
      quoteSource,
      quote: quote
        ? {
          _id: quote._id,
          text: quote.text,
          category: quote.category,
          author: quote.author || "InspireTag",
          description: quote.description || null,
          image: quote.image || null,
          theme: quote.theme || null,
          allowReuse:
            typeof quote.allowReuse === "boolean" ? quote.allowReuse : true,
        }
        : null,
    },
  });
});

// Set personal message
const setPersonalMessage = catchAsync(async (req, res) => {
  const { tagCode } = req.params;
  const { message } = req.body;
  const userId = req.user.userId;

  const result = await tagService.setPersonalMessage(tagCode, userId, message);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: message ? "Personal message saved successfully" : "Personal message removed",
    data: result,
  });
});

// Get personal message
const getPersonalMessage = catchAsync(async (req, res) => {
  const { tagCode } = req.params;

  const result = await tagService.getPersonalMessage(tagCode);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: result,
  });
});

const getMyTags = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const result = await tagService.getMyTags(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My tags fetched successfully",
    data: result,
  });
});

export default {
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  activateTag,
  resolveTag,
  setPersonalMessage,
  getPersonalMessage,
  getMyTags,
};