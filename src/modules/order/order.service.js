import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderRepository from "./order.repository.js";
import tagRepository from "../tag/tag.repository.js";
import productRepository from "../product/product.repository.js";
import stripe from "../../config/stripe.js";
import env from "../../config/env.js";


const createOrder = async (userId, payload) => {
    const product = await productRepository.getProductById(payload.productId);

    if (!product) {
        throw new AppError(httpStatus.NOT_FOUND, "Product not found");
    }

    return orderRepository.createOrder({
        user: userId,
        product: payload.productId,
        purchaseType: payload.purchaseType || "self",
        giftMessage: payload.giftMessage || null,
    });
};


// 2️⃣ Create Stripe Checkout Session
const createCheckoutSession = async (orderId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",

        line_items: [
            {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: order.product.name,
                    },
                    unit_amount: order.product.price * 100,
                },
                quantity: 1,
            },
        ],

        success_url: `${env.clientUrl}/success?orderId=${orderId}`,
        cancel_url: `${env.clientUrl}/cancel`,

        metadata: {
            orderId: orderId.toString(),
        },
    });

    return session;
};

const confirmPaymentAndAssignTag = async (orderId) => {
    console.log("🔍 confirmPaymentAndAssignTag called for order:", orderId);

    const order = await orderRepository.findById(orderId);

    if (!order) {
        console.error("❌ Order not found:", orderId);
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }


    if (order.paymentStatus === "paid") {
        console.log("⚠️ Order already paid:", orderId);
        return order;
    }

    const tag = await tagRepository.findUnusedTag();

    if (!tag) {
        console.error("❌ No available tags found in database!");
        console.log("💡 Please insert some tags into the database");
        throw new AppError(httpStatus.BAD_REQUEST, "No available tags. Please contact support.");
    }


    const updatedTag = await tagRepository.updateTag(tag._id, {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
    });


    // Update order
    const updatedOrder = await orderRepository.updateOrder(orderId, {
        paymentStatus: "paid",
        fulfillmentStatus: "assigned",
        assignedTag: tag._id,
    });

    return updatedOrder;
};


const getOrderById = async (id) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    return order;
};

const getUserOrders = async (userId) => {
  const orders = await orderRepository.findByUser(userId);
  return orders;
};


export default {
    createOrder,
    createCheckoutSession,
    confirmPaymentAndAssignTag,
    getOrderById,
    getUserOrders,
};