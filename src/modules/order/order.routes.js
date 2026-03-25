import express from "express";
import orderController from "./order.controller.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/checkout", auth(), orderController.createCheckout);

router.get("/", auth(), orderController.getUserOrders);

router.get("/:id", auth(), orderController.getOrderById);

export default router;