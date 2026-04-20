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
      required: false,
      default: null,
      index: true,
    },

    quote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      default: null,
    },

    category: {
      type: String,
      default: null,
    },

    scanDateKey: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

scanHistorySchema.index({ tag: 1, scanDateKey: 1 });
scanHistorySchema.index({ user: 1, createdAt: -1 });
scanHistorySchema.index({ user: 1, scanDateKey: 1 });

const ScanHistory = mongoose.model("ScanHistory", scanHistorySchema);

export default ScanHistory;