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
      enum: [
        "inspire", "love", "strength", "healing", "faith", "gratitude",
        "hope", "success", "leadership", "family", "friendship", "kindness",
        "happiness", "wisdom", "motivation", "self-growth", "positivity",
        "courage", "mindfulness", "dreams", "life", "peace", "discipline",
        "purpose", "other",
      ],
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
    // Explicit submission timestamp — the cooldown anchor for submission
    // limits. Set on creation (same instant as createdAt) so the most
    // recent successful submission lookup is unambiguous.
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    // Atomicity guard for the submission cooldown. Unique per
    // { user, type, cooldown window } so two concurrent submission requests
    // cannot both create a record (the second insert hits a duplicate-key
    // error). Window size is plan-dependent: 1 day for subscribers,
    // 7 days for free users. Only set by the submission endpoint.
    cooldownWindowKey: {
      type: String,
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
pendingQuoteSchema.index({ user: 1, submittedAt: -1 });
pendingQuoteSchema.index({ type: 1, status: 1 });
pendingQuoteSchema.index({ order: 1 });
// Unique per user+type+cooldown-window → atomic duplicate-submission guard.
pendingQuoteSchema.index(
  { cooldownWindowKey: 1 },
  { unique: true, sparse: true, partialFilterExpression: { cooldownWindowKey: { $type: "string" } } }
);

const PendingQuote = mongoose.model("PendingQuote", pendingQuoteSchema);
export default PendingQuote;