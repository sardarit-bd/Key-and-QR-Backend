import express from "express";
import receivedQuoteController from "./receivedQuote.controller.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import {
  historyQueryValidation,
  statisticsQueryValidation,
  receivedQuoteParamsValidation,
  receiveQuoteValidation,
} from "./receivedQuote.validation.js";

const router = express.Router();

// All received-quote endpoints require authentication
router.use(auth());

// Receive a quote (dashboard quote engine)
router.post(
  "/receive",
  validateRequest(receiveQuoteValidation),
  receivedQuoteController.receive
);

// Get paginated history
router.get(
  "/history",
  validateRequest({ query: historyQueryValidation }),
  receivedQuoteController.getHistory
);

// Get latest received quote
router.get("/latest", receivedQuoteController.getLatest);

// Get statistics
router.get(
  "/statistics",
  validateRequest({ query: statisticsQueryValidation }),
  receivedQuoteController.getStatistics
);

// Get today's received quotes
router.get("/today", receivedQuoteController.getToday);

// Read again — re-open an existing received quote (no new quote, no streak/limit change)
router.get(
  "/:id/read",
  validateRequest({ params: receivedQuoteParamsValidation }),
  receivedQuoteController.readAgain
);

// Get by id
router.get(
  "/:id",
  validateRequest({ params: receivedQuoteParamsValidation }),
  receivedQuoteController.getById
);

export default router;
