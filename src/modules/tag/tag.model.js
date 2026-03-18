import mongoose from "mongoose";

const tagSchema = new mongoose.Schema(
  {
    tagCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isActivated: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    subscriptionType: {
      type: String,
      enum: ["free", "subscriber"],
      default: "free",
    },

    activatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Tag = mongoose.model("Tag", tagSchema);
export default Tag;