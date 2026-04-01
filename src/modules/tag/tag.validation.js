import Joi from "joi";

export const createTagValidation = Joi.object({
  tagCode: Joi.string().required(),
});

export const updateTagValidation = Joi.object({
  isActive: Joi.boolean(),
  subscriptionType: Joi.string().valid("free", "subscriber"),
});