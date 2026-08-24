import env from "../config/env.js";
import httpStatus from "../constants/httpStatus.js";
import logger from "../utils/logger.js";

const globalErrorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
  let message = error.message || "Something went wrong";

  if (error.name === "JsonWebTokenError") {
    statusCode = httpStatus.UNAUTHORIZED;
    message = "Invalid token";
  }

  if (error.name === "TokenExpiredError") {
    statusCode = httpStatus.UNAUTHORIZED;
    message = "Token expired";
  }

  if (error.name === "MulterError" || error.code === "LIMIT_FILE_SIZE") {
    statusCode = httpStatus.BAD_REQUEST;
    if (error.code === "LIMIT_FILE_SIZE") {
      message = "File is too large. Maximum allowed size is 10 MB.";
    }
  }

  if (error.code === 11000) {
    statusCode = httpStatus.CONFLICT;
    message = "Duplicate field value entered";
  }

  logger.error(message);

  res.status(statusCode).json({
    success: false,
    message,
    code: error.errorCode || error.code || undefined,
    nextAllowedAt: error.nextAllowedAt || undefined,
    remainingDays: error.remainingDays || undefined,
    error: env.nodeEnv === "development" ? error.stack : undefined,
    data: null,
  });
};

export default globalErrorHandler;