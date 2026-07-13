import env from "./env.js";

/**
 * Centralized payment/checkout configuration.
 * Used by order.service.js when creating Stripe Checkout Sessions.
 */
const PAYMENT_CONFIG = {
  currency: "usd",

  stripe: {
    mode: "payment",
  },

  getCurrency: () => PAYMENT_CONFIG.currency,

  getPaymentMethodTypes: () => ["card"],

  getSuccessUrl: (orderId) =>
    `${env.clientUrl}/success?orderId=${orderId}`,

  getCancelUrl: () => `${env.clientUrl}/cancel`,
};

export default PAYMENT_CONFIG;