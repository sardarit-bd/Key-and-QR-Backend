import MediaCleanup from "../../models/mediaCleanup.model.js";

const createCleanupJob = async (payload) => {
  return MediaCleanup.create(payload);
};

const getPendingCleanupJobs = async (limit = 20) => {
  return MediaCleanup.find({
    status: { $in: ["pending", "failed"] },
    retryCount: { $lt: 5 },
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

const markCleanupDone = async (id) => {
  return MediaCleanup.findByIdAndUpdate(
    id,
    { status: "done", lastError: null },
    { new: true }
  );
};

const markCleanupFailed = async (id, errorMessage) => {
  return MediaCleanup.findByIdAndUpdate(
    id,
    {
      status: "failed",
      $inc: { retryCount: 1 },
      lastError: errorMessage,
    },
    { new: true }
  );
};

export default {
  createCleanupJob,
  getPendingCleanupJobs,
  markCleanupDone,
  markCleanupFailed,
};