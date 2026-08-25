import express from "express";
import roles from "../../constants/roles.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import { uploadSingleImage } from "../../middlewares/upload.middleware.js";
import heroController from "./hero.controller.js";
import { uploadHeroImage } from "./heroUpload.controller.js";
import {
  updateHeroValidation,
  updateShopHeroValidation,
  updateAnnouncementBannerValidation,
} from "./hero.validation.js";

const router = express.Router();

// Public routes — get hero content (singleton)
router.get("/", heroController.getHeroContent);
router.get("/homepage-hero", heroController.getHeroContent);

// Public route — get shop hero image content
router.get("/shop-hero", heroController.getShopHeroContent);

// Public route — get announcement banner content
router.get("/announcement-banner", heroController.getAnnouncementBanner);
router.get("/announcement", heroController.getAnnouncementBanner);

// Admin only — upload a new hero / shop-hero image to Cloudinary
router.post(
  "/upload-image",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  uploadSingleImage,
  uploadHeroImage
);

// Admin only — update homepage hero content
router.put(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateHeroValidation),
  heroController.updateHeroContent
);

router.put(
  "/homepage-hero",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateHeroValidation),
  heroController.updateHeroContent
);

// Admin only — update shop hero image
router.put(
  "/shop-hero",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateShopHeroValidation),
  heroController.updateShopHeroContent
);

// Admin only — update announcement banner
router.put(
  "/announcement-banner",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateAnnouncementBannerValidation),
  heroController.updateAnnouncementBanner
);

router.put(
  "/announcement",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateAnnouncementBannerValidation),
  heroController.updateAnnouncementBanner
);

// Backward-compatible legacy route (used by the frozen legacy admin page):
// PUT /hero/:id → same singleton update, id is ignored.
router.put(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateHeroValidation),
  heroController.updateHeroContent
);

export default router;

