import mongoose from "mongoose";
import env from "./env.js";
import logger from "../utils/logger.js";

const connectDB = async () => {
  try {
    // Enable transaction support
    await mongoose.connect(env.mongoURI, {
      // MongoDB driver options for transactions
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: "majority",
    });
    
    logger.info("MongoDB connected successfully");
    
    // Test transaction support
    await testTransactionSupport();
    
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
};

// Test transaction support function
const testTransactionSupport = async () => {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    await session.abortTransaction();
    logger.info("✅ MongoDB Transaction Support: ENABLED");
  } catch (error) {
    logger.warn("⚠️ MongoDB Transaction Support: DISABLED - Check replica set configuration");
  }
};

export default connectDB;