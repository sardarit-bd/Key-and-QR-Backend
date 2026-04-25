import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import pendingQuoteRepository from "./pendingQuote.repository.js";
import quoteRepository from "../quote/quote.repository.js";
import orderRepository from "../order/order.repository.js";

const submitQuote = async (userId, payload) => {
  return pendingQuoteRepository.createPendingQuote({
    user: userId,
    text: payload.text,
    category: payload.category || "other",
  });
};

const getPendingQuotes = async (page, limit, search) => {
  return pendingQuoteRepository.getPendingQuotes(page, limit, search);
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
    category: pendingQuote.category === "other" ? "motivation" : pendingQuote.category,
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

const getMyQuotes = async (userId, page, limit) => {
  return pendingQuoteRepository.getMyQuotes(userId, page, limit);
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