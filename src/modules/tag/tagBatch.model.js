import mongoose from "mongoose";

const tagBatchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    prefix: {
      type: String,
      default: "TAG",
      trim: true,
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1,
      max: 5000,
    },
    createdQuantity: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const TagBatch = mongoose.model("TagBatch", tagBatchSchema);
export default TagBatch;
