import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import quoteRepository from "./quote.repository.js";

const createQuote = async (payload) => {
  return quoteRepository.createQuote(payload);
};

const getAllQuotes = async (page, limit, search, category) => {
  return quoteRepository.getAllQuotes(page, limit, search, category);
};

const getQuoteById = async (id) => {
  const quote = await quoteRepository.findById(id);
  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }
  return quote;
};

const updateQuote = async (id, payload) => {
  const quote = await quoteRepository.findById(id);
  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }
  return quoteRepository.updateQuote(id, payload);
};

const deleteQuote = async (id) => {
  const quote = await quoteRepository.findById(id);
  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }
  return quoteRepository.deleteQuote(id);
};

const toggleQuoteActive = async (id) => {
  const quote = await quoteRepository.findById(id);
  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
  }
  return quoteRepository.toggleActive(id);
};

// Get random quote - updated to handle null category
const getRandomQuote = async (category = null) => {
  return quoteRepository.getRandomQuoteByCategory(category);
};

export default {
  createQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
  toggleQuoteActive,
  getRandomQuote,
};