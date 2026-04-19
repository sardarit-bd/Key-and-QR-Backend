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

const registerUser = async (payload) => {
  const existingUser = await authRepository.findUserByEmail(payload.email);

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "User already exists with this email");
  }

  const hashedPassword = await bcrypt.hash(payload.password, env.bcryptSaltRounds);

  const createdUser = await authRepository.createUser({
    ...payload,
    password: hashedPassword,
    provider: "local",
    isEmailVerified: false,
  });

  return buildAuthResponse(createdUser);
};

const loginUser = async (payload) => {
  const user = await authRepository.findUserByEmail(payload.email, true);

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  if (user.provider !== "local") {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      `Please login with ${user.provider}`
    );
  }

  const isPasswordMatched = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  return buildAuthResponse(user);
};

const handleSocialLogin = async (profile, provider) => {
  let user = null;

  if (provider === "google") {
    user = await authRepository.findUserByGoogleId(profile.id);
  } else if (provider === "apple") {
    user = await authRepository.findUserByAppleId(profile.id);
  }

  if (!user && profile.email) {
    user = await authRepository.findUserByEmail(profile.email);

    if (user) {
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

  return buildAuthResponse(user);
};

// getMe returns full user data for server-side use
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

// Refresh access token - returns both tokens
const refreshAccessToken = async (token) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is required");
  }

  try {
    const decoded = verifyRefreshToken(token);

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
    const refreshToken = generateRefreshToken(jwtPayload);

    return { accessToken, refreshToken };
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token expired or invalid. Please login again.");
  }
};

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

const resetPassword = async ({ token, newPassword }) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await authRepository.findUserByResetToken(hashedToken);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired reset token");
  }

  const hashedPassword = await bcrypt.hash(newPassword, env.bcryptSaltRounds);

  await authRepository.updatePassword(user._id, hashedPassword);

  return null;
};

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

  return null;
};

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

export default {
  registerUser,
  loginUser,
  handleSocialLogin,
  getMe,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  uploadAvatar,
};