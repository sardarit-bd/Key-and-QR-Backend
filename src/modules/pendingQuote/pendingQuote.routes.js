import express from "express";
import pendingQuoteController from "./pendingQuote.controller.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import sanitizeBody from "../../middlewares/sanitize.middleware.js";
import Joi from "joi";

const router = express.Router();

// Validation schemas
const PENDING_QUOTE_CATEGORIES = [
  "inspire", "love", "strength", "healing", "faith", "gratitude",
  "hope", "success", "leadership", "family", "friendship", "kindness",
  "happiness", "wisdom", "motivation", "self-growth", "positivity",
  "courage", "mindfulness", "dreams", "life", "peace", "discipline",
  "purpose", "other",
];

const submitQuoteValidation = Joi.object({
  text: Joi.string().required().min(3).max(500),
  category: Joi.string().valid(...PENDING_QUOTE_CATEGORIES),
  author: Joi.string().trim().max(100).optional().allow("", null),
  type: Joi.string().valid("community", "gift").optional(),
  orderId: Joi.string().optional(),
});

const myQuotesQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  search: Joi.string().trim().max(100).optional().allow(""),
  category: Joi.string().valid(...PENDING_QUOTE_CATEGORIES, "all").optional().allow(""),
  status: Joi.string().valid("pending", "approved", "rejected", "all").optional().allow(""),
  sortBy: Joi.string().valid("newest", "oldest").optional(),
});

const approveRejectValidation = Joi.object({
  adminNote: Joi.string().trim().max(500).allow("").optional(),
});

// User route - submit quote
router.post(
  "/submit",
  auth(),
  sanitizeBody,
  validateRequest(submitQuoteValidation),
  pendingQuoteController.submitQuote
);

// Admin & Moderator routes
router.get(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  pendingQuoteController.getPendingQuotes
);

router.get(
  "/my-quotes",
  auth(),
  validateRequest({ query: myQuotesQueryValidation }),
  pendingQuoteController.getMyQuotes
);

router.patch(
  "/:id/approve",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  validateRequest(approveRejectValidation),
  pendingQuoteController.approveQuote
);

router.patch(
  "/:id/reject",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  validateRequest(approveRejectValidation),
  pendingQuoteController.rejectQuote
);

router.delete(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  pendingQuoteController.deletePendingQuote
);

export default router;
