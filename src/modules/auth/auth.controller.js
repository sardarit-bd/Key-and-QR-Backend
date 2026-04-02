import env from "../../config/env.js";
import httpStatus from "../../constants/httpStatus.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import authService from "./auth.service.js";
import passport from "../../config/passport.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import AppError from "../../utils/AppError.js";

const accessCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? "none" : "lax",
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const roleCookieOptions = {
  httpOnly: false,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const register = catchAsync(async (req, res) => {
  const result = await authService.registerUser(req.body);

  res
    .cookie("accessToken", result.accessToken, accessCookieOptions)
    .cookie("refreshToken", result.refreshToken, refreshCookieOptions)
    .cookie("userRole", result.user.role, roleCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "User registered successfully",
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

const login = catchAsync(async (req, res) => {
  const result = await authService.loginUser(req.body);

  res
    .cookie("accessToken", result.accessToken, accessCookieOptions)
    .cookie("refreshToken", result.refreshToken, refreshCookieOptions)
    .cookie("userRole", result.user.role, roleCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

const getMe = catchAsync(async (req, res) => {
  const result = await authService.getMe(req.user.userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User profile fetched successfully",
    data: result,
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is required");
  }

  const result = await authService.refreshAccessToken(token);

  res.cookie("accessToken", result.accessToken, accessCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Access token refreshed successfully",
    data: {
      accessToken: result.accessToken,
    },
  });
});

const logout = catchAsync(async (req, res) => {
  res
    .clearCookie("accessToken", {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: env.nodeEnv === "production" ? "none" : "lax",
    })
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: env.nodeEnv === "production" ? "none" : "lax",
    })
    .clearCookie("userRole", {
      httpOnly: false,
      secure: env.nodeEnv === "production",
      sameSite: env.nodeEnv === "production" ? "none" : "lax",
    });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: null,
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset link sent to your email",
    data: null,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: null,
  });
});

const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  await authService.changePassword(req.user.userId, oldPassword, newPassword);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});

// ============= GOOGLE OAUTH =============
const googleLogin = passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false,
});

const googleCallback = catchAsync(async (req, res, next) => {
  passport.authenticate("google", { session: false }, async (err, profile) => {
    if (err || !profile) {
      console.error("Google auth error:", err);
      return res.redirect(`${env.clientUrl}/login?error=google_auth_failed`);
    }

    try {
      const result = await authService.handleSocialLogin(profile, "google");

      res
        .cookie("accessToken", result.accessToken, accessCookieOptions)
        .cookie("refreshToken", result.refreshToken, refreshCookieOptions)
        .cookie("userRole", result.user.role, roleCookieOptions);

      res.redirect(
        `${env.clientUrl}/auth-success?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`
      );
    } catch (error) {
      console.error("Social login error:", error);
      res.redirect(`${env.clientUrl}/login?error=social_login_failed`);
    }
  })(req, res, next);
});

const updateProfile = catchAsync(async (req, res) => {
  const result = await authService.updateProfile(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

const uploadAvatar = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST, "No image file provided");
  }

  const result = await authService.uploadAvatar(req.user.userId, req.file.buffer);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Avatar uploaded successfully",
    data: result,
  });
});

// ============= SOCIAL LOGIN SUCCESS =============
const socialLoginSuccess = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Social login successful",
    data: null,
  });
});

export default {
  register,
  login,
  getMe,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  googleLogin,
  googleCallback,
  socialLoginSuccess,
  updateProfile,
  uploadAvatar,
};