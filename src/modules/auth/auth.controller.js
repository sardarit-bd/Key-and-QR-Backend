import env from "../../config/env.js";
import httpStatus from "../../constants/httpStatus.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import authService from "./auth.service.js";
import passport from "../../config/passport.js";
import AppError from "../../utils/AppError.js";

const getCookieOptions = (maxAge, httpOnly = true) => ({
  httpOnly,
  secure: env.isProduction || env.nodeEnv === "production",
  sameSite:
    env.isProduction || env.nodeEnv === "production" ? "none" : "lax",
  maxAge,
  path: "/",
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
});

const accessCookieOptions = getCookieOptions(15 * 60 * 1000, true);
const refreshCookieOptions = getCookieOptions(7 * 24 * 60 * 60 * 1000, true);
const roleCookieOptions = getCookieOptions(7 * 24 * 60 * 60 * 1000, false);

const clearAuthCookies = (res) => {
  const clearOptions = {
    path: "/",
    secure: env.isProduction || env.nodeEnv === "production",
    sameSite:
      env.isProduction || env.nodeEnv === "production" ? "none" : "lax",
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  };

  res.clearCookie("accessToken", clearOptions);
  res.clearCookie("refreshToken", clearOptions);
  res.clearCookie("userRole", {
    ...clearOptions,
    httpOnly: false,
  });
};

const setAuthCookies = (res, accessToken, refreshToken, userRole) => {
  res.cookie("accessToken", accessToken, accessCookieOptions);
  res.cookie("refreshToken", refreshToken, refreshCookieOptions);
  res.cookie("userRole", userRole, roleCookieOptions);
};

const register = catchAsync(async (req, res) => {
  const result = await authService.registerUser(req.body);

  setAuthCookies(res, result.accessToken, result.refreshToken, result.user.role);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "User registered successfully",
    data: { user: result.user },
  });
});

const login = catchAsync(async (req, res) => {
  const result = await authService.loginUser(req.body);

  setAuthCookies(res, result.accessToken, result.refreshToken, result.user.role);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: { user: result.user },
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
  const token = req.cookies?.refreshToken;

  if (!token) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: "Refresh token is required",
      data: null,
    });
  }

  const result = await authService.refreshAccessToken(token);

  res.cookie("accessToken", result.accessToken, accessCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Access token refreshed successfully",
    data: null,
  });
});

const logout = catchAsync(async (req, res) => {
  clearAuthCookies(res);

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

const googleLogin = passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false,
});

const googleCallback = catchAsync(async (req, res, next) => {
  passport.authenticate("google", { session: false }, async (err, profile) => {
    if (err || !profile) {
      return res.redirect(`${env.clientUrl}/login?error=google_auth_failed`);
    }

    try {
      const result = await authService.handleSocialLogin(profile, "google");

      setAuthCookies(res, result.accessToken, result.refreshToken, result.user.role);

      return res.redirect(`${env.clientUrl}/callback?success=true`);
    } catch (error) {
      return res.redirect(`${env.clientUrl}/login?error=social_login_failed`);
    }
  })(req, res, next);
});

const updateProfile = catchAsync(async (req, res) => {
  const result = await authService.updateProfile(req.user.userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
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
    statusCode: httpStatus.OK,
    success: true,
    message: "Avatar uploaded successfully",
    data: result,
  });
});

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