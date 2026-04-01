import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import tagService from "./tag.service.js";

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

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tag resolved successfully",
    data: {
      status,
      tagCode: tag.tagCode,
      isActivated: tag.isActivated,
      isActive: tag.isActive,
      isLoggedIn,
      needsAuth,
      subscriptionType: tag.subscriptionType,
      hasPersonalMessage: !!tag.personalMessage,
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

export default {
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  activateTag,
  resolveTag,
  setPersonalMessage,
  getPersonalMessage,
};