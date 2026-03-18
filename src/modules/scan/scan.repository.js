import ScanHistory from "./scan.model.js";

const createScan = (payload) => {
  return ScanHistory.create(payload);
};

const getTodayScans = (tagId, dateKey) => {
  return ScanHistory.find({
    tag: tagId,
    scanDateKey: dateKey,
  });
};

export default {
  createScan,
  getTodayScans,
};