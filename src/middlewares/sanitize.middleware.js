import { sanitizeObject } from "../utils/sanitize.js";

/**
 * Middleware to sanitize request body fields.
 * Strips HTML tags from all string fields in req.body.
 * Apply to routes that accept user-generated content.
 */
export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
};

export default sanitizeBody;
