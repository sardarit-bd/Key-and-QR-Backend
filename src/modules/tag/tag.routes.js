import express from "express";
import tagController from "./tag.controller.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import optionalAuth from "../../middlewares/optionalAuth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import {
  createTagValidation,
  updateTagValidation,
  bulkCreateTagValidation,
  selectedTagIdsValidation,
} from "./tag.validation.js";

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Tag resolution for QR scan (optional auth to identify owner)
router.get("/resolve/:tagCode", optionalAuth(), tagController.resolveTag);

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

// Tag batches list
router.get(
  "/batches",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.getAllBatches
);

// Get single batch
router.get(
  "/batches/:batchId",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.getBatchById
);

// Export batch CSV
router.get(
  "/batches/:batchId/export/csv",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.exportBatchCsv
);

// Export batch ZIP (PNGs + manifest.csv)
router.get(
  "/batches/:batchId/export/zip",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.exportBatchZip
);

// Bulk delete selected tags
router.post(
  "/bulk-delete",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(selectedTagIdsValidation),
  tagController.bulkDeleteTags
);

// Export selected tags CSV
router.post(
  "/export/csv",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(selectedTagIdsValidation),
  tagController.exportSelectedCsv
);

// Export selected tags ZIP
router.post(
  "/export/zip",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(selectedTagIdsValidation),
  tagController.exportSelectedZip
);

// Bulk generate tags
router.post(
  "/bulk-generate",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(bulkCreateTagValidation),
  tagController.bulkCreateTags
);

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

// Delete tag (Permanent delete for unassigned tags)
router.delete(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  tagController.deleteTag
);

// ==================== DYNAMIC ROUTES LAST ====================

// Get tag info by code
router.get("/:tagCode", tagController.getTagByCode);

export default router;