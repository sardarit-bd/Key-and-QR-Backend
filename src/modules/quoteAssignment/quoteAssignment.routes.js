import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import quoteAssignmentController from "./quoteAssignment.controller.js";
import {
  createQuoteAssignmentValidation,
  updateQuoteAssignmentValidation,
} from "./quoteAssignment.validation.js";

const router = express.Router();

/**
 * Admin only routes
 */

// Create assignment
router.post(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(createQuoteAssignmentValidation),
  quoteAssignmentController.createAssignment
);

// Get all assignments
router.get(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  quoteAssignmentController.getAllAssignments
);

// Get single assignment by ID
router.get(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  quoteAssignmentController.getAssignmentById
);

// Update assignment
router.patch(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateQuoteAssignmentValidation),
  quoteAssignmentController.updateAssignment
);

// Delete assignment
router.delete(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  quoteAssignmentController.deleteAssignment
);

export default router;