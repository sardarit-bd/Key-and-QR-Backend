import bcrypt from "bcryptjs";
import crypto from "crypto";

import env from "../../config/env.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import sendEmail from "../../utils/sendEmail.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import authRepository from "./auth.repository.js";
import resetPasswordTemplate from "../../templates/resetPasswordTemplate.js";
import { uploadImageBuffer } from './../../utils/cloudinary.util.js';
import guestClaimService from "./guestClaim.service.js";
import logger from "../../utils/logger.js";
import RefreshToken from "../../models/refreshToken.model.js";
import { hashToken } from "../../utils/tokenHash.js";

// ===============================
// PRIVATE HELPER FUNCTIONS
// ===============================

/**
 * Store a refresh token in the database
 */
const storeRefreshToken = async (userId, token, metadata = {}) => {
  const tokenHash = hashToken(token);
  
  // Decode JWT to get expiry
  const decoded = verifyRefreshToken(token);
  const expiresAt = new Date(decoded.exp * 1000);

  await RefreshToken.create({
    user: userId,
    tokenHash,
    expiresAt,
    ipAddress: metadata.ipAddress || null,
    userAgent: metadata.userAgent || null,
  });

  return tokenHash;
};

/**
 * Revoke a specific refresh token
 */
const revokeRefreshToken = async (tokenHash) => {
  await RefreshToken.findOneAndUpdate(
    { tokenHash },
    { revoked: true }
  );
};

/**
 * Revoke all refresh tokens for a user
 */
const revokeAllUserTokens = async (userId) => {
  await RefreshToken.updateMany(
    { user: userId, revoked: false },
    { revoked: true }
  );
};

/**
 * Build authentication response with tokens and user data
 */
const buildAuthResponse = (user) => {
  const jwtPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const accessToken = generateAccessToken(jwtPayload);
  const refreshToken = generateRefreshToken(jwtPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage?.url || user.profileImage || null,
      provider: user.provider,
      isEmailVerified: user.isEmailVerified || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      stripeCustomerId: user.stripeCustomerId || null,
    },
  };
};

/**
 * Attempt to claim guest resources for a user
 * Non-blocking: failures are logged but don't affect authentication
 */
const claimGuestResourcesIfExists = async (userId, email) => {
  try {
    const claimResult = await guestClaimService.claimGuestResources(userId, email);
    
    if (claimResult.ordersClaimed > 0 || claimResult.tagsClaimed > 0) {
      logger.info(`Guest resources claimed for user ${email}:`, {
        userId,
        orders: claimResult.ordersClaimed,
        tags: claimResult.tagsClaimed,
        timestamp: new Date().toISOString(),
      });
      
      // Log any errors that occurred during claim
      if (claimResult.errors && claimResult.errors.length > 0) {
        logger.warn(`⚠️ Partial claim errors for user ${email}:`, {
          userId,
          errors: claimResult.errors,
        });
      }
    }
    
    return claimResult;
  } catch (error) {
    // Non-blocking: Don't fail registration/login if claim fails
    logger.error(`❌ Failed to claim guest resources for ${email}:`, {
      userId,
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
};

// ===============================
// PUBLIC SERVICE FUNCTIONS
// ===============================

/**
 * Register User with Guest Claim Support
 * 
 * Flow:
 * 1. Validate email not already registered
 * 2. Hash password
 * 3. Create user account
 * 4. Store refresh token
 * 5. Attempt to claim guest resources
 * 6. Return auth response
 */
const registerUser = async (payload, metadata = {}) => {
  // 1. Check for existing user
  const existingUser = await authRepository.findUserByEmail(payload.email);

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "User already exists with this email");
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(payload.password, env.bcryptSaltRounds);

  // 3. Create user
  const createdUser = await authRepository.createUser({
    ...payload,
    password: hashedPassword,
    provider: "local",
    isEmailVerified: false,
  });

  // 4. Build auth response (generates tokens)
  const authResponse = buildAuthResponse(createdUser);

  // 5. Store refresh token
  await storeRefreshToken(createdUser._id, authResponse.refreshToken, metadata);

  // 6. Claim guest resources (non-blocking)
  await claimGuestResourcesIfExists(createdUser._id, createdUser.email);

  // 7. Return auth response
  return authResponse;
};

/**
 * Login User with Guest Claim Support
 * 
 * Flow:
 * 1. Find user by email
 * 2. Validate password
 * 3. Store refresh token
 * 4. Attempt to claim guest resources
 * 5. Return auth response
 */
const loginUser = async (payload, metadata = {}) => {
  // 1. Find user (include lockout fields)
  const user = await authRepository.findUserByEmail(payload.email, true);

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  // 2. Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
    throw new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      `Account is locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`
    );
  }

  // 3. Validate provider
  if (user.provider !== "local") {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      `Please login with ${user.provider}`
    );
  }

  // 4. Validate password
  const isPasswordMatched = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordMatched) {
    // Increment failed attempts and potentially lock account
    await authRepository.incrementFailedLoginAttempts(user._id);
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  // 5. Successful login - reset failed attempts and lockout
  await authRepository.resetFailedLoginAttempts(user._id);

  // 6. Build auth response (generates tokens)
  const authResponse = buildAuthResponse(user);

  // 7. Store refresh token
  await storeRefreshToken(user._id, authResponse.refreshToken, metadata);

  // 8. Claim guest resources (non-blocking)
  await claimGuestResourcesIfExists(user._id, user.email);

  // 9. Return auth response
  return authResponse;
};

