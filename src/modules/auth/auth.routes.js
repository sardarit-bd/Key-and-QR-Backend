import express from "express";
import roles from "../../constants/roles.js";
import auth from "../../middlewares/auth.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import authController from "./auth.controller.js";
import guestClaimController from "./guestClaim.controller.js";
import {
    changePasswordValidationSchema,
    forgotPasswordValidationSchema,
    loginValidationSchema,
    registerValidationSchema,
    resetPasswordValidationSchema,
    updateProfileValidationSchema,
} from "./auth.validation.js";
import { uploadSingleImage } from "../../middlewares/upload.middleware.js";
import {
    loginLimiter,
    registerLimiter,
    passwordResetLimiter,
} from "../../middlewares/rateLimiter.js";
import sanitizeBody from "../../middlewares/sanitize.middleware.js";

const router = express.Router();

// ===============================
// LOCAL AUTH ROUTES
// ===============================

router.post(
    "/register",
    registerLimiter,
    validateRequest(registerValidationSchema),
    authController.register
);

router.post(
    "/login",
    loginLimiter,
    validateRequest(loginValidationSchema),
    authController.login
);

// ===============================
// GUEST CLAIM ROUTES
// ===============================

router.get(
    "/guest-resources",
    auth(roles.USER, roles.ADMIN),
    guestClaimController.checkGuestResources
);

router.post(
    "/claim-guest-resources",
    auth(roles.USER, roles.ADMIN),
    guestClaimController.claimGuestResources
);

// ===============================
// TOKEN ROUTES
// ===============================

router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authController.logout);
router.post("/logout-all", auth(roles.USER, roles.ADMIN), authController.logoutAll);
router.get("/me", auth(roles.USER, roles.ADMIN), authController.getMe);

// ===============================
// PASSWORD ROUTES
// ===============================

router.post(
    "/forgot-password",
    passwordResetLimiter,
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

// ===============================
// SOCIAL AUTH ROUTES
// ===============================

router.get("/google", authController.googleLogin);
router.get("/google/callback", authController.googleCallback);
router.get("/social/success", authController.socialLoginSuccess);

// ===============================
// PROFILE ROUTES
// ===============================

router.patch(
    "/update-profile",
    auth(roles.USER, roles.ADMIN),
    sanitizeBody,
    validateRequest(updateProfileValidationSchema),
    authController.updateProfile
);

router.post(
    "/upload-avatar",
    auth(roles.USER, roles.ADMIN),
    uploadSingleImage,
    authController.uploadAvatar
);

export default router;
