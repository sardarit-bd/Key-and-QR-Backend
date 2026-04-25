import Joi from "joi";

/***----------------- Create Assignment Validation --------------------*/
export const createQuoteAssignmentValidation = Joi.object({
  quote: Joi.string().required().messages({
    "string.empty": "Quote ID is required",
  }),

  tag: Joi.string().optional().allow(null, ""),
  user: Joi.string().optional().allow(null, ""),

  assignmentType: Joi.string()
    .valid("tag", "user")
    .required()
    .messages({
      "any.only": "assignmentType must be either 'tag' or 'user'",
      "string.empty": "assignmentType is required",
    }),

  priority: Joi.number().optional().default(0),

  isActive: Joi.boolean().optional(),

  startAt: Joi.date().optional().allow(null),
  endAt: Joi.date().optional().allow(null),
})
  .custom((value, helpers) => {
    // ❗ Ensure correct pairing
    if (value.assignmentType === "tag" && !value.tag) {
      return helpers.message("Tag is required when assignmentType is 'tag'");
    }

    if (value.assignmentType === "user" && !value.user) {
      return helpers.message("User is required when assignmentType is 'user'");
    }

    return value;
  });

/***-----------------Update Assignment Validation--------------------*/
export const updateQuoteAssignmentValidation = Joi.object({
  quote: Joi.string().optional(),

  tag: Joi.string().optional().allow(null, ""),
  user: Joi.string().optional().allow(null, ""),

  assignmentType: Joi.string().valid("tag", "user"),

  priority: Joi.number().optional(),

  isActive: Joi.boolean().optional(),

  startAt: Joi.date().optional().allow(null),
  endAt: Joi.date().optional().allow(null),
});