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
  const result = await tagService.getAllTags();

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

  if (!tag.isActivated) {
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Tag needs activation",
      data: { status: "NEEDS_ACTIVATION" },
    });
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Ready to unlock",
    data: { status: "READY_FOR_UNLOCK" },
  });
});

export default {
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  activateTag,
  resolveTag,
};