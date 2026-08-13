import Joi from "joi";

export const createProductValidationSchema = Joi.object({
  name: Joi.string().required(),
  price: Joi.number().required(),
  categoryId: Joi.string().hex().length(24).required(),
  brand: Joi.string().optional(),
  description: Joi.string().required(),
  stock: Joi.number().optional(),
});