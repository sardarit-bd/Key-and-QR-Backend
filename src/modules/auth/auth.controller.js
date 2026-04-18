import env from "../../config/env.js";
import httpStatus from "../../constants/httpStatus.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import authService from "./auth.service.js";
import passport from "../../config/passport.js";
import AppError from "../../utils/AppError.js";
import { setAuthResponse, clearAuthCookies } from "../../utils/token.util.js";

// Register new user
const register = catchAsync(async (req, res) => {
  const result = await authService.registerUser(req.body);

  const tokens = setAuthResponse(res, result.accessToken, result.refreshToken, result.user.role);

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

// Login user
const login = catchAsync(async (req, res) => {
  const result = await authService.loginUser(req.body);

  const tokens = setAuthResponse(res, result.accessToken, result.refreshToken, result.user.role);

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

// Get current user profile
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

  const token = req.headers['x-refresh-token'];

  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is required in x-refresh-token header");
  }

  const result = await authService.refreshAccessToken(token);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Access token refreshed successfully",
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
});

// Logout user - just return success (client clears storage)
const logout = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: null,
  });
});

// Forgot password
const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset link sent to your email",
    data: null,
  });
});

// Reset password
const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: null,
  });
});

// Change password
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

// Google Login
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

      // Encode user data properly
      const encodedUser = encodeURIComponent(JSON.stringify(result.user));

      const redirectUrl = `${env.clientUrl}/callback?success=true&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}&user=${encodedUser}`;

      console.log("Redirecting to:", redirectUrl.substring(0, 200) + "...");

      return res.redirect(redirectUrl);
    } catch (error) {
      console.error("Social login error:", error);
      return res.redirect(`${env.clientUrl}/login?error=social_login_failed`);
    }
  })(req, res, next);
});

// Update profile
const updateProfile = catchAsync(async (req, res) => {
  const result = await authService.updateProfile(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

// Upload avatar
const uploadAvatar = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST, "No image file provided");
  }

  const result = await authService.uploadAvatar(req.user.userId, req.file.buffer);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Avatar uploaded successfully",
    data: result,
  });
});

// Social login success
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