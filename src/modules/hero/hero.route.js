import express from "express";
import roles from "../../constants/roles.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import heroController from "./hero.controller.js";

const router = express.Router();

// Public route - get hero content
router.get("/", heroController.getHeroContent);

// Admin only - update hero content
router.put("/:id", auth(roles.ADMIN), roleMiddleware(roles.ADMIN), heroController.updateHeroContent);

export default router;