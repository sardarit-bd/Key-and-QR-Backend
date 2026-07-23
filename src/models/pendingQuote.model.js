import mongoose from "mongoose";

const pendingQuoteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: ["love", "strength", "healing", "faith", "gratitude", "other"],
      default: "other",
    },
    // Discriminator: "community" for user submissions, "gift" for gift messages attached to orders
    type: {
      type: String,
      enum: ["community", "gift"],
      default: "community",
      index: true,
    },
    // Optional author attribution ("Who said it?")
    author: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
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

// Indexes for faster queries
pendingQuoteSchema.index({ status: 1, createdAt: -1 });
pendingQuoteSchema.index({ user: 1, status: 1 });
pendingQuoteSchema.index({ type: 1, status: 1 });
pendingQuoteSchema.index({ order: 1 });

const PendingQuote = mongoose.model("PendingQuote", pendingQuoteSchema);
export default PendingQuote;