import express from "express";
import stripe from "../config/stripe.js";
import env from "../config/env.js";
import orderService from "../modules/order/order.service.js";

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
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("📦 Webhook event received:", event.type);
    console.log("Event data:", JSON.stringify(event.data.object, null, 2));

    if (event.type === "checkout.session.completed") {
      try {
        const session = event.data.object;
        const orderId = session.metadata.orderId;

        console.log("💰 Payment completed for order:", orderId);

        // Call the service
        const updatedOrder = await orderService.confirmPaymentAndAssignTag(orderId);

        console.log("✅ Order updated:", {
          orderId: updatedOrder._id,
          paymentStatus: updatedOrder.paymentStatus,
          fulfillmentStatus: updatedOrder.fulfillmentStatus,
          assignedTag: updatedOrder.assignedTag
        });

      } catch (error) {
        console.error("❌ Error processing webhook:", error);
        console.error("Error stack:", error.stack);
        // Don't return error response to Stripe (they'll retry)
      }
    }

    res.json({ received: true });
  }
);

export default router;