import Joi from "joi";
import AppError from "../utils/AppError.js";
import httpStatus from "../constants/httpStatus.js";

// Item shape used by the multi-product cart flow (Checkout.jsx -> buildCheckoutPayload)
const cartItemSchema = Joi.object({
    product: Joi.string(),
    productId: Joi.string(),
    quantity: Joi.number().min(1).default(1),
    unitPrice: Joi.number().min(0),
    subtotal: Joi.number().min(0),
    purchaseType: Joi.string().valid("self", "gift").default("self"),
    giftMessage: Joi.string().max(500).allow(null, ""),
}).or("product", "productId"); // at least one of these must be present

const guestCheckoutSchema = Joi.object({
    // Support existing order flow (checkout for an already-created order)
    orderId: Joi.string(),

    // Multi-product cart flow
    items: Joi.array().items(cartItemSchema).min(1),

    // Legacy / single-product flow. Not required when `items` or `orderId` is present.
    productId: Joi.string(),
    quantity: Joi.number().min(1).default(1),
    purchaseType: Joi.string().valid("self", "gift").default("self"),
    giftMessage: Joi.string().max(500).allow(null, ""),

    // Nested shape (preferred)
    guestCustomer: Joi.object({
        fullName: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        phone: Joi.string().allow(null, ""),
    }),

    shippingAddress: Joi.object({
        fullName: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        phone: Joi.string().allow(null, ""),
        address: Joi.string().required(),
        city: Joi.string().required(),
        postalCode: Joi.string().required(),
        country: Joi.string().required(),
    }),

    // Flat shape - this is what Checkout.jsx actually sends today.
    // We accept it here and normalize it into guestCustomer/shippingAddress below.
    fullName: Joi.string().min(2).max(100),
    email: Joi.string().email(),
    phone: Joi.string().allow(null, ""),
    address: Joi.string(),
    city: Joi.string(),
    postalCode: Joi.string(),
    country: Joi.string(),
})
    .or("productId", "items", "orderId")
    .unknown(true); // don't drop fields the service layer still relies on (e.g. unitPrice inside items is validated separately)

export const validateCheckout = (req, res, next) => {
    const isGuest = !req.user?.userId;
    const body = req.body || {};

    const { error, value } = guestCheckoutSchema.validate(body, {
        context: { isGuest },
        abortEarly: false,
        stripUnknown: false,
    });

    if (error) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            data: error.details.map((detail) => detail.message),
        });
    }

    // Normalize flat fields -> nested guestCustomer / shippingAddress
    // so downstream code (and the guest-required check below) has one consistent shape.
    const hasFlatAddress = value.fullName || value.address || value.city || value.postalCode || value.country;

    if (!value.shippingAddress && (hasFlatAddress || value.email)) {
        value.shippingAddress = {
            fullName: value.fullName,
            email: value.email,
            phone: value.phone,
            address: value.address,
            city: value.city,
            postalCode: value.postalCode,
            country: value.country,
        };
    }

    if (!value.guestCustomer && isGuest && value.email) {
        value.guestCustomer = {
            fullName: value.fullName,
            email: value.email,
            phone: value.phone,
        };
    }

    // Guests must end up with a full shipping address + guest customer info
    // (whether they sent it nested or flat).
    if (isGuest) {
        const missing = [];
        if (!value.guestCustomer?.email) missing.push('"guestCustomer" is required');
        if (
            !value.shippingAddress?.fullName ||
            !value.shippingAddress?.address ||
            !value.shippingAddress?.city ||
            !value.shippingAddress?.postalCode ||
            !value.shippingAddress?.country
        ) {
            missing.push('"shippingAddress" is required');
        }

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                data: missing,
            });
        }
    }

    // `items` require a productId or orderId when it's a single-product legacy request
    if (!value.items && !value.productId && !value.orderId) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            data: ['"productId" or "items" is required'],
        });
    }

    req.body = value;
    next();
};