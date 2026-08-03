import Joi from "joi";

export const historyQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).optional().messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),

  limit: Joi.number().integer().min(1).max(100).optional().messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),

  category: Joi.string().hex().length(24).optional().allow(null, "").messages({
    "string.hex": "Category must be a valid ObjectId",
    "string.length": "Category must be a valid ObjectId",
  }),

  source: Joi.string()
    .valid("scan", "random", "assignment", "personal", "dashboard", "other")
    .optional()
    .messages({
      "any.only": "Source must be one of: scan, random, assignment, personal, dashboard, other",
    }),
});

export const categoryQueryValidation = Joi.object({
  category: Joi.string().hex().length(24).required().messages({
    "string.hex": "Category must be a valid ObjectId",
    "string.length": "Category must be a valid ObjectId",
    "any.required": "Category is required",
  }),

  page: Joi.number().integer().min(1).optional().messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),

  limit: Joi.number().integer().min(1).max(100).optional().messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),
});

export const receivedQuoteParamsValidation = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    "string.hex": "Invalid received quote ID format",
    "string.length": "Invalid received quote ID length",
    "any.required": "Received quote ID is required",
  }),
});

export const statisticsQueryValidation = Joi.object({
  // Reserved for future filter options (e.g. date range)
});

export const receiveQuoteValidation = Joi.object({
  categorySlug: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .allow(null, "")
    .messages({
      "string.pattern.base": "Category slug must be lowercase alphanumeric with dashes",
    }),
});
