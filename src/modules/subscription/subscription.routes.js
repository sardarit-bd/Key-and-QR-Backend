import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import subscriptionController from "./subscription.controller.js";
import {
  createCheckoutValidation,
  cancelSubscriptionValidation,
} from "./subscription.validation.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";

const router = express.Router();

// Public routes
router.get("/plans", subscriptionController.getPlans);

// Protected routes
router.get("/me", auth(), subscriptionController.getMySubscriptions);

router.post(
  "/checkout",
  auth(),
  validateRequest(createCheckoutValidation),
  subscriptionController.createCheckoutSession
);

router.post(
  "/cancel",
  auth(),
  validateRequest(cancelSubscriptionValidation),
  subscriptionController.cancelMySubscription
);

// Customer Portal route
router.post(
  "/create-portal-session",
  auth(),
  subscriptionController.createCustomerPortalSession
);

// Latest invoice
router.get(
  "/latest-invoice",
  auth(),
  subscriptionController.getLatestInvoice
);

// Admin routes
router.get(
    "/admin/subscriptions",
    auth(roles.ADMIN),
    roleMiddleware(roles.ADMIN),
    subscriptionController.getAllSubscriptionsForAdmin
);

router.get(
    "/admin/subscriptions/stats",
    auth(roles.ADMIN),
    roleMiddleware(roles.ADMIN),
    subscriptionController.getSubscriptionStatsForAdmin
);

router.post(
    "/admin/subscriptions/sync",
    auth(roles.ADMIN),
    roleMiddleware(roles.ADMIN),
    subscriptionController.syncAllSubscriptionsWithStripe
);
export default router;