import ReceivedQuote from "./receivedQuote.model.js";

const createReceivedQuote = (payload) => {
  return ReceivedQuote.create(payload);
};

const getReceivedQuoteById = async (id, userId = null) => {
  const filter = { _id: id };
  if (userId) filter.user = userId;

  return ReceivedQuote.findOne(filter)
    .populate("quote", "text category author description image theme allowReuse")
    .populate("category", "name slug icon color");
};

const getLatestReceivedQuote = async (userId) => {
  return ReceivedQuote.findOne({ user: userId })
    .sort({ receivedAt: -1 })
    .populate("quote", "text category author description image theme allowReuse")
    .populate("category", "name slug icon color");
};

const getUserHistory = async ({
  userId,
  page = 1,
  limit = 10,
  category = null,
  source = null,
}) => {
  const skip = (page - 1) * limit;

  const filter = { user: userId };

  if (category) filter.category = category;
  if (source) filter.source = source;

  const [data, total] = await Promise.all([
    ReceivedQuote.find(filter)
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("quote", "text category author description image theme allowReuse")
      .populate("category", "name slug icon color"),
    ReceivedQuote.countDocuments(filter),
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

// Lightweight date-only history (used by the streak engine's backfill).
const getUserHistoryDates = async (userId) => {
  return ReceivedQuote.find({ user: userId })
    .select("receivedAt")
    .sort({ receivedAt: 1 })
    .lean();
};

const getTodayReceivedQuotes = async (userId, dayKey) => {
  return ReceivedQuote.find({ user: userId, dayKey })
    .sort({ receivedAt: -1 })
    .populate("quote", "text category author description image theme allowReuse")
    .populate("category", "name slug icon color");
};

const existsForToday = async (userId, dayKey) => {
  return ReceivedQuote.exists({ user: userId, dayKey });
};

const countToday = async (userId, dayKey) => {
  return ReceivedQuote.countDocuments({ user: userId, dayKey });
};

const getByCategory = async (userId, category, { page = 1, limit = 10 } = {}) => {
  const skip = (page - 1) * limit;

  const filter = { user: userId, category };

  const [data, total] = await Promise.all([
    ReceivedQuote.find(filter)
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("quote", "text category author description image theme allowReuse"),
    ReceivedQuote.countDocuments(filter),
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

const getStatistics = async (userId) => {
  const [total, favorites, unread, today, categoryDistribution] =
    await Promise.all([
      ReceivedQuote.countDocuments({ user: userId }),
      ReceivedQuote.countDocuments({ user: userId, isFavoriteSnapshot: true }),
      ReceivedQuote.countDocuments({ user: userId, isRead: false }),
      ReceivedQuote.countDocuments({
        user: userId,
        dayKey: new Date().toISOString().split("T")[0],
      }),
      ReceivedQuote.aggregate([
        { $match: { user: userId } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

  return {
    totalQuotes: total,
    favorites: favorites,
    unread: unread,
    today: today,
    categoryDistribution: categoryDistribution,
  };
};

const getLatestReceivedAt = async (userId) => {
  return ReceivedQuote.findOne({ user: userId })
    .sort({ receivedAt: -1 })
    .select("receivedAt");
};

// No-repeat cycle support:
// Returns the highest cycle number the user has within a category (0 when none).
const getCurrentCycle = async (userId, categoryId) => {
  const doc = await ReceivedQuote.findOne({
    user: userId,
    category: categoryId,
  })
    .sort({ cycle: -1 })
    .select("cycle");

  return doc?.cycle ?? 0;
};

// Returns the distinct quote ObjectIds already received in a given cycle.
// cycle: null (legacy rows with no cycle number) are treated as cycle 0.
const getReceivedQuoteIdsForCycle = async (userId, categoryId, cycle) => {
  return ReceivedQuote.find({
    user: userId,
    category: categoryId,
    cycle: { $in: [cycle, null] },
  }).distinct("quote");
};

const updateReadStatus = async (id, isRead, userId = null) => {
  const filter = { _id: id };
  if (userId) filter.user = userId;

  return ReceivedQuote.findOneAndUpdate(
    filter,
    { isRead },
    { new: true, runValidators: true }
  );
};

const updateFavoriteSnapshot = async (id, isFavorite, userId = null) => {
  const filter = { _id: id };
  if (userId) filter.user = userId;

  return ReceivedQuote.findOneAndUpdate(
    filter,
    { isFavoriteSnapshot: isFavorite },
    { new: true, runValidators: true }
  );
};

export default {
  createReceivedQuote,
  getReceivedQuoteById,
  getLatestReceivedQuote,
  getUserHistory,
  getUserHistoryDates,
  getTodayReceivedQuotes,
  existsForToday,
  countToday,
  getByCategory,
  getStatistics,
  getLatestReceivedAt,
  getCurrentCycle,
  getReceivedQuoteIdsForCycle,
  updateReadStatus,
  updateFavoriteSnapshot,
};
