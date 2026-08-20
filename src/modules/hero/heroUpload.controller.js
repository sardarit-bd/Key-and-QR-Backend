import cloudinary from "../../config/cloudinary.js";
import httpStatus from "../../constants/httpStatus.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";

/**
 * Upload the hero image to Cloudinary (folder: hero).
 * Returns { url, publicId } which the admin form stores on the Hero record.
 */
export const uploadHeroImage = catchAsync(async (req, res) => {
  if (!req.file) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "No image file provided",
    });
  }

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "hero",
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, uploadedResult) => {
        if (error) return reject(error);
        resolve(uploadedResult);
      }
    );
    uploadStream.end(req.file.buffer);
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hero image uploaded successfully",
    data: {
      url: result.secure_url,
      publicId: result.public_id,
    },
  });
});
