import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import scanService from "./tag-unlock.service.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";

const unlockTag = catchAsync(async (req, res) => {
  const { tagCode } = req.params;
  const { category } = req.body;

  const result = await scanService.unlockTag(
    tagCode,
    req.user,
    category
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unlock processed",
    data: result,
  });
});

const getLastUnlock = catchAsync(async (req, res) => {
  const { tagCode } = req.params;

  const tag = await tagRepository.findByTagCode(tagCode);
  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  const lastScan = await scanRepository.getLastScan(tag._id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: lastScan ? {
      quote: lastScan.quote?.text,
      category: lastScan.category,
      scannedAt: lastScan.createdAt,
      scanDateKey: lastScan.scanDateKey,
    } : null,
  });
});

// Get user scan history
const getUserScanHistory = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  
  const result = await scanRepository.getUserScanHistory(req.user.userId, page, limit);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Scan history fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

// Get user scan stats
const getUserScanStats = catchAsync(async (req, res) => {
  const result = await scanRepository.getUserScanStats(req.user.userId);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Scan stats fetched successfully",
    data: result,
  });
});

export default {
  unlockTag,
  getLastUnlock,
  getUserScanHistory,
  getUserScanStats,
};