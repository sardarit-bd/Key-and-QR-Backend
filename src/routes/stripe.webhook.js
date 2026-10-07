import express from "express";
import stripe from "../config/stripe.js";
import env from "../config/env.js";
import orderService from "../modules/order/order.service.js";
import { handleSubscriptionWebhook } from "../modules/subscription/subscription.webhook.js";
import WebhookLog from "../models/webhookLog.model.js";
import Order from "../modules/order/order.model.js";
import logger from "../utils/logger.js";
import auth from "../middlewares/auth.middleware.js";
import roles from "../constants/roles.js";

const router = express.Router();

// Healthcheck GET endpoint for verifying webhook URL reachability
router.get(
  ["/webhook", "/stripe/webhook", "/"],
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Stripe Webhook endpoint is active and listening for POST events",
    });
  }
);

router.post(
  ["/webhook", "/stripe/webhook", "/"],
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      logger.error("Webhook Error: Missing stripe-signature header");
      return res.status(400).send("Webhook Error: Missing stripe-signature header");
    }

    if (!env.stripeWebhookSecret) {
      logger.error("Webhook Error: STRIPE_WEBHOOK_SECRET is not configured in environment");
      return res.status(500).send("Webhook Error: STRIPE_WEBHOOK_SECRET is not configured on server");
    }

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
            let orderId = session.metadata?.orderId;
            let paymentIntentId = typeof session.payment_intent === "object"
              ? session.payment_intent?.id
              : session.payment_intent;

            // Fallback: if orderId is missing in metadata, lookup order by stripeSessionId
            if (!orderId && session.id) {
              const matchedOrder = await Order.findOne({ stripeSessionId: session.id });
              if (matchedOrder) {
                orderId = matchedOrder._id.toString();
              }
            }

            // Fallback: if payment_intent is not expanded, retrieve from Stripe
            if (session.id && !paymentIntentId) {
              try {
                const fullSession = await stripe.checkout.sessions.retrieve(session.id);
                paymentIntentId = typeof fullSession.payment_intent === "object"
                  ? fullSession.payment_intent?.id
                  : fullSession.payment_intent;
              } catch (sessionErr) {
                logger.warn(`Could not retrieve payment_intent from Stripe session ${session.id}: ${sessionErr.message}`);
              }
            }

            if (orderId && paymentIntentId) {
              // ✅ Use transaction for payment confirmation and tag assignment
              await orderService.confirmPaymentAndAssignTag(
                orderId,
                paymentIntentId,
              );
            } else if (!orderId) {
              logger.warn(`⚠️ checkout.session.completed missing metadata.orderId (Session: ${session.id})`);
            } else if (!paymentIntentId) {
              logger.warn(`⚠️ checkout.session.completed missing paymentIntentId (Session: ${session.id}, Order: ${orderId})`);
            }
          } else if (session.mode === "subscription") {
            await handleSubscriptionWebhook(event);
          }
        } else if (eventType === "payment_intent.succeeded") {
          const paymentIntent = event.data.object;
          let orderId = paymentIntent.metadata?.orderId;
          const paymentIntentId = paymentIntent.id;

          if (!orderId && paymentIntentId) {
            // Find order by stripePaymentIntentId
            const matchedOrder = await Order.findOne({ stripePaymentIntentId: paymentIntentId });
            if (matchedOrder) {
              orderId = matchedOrder._id.toString();
            } else {
              // Check if a checkout session exists for this payment intent
              try {
                const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
                if (sessions?.data?.length > 0) {
                  const sess = sessions.data[0];
                  orderId = sess.metadata?.orderId;
                  if (!orderId && sess.id) {
                    const orderFromSession = await Order.findOne({ stripeSessionId: sess.id });
                    if (orderFromSession) orderId = orderFromSession._id.toString();
                  }
                }
              } catch (sessErr) {
                logger.warn(`Could not lookup checkout session for payment_intent ${paymentIntentId}: ${sessErr.message}`);
              }
            }
          }

          if (orderId && paymentIntentId) {
            logger.info(`💳 Processing payment_intent.succeeded fallback for order ${orderId}`);
            await orderService.confirmPaymentAndAssignTag(
              orderId,
              paymentIntentId,
            );
          } else {
            logger.info(`ℹ️ payment_intent.succeeded received without metadata.orderId (${paymentIntentId})`);
          }
        } else if (
          eventType === "customer.subscription.created" ||
          eventType === "customer.subscription.updated" ||
          eventType === "customer.subscription.deleted" ||
          eventType === "invoice.paid" ||
          eventType === "invoice.payment_succeeded" ||
          eventType === "invoice.payment_failed"
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
router.get("/webhook-logs", auth(roles.ADMIN), async (req, res) => {
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