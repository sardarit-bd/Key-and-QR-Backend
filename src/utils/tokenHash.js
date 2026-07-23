import crypto from "crypto";

/**
 * Hash a refresh token for secure storage.
 * We never store raw tokens - only their SHA-256 hash.
 */
export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generate a unique token family ID for tracking rotation chains.
 */
export const generateTokenFamily = () => {
  return crypto.randomBytes(16).toString("hex");
};
