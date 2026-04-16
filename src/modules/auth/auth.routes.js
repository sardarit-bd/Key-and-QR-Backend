import express from "express";
import roles from "../../constants/roles.js";
import auth from "../../middlewares/auth.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import authController from "./auth.controller.js";
import {
  changePasswordValidationSchema,
  forgotPasswordValidationSchema,
  loginValidationSchema,
  registerValidationSchema,
  resetPasswordValidationSchema,
} from "./auth.validation.js";
import { uploadSingleImage } from "../../middlewares/upload.middleware.js";

const router = express.Router();

// Local auth routes
router.post(
  "/register",
  validateRequest(registerValidationSchema),
  authController.register
);

router.post(
  "/login",
  validateRequest(loginValidationSchema),
  authController.login
);

// Refresh token endpoint - can accept token from body, header, or cookie
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", auth(roles.USER, roles.ADMIN), authController.getMe);

router.post(
  "/forgot-password",
  validateRequest(forgotPasswordValidationSchema),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  validateRequest(resetPasswordValidationSchema),
  authController.resetPassword
);

router.post(
  "/change-password",
  auth(roles.USER, roles.ADMIN),
  validateRequest(changePasswordValidationSchema),
  authController.changePassword
);

// Google OAuth Routes
router.get("/google", authController.googleLogin);
router.get("/google/callback", authController.googleCallback);

// Social login success
router.get("/social/success", authController.socialLoginSuccess);

router.patch(
  "/update-profile",
  auth(roles.USER, roles.ADMIN),
  authController.updateProfile
);

router.post(
  "/upload-avatar",
  auth(roles.USER, roles.ADMIN),
  uploadSingleImage,
  authController.uploadAvatar
);

export default router;