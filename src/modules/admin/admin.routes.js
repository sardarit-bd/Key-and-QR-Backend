import express from "express";
import auth from "../../middlewares/auth.middleware.js";
import roles from "../../constants/roles.js";
import adminController from "./admin.controller.js";
import { uploadProductImages, uploadSingleImage } from "../../middlewares/upload.middleware.js";

const router = express.Router();

router.post(
  "/create-admin",
  auth(roles.ADMIN),
  adminController.createAdmin
);

router.get(
  "/users",
  auth(roles.ADMIN),
  adminController.getAllUsers
);

router.get(
  "/users/:id",
  auth(roles.ADMIN),
  adminController.getUserById
);


router.patch(
  "/profile",
  auth(roles.ADMIN),
  uploadSingleImage,
  adminController.updateAdminProfile
);

router.patch(
  "/users/:id/role",
  auth(roles.ADMIN),
  adminController.updateUserRole
);

router.delete(
  "/users/:id",
  auth(roles.ADMIN),
  adminController.deleteUser
);

export default router;