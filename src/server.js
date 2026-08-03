import app from "./app/app.js";
import { connectCloudinary } from "./config/cloudinary.js";
import connectDB from "./config/database.js";
import env from "./config/env.js";
import { startMediaCleanupJob } from "./jobs/mediaCleanup.job.js";
import createAdmin from "./seeders/createAdmin.js";
import seedCategories from "./seeders/seedCategories.js";
import logger from "./utils/logger.js";

const startServer = async () => {
  try {
    await connectDB();

    await connectCloudinary();

    startMediaCleanupJob();

    // create admin automatically

    if (process.env.SEED_ADMIN === "true") {
      await createAdmin();
    }

    // Seed initial categories

    if (process.env.SEED_CATEGORIES === "true") {
      await seedCategories();
    }

    app.listen(env.port, () => {
      logger.info(`Server is running on port ${env.port}`);
    });
  } catch (error) {
    logger.error(`Server failed to start: ${error.message}`);
    process.exit(1);
  }
};

startServer();