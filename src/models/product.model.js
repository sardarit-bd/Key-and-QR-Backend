import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    brand: { type: String, default: null, trim: true },
    description: { type: String, default: "", trim: true },
    stock: { type: Number, default: 0 },
    image: {
      public_id: { type: String, default: null },
      url: { type: String, default: null },
    },
    gallery: [
      {
        public_id: { type: String, default: null },
        url: { type: String, default: null },
      }
    ],
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);
export default Product;
