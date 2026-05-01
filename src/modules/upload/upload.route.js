import express from "express";
import { uploadImage } from "./upload.controller.js";
import { uploadSingleImage } from "../../middlewares/upload.middleware.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";

const router = express.Router();

router.post(
  "/single",
  auth(roles.ADMIN),
  roleMiddleware(roles.ADMIN),
  uploadSingleImage,
  uploadImage
);

export default router;