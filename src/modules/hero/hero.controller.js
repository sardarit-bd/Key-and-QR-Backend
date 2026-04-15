import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import heroService from "./hero.service.js";

const getHeroContent = catchAsync(async (req, res) => {
  const result = await heroService.getHeroContent();
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hero content fetched successfully",
    data: result,
  });
});

const updateHeroContent = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await heroService.updateHeroContent(id, req.body, req.user.userId);
  
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