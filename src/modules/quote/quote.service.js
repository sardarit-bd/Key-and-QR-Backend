import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import quoteRepository from "./quote.repository.js";

const createQuote = async (payload) => {
  return quoteRepository.createQuote(payload);
};

const getAllQuotes = async () => {
  return quoteRepository.getAllQuotes();
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

export default {
  createQuote,
  getAllQuotes,
  updateQuote,
  deleteQuote,
};