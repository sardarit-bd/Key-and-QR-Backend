import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    public_id: String,
    url: String,
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    brand: {
      type: String,
      default: "",
      trim: true,
    },

    image: imageSchema,

    gallery: {
      type: [imageSchema],
      default: [],
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    stock: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", category: "text", brand: "text" });

export default mongoose.model("Product", productSchema);