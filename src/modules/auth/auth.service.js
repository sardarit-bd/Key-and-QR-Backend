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

const buildAuthResponse = (user) => {
  const jwtPayload = {
    userId: user._id,
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
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
  });

  return buildAuthResponse(createdUser);
};

const loginUser = async (payload) => {
  const user = await authRepository.findUserByEmail(payload.email, true);

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  const isPasswordMatched = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  return buildAuthResponse(user);
};

const getMe = async (userId) => {
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

const refreshAccessToken = async (token) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is required");
  }

  const decoded = verifyRefreshToken(token);

  const user = await authRepository.findUserById(decoded.userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const accessToken = generateAccessToken({
    userId: user._id,
    email: user.email,
    role: user.role,
  });

  return { accessToken };
};

const forgotPassword = async (email) => {
  const user = await authRepository.findUserByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found with this email");
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

export default {
  registerUser,
  loginUser,
  getMe,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  changePassword,
};