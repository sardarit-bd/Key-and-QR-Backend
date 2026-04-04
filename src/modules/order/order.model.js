import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    assignedTag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tag",
      default: null,
    },

    purchaseType: {
      type: String,
      enum: ["self", "gift"],
      default: "self",
    },

    giftMessage: {
      type: String,
      default: null,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
    },

    fulfillmentStatus: {
      type: String,
      enum: ["pending", "assigned", "shipped", "delivered", "cancelled", "returned"],
      default: "pending",
    },

    refundStatus: {
      type: String,
      enum: ["none", "requested", "approved", "completed", "rejected"],
      default: "none",
    },

    refundAmount: {
      type: Number,
      default: 0,
    },

    refundReason: {
      type: String,
      default: null,
    },

    refundRequestedAt: {
      type: Date,
      default: null,
    },

    refundProcessedAt: {
      type: Date,
      default: null,
    },

    refundTransactionId: {
      type: String,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: String,
      enum: ["user", "admin"],
      default: null,
    },

    returnStatus: {
      type: String,
      enum: ["none", "requested", "approved", "shipped", "received", "completed", "rejected"],
      default: "none",
    },

    returnReason: {
      type: String,
      default: null,
    },

    returnRequestedAt: {
      type: Date,
      default: null,
    },

    returnApprovedAt: {
      type: Date,
      default: null,
    },

    returnShippedAt: {
      type: Date,
      default: null,
    },

    returnReceivedAt: {
      type: Date,
      default: null,
    },

    returnTrackingNumber: {
      type: String,
      default: null,
    },

    // Stripe payment intent ID for refund
    stripePaymentIntentId: {
      type: String,
      default: null,
    },

    stripeSessionId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ fulfillmentStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ refundStatus: 1 });
orderSchema.index({ returnStatus: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;