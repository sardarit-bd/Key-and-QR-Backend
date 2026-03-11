import mediaCleanupService from "../src/modules/media-cleanup/mediaCleanup.service.js";


export default async function handler(req, res) {
  await mediaCleanupService.processMediaCleanupQueue();

  res.status(200).json({
    success: true,
    message: "Cleanup job executed"
  });
}