import mongoose from "mongoose";

const quoteAssignmentSchema = new mongoose.Schema(
  {
    quote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      required: true,
      index: true,
    },

    tag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tag",
      default: null,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    assignmentType: {
      type: String,
      enum: ["tag", "user"],
      required: true,
      index: true,
    },

    priority: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    startAt: {
      type: Date,
      default: null,
    },

    endAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate active tag-based assignment for same tag + quote
quoteAssignmentSchema.index(
  { tag: 1, quote: 1, assignmentType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tag: { $ne: null },
      assignmentType: "tag",
    },
  }
);

// Prevent duplicate active user-based assignment for same user + quote
quoteAssignmentSchema.index(
  { user: 1, quote: 1, assignmentType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $ne: null },
      assignmentType: "user",
    },
  }
);

// Helpful query indexes
quoteAssignmentSchema.index({ tag: 1, isActive: 1, priority: -1, createdAt: -1 });
quoteAssignmentSchema.index({ user: 1, isActive: 1, priority: -1, createdAt: -1 });
quoteAssignmentSchema.index({ quote: 1, isActive: 1 });

const QuoteAssignment = mongoose.model("QuoteAssignment", quoteAssignmentSchema);

export default QuoteAssignment;