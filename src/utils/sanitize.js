import createDOMPurify from "isomorphic-dompurify";

const dompurify = createDOMPurify;

/**
 * Sensitive fields that must NEVER be sanitized to avoid corrupting
 * passwords, authentication hashes, cryptographically signed tokens, or secrets.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "confirmpassword",
  "currentpassword",
  "newpassword",
  "oldpassword",
  "adminpassword",
  "token",
  "refreshtoken",
  "accesstoken",
  "idtoken",
  "guesttoken",
  "resettoken",
  "passwordresettoken",
  "verificationtoken",
  "secret",
  "secretkey",
  "stripesignature",
  "signature",
  "apikey",
  "authorization",
  "code",
]);

/**
 * Sanitize a string to prevent XSS attacks.
 * Strips all HTML tags, keeping plain text.
 */
export const sanitizeString = (input) => {
  if (typeof input !== "string") return input;

  // Fast-path: Skip DOMPurify if no HTML tag or entity indicators are present
  if (!input.includes("<") && !input.includes(">") && !input.includes("&")) {
    return input;
  }

  const clean = dompurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  // Restore common entities that DOMPurify encodes during serialization
  return clean
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

/**
 * Sanitize an object's string fields recursively with strict safeguards.
 * - Safely handles arrays at root or nested levels
 * - Preserves binary buffers, Date instances, and RegExps
 * - Skips sensitive fields (passwords, tokens, signatures)
 */
export const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  // Preserve binary buffers, Dates, and RegExps
  if (Buffer.isBuffer(obj) || obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }

  // Handle Arrays safely
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === "string") return sanitizeString(item);
      if (typeof item === "object" && item !== null) return sanitizeObject(item);
      return item;
    });
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitiveKey = SENSITIVE_KEYS.has(key.toLowerCase());

    if (typeof value === "string") {
      sanitized[key] = isSensitiveKey ? value : sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (typeof item === "string") return isSensitiveKey ? item : sanitizeString(item);
        if (typeof item === "object" && item !== null) return sanitizeObject(item);
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      if (Buffer.isBuffer(value) || value instanceof Date || value instanceof RegExp) {
        sanitized[key] = value;
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};
