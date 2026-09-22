import mongoose from "mongoose";

const productCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product category name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },
    slug: {
      type: String,
      required: [true, "Product category slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"],
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    image: {
      public_id: { type: String, default: null },
      url: { type: String, default: null },
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

productCategorySchema.index({ slug: 1 }, { unique: true });
productCategorySchema.index({ name: 1 }, { unique: true });
productCategorySchema.index({ sortOrder: 1, isActive: 1 });

const ProductCategory = mongoose.model("ProductCategory", productCategorySchema);
export default ProductCategory;
