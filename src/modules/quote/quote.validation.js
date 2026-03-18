import Joi from "joi";

export const createQuoteValidation = Joi.object({
  text: Joi.string().required(),
  category: Joi.string()
    .valid("faith", "love", "hope", "success", "motivation")
    .required(),
});

export const updateQuoteValidation = Joi.object({
  text: Joi.string(),
  category: Joi.string().valid(
    "faith",
    "love",
    "hope",
    "success",
    "motivation"
  ),
  isActive: Joi.boolean(),
});