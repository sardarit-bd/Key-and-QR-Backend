/**
 * Payment Configuration - Centralized Stripe settings
 */

export const PAYMENT_CONFIG = {
    // ************* Currency *************
    currency: {
        code: process.env.NEXT_PUBLIC_CURRENCY_CODE || "usd",
        symbol: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "$",
        locale: process.env.NEXT_PUBLIC_CURRENCY_LOCALE || "en-US",
    },

    // ************* URLs *************
    urls: {
        success: process.env.NEXT_PUBLIC_SUCCESS_URL || "/success",
        cancel: process.env.NEXT_PUBLIC_CANCEL_URL || "/cancel",
    },

    // ************* Stripe Settings *************
    stripe: {
        paymentMethodTypes: ["card"],
        mode: "payment",
        // Session expiry (30 minutes)
        sessionExpirySeconds: 1800,
        // Future: Tax settings
        tax: {
            enabled: process.env.NEXT_PUBLIC_TAX_ENABLED === "true",
            rate: parseFloat(process.env.NEXT_PUBLIC_TAX_RATE || "0"),
        },
        // Future: Shipping settings
        shipping: {
            enabled: process.env.NEXT_PUBLIC_SHIPPING_ENABLED === "true",
            cost: parseFloat(process.env.NEXT_PUBLIC_SHIPPING_COST || "0"),
        },
    },

    // ************* Timeouts *************
    timeouts: {
        // Orders pending payment timeout (30 minutes)
        pendingOrderTimeout: 30 * 60 * 1000,
        // Payment session timeout (30 minutes)
        sessionTimeout: 30 * 60,
    },

    // ************* Helpers *************
    getSuccessUrl: (orderId) => {
        const baseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL ||
                       (typeof window !== "undefined" ? window.location.origin : "");
        return `${baseUrl}${PAYMENT_CONFIG.urls.success}?orderId=${orderId}`;
    },

    getCancelUrl: () => {
        const baseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL ||
                       (typeof window !== "undefined" ? window.location.origin : "");
        return `${baseUrl}${PAYMENT_CONFIG.urls.cancel}`;
    },

    formatPrice: (amount) => {
        return `${PAYMENT_CONFIG.currency.symbol}${Number(amount).toFixed(2)}`;
    },

    getCurrency: () => PAYMENT_CONFIG.currency.code,

    getPaymentMethodTypes: () => PAYMENT_CONFIG.stripe.paymentMethodTypes,

    getSessionExpiry: () => PAYMENT_CONFIG.timeouts.sessionTimeout,

    getTaxRate: () => PAYMENT_CONFIG.stripe.tax.rate,

    getShippingCost: () => PAYMENT_CONFIG.stripe.shipping.cost,
};

export default PAYMENT_CONFIG;