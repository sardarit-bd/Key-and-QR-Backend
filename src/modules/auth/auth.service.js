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
import User from "../../models/user.model.js";
import roles from "../../constants/roles.js";
import { NAME_CHANGE_COOLDOWN_MS } from "../../constants/user.constants.js";
import { hashToken } from "../../utils/tokenHash.js";
import Tag from "../tag/tag.model.js";
import Category from "../category/category.model.js";
import Quote from "../quote/quote.model.js";
import quoteAssignmentService from "../quoteAssignment/quoteAssignment.service.js";
import receivedQuoteRepository from "../received-quote/receivedQuote.repository.js";
import ScanHistory from "../scan/scan.model.js";
import scanRepository from "../scan/scan.repository.js";

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
      nameChangedAt: user.nameChangedAt || null,
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

/**
 * Claim an unassigned/scanned tag directly to the newly registered user and
 * persist today's unlocked quote in ReceivedQuote for immediate dashboard availability.
 * Non-blocking: failures are logged but don't prevent user registration.
 */
const claimScannedTagIfExists = async (userId, tagCode) => {
  if (!tagCode || typeof tagCode !== "string" || !tagCode.trim()) {
    return null;
  }

  const normalizedCode = tagCode.trim();
  const todayKey = new Date().toISOString().split("T")[0];

  try {
    const tag = await Tag.findOne({ tagCode: normalizedCode });
    if (!tag) {
      logger.warn(`Tag ${normalizedCode} not found during registration claim.`);
      return null;
    }

    // Strict Ownership Guard: Never reassign an already-owned tag or steal ownership
    if (tag.owner && tag.owner.toString() !== userId.toString()) {
      logger.warn(`Tag ${normalizedCode} is already owned by another user (${tag.owner}). Aborting tag claim.`);
      return null;
    }

    // 1. Update Tag ownership & activation
    tag.owner = userId;
    tag.isActivated = true;
    tag.isActive = true;
    if (!tag.activatedAt) {
      tag.activatedAt = new Date();
    }
    await tag.save();

    logger.info(`✅ Successfully claimed tag ${normalizedCode} for user ${userId}`);

    // 2. Find today's quote for this tag (from Tag assignment, anonymous ScanHistory, or random)
    let activeQuote = null;
    let quoteSource = "scan";

    // Priority A: Tag assignment
    try {
      const tagAssignment = await quoteAssignmentService.getTopAssignmentByTag(tag._id);
      if (tagAssignment?.quote && tagAssignment.quote.isActive !== false) {
        activeQuote = tagAssignment.quote;
        quoteSource = "assignment";
      }
    } catch (err) {
      // non-fatal
    }

    // Priority B: Anonymous public scan from today
    if (!activeQuote) {
      const todayScan = await ScanHistory.findOne({
        tag: tag._id,
        scanDateKey: todayKey,
        quote: { $ne: null },
      }).populate("quote").sort({ createdAt: -1 });

      if (todayScan?.quote && todayScan.quote.isActive !== false) {
        activeQuote = todayScan.quote;
      }
    }

    // Priority C: Any latest scan for this tag
    if (!activeQuote) {
      const latestScan = await ScanHistory.findOne({
        tag: tag._id,
        quote: { $ne: null },
      }).populate("quote").sort({ createdAt: -1 });

      if (latestScan?.quote && latestScan.quote.isActive !== false) {
        activeQuote = latestScan.quote;
      }
    }

    // Priority D: Fallback to active random quote if none found yet
    if (!activeQuote) {
      const randomQuotes = await Quote.aggregate([
        { $match: { isActive: true } },
        { $sample: { size: 1 } },
      ]);
      if (randomQuotes.length > 0) {
        activeQuote = randomQuotes[0];
      }
    }

    // 3. Create ReceivedQuote if activeQuote found and not already exists for today
    if (activeQuote && activeQuote._id) {
      const alreadyHasQuoteToday = await receivedQuoteRepository.existsForToday(userId, todayKey);
      if (!alreadyHasQuoteToday) {
        let categoryDoc = null;
        if (activeQuote.category) {
          categoryDoc = await Category.findOne({
            $or: [
              { slug: activeQuote.category.toString().toLowerCase() },
              { name: new RegExp(`^${activeQuote.category}$`, "i") },
            ],
          });
        }

        await receivedQuoteRepository.createReceivedQuote({
          user: userId,
          quote: activeQuote._id,
          category: categoryDoc?._id || null,
          categorySlug: categoryDoc?.slug || (activeQuote.category ? activeQuote.category.toString().toLowerCase() : "inspire"),
          receivedAt: new Date(),
          source: quoteSource,
          dayKey: todayKey,
          isRead: true,
          metadata: {
            tagCode: tag.tagCode,
            tagId: tag._id,
          },
        });

        logger.info(`✅ Created initial ReceivedQuote for user ${userId} from claimed tag ${normalizedCode}`);
      }

      // 4. Backfill user scan record
      try {
        await scanRepository.createScan({
          tag: tag._id,
          user: userId,
          quote: activeQuote._id,
          category: activeQuote.category || "faith",
          scanDateKey: todayKey,
          sourceType: quoteSource,
        });
      } catch (scanErr) {
        // Non-fatal if scan history already exists or fails
      }
    }

    return {
      claimedTag: normalizedCode,
      tagId: tag._id,
    };
  } catch (error) {
    logger.error(`❌ Failed to claim scanned tag ${normalizedCode} for user ${userId}:`, {
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
 * Register User with Guest & Tag Claim Support
 * 
 * Flow:
 * 1. Validate email not already registered
 * 2. Hash password
 * 3. Create user account
 * 4. Store refresh token
 * 5. Attempt to claim scanned tag directly if tagCode provided
 * 6. Attempt to claim guest resources
 * 7. Return auth response
 */
const registerUser = async (payload, metadata = {}) => {
  const { tagCode, ...userFields } = payload;

  // 1. Check for existing user
  const existingUser = await authRepository.findUserByEmail(userFields.email);

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "This email is already registered. Please log in.");
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(userFields.password, env.bcryptSaltRounds);

  // 3. Create user
  const createdUser = await authRepository.createUser({
    ...userFields,
    password: hashedPassword,
    provider: "local",
    isEmailVerified: false,
  });

  // 4. Build auth response (generates tokens)
  const authResponse = buildAuthResponse(createdUser);

  // 5. Store refresh token
  await storeRefreshToken(createdUser._id, authResponse.refreshToken, metadata);

  // 6. Claim scanned tag directly if tagCode was provided (non-blocking)
  if (tagCode) {
    await claimScannedTagIfExists(createdUser._id, tagCode);
  }

  // 7. Claim guest resources (non-blocking)
  await claimGuestResourcesIfExists(createdUser._id, createdUser.email);

  // 8. Return auth response
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

  // 1. Extract social profile attributes with multi-format normalization
  const socialId = profile.id || profile.sub || profile._json?.sub || null;
  const rawEmail = profile.email || profile.emails?.[0]?.value || profile._json?.email || null;
  const email = rawEmail ? rawEmail.toLowerCase().trim() : null;

  // Extract avatar URL
  const avatarUrl = profile.photos?.[0]?.value || profile.avatar || profile.picture || profile._json?.picture || null;

  // Extract name with multi-level fallback chain
  const givenName = profile.name?.givenName || profile.name?.firstName || profile._json?.given_name || "";
  const familyName = profile.name?.familyName || profile.name?.lastName || profile._json?.family_name || "";
  const fullName = `${givenName} ${familyName}`.trim();

  const userName =
    profile.displayName ||
    profile._json?.name ||
    (fullName.length > 0 ? fullName : null) ||
    (email ? email.split("@")[0] : null) ||
    `${provider === "google" ? "Google" : "Apple"} User`;

  // 2. Check by social ID (Google / Apple ID)
  if (provider === "google" && socialId) {
    user = await authRepository.findUserByGoogleIdAnyStatus(socialId);
  } else if (provider === "apple" && socialId) {
    user = await authRepository.findUserByAppleId(socialId);
  }

  if (user) {
    // If account was soft-deleted, reactivate it upon social login
    const updates = {};
    if (user.isDeleted) updates.isDeleted = false;
    if (!user.isEmailVerified) updates.isEmailVerified = true;
    if ((!user.name || user.name.trim().length === 0) && userName) updates.name = userName;
    if (!user.profileImage?.url && avatarUrl) updates.profileImage = { url: avatarUrl };

    if (Object.keys(updates).length > 0) {
      user = await authRepository.updateUser(user._id, updates);
    }
  }

  // 3. Check by Email (Link Existing Account)
  if (!user && email) {
    user = await authRepository.findUserByEmailAnyStatus(email);

    if (user) {
      const updateData = {
        isEmailVerified: true,
      };

      if (user.isDeleted) updateData.isDeleted = false;

      if (provider === "google" && socialId) {
        updateData.googleId = socialId;
        if (!user.provider || user.provider === "local") {
          updateData.provider = "google";
        }
      } else if (provider === "apple" && socialId) {
        updateData.appleId = socialId;
        if (!user.provider || user.provider === "local") {
          updateData.provider = "apple";
        }
      }

      if ((!user.name || user.name.trim().length === 0) && userName) {
        updateData.name = userName;
      }

      if (!user.profileImage?.url && avatarUrl) {
        updateData.profileImage = { url: avatarUrl };
      }

      user = await authRepository.updateUser(user._id, updateData);
    }
  }

  // 4. Create New User if Not Found
  if (!user) {
    if (!email) {
      throw new AppError(httpStatus.BAD_REQUEST, "Email is required for social registration");
    }

    const userData = {
      name: userName,
      email: email,
      provider: provider,
      isEmailVerified: true,
      isDeleted: false,
      password: null,
    };

    if (avatarUrl) {
      userData.profileImage = { url: avatarUrl };
    }

    if (provider === "google" && socialId) {
      userData.googleId = socialId;
    } else if (provider === "apple" && socialId) {
      userData.appleId = socialId;
    }

    try {
      user = await authRepository.createUser(userData);
    } catch (createErr) {
      // Race condition safety: catch MongoDB E11000 duplicate key error and link existing user
      if (createErr.code === 11000 || createErr.name === "MongoServerError") {
        user = await authRepository.findUserByEmailAnyStatus(email);
        if (user) {
          const updateData = { isEmailVerified: true, isDeleted: false };
          if (provider === "google" && socialId) updateData.googleId = socialId;
          if (provider === "apple" && socialId) updateData.appleId = socialId;
          if (!user.profileImage?.url && avatarUrl) updateData.profileImage = { url: avatarUrl };
          user = await authRepository.updateUser(user._id, updateData);
        } else {
          throw createErr;
        }
      } else {
        throw createErr;
      }
    }
  }

  // 5. Build auth response (generates JWT tokens)
  const authResponse = buildAuthResponse(user);

  // 6. Store refresh token
  await storeRefreshToken(user._id, authResponse.refreshToken, metadata);

  // 7. Claim guest resources (non-blocking)
  await claimGuestResourcesIfExists(user._id, user.email);

  // 8. Claim scanned tag if metadata.tagCode was provided (non-blocking)
  if (metadata?.tagCode) {
    await claimScannedTagIfExists(user._id, metadata.tagCode);
  }

  // 9. Return auth response
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
    nameChangedAt: user.nameChangedAt || null,
  };
};

const ROTATION_GRACE_PERIOD_MS = 90 * 1000; // 90 seconds grace period for concurrent requests (multi-tab safety)

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
 * Updates user profile information with 30-day name change restriction
 */
const updateProfile = async (userId, updateData, authUser = null) => {
  const currentUser = await authRepository.findUserById(userId);
  if (!currentUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const payload = { ...updateData };
  const userRole = authUser?.role || currentUser.role;
  const canOverride = userRole === roles.ADMIN || userRole === roles.MODERATOR;

  let isNameChanged = false;
  let trimmedNewName = null;

  if (payload.name !== undefined && payload.name !== null) {
    trimmedNewName = String(payload.name).trim();
    const currentTrimmedName = (currentUser.name || "").trim();
    isNameChanged = trimmedNewName !== currentTrimmedName;
  }

  if (payload.email !== undefined && payload.email !== null) {
    const newEmail = String(payload.email).trim().toLowerCase();
    const currentEmail = (currentUser.email || "").trim().toLowerCase();
    const isEmailChanged = newEmail !== currentEmail;

    if (isEmailChanged) {
      if (currentUser.provider && currentUser.provider !== "local") {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Email cannot be modified for accounts authenticated via ${currentUser.provider}`
        );
      }

      const existingUser = await authRepository.findUserByEmail(newEmail);
      if (existingUser && existingUser._id.toString() !== userId.toString()) {
        throw new AppError(httpStatus.CONFLICT, "Email is already in use by another account");
      }
      payload.email = newEmail;
    } else {
      delete payload.email;
    }
  }

  let user = null;

  if (isNameChanged) {
    const now = new Date();

    if (!canOverride && currentUser.nameChangedAt) {
      const lastChangedTime = new Date(currentUser.nameChangedAt).getTime();
      const nextAllowedTime = lastChangedTime + NAME_CHANGE_COOLDOWN_MS;

      if (now.getTime() < nextAllowedTime) {
        const remainingMs = nextAllowedTime - now.getTime();
        const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
        const nextAllowedAt = new Date(nextAllowedTime).toISOString();

        const err = new AppError(
          httpStatus.BAD_REQUEST,
          `You can change your name again in ${remainingDays} ${remainingDays === 1 ? "day" : "days"}.`,
          "NAME_CHANGE_COOLDOWN"
        );
        err.nextAllowedAt = nextAllowedAt;
        err.remainingDays = remainingDays;
        throw err;
      }
    }

    if (!canOverride) {
      // Atomic conditional update to guard against concurrent requests
      const cooldownCutoff = new Date(now.getTime() - NAME_CHANGE_COOLDOWN_MS);
      const updateFields = {
        ...payload,
        name: trimmedNewName,
        nameChangedAt: now,
      };

      user = await User.findOneAndUpdate(
        {
          _id: userId,
          isDeleted: false,
          $or: [
            { nameChangedAt: null },
            { nameChangedAt: { $exists: false } },
            { nameChangedAt: { $lte: cooldownCutoff } },
          ],
        },
        { $set: updateFields },
        { returnDocument: 'after' }
      );

      if (!user) {
        // Condition failed due to concurrent update or user deletion
        const recheckUser = await authRepository.findUserById(userId);
        if (!recheckUser) {
          throw new AppError(httpStatus.NOT_FOUND, "User not found");
        }
        if (recheckUser.nameChangedAt) {
          const nextAllowedTime = new Date(recheckUser.nameChangedAt).getTime() + NAME_CHANGE_COOLDOWN_MS;
          const remainingMs = Math.max(0, nextAllowedTime - Date.now());
          const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
          const err = new AppError(
            httpStatus.BAD_REQUEST,
            `You can change your name again in ${remainingDays} ${remainingDays === 1 ? "day" : "days"}.`,
            "NAME_CHANGE_COOLDOWN"
          );
          err.nextAllowedAt = new Date(nextAllowedTime).toISOString();
          err.remainingDays = remainingDays;
          throw err;
        }
        throw new AppError(httpStatus.BAD_REQUEST, "Failed to update name");
      }
    } else {
      // Admin / Support override
      const updateFields = {
        ...payload,
        name: trimmedNewName,
        nameChangedAt: now,
      };
      user = await authRepository.updateUser(userId, updateFields);
    }
  } else {
    // Name is not changed (only other fields like profileImage or submitted name is identical)
    // Do NOT update nameChangedAt
    const updateFields = { ...payload };
    if (trimmedNewName) {
      updateFields.name = trimmedNewName;
    }
    user = await authRepository.updateUser(userId, updateFields);
  }

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
    nameChangedAt: user.nameChangedAt || null,
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
