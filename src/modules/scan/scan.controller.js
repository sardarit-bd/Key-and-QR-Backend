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

export default {
  unlockTag,
};