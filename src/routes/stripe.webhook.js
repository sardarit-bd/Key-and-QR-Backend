import express from "express";
import stripe from "../config/stripe.js";
import env from "../config/env.js";
import orderService from "../modules/order/order.service.js";
import { handleSubscriptionWebhook } from "../modules/subscription/subscription.webhook.js";
import WebhookLog from "../models/webhookLog.model.js";
import logger from "../utils/logger.js";

const router = express.Router();

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        env.stripeWebhookSecret
      );
    } catch (err) {
      logger.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const eventId = event.id;
    const eventType = event.type;

    try {
      // ✅ IDEMPOTENCY CHECK
      const existingLog = await WebhookLog.findOne({ eventId });
      
      if (existingLog) {
        if (existingLog.status === "completed") {
          logger.info(`✅ Webhook ${eventId} already processed - skipping`);
          return res.json({ received: true, alreadyProcessed: true });
        }
        
        // If failed, retry with backoff
        if (existingLog.status === "failed" && existingLog.retryCount < 3) {
          logger.info(`🔄 Retrying webhook ${eventId}, attempt ${existingLog.retryCount + 1}`);
          await WebhookLog.updateOne(
            { _id: existingLog._id },
            { 
              status: "processing",
              $inc: { retryCount: 1 }
            }
          );
        } else {
          // Max retries exceeded or currently processing
          if (existingLog.status === "processing") {
            logger.warn(`⚠️ Webhook ${eventId} is already processing`);
            return res.json({ received: true, alreadyProcessing: true });
          }
          if (existingLog.retryCount >= 3) {
            logger.error(`❌ Webhook ${eventId} failed after 3 retries`);
            return res.status(500).json({ error: "Webhook processing failed" });
          }
        }
      } else {
        // ✅ NEW EVENT - Create log
        await WebhookLog.create({
          eventId,
          eventType,
          status: "pending",
          payload: event,
          metadata: {
            orderId: event.data.object?.metadata?.orderId || null,
            userId: event.data.object?.metadata?.userId || null,
            sessionId: event.data.object?.id || null,
          },
        });
        logger.info(`📥 New webhook ${eventId} of type ${eventType} logged`);
      }

      // ✅ PROCESS WEBHOOK
      try {
        if (eventType === "checkout.session.completed") {
          const session = event.data.object;

          if (session.mode === "payment") {
            const orderId = session.metadata.orderId;
            const paymentIntentId = session.payment_intent;

            // ✅ Use transaction for payment confirmation and tag assignment
            await orderService.confirmPaymentAndAssignTag(
              orderId,
              paymentIntentId,
              eventId // Pass eventId for idempotency
            );
          } else if (session.mode === "subscription") {
            await handleSubscriptionWebhook(event);
          }
        } else if (
          eventType === "customer.subscription.updated" ||
          eventType === "customer.subscription.deleted"
        ) {
          await handleSubscriptionWebhook(event);
        }

        // ✅ MARK AS COMPLETED
        await WebhookLog.updateOne(
          { eventId },
          {
            status: "completed",
            processedAt: new Date(),
          }
        );
        
        logger.info(`✅ Webhook ${eventId} processed successfully`);

      } catch (error) {
        // ✅ MARK AS FAILED
        const log = await WebhookLog.findOne({ eventId });
        const retryCount = log?.retryCount || 0;

        await WebhookLog.updateOne(
          { eventId },
          {
            status: "failed",
            error: error.message,
            retryCount: retryCount + 1,
          }
        );

        logger.error(`❌ Webhook ${eventId} processing failed: ${error.message}`);
        throw error; // Re-throw for webhook retry
      }

    } catch (error) {
      logger.error(`Webhook processing error: ${error.message}`, error);
      // Return 200 to avoid Stripe retry for duplicate events
      // For actual errors, return 500 to trigger Stripe retry
      if (error.message.includes("already processed")) {
        return res.json({ received: true });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json({ received: true });
  }
);

// ✅ Admin endpoint to view webhook logs
router.get("/webhook-logs", async (req, res) => {
  try {
    const { limit = 50, status, eventType } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (eventType) filter.eventType = eventType;

    const logs = await WebhookLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;