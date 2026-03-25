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

export default {
  createScan,
  countTodayScans,
  getUsedQuoteIds,
};