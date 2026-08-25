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

// Public: get shop hero image data
const getShopHeroContent = catchAsync(async (req, res) => {
  const result = await heroService.getShopHeroContent();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop hero content fetched successfully",
    data: result,
  });
});

// Admin only: update shop hero image data
const updateShopHeroContent = catchAsync(async (req, res) => {
  const result = await heroService.updateShopHeroContent(req.body, req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop hero image updated successfully",
    data: result,
  });
});

// Public: get announcement banner data
const getAnnouncementBanner = catchAsync(async (req, res) => {
  const result = await heroService.getAnnouncementBanner();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Announcement banner fetched successfully",
    data: result,
  });
});

// Admin only: update announcement banner data
const updateAnnouncementBanner = catchAsync(async (req, res) => {
  const result = await heroService.updateAnnouncementBanner(req.body, req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Announcement banner updated successfully",
    data: result,
  });
});

export default {
  getHeroContent,
  updateHeroContent,
  getShopHeroContent,
  updateShopHeroContent,
  getAnnouncementBanner,
  updateAnnouncementBanner,
};

