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
import { uploadSingleImage } from "../../middlewares/upload.middleware.js";

const router = express.Router();

router.get("/random", quoteController.getRandomQuote);
router.get("/explore", quoteController.getExploreQuotes);
router.get("/public/:id", quoteController.getPublicQuoteById);

// Admin & Moderator routes
router.post(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  uploadSingleImage,
  validateRequest(createQuoteValidation),
  quoteController.createQuote
);

router.get(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  quoteController.getAllQuotes
);

router.get(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  quoteController.getQuoteById
);

router.patch(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  uploadSingleImage,
  validateRequest(updateQuoteValidation),
  quoteController.updateQuote
);

router.patch(
  "/:id/toggle",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  quoteController.toggleQuoteActive
);

router.delete(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN, roles.MODERATOR),
  quoteController.deleteQuote
);

export default router;