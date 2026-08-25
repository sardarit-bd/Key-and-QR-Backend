import Joi from "joi";

// ---------------------------------------------------------------------------
// Hero Section CMS validation
// The DB stores only stable strings (icon NAMES, URLs). No raw markup.
// ---------------------------------------------------------------------------

const hrefSchema = Joi.string()
  .max(500)
  .allow("")
  .pattern(/^(\/|https?:\/\/)/)
  .messages({
    "string.pattern.base": "CTA link must be an internal route (e.g. /shop) or a valid http(s) URL",
    "string.max": "CTA link cannot exceed 500 characters",
  });

const heroImageValidation = Joi.object({
  url: Joi.string().max(500).allow("").messages({
    "string.max": "Image URL cannot exceed 500 characters",
  }),
  publicId: Joi.string().max(500).allow("").messages({
    "string.max": "Image public ID cannot exceed 500 characters",
  }),
  alt: Joi.string().max(300).allow("").messages({
    "string.max": "Image alt text cannot exceed 300 characters",
  }),
});

const featureValidation = Joi.object({
  icon: Joi.string().max(100).allow("").messages({
    "string.max": "Feature icon name cannot exceed 100 characters",
  }),
  title: Joi.string().max(150).required().messages({
    "string.empty": "Feature title is required",
    "string.max": "Feature title cannot exceed 150 characters",
    "any.required": "Feature title is required",
  }),
  description: Joi.string().max(500).allow("").messages({
    "string.max": "Feature description cannot exceed 500 characters",
  }),
  enabled: Joi.boolean().default(true),
  order: Joi.number().integer().min(0).default(0),
});

export const updateHeroValidation = Joi.object({
  eyebrow: Joi.string().max(200).allow("").messages({
    "string.max": "Eyebrow text cannot exceed 200 characters",
  }),

  title: Joi.string().max(300).allow("").messages({
    "string.max": "Heading cannot exceed 300 characters",
  }),

  description: Joi.string().max(1000).allow("").messages({
    "string.max": "Description cannot exceed 1000 characters",
  }),

  primaryCta: Joi.object({
    label: Joi.string().max(100).allow("").messages({
      "string.max": "Primary CTA label cannot exceed 100 characters",
    }),
    href: hrefSchema,
  }).default(),

  secondaryCta: Joi.object({
    label: Joi.string().max(100).allow("").messages({
      "string.max": "Secondary CTA label cannot exceed 100 characters",
    }),
    href: hrefSchema,
  }).default(),

  heroImage: heroImageValidation.default(),

  features: Joi.array().items(featureValidation).max(10).messages({
    "array.max": "A maximum of 10 features is allowed",
  }),

  enabled: Joi.boolean().default(true),

  // Legacy fields — accepted so the frozen legacy admin page still works.
  subtitle: Joi.string().max(1000).allow("").optional(),
  buttonText: Joi.string().max(200).allow("").optional(),
  secondaryButtonText: Joi.string().max(200).allow("").optional(),
  imageUrl: Joi.string().max(500).allow("").optional(),
  isActive: Joi.boolean().optional(),
  steps: Joi.array().max(10).optional(),
});

export const updateShopHeroValidation = Joi.object({
  imageUrl: Joi.string().max(500).allow("").messages({
    "string.max": "Image URL cannot exceed 500 characters",
  }),
  publicId: Joi.string().max(500).allow("").messages({
    "string.max": "Image public ID cannot exceed 500 characters",
  }),
});

const bannerMessageValidation = Joi.object({
  _id: Joi.string().allow("").optional(),
  id: Joi.string().allow("").optional(),
  text: Joi.string().max(300).required().messages({
    "string.empty": "Message text is required",
    "string.max": "Message text cannot exceed 300 characters",
    "any.required": "Message text is required",
  }),
  icon: Joi.string().max(100).allow("").default("Sparkles"),
  linkUrl: Joi.string().max(500).allow("").default(""),
  enabled: Joi.boolean().default(true),
});

export const updateAnnouncementBannerValidation = Joi.object({
  isEnabled: Joi.boolean().default(true),
  backgroundColor: Joi.string().max(50).allow("").default("#000000"),
  textColor: Joi.string().max(50).allow("").default("#ffffff"),
  isDismissible: Joi.boolean().default(true),
  rotationSpeed: Joi.number().integer().min(2).max(30).default(5),
  messages: Joi.array().items(bannerMessageValidation).max(10).messages({
    "array.max": "A maximum of 10 messages is allowed",
  }),
  // Optional legacy single-text fields for backwards compatibility
  text: Joi.string().max(300).allow("").optional(),
  linkUrl: Joi.string().max(500).allow("").optional(),
});


