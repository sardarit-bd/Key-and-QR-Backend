import cloudinary from "../../config/cloudinary.js";
import httpStatus from "../../constants/httpStatus.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { sanitizeSvg } from "../../utils/svgSanitizer.js";

export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "No file provided",
    });
  }

  // Convert buffer to base64
  const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  
  const result = await cloudinary.uploader.upload(base64Image, {
    folder: "hero",
    resource_type: "auto",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "File uploaded successfully",
    data: { url: result.secure_url },
  });
});

/**
 * Upload a category icon (SVG only).
 * Validates file type/size, sanitizes the SVG markup (rejects scripts,
 * event handlers, foreignObject, external refs, SMIL), then stores the
 * sanitized asset on Cloudinary as an image resource.
 */
export const uploadCategoryIcon = catchAsync(async (req, res) => {
  if (!req.file) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "No SVG file provided",
    });
  }

  // Accept image/svg+xml (and the generic application/octet-stream some
  // clients send for .svg). Reject everything else explicitly.
  const isSvg =
    req.file.mimetype === "image/svg+xml" ||
    req.file.mimetype === "application/octet-stream" ||
    /\.svg$/i.test(req.file.originalname);

  if (!isSvg) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Only SVG files are allowed for category icons",
    });
  }

  const svgText = req.file.buffer.toString("utf8");
  const sanitized = sanitizeSvg(svgText, { maxBytes: 500 * 1024 });

  if (!sanitized.ok) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: sanitized.error || "SVG failed validation",
    });
  }

  // Store as an image asset (SVG served with image/svg+xml by Cloudinary).
  const base64Svg = `data:image/svg+xml;base64,${Buffer.from(sanitized.svg, "utf8").toString("base64")}`;

  const result = await cloudinary.uploader.upload(base64Svg, {
    folder: "category-icons",
    resource_type: "image",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Icon uploaded successfully",
    data: { url: result.secure_url },
  });
});