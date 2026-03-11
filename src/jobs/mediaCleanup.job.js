import mediaCleanupService from "../modules/media-cleanup/mediaCleanup.service.js";
import logger from "../utils/logger.js";

export const startMediaCleanupJob = () => {
  setInterval(async () => {
    try {
      await mediaCleanupService.processMediaCleanupQueue();
    } catch (error) {
      logger.error(`Media cleanup job failed: ${error.message}`);
    }
  }, 60 * 1000);
};