import mongoose from "mongoose";

const pendingQuoteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: ["faith", "love", "hope", "success", "motivation", "other"],
      default: "other",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNote: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for faster queries
pendingQuoteSchema.index({ status: 1, createdAt: -1 });
pendingQuoteSchema.index({ user: 1, status: 1 });

const PendingQuote = mongoose.model("PendingQuote", pendingQuoteSchema);
export default PendingQuote;