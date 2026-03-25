import mongoose from "mongoose";

const scanHistorySchema = new mongoose.Schema(
  {
    tag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tag",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    quote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      required: true,
    },

    category: {
      type: String,
      default: null,
    },

    scanDateKey: {
      type: String, // e.g. "2026-03-25"
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// compound index for daily lookup
scanHistorySchema.index({ tag: 1, scanDateKey: 1 });

const ScanHistory = mongoose.model("ScanHistory", scanHistorySchema);

export default ScanHistory;