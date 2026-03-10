import express from "express";
import roles from "../../constants/roles.js";
import auth from "../../middlewares/auth.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import authController from "./auth.controller.js";
import {
  changePasswordValidationSchema,
  forgotPasswordValidationSchema,
  loginValidationSchema,
  refreshTokenValidationSchema,
  registerValidationSchema,
  resetPasswordValidationSchema,
} from "./auth.validation.js";

const router = express.Router();

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

router.post(
  "/refresh-token",
  (req, res, next) => {
    if (req.cookies.refreshToken) {
      return next();
    }
    return validateRequest(refreshTokenValidationSchema)(req, res, next);
  },
  authController.refreshToken
);

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

export default router;