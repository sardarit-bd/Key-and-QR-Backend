import Joi from "joi";

export const createCheckoutValidation = Joi.object({
  tagCode: Joi.string().trim().required(),
  preferredCategory: Joi.string()
    .valid("faith", "love", "hope", "success", "motivation")
    .optional(),
});

export const cancelSubscriptionValidation = Joi.object({
  tagCode: Joi.string().trim().required().messages({
    "string.empty": "tagCode is required",
    "any.required": "tagCode is required",
  }),
});