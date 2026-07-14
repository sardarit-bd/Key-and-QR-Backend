import express from "express";
import paymentController from "./payment.controller.js";
import optionalAuth from "../../middlewares/optionalAuth.middleware.js";
// import paymentController from "../controllers/payment.controller.js";
// import auth from "../middlewares/auth.middleware.js";
// import optionalAuth from "../middlewares/optionalAuth.middleware.js";

const router = express.Router();

// ************* Create Checkout Session *************
router.post(
    "/create-session/:orderId",
    optionalAuth(),
    paymentController.createCheckoutSession
);

// ************* Get Payment Status *************
router.get(
    "/status/:orderId",
    optionalAuth(),
    paymentController.getPaymentStatus
);

// ************* Cancel Payment *************
router.post(
    "/cancel/:orderId",
    optionalAuth(),
    paymentController.cancelPayment
);

export default router;