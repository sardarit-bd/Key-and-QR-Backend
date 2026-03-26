import mongoose from "mongoose";

const quoteSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      enum: ["faith", "love", "hope", "success", "motivation"],
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Create index for faster random queries
quoteSchema.index({ category: 1, isActive: 1 });

const Quote = mongoose.model("Quote", quoteSchema);
export default Quote;