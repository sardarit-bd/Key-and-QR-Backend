import ScanHistory from "./scan.model.js";
import Quote from "../quote/quote.model.js";
import Tag from "../tag/tag.model.js";

const createScan = (payload) => {
  return ScanHistory.create(payload);
};

const countTodayScans = (tagId, dateKey) => {
  return ScanHistory.countDocuments({
    tag: tagId,
    scanDateKey: dateKey,
  });
};

const countTodayScansByUser = (tagId, userId, dateKey) => {
  return ScanHistory.countDocuments({
    tag: tagId,
    user: userId,
    scanDateKey: dateKey,
  });
};

const getUsedQuoteIds = (tagId, dateKey) => {
  return ScanHistory.find({
    tag: tagId,
    scanDateKey: dateKey,
  }).distinct("quote");
};

const getUsedQuoteIdsByUser = (tagId, userId, dateKey) => {
  return ScanHistory.find({
    tag: tagId,
    user: userId,
    scanDateKey: dateKey,
  }).distinct("quote");
};

const getLastScan = async (tagId) => {
  return ScanHistory.findOne({ tag: tagId })
    .sort({ createdAt: -1 })
    .populate("quote", "text category");
};

const getTodayScan = async (tagId, dateKey) => {
  return ScanHistory.findOne({
    tag: tagId,
    scanDateKey: dateKey,
  }).populate("quote", "text category");
};

const getTodayScanByUser = async (tagId, userId, dateKey) => {
  return ScanHistory.findOne({
    tag: tagId,
    user: userId,
    scanDateKey: dateKey,
  }).populate("quote", "text category");
};

const getScanByTagAndDate = async (tagId, dateKey) => {
  return ScanHistory.findOne({
    tag: tagId,
    scanDateKey: dateKey,
  }).populate("quote", "text category");
};

/**
 * Resolve the ObjectIds of Quotes and Tags matching a free-text search.
 * Quote text/author and Tag tagCode are searched case-insensitively.
 * Returns { quoteIds, tagIds } — each possibly empty.
 */
const resolveSearchIds = async (search) => {
  const safe = search.trim();
  if (!safe) return { quoteIds: [], tagIds: [] };

  const regex = { $regex: safe, $options: "i" };

  const [matchingQuotes, matchingTags] = await Promise.all([
    Quote.find({ $or: [{ text: regex }, { author: regex }] })
      .select("_id")
      .limit(200)
      .lean(),
    Tag.find({ tagCode: regex }).select("_id").limit(200).lean(),
  ]);

  return {
    quoteIds: matchingQuotes.map((q) => q._id),
    tagIds: matchingTags.map((t) => t._id),
  };
};

/**
 * Get paginated scan history for a user with optional search, category
 * filter and sort. Search matches quote text / author / tag code.
 */
const getUserScanHistory = async ({
  userId,
  page = 1,
  limit = 10,
  search = "",
  category = "",
  sortOrder = "desc",
}) => {
  const skip = (page - 1) * limit;
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const filter = { user: userId };

  // Category filter (top-level string field on the scan doc).
  if (category) {
    filter.category = category;
  }

  // Search: resolve matching quote/tag ids, then filter scans by $in.
  // Keeps the main query indexed on { user, createdAt } and only loads
  // matching docs (no unindexed $lookup on every row).
  if (search && search.trim()) {
    const { quoteIds, tagIds } = await resolveSearchIds(search);
    if (quoteIds.length === 0 && tagIds.length === 0) {
      // Nothing matches — return empty page without scanning the collection.
      return {
        meta: { page, limit, total: 0, totalPage: 0 },
        data: [],
      };
    }
    filter.$or = [];
    if (quoteIds.length > 0) filter.$or.push({ quote: { $in: quoteIds } });
    if (tagIds.length > 0) filter.$or.push({ tag: { $in: tagIds } });
  }

  const [data, total] = await Promise.all([
    ScanHistory.find(filter)
      .populate("tag", "tagCode")
      .populate("quote", "text category")
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(limit),
    ScanHistory.countDocuments(filter),
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

const getUserScanStats = async (userId) => {
  const scans = await ScanHistory.find({ user: userId }).sort({ createdAt: -1 });

  const todayKey = new Date().toISOString().split("T")[0];
  const todayScans = scans.filter((s) => s.scanDateKey === todayKey).length;

  const uniqueTags = new Set(scans.map((s) => s.tag?.toString())).size;

  const categoryCount = {};
  scans.forEach((scan) => {
    if (scan.category) {
      categoryCount[scan.category] = (categoryCount[scan.category] || 0) + 1;
    }
  });

  return {
    totalScans: scans.length,
    todayScans,
    uniqueTags,
    categoryDistribution: categoryCount,
    lastScan: scans[0] || null,
  };
};

/**
 * Get scan count for a user
 * Used for dashboard counts
 */
const getUserScanCount = async (userId) => {
  return ScanHistory.countDocuments({ user: userId });
};

export default {
  createScan,
  countTodayScans,
  countTodayScansByUser,
  getUsedQuoteIds,
  getUsedQuoteIdsByUser,
  getLastScan,
  getTodayScan,
  getTodayScanByUser,
  getScanByTagAndDate,
  getUserScanHistory,
  getUserScanStats,
  getUserScanCount,
};