import express from "express";
import categoryController from "./category.controller.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import {
  createCategoryValidation,
  updateCategoryValidation,
  reorderCategoriesValidation,
  categoryParamsValidation,
  categorySlugParamsValidation,
} from "./category.validation.js";

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Get all active categories
router.get("/", categoryController.getAllCategories);

// Get category by slug
router.get(
  "/slug/:slug",
  validateRequest({ params: categorySlugParamsValidation }),
  categoryController.getCategoryBySlug
);

// ==================== ADMIN ONLY ROUTES ====================

// Create category
router.post(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(createCategoryValidation),
  categoryController.createCategory
);

// Reorder categories (sortOrder)
router.patch(
  "/reorder",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(reorderCategoriesValidation),
  categoryController.reorderCategories
);

// Update category
router.patch(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateCategoryValidation),
  validateRequest({ params: categoryParamsValidation }),
  categoryController.updateCategory
);

// Toggle active status
router.patch(
  "/:id/toggle",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ params: categoryParamsValidation }),
  categoryController.toggleCategoryActive
);

// Get category by id (admin)
router.get(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ params: categoryParamsValidation }),
  categoryController.getCategoryById
);

// Delete category
router.delete(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ params: categoryParamsValidation }),
  categoryController.deleteCategory
);

export default router;
