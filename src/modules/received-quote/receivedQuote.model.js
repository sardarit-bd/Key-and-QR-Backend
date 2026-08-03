import mongoose from "mongoose";

const receivedQuoteSchema = new mongoose.Schema(
  {
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
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    // Snapshot so history renders correctly even if the category is later renamed/deleted
    categorySlug: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },

    receivedAt: {
      type: Date,
      default: Date.now,
    },

    source: {
      type: String,
      enum: ["scan", "random", "assignment", "personal", "dashboard", "other"],
      default: "other",
    },

    dayKey: {
      type: String,
      required: true,
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    isFavoriteSnapshot: {
      type: Boolean,
      default: false,
    },

    // No-repeat cycle: increments per user+category each time the cycle completes.
    // cycle: null applies to legacy rows without a cycle number.
    cycle: {
      type: Number,
      default: 0,
      min: 0,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

receivedQuoteSchema.index({ user: 1, receivedAt: -1 });
receivedQuoteSchema.index({ user: 1, dayKey: 1 });
receivedQuoteSchema.index({ user: 1, category: 1 });
receivedQuoteSchema.index({ user: 1, category: 1, cycle: 1 });
receivedQuoteSchema.index({ quote: 1 });

const ReceivedQuote = mongoose.model("ReceivedQuote", receivedQuoteSchema);
export default ReceivedQuote;
