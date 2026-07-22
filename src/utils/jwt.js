import jwt from "jsonwebtoken";
import env from "../config/env.js";

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.jwtAccessSecret);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.jwtRefreshSecret);
};

/**
 * Generate a short-lived guest access token for order access.
 * Payload: { orderId, type: "guest_access" }
 * Uses dedicated guest access secret and configurable expiry.
 */
export const generateGuestAccessToken = (orderId) => {
  return jwt.sign(
    { orderId: orderId.toString(), type: "guest_access" },
    env.jwtGuestAccessSecret,
    { expiresIn: env.guestAccessTokenExpiresIn }
  );
};

/**
 * Verify a guest access token.
 * Uses dedicated guest access secret.
 * Returns decoded payload if valid, throws if invalid.
 */
export const verifyGuestAccessToken = (token) => {
  const decoded = jwt.verify(token, env.jwtGuestAccessSecret);
  if (decoded.type !== "guest_access") {
    throw new Error("Invalid token type");
  }
  return decoded;
};