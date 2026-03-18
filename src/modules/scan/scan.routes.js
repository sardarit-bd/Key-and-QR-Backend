import express from "express";
import scanController from "./scan.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/unlock/:tagCode", auth(), scanController.unlockTag);

export default router;