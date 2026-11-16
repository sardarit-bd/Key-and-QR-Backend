import Joi from "joi";

export const createTagValidation = Joi.object({
  tagCode: Joi.string().required(),
});

export const updateTagValidation = Joi.object({
  isActive: Joi.boolean(),
  subscriptionType: Joi.string().valid("free", "subscriber"),
});

export const bulkCreateTagValidation = Joi.object({
  quantity: Joi.number().integer().min(1).max(5000).required(),
  prefix: Joi.string().max(20).optional().default("TAG"),
  batchType: Joi.string().valid("production", "testing").optional().default("production"),
});

export const selectedTagIdsValidation = Joi.object({
  tagIds: Joi.array().items(Joi.string().required()).min(1).max(5000).required(),
});