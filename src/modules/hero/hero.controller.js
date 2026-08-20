import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import heroService from "./hero.service.js";

// Public: anyone can read the hero content
const getHeroContent = catchAsync(async (req, res) => {
  const result = await heroService.getHeroContent();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hero content fetched successfully",
    data: result,
  });
});

// Admin only: update the hero content (body is validated by middleware)
const updateHeroContent = catchAsync(async (req, res) => {
  const result = await heroService.updateHeroContent(req.body, req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hero content updated successfully",
    data: result,
  });
});

export default {
  getHeroContent,
  updateHeroContent,
};
