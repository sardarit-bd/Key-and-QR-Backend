import mongoose from "mongoose";

const heroSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      default: "Create Your Story in a Keychain",
    },
    subtitle: {
      type: String,
      required: true,
      default: "Every keychain carries a hidden message of hope, love, or joy — revealed only when scanned.",
    },
    buttonText: {
      type: String,
      required: true,
      default: "Start Your Story Now",
    },
    secondaryButtonText: {
      type: String,
      required: true,
      default: "How It Works",
    },
    imageUrl: {
      type: String,
      default: "/home/keychain.png",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    steps: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        icon: { type: String, enum: ["ShoppingBag", "QrCode", "Scan"], default: "ShoppingBag" },
        bgColor: { type: String, default: "bg-blue-100" },
        iconColor: { type: String, default: "text-blue-600" },
      },
    ],
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Hero = mongoose.model("Hero", heroSchema);
export default Hero;