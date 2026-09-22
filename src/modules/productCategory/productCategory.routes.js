import express from "express";
import productCategoryController from "./productCategory.controller.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";
import {
  createProductCategoryValidation,
  updateProductCategoryValidation,
  reorderProductCategoriesValidation,
  productCategoryParamsValidation,
  productCategorySlugParamsValidation,
} from "./productCategory.validation.js";

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Get all active product categories (or filtered for admin)
router.get("/", productCategoryController.getAllProductCategories);

// Get product category by slug
router.get(
  "/slug/:slug",
  validateRequest({ params: productCategorySlugParamsValidation }),
  productCategoryController.getProductCategoryBySlug
);

// Get product category by id
router.get(
  "/:id",
  validateRequest({ params: productCategoryParamsValidation }),
  productCategoryController.getProductCategoryById
);

// ==================== ADMIN ONLY ROUTES ====================

// Create product category
router.post(
  "/",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ body: createProductCategoryValidation }),
  productCategoryController.createProductCategory
);

// Reorder product categories
router.patch(
  "/reorder",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ body: reorderProductCategoriesValidation }),
  productCategoryController.reorderProductCategories
);

// Update product category
router.patch(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ params: productCategoryParamsValidation, body: updateProductCategoryValidation }),
  productCategoryController.updateProductCategory
);

// Toggle active status
router.patch(
  "/:id/toggle",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ params: productCategoryParamsValidation }),
  productCategoryController.toggleProductCategoryActive
);

// Delete product category
router.delete(
  "/:id",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  validateRequest({ params: productCategoryParamsValidation }),
  productCategoryController.deleteProductCategory
);

export default router;
