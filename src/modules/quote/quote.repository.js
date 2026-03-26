import Quote from "./quote.model.js";

const createQuote = (payload) => {
  return Quote.create(payload);
};

const getAllQuotes = async (page = 1, limit = 10, search = "", category = null) => {
  const skip = (page - 1) * limit;
  
  // Build filter
  const filter = {};
  
  if (search) {
    filter.text = { $regex: search, $options: "i" };
  }
  
  if (category && category !== "all") {
    filter.category = category;
  }
  
  const [data, total] = await Promise.all([
    Quote.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Quote.countDocuments(filter)
  ]);
  
  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit)
    },
    data
  };
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

const toggleActive = (id) => {
  return Quote.findByIdAndUpdate(
    id,
    [{ $set: { isActive: { $not: "$isActive" } } }],
    { new: true }
  );
};

const getRandomQuoteByCategory = async (category, excludeIds = []) => {
  const filter = { isActive: true, category };
  if (excludeIds.length > 0) {
    filter._id = { $nin: excludeIds };
  }
  
  const quotes = await Quote.aggregate([
    { $match: filter },
    { $sample: { size: 1 } }
  ]);
  
  return quotes[0] || null;
};

export default {
  createQuote,
  getAllQuotes,
  findById,
  updateQuote,
  deleteQuote,
  toggleActive,
  getRandomQuoteByCategory,
};