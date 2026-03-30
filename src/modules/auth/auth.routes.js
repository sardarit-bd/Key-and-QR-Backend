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

// ============= GOOGLE OAUTH ROUTES =============
router.get("/google", authController.googleLogin);
router.get("/google/callback", authController.googleCallback);

// ============= APPLE OAUTH ROUTES =============
// router.get("/apple", authController.appleLogin);
// router.get("/apple/callback", authController.appleCallback);

// ============= SOCIAL LOGIN SUCCESS =============
router.get("/social/success", authController.socialLoginSuccess);

export default router;