import Joi from "joi";

/**
 * Validation schema for admin order updates.
 * Only allows fields that admins should be able to modify.
 * Sensitive fields (paymentStatus, grandTotal, user, items, etc.) are excluded.
 * Audit fields (cancelledAt, cancelledBy, deliveredAt, changedBy) are server-generated.
 */
export const updateOrderValidationSchema = Joi.object({
  // Fulfillment status
  fulfillmentStatus: Joi.string()
    .valid("pending", "assigned", "shipped", "delivered", "cancelled", "returned")
    .optional(),

  // Tag assignment
  tagAssignmentStatus: Joi.string()
    .valid("none", "partial", "complete")
    .optional(),
  assignedTag: Joi.string().optional().allow(null),
  assignedTags: Joi.array()
    .items(
      Joi.object({
        tag: Joi.string().required(),
        assignedAt: Joi.date().optional(),
        assignedBy: Joi.string().valid("auto", "admin").optional(),
      })
    )
    .optional(),

  // Cancellation details (client can provide reason, timestamps are server-generated)
  cancellationReason: Joi.string().max(500).optional().allow(null),

  // Audit trail (client can provide reason, changedBy is server-generated)
  changeReason: Joi.string().max(500).optional().allow(null),

  // Legacy fields (backward compatibility)
  quantity: Joi.number().min(1).optional(),
}).options({ stripUnknown: true });
