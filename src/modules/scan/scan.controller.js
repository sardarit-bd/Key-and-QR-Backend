import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import unlockService from "./tag-unlock.service.js";

const unlockTag = catchAsync(async (req, res) => {
  const { tagCode } = req.params;
  const { category } = req.body;

  const result = await unlockService.unlockTag(
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

export default {
  unlockTag,
  getLastUnlock,
};