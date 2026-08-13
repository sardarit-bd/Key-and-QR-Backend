import express from "express";
import orderController from "./order.controller.js";
import auth from "../../middlewares/auth.middleware.js";
import optionalAuth from "../../middlewares/optionalAuth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import validateRequest from "../../middlewares/validate.middleware.js";
import roles from "../../constants/roles.js";
import { validateCheckout } from "../../middlewares/checkoutValidation.middleware.js";
import { guestCheckoutLimiter } from "../../middlewares/rateLimiter.js";
import { updateOrderValidationSchema } from "./order.validation.js";

const router = express.Router();

// ===============================
//  GUEST CHECKOUT ROUTE
// ===============================


router.post(
    "/checkout",
    optionalAuth(),
    guestCheckoutLimiter,
    validateCheckout,
    orderController.createCheckout
);

// ===============================
// ADMIN ROUTES
// ===============================

router.get(
    "/admin/all",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.getAllOrders
);

router.post(
    "/admin/manual-order",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.createManualOrder
);

router.get(
    "/admin/stats",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.getOrderStats
);

// ===============================
// USER ROUTES (Auth Required)
// ===============================

router.get("/", auth(roles.USER, roles.ADMIN), orderController.getUserOrders);
router.get("/:id", optionalAuth(), orderController.getOrderById);

// ===============================
// ADMIN UPDATE ROUTES
// ===============================

router.patch(
    "/:id",
    auth(),
    roleMiddleware(roles.ADMIN),
    validateRequest(updateOrderValidationSchema),
    orderController.updateOrder
);

// ===============================
// ORDER TAGS MANAGEMENT (Admin)
// ===============================

router.post(
    "/:id/tags/add",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.addTagToOrder
);

router.patch(
    "/:id/tags/replace",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.replaceOrderTag
);

router.delete(
    "/:id/tags/:tagId/remove",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.removeTagFromOrder
);

// Bulk unassign tags (orchestrated from Order module)
router.post(
    "/bulk-unassign",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.bulkUnassignTags
);

// ===============================
// SHIPPING (Auth Required)
// ===============================

router.patch("/:id/address", auth(), orderController.updateShippingAddress);

// ===============================
// CANCEL, REFUND, RETURN (Auth Required)
// ===============================

router.post("/:id/cancel", auth(), orderController.cancelOrder);
router.post("/:id/refund/request", auth(), orderController.requestRefund);

router.post(
    "/:id/refund/process",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.processRefund
);

router.post("/:id/return/request", auth(), orderController.requestReturn);

router.post(
    "/:id/return/process",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.processReturn
);

router.post(
    "/:id/return/complete",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.completeReturn
);

// ===============================
// GIFT (Auth Required for Claim)
// ===============================

router.post(
    "/:id/claim-gift",
    auth(roles.USER, roles.ADMIN),
    orderController.claimGiftOrder
);

// ===============================
// GIFT MESSAGE MODERATION (Admin)
// ===============================

router.post(
    "/:id/gift-message/approve",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.approveGiftMessage
);

router.post(
    "/:id/gift-message/reject",
    auth(),
    roleMiddleware(roles.ADMIN),
    orderController.rejectGiftMessage
);

export default router;