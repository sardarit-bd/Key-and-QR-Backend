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

export default {
  createScan,
  countTodayScans,
  getUsedQuoteIds,
  getLastScan,
  getTodayScan,
  getScanByTagAndDate,
};