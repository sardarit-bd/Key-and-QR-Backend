import mongoose from "mongoose";
import roles from "../constants/roles.js";

const imageSchema = new mongoose.Schema(
  {
    public_id: String,
    url: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      minlength: 6,
      select: false,
      // Password is optional for social login users
    },

    role: {
      type: String,
      enum: [roles.USER, roles.ADMIN],
      default: roles.USER,
    },

    profileImage: {
      type: imageSchema,
      default: null,
    },

    // Social login fields
    provider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },

    googleId: {
      type: String,
      sparse: true,
      index: true,
    },

    appleId: {
      type: String,
      sparse: true,
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    // 🆕 Stripe Customer ID for subscription management
    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ appleId: 1 }, { sparse: true });
userSchema.index({ provider: 1 });
userSchema.index({ stripeCustomerId: 1 }, { sparse: true }); // 🆕 Index for stripeCustomerId

const User = mongoose.model("User", userSchema);

export default User;