import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import roles from "../../constants/roles.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import productController from "./product.controller.js";
import { createProductValidationSchema } from "./product.validation.js";

const router = express.Router();

/* Public */
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);

/* Admin */
router.post(
  "/",
  auth(roles.ADMIN),
  validateRequest(createProductValidationSchema),
  productController.createProduct
);

router.patch(
  "/:id",
  auth(roles.ADMIN),
  productController.updateProduct
);

router.delete(
  "/:id",
  auth(roles.ADMIN),
  productController.deleteProduct
);

export default router;