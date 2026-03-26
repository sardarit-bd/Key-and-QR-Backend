import express from "express";
import scanController from "./scan.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/unlock/:tagCode", auth(), scanController.unlockTag);

router.post("/unlock/:tagCode", auth(), scanController.unlockTag);

router.get("/last/:tagCode", auth(), scanController.getLastUnlock);

export default router;