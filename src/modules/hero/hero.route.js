import express from "express";
import roles from "../../constants/roles.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import { uploadSingleImage } from "../../middlewares/upload.middleware.js";
import heroController from "./hero.controller.js";
import { uploadHeroImage } from "./heroUpload.controller.js";
import { updateHeroValidation } from "./hero.validation.js";

const router = express.Router();

// Public route — get hero content (singleton)
router.get("/", heroController.getHeroContent);

// Admin only — upload a new hero image to Cloudinary
router.post(
  "/upload-image",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  uploadSingleImage,
  uploadHeroImage
);

// Admin only — update hero content
router.put(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateHeroValidation),
  heroController.updateHeroContent
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
