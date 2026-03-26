import express from "express";
import tagController from "./tag.controller.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import {
  createTagValidation,
  updateTagValidation,
} from "./tag.validation.js";

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
// Tag resolution for QR scan (first API call when scanning)
router.get("/resolve/:tagCode", tagController.resolveTag);

// Get tag info by code
router.get("/:tagCode", tagController.getTagByCode);

// Get personal message (public - anyone can see)
router.get("/:tagCode/personal-message", tagController.getPersonalMessage);

// ==================== AUTHENTICATED ROUTES ====================
// Activate tag (requires login)
router.post("/activate/:tagCode", auth(), tagController.activateTag);

router.put(
  "/:tagCode/personal-message",
  auth(),
  tagController.setPersonalMessage
);

// ==================== ADMIN ONLY ROUTES ====================
router.post(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(createTagValidation),
  tagController.createTag
);

router.get(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.getAllTags
);

router.patch(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateTagValidation),
  tagController.updateTag
);

export default router;