import { v2 as cloudinary } from "cloudinary";
import env from "./env.js";
import logger from "../utils/logger.js";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

// connection test
export const connectCloudinary = async () => {
  try {
    const result = await cloudinary.api.ping();

    if (result.status === "ok") {
      logger.info("Cloudinary connected successfully");
    }
  } catch (error) {
    logger.error(`Cloudinary connection failed: ${error.message}`);
  }
};

export default cloudinary;