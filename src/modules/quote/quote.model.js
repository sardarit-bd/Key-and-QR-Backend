import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    public_id: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const renderedImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      default: null,
    },
    publicId: {
      type: String,
      default: null,
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
    format: {
      type: String,
      default: "webp",
    },
  },
  { _id: false }
);

const quoteSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      default: "",
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    author: {
      type: String,
      default: "InspireTag",
      trim: true,
    },

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },

    image: {
      type: mediaSchema,
      default: null,
    },

    theme: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },

    allowReuse: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    editorData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    renderedImages: {
      desktop: {
        type: renderedImageSchema,
        default: null,
      },
      mobile: {
        type: renderedImageSchema,
        default: null,
      },
    },
  },
  { timestamps: true }
);

// Create index for faster random queries
quoteSchema.index({ category: 1, isActive: 1 });

// Helpful for admin filtering later
quoteSchema.index({ isActive: 1, allowReuse: 1, createdAt: -1 });

const Quote = mongoose.model("Quote", quoteSchema);
export default Quote;