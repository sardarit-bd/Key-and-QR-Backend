import Joi from "joi";

export const createQuoteValidation = Joi.object({
  text: Joi.string().required().min(3).max(1000).messages({
    "string.empty": "Quote text is required",
    "string.min": "Quote must be at least 3 characters",
    "string.max": "Quote cannot exceed 1000 characters",
  }),
  category: Joi.string()
    .valid("faith", "love", "hope", "success", "motivation")
    .required()
    .messages({
      "any.only": "Category must be one of: faith, love, hope, success, motivation",
      "string.empty": "Category is required",
    }),
});

export const updateQuoteValidation = Joi.object({
  text: Joi.string().min(3).max(1000).messages({
    "string.min": "Quote must be at least 3 characters",
    "string.max": "Quote cannot exceed 1000 characters",
  }),
  category: Joi.string().valid("faith", "love", "hope", "success", "motivation"),
  isActive: Joi.boolean(),
});