import express from "express";
import pendingQuoteController from "./pendingQuote.controller.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import Joi from "joi";

const router = express.Router();

// Validation schemas
const submitQuoteValidation = Joi.object({
  text: Joi.string().required().min(3).max(500),
  category: Joi.string().valid("faith", "love", "hope", "success", "motivation", "other"),
});

const approveRejectValidation = Joi.object({
  adminNote: Joi.string().trim().max(500).allow("").optional(),
});

// User route - submit quote
router.post(
  "/submit",
  auth(),
  validateRequest(submitQuoteValidation),
  pendingQuoteController.submitQuote
);

// Admin routes
router.get(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN),
  pendingQuoteController.getPendingQuotes
);

router.get(
  "/my-quotes",
  auth(),
  pendingQuoteController.getMyQuotes
);

router.patch(
  "/:id/approve",
  auth(),
  roleMiddleware(roles.ADMIN),
  validateRequest(approveRejectValidation),
  pendingQuoteController.approveQuote
);

router.patch(
  "/:id/reject",
  auth(),
  roleMiddleware(roles.ADMIN),
  validateRequest(approveRejectValidation),
  pendingQuoteController.rejectQuote
);

router.delete(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN),
  pendingQuoteController.deletePendingQuote
);

export default router;