import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import tagService from "./tag.service.js";
import quoteService from "../quote/quote.service.js";
import quoteAssignmentService from "../quoteAssignment/quoteAssignment.service.js";
import receivedQuoteService from "../received-quote/receivedQuote.service.js";
import receivedQuoteRepository from "../received-quote/receivedQuote.repository.js";
import { getDayKey } from "../../utils/dateUtils.js";

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

const deleteTag = catchAsync(async (req, res) => {
  const result = await tagService.deleteTag(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tag permanently deleted successfully",
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

  const isLoggedIn = Boolean(req.user && req.user.userId);
  const userId = req.user?.userId || null;
  const ownerId = tag.owner ? (tag.owner._id ? tag.owner._id.toString() : tag.owner.toString()) : null;
  const isOwner = Boolean(isLoggedIn && ownerId && userId && ownerId === userId.toString());

  const targetUserId = userId || ownerId;
  const todayKey = getDayKey(req);

  let dailyUsage = null;
  if (targetUserId) {
    try {
      dailyUsage = await receivedQuoteService.getDailyUsage(targetUserId, req);
    } catch (e) {
      // Non-fatal
    }
  }

  let quote = null;
  let quoteSource = "random";

  // 1. First check quote assigned directly to this tag
  const tagAssignment = await quoteAssignmentService.getTopAssignmentByTag(tag._id);

  if (tagAssignment?.quote && tagAssignment.quote.isActive !== false) {
    quote = tagAssignment.quote;
    quoteSource = "tag_assignment";
  }

  // 2. If no tag assignment, check quote assigned to tag owner/user
  if (!quote && tag.owner) {
    const userAssignment = await quoteAssignmentService.getTopAssignmentByUser(tag.owner);

    if (userAssignment?.quote && userAssignment.quote.isActive !== false) {
      quote = userAssignment.quote;
      quoteSource = "user_assignment";
    }
  }

  // If an assignment was found, check if it was already received on a prior day
  if (quote && targetUserId) {
    try {
      const receivedOnPriorDay = await receivedQuoteRepository.hasReceivedQuoteOnPriorDay(
        targetUserId,
        quote._id,
        todayKey
      );
      if (receivedOnPriorDay) {
        const receivedToday = await receivedQuoteRepository.hasReceivedQuoteToday(
          targetUserId,
          quote._id,
          todayKey
        );
        if (!receivedToday) {
          quote = null;
          quoteSource = "random";
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // 3. If no unconsumed assignment, check if user already has an active quote for today
  if (!quote && targetUserId) {
    try {
      const todayQuotes = await receivedQuoteRepository.getTodayReceivedQuotes(targetUserId, todayKey);
      if (todayQuotes && todayQuotes.length > 0 && todayQuotes[0].quote) {
        quote = todayQuotes[0].quote;
        quoteSource = todayQuotes[0].source || "scan";
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // 4. If still no quote, fallback to random quote
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
      isOwner,
      needsAuth,
      subscriptionType: tag.subscriptionType,
      hasPersonalMessage: !!tag.personalMessage,
      quoteSource,
      dailyUsage,
      quote: quote
        ? {
          _id: quote._id,
          text: quote.text,
          category: quote.category,
          author: quote.author || "InspireTag",
          description: quote.description || null,
          image: quote.image || null,
          theme: quote.theme || null,
          editorData: quote.editorData || null,
          renderedImages: quote.renderedImages || null,
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

const bulkCreateTags = catchAsync(async (req, res) => {
  const { quantity, prefix } = req.body;
  const result = await tagService.bulkCreateTags(quantity, prefix);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Tags generated successfully",
    data: result,
  });
});

export default {
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  deleteTag,
  activateTag,
  resolveTag,
  setPersonalMessage,
  getPersonalMessage,
  getMyTags,
  bulkCreateTags,
};