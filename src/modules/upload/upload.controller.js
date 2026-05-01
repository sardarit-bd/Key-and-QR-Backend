import cloudinary from "../../config/cloudinary.js";
import httpStatus from "../../constants/httpStatus.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";

export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "No image file provided",
    });
  }

  // Convert buffer to base64
  const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  
  const result = await cloudinary.uploader.upload(base64Image, {
    folder: "hero",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Image uploaded successfully",
    data: { url: result.secure_url },
  });
});