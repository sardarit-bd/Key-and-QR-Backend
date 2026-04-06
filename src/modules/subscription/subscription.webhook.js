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