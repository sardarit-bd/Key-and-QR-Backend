import express from "express";
import quoteController from "./quote.controller.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import {
  createQuoteValidation,
  updateQuoteValidation,
} from "./quote.validation.js";

const router = express.Router();

// Admin only routes
router.post(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN),
  validateRequest(createQuoteValidation),
  quoteController.createQuote
);

router.get(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN),
  quoteController.getAllQuotes
);

router.get(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN),
  quoteController.getQuoteById
);

router.patch(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateQuoteValidation),
  quoteController.updateQuote
);

router.patch(
  "/:id/toggle",
  auth(),
  roleMiddleware(roles.ADMIN),
  quoteController.toggleQuoteActive
);

router.delete(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN),
  quoteController.deleteQuote
);

export default router;