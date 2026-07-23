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

const router = express.Router();

// ===============================
// LOCAL AUTH ROUTES
// ===============================

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

// ===============================
// GUEST CLAIM ROUTES (NEW)
// ===============================

/**
 * 🆕 Check guest resources
 * GET /api/v1/auth/guest-resources
 * Requires authentication
 * Returns summary of guest resources waiting to be claimed
 */
router.get(
    "/guest-resources",
    auth(roles.USER, roles.ADMIN),
    guestClaimController.checkGuestResources
);

/**
 * 🆕 Manually claim guest resources
 * POST /api/v1/auth/claim-guest-resources
 * Requires authentication
 * Triggers guest claim process
 */
router.post(
    "/claim-guest-resources",
    auth(roles.USER, roles.ADMIN),
    guestClaimController.claimGuestResources
);

// ===============================
// EXISTING AUTH ROUTES
// ===============================

router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authController.logout);
router.post("/logout-all", auth(roles.USER, roles.ADMIN), authController.logoutAll);
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
