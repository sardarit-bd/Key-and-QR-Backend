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

  if (error.code === 11000) {
    statusCode = httpStatus.CONFLICT;
    message = "Duplicate field value entered";
  }

  logger.error(message);

  res.status(statusCode).json({
    success: false,
    message,
    error: env.nodeEnv === "development" ? error.stack : undefined,
    data: null,
  });
};

export default globalErrorHandler;