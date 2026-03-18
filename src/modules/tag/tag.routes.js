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

// Admin only
router.post(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN),
  validateRequest(createTagValidation),
  tagController.createTag
);

router.get(
  "/",
  auth(),
  roleMiddleware(roles.ADMIN),
  tagController.getAllTags
);

router.get("/:tagCode", tagController.getTagByCode);

router.get("/t/:tagCode", tagController.resolveTag);

router.post(
  "/activate/:tagCode",
  auth(),
  tagController.activateTag
);

router.patch(
  "/:id",
  auth(),
  roleMiddleware(roles.ADMIN),
  validateRequest(updateTagValidation),
  tagController.updateTag
);

export default router;