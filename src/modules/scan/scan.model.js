import mongoose from "mongoose";

const scanHistorySchema = new mongoose.Schema(
  {
    tag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tag",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
      type: String, // e.g. "2026-03-18"
      required: true,
    },
  },
  { timestamps: true }
);

const ScanHistory = mongoose.model("ScanHistory", scanHistorySchema);
export default ScanHistory;