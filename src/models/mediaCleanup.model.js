import mongoose from "mongoose";

const mediaCleanupSchema = new mongoose.Schema(
  {
    public_id: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "PRODUCT_CREATE_DB_FAILED",
        "PRODUCT_UPDATE_OLD_IMAGE_DELETE_FAILED",
        "PRODUCT_UPDATE_OLD_GALLERY_DELETE_FAILED",
        "PRODUCT_SOFT_DELETE_IMAGE_DELETE_FAILED",
        "PRODUCT_SOFT_DELETE_GALLERY_DELETE_FAILED",
        "PRODUCT_PERMANENT_DELETE_IMAGE_DELETE_FAILED",
        "PRODUCT_PERMANENT_DELETE_GALLERY_DELETE_FAILED",
      ],
    },
    status: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending",
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const MediaCleanup = mongoose.model("MediaCleanup", mediaCleanupSchema);

export default MediaCleanup;