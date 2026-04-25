import Quote from "./quote.model.js";

/**
 * Create Quote
 */
const createQuote = (payload) => {
  return Quote.create(payload);
};

/**
 * Get all quotes with filters + pagination
 */
const getAllQuotes = async ({
  page = 1,
  limit = 10,
  search = "",
  category = null,
  isActive,
  allowReuse,
}) => {
  const skip = (page - 1) * limit;

  const filter = {};

  // 🔍 Search (text)
  if (search) {
    filter.text = { $regex: search, $options: "i" };
  }

  // 🎯 Category filter
  if (category && category !== "all") {
    filter.category = category;
  }

  // ✅ Active filter
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  // 🔁 Reuse filter
  if (allowReuse !== undefined) {
    filter.allowReuse = allowReuse;
  }

  const [data, total] = await Promise.all([
    Quote.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    Quote.countDocuments(filter),
  ]);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit),
    },
    data,
  };
};

/**
 * Find by ID
 */
const findById = (id) => {
  return Quote.findById(id);
};

/**
 * Update Quote
 */
const updateQuote = (id, payload) => {
  return Quote.findByIdAndUpdate(id, payload, { new: true });
};

/**
 Delete Quote
 */
const deleteQuote = (id) => {
  return Quote.findByIdAndDelete(id);
};

/**
 Toggle Active
 */
const toggleActive = async (id) => {
  const quote = await Quote.findById(id);
  if (!quote) return null;

  return Quote.findByIdAndUpdate(
    id,
    { isActive: !quote.isActive },
    { new: true }
  );
};

/**Get random quote (with optional category + excludeIds)*/
const getRandomQuoteByCategory = async (category = null, excludeIds = []) => {
  const filter = { isActive: true };

  if (category) {
    filter.category = category;
  }

  if (excludeIds.length > 0) {
    filter._id = { $nin: excludeIds };
  }

  const quotes = await Quote.aggregate([
    { $match: filter },
    { $sample: { size: 1 } },
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