import createDOMPurify from "isomorphic-dompurify";

const dompurify = createDOMPurify;

/**
 * Sanitize a string to prevent XSS attacks.
 * Strips all HTML tags, keeping only plain text.
 */
export const sanitizeString = (input) => {
  if (typeof input !== "string") return input;
  return dompurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
};

/**
 * Sanitize an object's string fields recursively.
 * Useful for sanitizing entire request payloads.
 */
export const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === "string" ? sanitizeString(item) : item
      );
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};
