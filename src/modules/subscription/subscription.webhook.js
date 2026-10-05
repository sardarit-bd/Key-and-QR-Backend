import subscriptionService from "./subscription.service.js";


export const handleSubscriptionWebhook = async (event) => {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      if (session.mode === "subscription") {
        await subscriptionService.activateFromCheckoutSession(session);
      }
      break;
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      await subscriptionService.handleInvoicePaymentSucceeded(invoice);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      await subscriptionService.handleInvoicePaymentFailed(invoice);
      break;
    }

    case "customer.subscription.updated": {
      const stripeSubscription = event.data.object;
      await subscriptionService.syncFromStripeSubscription(stripeSubscription);
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSubscription = event.data.object;
      await subscriptionService.syncFromStripeSubscription(stripeSubscription);
      break;
    }

    default:
      break;
  }
};