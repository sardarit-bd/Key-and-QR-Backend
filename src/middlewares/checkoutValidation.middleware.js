import Joi from "joi";
import AppError from "../utils/AppError.js";
import httpStatus from "../constants/httpStatus.js";

const guestCheckoutSchema = Joi.object({
    productId: Joi.string().required(),
    quantity: Joi.number().min(1).default(1),
    purchaseType: Joi.string().valid("self", "gift").default("self"),
    giftMessage: Joi.string().max(500).allow(null, ""),
    
    guestCustomer: Joi.object({
        fullName: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        phone: Joi.string().allow(null, ""),
    }).when(Joi.ref('$isGuest'), {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
    }),
    
    shippingAddress: Joi.object({
        fullName: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        phone: Joi.string().allow(null, ""),
        address: Joi.string().required(),
        city: Joi.string().required(),
        postalCode: Joi.string().required(),
        country: Joi.string().required(),
    }).when(Joi.ref('$isGuest'), {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
    }),
});

export const validateCheckout = (req, res, next) => {
    const isGuest = !req.user?.userId;
    
    const { error } = guestCheckoutSchema.validate(req.body, {
        context: { isGuest },
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            data: error.details.map((detail) => detail.message),
        });
    }

    next();
};