/**
 * Social Login with Guest Claim Support
 * 
 * Flow:
 * 1. Find or create user from social profile
 * 2. Store refresh token
 * 3. Attempt to claim guest resources
 * 4. Return auth response
 */
const handleSocialLogin = async (profile, provider, metadata = {}) => {
  let user = null;

  // 1. Find existing social user
  if (provider === "google") {
    user = await authRepository.findUserByGoogleId(profile.id);
  } else if (provider === "apple") {
    user = await authRepository.findUserByAppleId(profile.id);
  }

  // 2. If not found by social ID, check by email
  if (!user && profile.email) {
    user = await authRepository.findUserByEmail(profile.email);

    if (user) {
      // Update existing user with social credentials
      const updateData = {
        provider: provider,
        isEmailVerified: true,
      };

      if (provider === "google") {
        updateData.googleId = profile.id;
      } else if (provider === "apple") {
        updateData.appleId = profile.id;
      }

      user = await authRepository.updateUser(user._id, updateData);
    }
  }

  // 3. Create new user if not found
  if (!user) {
    const userName = provider === "google"
      ? profile.displayName
      : profile.name?.firstName + " " + profile.name?.lastName || `${provider} User`;

    const userData = {
      name: userName,
      email: profile.email,
      provider: provider,
      isEmailVerified: true,
      password: null,
    };

    if (provider === "google") {
      userData.googleId = profile.id;
    } else if (provider === "apple") {
      userData.appleId = profile.id;
    }

    user = await authRepository.createUser(userData);
  }

  // 4. Build auth response (generates tokens)
  const authResponse = buildAuthResponse(user);

  // 5. Store refresh token
  await storeRefreshToken(user._id, authResponse.refreshToken, metadata);

  // 6. Claim guest resources (non-blocking)
  await claimGuestResourcesIfExists(user._id, user.email);

  // 7. Return auth response
  return authResponse;
};

/**
 * Get Current User Profile
 * Returns full user data for server-side use
 */
const getMe = async (userId) => {
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  // Return full user object with all fields
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    profileImage: user.profileImage?.url || user.profileImage || null,
    provider: user.provider,
    isEmailVerified: user.isEmailVerified || false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    stripeCustomerId: user.stripeCustomerId || null,
    isDeleted: user.isDeleted,
  };
};

const ROTATION_GRACE_PERIOD_MS = 30 * 1000; // 30 seconds grace period for concurrent requests

/**
 * Refresh Access Token with Atomic Token Rotation and Grace Period
 * 
 * Uses a single atomic findOneAndUpdate to claim the old token.
 * If the token was already rotated within ROTATION_GRACE_PERIOD_MS,
 * it safely issues a fresh access token without triggering reuse detection revocation.
 */
const refreshAccessToken = async (token, metadata = {}) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is required");
  }

  try {
    // 1. Verify JWT signature
    const decoded = verifyRefreshToken(token);
    const tokenHash = hashToken(token);

    // 2. Atomically claim the token: find it unrevoked and mark it revoked
    //    in a single operation. If another request already rotated it,
    //    this returns null (modifiedCount=0).
    const claimedToken = await RefreshToken.findOneAndUpdate(
      {
        tokenHash,
        revoked: false,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: { revoked: true },
      },
      {
        new: true,
      }
    );

    if (!claimedToken) {
      // Check if this token was already rotated recently within the grace period
      const existingToken = await RefreshToken.findOne({ tokenHash });

      if (existingToken && existingToken.revoked && existingToken.replacedByTokenHash) {
        const timeSinceRevocation = Date.now() - new Date(existingToken.updatedAt).getTime();

        if (timeSinceRevocation <= ROTATION_GRACE_PERIOD_MS) {
          const replacementToken = await RefreshToken.findOne({
            tokenHash: existingToken.replacedByTokenHash,
            revoked: false,
            expiresAt: { $gt: new Date() },
          });

          if (replacementToken) {
            const user = await authRepository.findUserById(decoded.userId);
            if (!user) {
              throw new AppError(httpStatus.UNAUTHORIZED, "User not found or account deleted");
            }

            const jwtPayload = {
              userId: user._id.toString(),
              email: user.email,
              role: user.role,
            };

            const accessToken = generateAccessToken(jwtPayload);
            return { accessToken, refreshToken: null };
          }
        }
      }

      // Token was already revoked outside the grace period or doesn't exist - genuine reuse / theft attempt
      // Revoke ALL tokens for this user as a security measure
      logger.warn(`Revoked refresh token used outside grace period for user ${decoded.userId} - revoking all tokens`);
      await revokeAllUserTokens(decoded.userId);
      throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token has been revoked. Please login again.");
    }

    // 3. Get user
    const user = await authRepository.findUserById(decoded.userId);

    if (!user) {
      throw new AppError(httpStatus.UNAUTHORIZED, "User not found or account deleted");
    }

    // 4. Generate new token pair
    const jwtPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    // 5. Store new refresh token, linked to the old one via replacedByTokenHash
    const newTokenHash = hashToken(refreshToken);
    const newDecoded = verifyRefreshToken(refreshToken);
    const newExpiresAt = new Date(newDecoded.exp * 1000);

    await RefreshToken.create({
      user: user._id,
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
      replacedByTokenHash: null,
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
    });

    // 6. Link old token to new token (chain preservation)
    claimedToken.replacedByTokenHash = newTokenHash;
    await claimedToken.save();

    return { accessToken, refreshToken };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token expired or invalid. Please login again.");
  }
};

