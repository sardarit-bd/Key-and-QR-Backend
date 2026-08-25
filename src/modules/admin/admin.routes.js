import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import roles from "../../constants/roles.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import adminController from "./admin.controller.js";
import heroController from "../hero/hero.controller.js";
import { updateAnnouncementBannerValidation } from "../hero/hero.validation.js";
import { uploadProductImages, uploadSingleImage } from "../../middlewares/upload.middleware.js";

const router = express.Router();

router.post(
  "/create-admin",
  auth(roles.ADMIN),
  adminController.createAdmin
);

router.get(
  "/users",
  auth(roles.ADMIN),
  adminController.getAllUsers
);

router.get(
  "/users/stats",
  auth(roles.ADMIN),
  adminController.getUsersStats
);

router.get(
  "/dashboard/overview",
  auth(roles.ADMIN),
  adminController.getDashboardOverview
);

router.get(
  "/users/:id",
  auth(roles.ADMIN),
  adminController.getUserById
);


router.patch(
  "/profile",
  auth(roles.ADMIN),
  uploadSingleImage,
  adminController.updateAdminProfile
);

router.patch(
  "/users/:id/role",
  auth(roles.ADMIN),
  adminController.updateUserRole
);

router.delete(
  "/users/:id",
  auth(roles.ADMIN),
  adminController.deleteUser
);

router.patch(
  "/users/:id/suspend",
  auth(roles.ADMIN),
  adminController.suspendUser
);

router.patch(
  "/users/:id/activate",
  auth(roles.ADMIN),
  adminController.activateUser
);

router.patch(
  "/users/:id",
  auth(roles.ADMIN),
  adminController.updateUser
);

// Content Management subroutes under /api/v1/admin/content/*
router.get(
  "/content/announcement-banner",
  auth(roles.ADMIN),
  heroController.getAnnouncementBanner
);

router.put(
  "/content/announcement-banner",
  auth(roles.ADMIN),
  validateRequest(updateAnnouncementBannerValidation),
  heroController.updateAnnouncementBanner
);

export default router;