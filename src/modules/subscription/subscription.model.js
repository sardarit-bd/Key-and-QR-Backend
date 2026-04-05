import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tag",
      required: true,
      index: true,
    },

    subscriptionType: {
      type: String,
      enum: ["free", "subscriber"],
      default: "free",
    },

    status: {
      type: String,
      enum: [
        "inactive",
        "checkout_pending",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "trialing",
      ],
      default: "inactive",
      index: true,
    },

    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
    },

    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true,
    },

    stripeCheckoutSessionId: {
      type: String,
      default: null,
      index: true,
    },

    stripePriceId: {
      type: String,
      default: null,
    },

    currentPeriodStart: {
      type: Date,
      default: null,
    },

    currentPeriodEnd: {
      type: Date,
      default: null,
    },

    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ user: 1, tag: 1 }, { unique: true });

const Subscription = mongoose.model("Subscription", subscriptionSchema);
export default Subscription;