import mongoose from "mongoose";

/**
 * Webhook Event Log Model
 * Track all Stripe webhook events for idempotency and auditing
 */
const webhookLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    metadata: {
      orderId: { type: String, default: null },
      userId: { type: String, default: null },
      sessionId: { type: String, default: null },
    },
    retryCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for cleanup jobs
webhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

// Index for querying by event type and status
webhookLogSchema.index({ eventType: 1, status: 1, createdAt: -1 });

const WebhookLog = mongoose.model("WebhookLog", webhookLogSchema);

export default WebhookLog;