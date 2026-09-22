import Joi from "joi";

export const createProductCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(60).required().messages({
    "string.empty": "Product category name is required",
    "string.min": "Product category name must be at least 2 characters",
    "string.max": "Product category name cannot exceed 60 characters",
    "any.required": "Product category name is required",
  }),

  slug: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .messages({
      "string.pattern.base": "Slug must be lowercase alphanumeric with hyphens",
    }),

  description: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Description cannot exceed 500 characters",
  }),

  sortOrder: Joi.number().min(0).optional().messages({
    "number.min": "Sort order cannot be negative",
  }),

  isActive: Joi.boolean().optional(),
});

export const updateProductCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(60).optional().messages({
    "string.min": "Product category name must be at least 2 characters",
    "string.max": "Product category name cannot exceed 60 characters",
  }),

  slug: Joi.string()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .messages({
      "string.pattern.base": "Slug must be lowercase alphanumeric with hyphens",
    }),

  description: Joi.string().max(500).optional().allow(null, "").messages({
    "string.max": "Description cannot exceed 500 characters",
  }),

  sortOrder: Joi.number().min(0).optional().messages({
    "number.min": "Sort order cannot be negative",
  }),

  isActive: Joi.boolean().optional(),
});

export const reorderProductCategoriesValidation = Joi.object({
  orderedIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required().messages({
    "array.min": "At least one category ID is required",
    "string.hex": "Invalid category ID format",
    "string.length": "Invalid category ID length",
    "any.required": "Ordered category IDs are required",
  }),
});

export const productCategoryParamsValidation = Joi.object({
  id: Joi.string().hex().length(24).required().messages({
    "string.hex": "Invalid category ID format",
    "string.length": "Invalid category ID length",
  }),
});

export const productCategorySlugParamsValidation = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required().messages({
    "string.pattern.base": "Invalid category slug",
  }),
});
