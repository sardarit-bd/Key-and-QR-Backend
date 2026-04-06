import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import subscriptionController from "./subscription.controller.js";
import {
  createCheckoutValidation,
  cancelSubscriptionValidation,
} from "./subscription.validation.js";

const router = express.Router();

router.get("/plans", subscriptionController.getPlans);

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

export default router;