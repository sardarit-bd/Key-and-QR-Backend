import ScanHistory from "./scan.model.js";

const createScan = (payload) => {
  return ScanHistory.create(payload);
};

const countTodayScans = (tagId, dateKey) => {
  return ScanHistory.countDocuments({
    tag: tagId,
    scanDateKey: dateKey,
  });
};

const getUsedQuoteIds = (tagId, dateKey) => {
  return ScanHistory.find({
    tag: tagId,
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

const getScanByTagAndDate = async (tagId, dateKey) => {
  return ScanHistory.findOne({
    tag: tagId,
    scanDateKey: dateKey,
  }).populate("quote", "text category");
};

// Get user scan history with pagination
const getUserScanHistory = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  const [data, total] = await Promise.all([
    ScanHistory.find({ user: userId })
      .populate("tag", "tagCode")
      .populate("quote", "text category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ScanHistory.countDocuments({ user: userId })
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

// Get user scan stats
const getUserScanStats = async (userId) => {
  const scans = await ScanHistory.find({ user: userId });
  
  const todayKey = new Date().toISOString().split("T")[0];
  const todayScans = scans.filter(s => s.scanDateKey === todayKey).length;
  
  const uniqueTags = new Set(scans.map(s => s.tag?.toString())).size;
  
  const categoryCount = {};
  scans.forEach(scan => {
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

export default {
  createScan,
  countTodayScans,
  getUsedQuoteIds,
  getLastScan,
  getTodayScan,
  getScanByTagAndDate,
  getUserScanHistory,
  getUserScanStats,
};