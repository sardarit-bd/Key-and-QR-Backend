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

// Tag resolution for QR scan
router.get("/resolve/:tagCode", tagController.resolveTag);

// Get personal message
router.get("/:tagCode/personal-message", tagController.getPersonalMessage);

// ==================== AUTHENTICATED ROUTES ====================

// Get my tags
router.get("/me", auth(), tagController.getMyTags);

// Activate tag
router.post("/activate/:tagCode", auth(), tagController.activateTag);

// Set personal message
router.put(
  "/:tagCode/personal-message",
  auth(),
  tagController.setPersonalMessage
);

// ==================== ADMIN ONLY ROUTES ====================

// Create tag
router.post(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(createTagValidation),
  tagController.createTag
);

// Get all tags
router.get(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.getAllTags
);

// Update tag
router.patch(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateTagValidation),
  tagController.updateTag
);

// ==================== DYNAMIC ROUTES LAST ====================

// Get tag info by code
router.get("/:tagCode", tagController.getTagByCode);

export default router;