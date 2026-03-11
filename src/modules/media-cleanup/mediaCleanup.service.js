import { deleteCloudinaryImage } from "../../utils/cloudinary.util.js";
import mediaCleanupRepository from "./mediaCleanup.repository.js";

const enqueueMediaCleanup = async (public_id, reason) => {
  return mediaCleanupRepository.createCleanupJob({
    public_id,
    reason,
  });
};

const processMediaCleanupQueue = async () => {
  const jobs = await mediaCleanupRepository.getPendingCleanupJobs();

  for (const job of jobs) {
    try {
      await deleteCloudinaryImage(job.public_id);
      await mediaCleanupRepository.markCleanupDone(job._id);
    } catch (error) {
      await mediaCleanupRepository.markCleanupFailed(
        job._id,
        error.message || "Unknown cleanup error"
      );
    }
  }
};

export default {
  enqueueMediaCleanup,
  processMediaCleanupQueue,
};