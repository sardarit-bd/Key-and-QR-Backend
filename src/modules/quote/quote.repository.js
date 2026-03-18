import Quote from "./quote.model.js";

const createQuote = (payload) => {
  return Quote.create(payload);
};

const getAllQuotes = () => {
  return Quote.find();
};

const findById = (id) => {
  return Quote.findById(id);
};

const updateQuote = (id, payload) => {
  return Quote.findByIdAndUpdate(id, payload, { new: true });
};

const deleteQuote = (id) => {
  return Quote.findByIdAndDelete(id);
};

export default {
  createQuote,
  getAllQuotes,
  findById,
  updateQuote,
  deleteQuote,
};