import express from "express";
import stripe from "../config/stripe.js";
import env from "../config/env.js";
import orderService from "../modules/order/order.service.js";
import { handleSubscriptionWebhook } from "../modules/subscription/subscription.webhook.js";

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
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        if (session.mode === "payment") {
          const orderId = session.metadata.orderId;
          await orderService.confirmPaymentAndAssignTag(orderId);
        } else if (session.mode === "subscription") {
          await handleSubscriptionWebhook(event);
        }
      } else if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        await handleSubscriptionWebhook(event);
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
    }

    res.json({ received: true });
  }
);

export default router;