/**
 * Logout - Revoke refresh token
 * 
 * Flow:
 * 1. Find and revoke the specific refresh token
 * 2. Return success
 */
const logout = async (refreshToken) => {
  if (!refreshToken) {
    // No token provided - just return success (client clears local storage)
    return;
  }

  try {
    const tokenHash = hashToken(refreshToken);
    await revokeRefreshToken(tokenHash);
  } catch (error) {
    // Non-blocking: Don't fail logout if revocation fails
    logger.error(`Failed to revoke refresh token on logout:`, {
      error: error.message,
    });
  }
};

/**
 * Logout All Devices - Revoke all refresh tokens for a user
 * 
 * Flow:
 * 1. Revoke all tokens for the user
 * 2. Return success
 */
const logoutAll = async (userId) => {
  await revokeAllUserTokens(userId);
};

/**
 * Forgot Password
 * Sends password reset email with token
 */
const forgotPassword = async (email) => {
  const user = await authRepository.findUserByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found with this email");
  }

  if (user.provider !== "local") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `You signed up with ${user.provider}. Please login with ${user.provider}`
    );
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await authRepository.savePasswordResetToken(user._id, hashedToken, tokenExpiry);

  const resetLink = `${env.clientUrl}/reset-password?token=${rawToken}`;

  const html = resetPasswordTemplate(user.name, resetLink);

  await sendEmail({
    to: user.email,
    subject: "Reset Your Password",
    html,
  });

  return null;
};

/**
 * Reset Password
 * Validates token and updates password
 */
const resetPassword = async ({ token, newPassword }) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await authRepository.findUserByResetToken(hashedToken);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired reset token");
  }

  const hashedPassword = await bcrypt.hash(newPassword, env.bcryptSaltRounds);

  await authRepository.updatePassword(user._id, hashedPassword);

  // Revoke all tokens on password reset (security best practice)
  await revokeAllUserTokens(user._id);

  return null;
};

/**
 * Change Password
 * Validates old password and updates to new password
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await authRepository.findUserByIdWithPassword(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.provider !== "local") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `You signed up with ${user.provider}. Password change is not available`
    );
  }

  const isOldPasswordMatched = await bcrypt.compare(oldPassword, user.password);

  if (!isOldPasswordMatched) {
    throw new AppError(httpStatus.BAD_REQUEST, "Old password is incorrect");
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);

  if (isSamePassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New password must be different from old password"
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, env.bcryptSaltRounds);

  await authRepository.updatePassword(user._id, hashedPassword);

  // Revoke all tokens on password change (security best practice)
  await revokeAllUserTokens(userId);

  return null;
};

/**
 * Update Profile
 * Updates user profile information
 */
const updateProfile = async (userId, updateData) => {
  const user = await authRepository.updateUser(userId, updateData);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  // Return full user data
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    profileImage: user.profileImage?.url || user.profileImage || null,
    provider: user.provider,
    isEmailVerified: user.isEmailVerified || false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    stripeCustomerId: user.stripeCustomerId || null,
  };
};

/**
 * Upload Avatar
 * Uploads profile image to Cloudinary
 */
const uploadAvatar = async (userId, imageBuffer) => {
  const uploadResult = await uploadImageBuffer(imageBuffer, "key-and-qr/avatars");

  const imageData = {
    public_id: uploadResult.public_id,
    url: uploadResult.secure_url,
  };

  const user = await authRepository.updateUser(userId, { profileImage: imageData });

  return {
    public_id: imageData.public_id,
    url: imageData.url,
  };
};

// ===============================
// EXPORTS
// ===============================

export default {
  registerUser,
  loginUser,
  handleSocialLogin,
  getMe,
  refreshAccessToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  uploadAvatar,
};
