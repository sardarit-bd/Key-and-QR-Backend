import Joi from "joi";

export const createQuoteValidation = Joi.object({
  text: Joi.string().max(1000).allow("").optional().messages({
    "string.max": "Quote cannot exceed 1000 characters",
  }),

  category: Joi.string()
    .max(100)
    .required()
    .messages({
      "string.empty": "Category is required",
      "string.max": "Category cannot exceed 100 characters",
    }),

  author: Joi.string().max(100).optional().allow(null, "").messages({
    "string.max": "Author name cannot exceed 100 characters",
  }),

  description: Joi.string().max(1000).optional().allow(null, "").messages({
    "string.max": "Description cannot exceed 1000 characters",
  }),

  theme: Joi.string().max(100).optional().allow(null, "").messages({
    "string.max": "Theme cannot exceed 100 characters",
  }),

  allowReuse: Joi.boolean().optional(),

  editorData: Joi.object().optional().allow(null),

  // image will come from file upload (multer), not body
});

export const updateQuoteValidation = Joi.object({
  text: Joi.string().max(1000).allow("").optional().messages({
    "string.max": "Quote cannot exceed 1000 characters",
  }),

  category: Joi.string().max(100).messages({
    "string.max": "Category cannot exceed 100 characters",
  }),

  author: Joi.string().max(100).optional().allow(null, ""),

  description: Joi.string().max(1000).optional().allow(null, ""),

  theme: Joi.string().max(100).optional().allow(null, ""),

  allowReuse: Joi.boolean().optional(),

  isActive: Joi.boolean(),

  editorData: Joi.object().optional().allow(null),
});