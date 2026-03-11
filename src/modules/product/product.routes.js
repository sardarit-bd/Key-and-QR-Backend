import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import roles from "../../constants/roles.js";
import productController from "./product.controller.js";
import { uploadProductImages } from "../../middlewares/upload.middleware.js";

const router = express.Router();

/* Public */
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);

/* Admin */
router.post(
  "/",
  auth(roles.ADMIN),
  uploadProductImages,
  productController.createProduct
);

router.patch(
  "/:id",
  auth(roles.ADMIN),
  uploadProductImages,
  productController.updateProduct
);

router.delete(
  "/:id",
  auth(roles.ADMIN),
  productController.deleteProduct
);

router.patch(
  "/restore/:id",
  auth(roles.ADMIN),
  productController.restoreProduct
);

router.delete(
  "/permanent/:id",
  auth(roles.ADMIN),
  productController.permanentDeleteProduct
);

export default router;