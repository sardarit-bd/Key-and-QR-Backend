import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    quote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      default: null,
    },
  },
  { timestamps: true }
);

// Ensure unique favorite per user per product (only when product exists)
favoriteSchema.index(
  { user: 1, product: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { product: { $ne: null } }
  }
);

// Ensure unique favorite per user per quote (only when quote exists)
favoriteSchema.index(
  { user: 1, quote: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { quote: { $ne: null } }
  }
);

const Favorite = mongoose.model("Favorite", favoriteSchema);
export default Favorite;