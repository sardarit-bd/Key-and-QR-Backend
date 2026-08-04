import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import pendingQuoteRepository from "./pendingQuote.repository.js";
import quoteRepository from "../quote/quote.repository.js";
import orderRepository from "../order/order.repository.js";

// The main Quote collection only accepts the 5 core categories.
// Submissions may use the full premium list — map any extended category
// to the closest core category at approval time so publishing never fails.
// Core categories pass through unchanged (existing behavior preserved).
const CORE_QUOTE_CATEGORIES = ["love", "strength", "healing", "faith", "gratitude"];
const CATEGORY_FALLBACK_MAP = {
  inspire: "faith",
  hope: "faith",
  wisdom: "faith",
  mindfulness: "faith",
  peace: "faith",
  purpose: "strength",
  discipline: "strength",
  courage: "strength",
  success: "strength",
  motivation: "strength",
  leadership: "strength",
  "self-growth": "strength",
  positivity: "strength",
  dreams: "strength",
  life: "gratitude",
  happiness: "gratitude",
  kindness: "love",
  family: "love",
  friendship: "love",
  healing: "healing",
  other: "faith",
};

const resolveApprovedCategory = (category) => {
  const normalized = (category || "other").toLowerCase();
  if (CORE_QUOTE_CATEGORIES.includes(normalized)) return normalized;
  return CATEGORY_FALLBACK_MAP[normalized] || "faith";
};

const submitQuote = async (userId, payload) => {
  return pendingQuoteRepository.createPendingQuote({
    user: userId,
    text: payload.text,
    category: payload.category || "other",
    type: payload.type || "community",
    author: payload.author || null,
    order: payload.orderId || null,
  });
};

const getPendingQuotes = async (page, limit, search, status) => {
  return pendingQuoteRepository.getPendingQuotes(page, limit, search, status);
};

const getPendingQuoteById = async (id) => {
  const quote = await pendingQuoteRepository.getPendingQuoteById(id);
  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }
  return quote;
};

const approveQuote = async (id, adminNote = null) => {
  const pendingQuote = await pendingQuoteRepository.getPendingQuoteById(id);

  if (!pendingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }

  if (pendingQuote.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, `Quote already ${pendingQuote.status}`);
  }

  await quoteRepository.createQuote({
    text: pendingQuote.text,
    category: resolveApprovedCategory(pendingQuote.category),
    author: pendingQuote.author || null,
    isActive: true,
  });

  const updated = await pendingQuoteRepository.approveQuote(id, adminNote);

  if (pendingQuote.order) {
    await orderRepository.updateOrder(pendingQuote.order, {
      giftMessageStatus: "approved",
      giftMessageReviewedAt: new Date(),
      giftMessageAdminNote: adminNote,
    });
  }

  return updated;
};

const rejectQuote = async (id, adminNote = null) => {
  const pendingQuote = await pendingQuoteRepository.getPendingQuoteById(id);

  if (!pendingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }

  if (pendingQuote.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, `Quote already ${pendingQuote.status}`);
  }

  const updated = await pendingQuoteRepository.rejectQuote(id, adminNote);

  if (pendingQuote.order) {
    await orderRepository.updateOrder(pendingQuote.order, {
      giftMessageStatus: "rejected",
      giftMessageReviewedAt: new Date(),
      giftMessageAdminNote: adminNote,
    });
  }

  return updated;
};

const deletePendingQuote = async (id) => {
  const pendingQuote = await pendingQuoteRepository.getPendingQuoteById(id);
  if (!pendingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }

  return pendingQuoteRepository.deletePendingQuote(id);
};

const getMyQuotes = async (userId, page, limit, search = "", category = "all", status = "all", sortBy = "newest") => {
  return pendingQuoteRepository.getMyQuotes(userId, page, limit, search, category, status, sortBy);
};

export default {
  submitQuote,
  getPendingQuotes,
  getPendingQuoteById,
  approveQuote,
  rejectQuote,
  deletePendingQuote,
  getMyQuotes,
};