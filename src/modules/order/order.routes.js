import express from "express";
import orderController from "./order.controller.js";
import auth from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import roles from "../../constants/roles.js";

const router = express.Router();

// Checkout (User)
router.post("/checkout", auth(), orderController.createCheckout);

// Admin - ALL orders
router.get("/admin/all", auth(), roleMiddleware(roles.ADMIN), orderController.getAllOrders);

// Admin - Order stats
router.get("/admin/stats", auth(), roleMiddleware(roles.ADMIN), orderController.getOrderStats);

// User - own orders
// router.get("/", auth(), orderController.getUserOrders);

router.get("/", auth(roles.USER, roles.ADMIN), orderController.getUserOrders);
// Single order
router.get("/:id", auth(), orderController.getOrderById);

// Update order (admin)
router.patch("/:id", auth(), roleMiddleware(roles.ADMIN), orderController.updateOrder);

router.patch("/:id/address", auth(), orderController.updateShippingAddress);

// Cancel order (user or admin)
router.post("/:id/cancel", auth(), orderController.cancelOrder);

// Request refund (user)
router.post("/:id/refund/request", auth(), orderController.requestRefund);

// Process refund (admin)
router.post("/:id/refund/process", auth(), roleMiddleware(roles.ADMIN), orderController.processRefund);

// Request return (user)
router.post("/:id/return/request", auth(), orderController.requestReturn);

// Process return (admin)
router.post("/:id/return/process", auth(), roleMiddleware(roles.ADMIN), orderController.processReturn);

// Complete return (admin)
router.post("/:id/return/complete", auth(), roleMiddleware(roles.ADMIN), orderController.completeReturn);

router.post("/:id/claim-gift",auth(roles.USER, roles.ADMIN),orderController.claimGiftOrder);

export default router;