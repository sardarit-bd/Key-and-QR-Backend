import Joi from "joi";

export const createCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    "string.empty": "Category name is required",
    "string.min": "Category name must be at least 2 characters",
    "string.max": "Category name cannot exceed 50 characters",
    "any.required": "Category name is required",
  }),

  slug: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .messages({
      "string.pattern.base": "Slug must be lowercase alphanumeric with dashes",
    }),

  description: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Description cannot exceed 500 characters",
  }),

  icon: Joi.string().max(100).optional().allow(null, "").messages({
    "string.max": "Icon cannot exceed 100 characters",
  }),

  color: Joi.string()
    .pattern(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional()
    .messages({
      "string.pattern.base": "Color must be a valid hex color",
    }),

  sortOrder: Joi.number().min(0).optional().messages({
    "number.min": "Sort order cannot be negative",
  }),

  isActive: Joi.boolean().optional(),

  isPremium: Joi.boolean().optional(),
});

export const updateCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(50).optional().messages({
    "string.min": "Category name must be at least 2 characters",
    "string.max": "Category name cannot exceed 50 characters",
  }),

  slug: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .messages({
      "string.pattern.base": "Slug must be lowercase alphanumeric with dashes",
    }),

  description: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Description cannot exceed 500 characters",
  }),

  icon: Joi.string().max(100).optional().allow(null, "").messages({
    "string.max": "Icon cannot exceed 100 characters",
  }),

  color: Joi.string()
    .pattern(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional()
    .messages({
      "string.pattern.base": "Color must be a valid hex color",
    }),

  sortOrder: Joi.number().min(0).optional().messages({
    "number.min": "Sort order cannot be negative",
  }),

  isActive: Joi.boolean().optional(),

  isPremium: Joi.boolean().optional(),
});

export const reorderCategoriesValidation = Joi.object({
  orderedIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required().messages({
    "array.min": "At least one category ID is required",
    "string.hex": "Invalid category ID format",
    "string.length": "Invalid category ID length",
    "any.required": "Ordered category IDs are required",
  }),
});

export const categoryParamsValidation = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    "string.hex": "Invalid category ID format",
    "string.length": "Invalid category ID length",
  }),
});

export const categorySlugParamsValidation = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required().messages({
    "string.pattern.base": "Invalid category slug",
  }),
});
