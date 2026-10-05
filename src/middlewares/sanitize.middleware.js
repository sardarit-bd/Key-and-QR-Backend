import { sanitizeObject } from "../utils/sanitize.js";

/**
 * Middleware to sanitize request body fields.
 * Strips HTML tags from string fields in req.body while safeguarding
 * passwords, authentication tokens, files, and binary buffers.
 */
export const sanitizeBody = (req, res, next) => {
  try {
    if (
      req.body &&
      typeof req.body === "object" &&
      !Buffer.isBuffer(req.body)
    ) {
      req.body = sanitizeObject(req.body);
    }
  } catch (error) {
    // Fail-open for request processing so an unexpected serialization issue doesn't crash the server
    console.warn("⚠️ sanitizeBody middleware warning:", error.message);
  }
  next();
};

export default sanitizeBody;

