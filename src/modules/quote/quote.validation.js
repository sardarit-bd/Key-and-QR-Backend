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

  author: Joi.string().max(100).optional().messages({
    "string.max": "Author name cannot exceed 100 characters",
  }),

  description: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Description cannot exceed 1000 characters",
  }),

  theme: Joi.string().max(100).optional().allow(null, "").messages({
    "string.max": "Theme cannot exceed 100 characters",
  }),

  allowReuse: Joi.boolean().optional(),

  // image will come from file upload (multer), not body
});

export const updateQuoteValidation = Joi.object({
  text: Joi.string().min(3).max(1000).messages({
    "string.min": "Quote must be at least 3 characters",
    "string.max": "Quote cannot exceed 1000 characters",
  }),

  category: Joi.string().valid("faith", "love", "hope", "success", "motivation"),

  author: Joi.string().max(100).optional(),

  description: Joi.string().max(1000).optional().allow(null, ""),

  theme: Joi.string().max(100).optional().allow(null, ""),

  allowReuse: Joi.boolean().optional(),

  isActive: Joi.boolean(),
});