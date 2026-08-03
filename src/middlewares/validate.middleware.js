/**
 * Validate request body, query, and/or params against Joi schemas.
 * 
 * @param {Object} schemas - Object with optional body, query, params Joi schemas
 *   - If a single Joi schema is passed (not wrapped in object), it validates req.body only (backward compatible)
 *   - If an object with body/query/params keys is passed, each is validated against its target
 * @returns {Function} Express middleware
 */
const validateRequest = (schemas) => {
  return (req, res, next) => {
    // Backward compatible: if a single schema is passed, validate body only
    if (schemas && schemas.validate) {
      const { error } = schemas.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          data: error.details.map((detail) => detail.message),
        });
      }

      return next();
    }

    // Object form: { body, query, params }
    const errors = [];

    if (schemas.body) {
      const { error, value } = schemas.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map((d) => `[body] ${d.message}`));
      } else {
        req.body = value;
      }
    }

    if (schemas.query) {
      const { error, value } = schemas.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map((d) => `[query] ${d.message}`));
      } else {
        // Express 5 exposes req.query as a read-only getter — store the
        // sanitized result on a dedicated property instead of reassigning.
        req.validatedQuery = value;
      }
    }

    if (schemas.params) {
      const { error, value } = schemas.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: false, // params are part of the URL, don't strip
      });
      if (error) {
        errors.push(...error.details.map((d) => `[params] ${d.message}`));
      } else {
        req.params = value;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        data: errors,
      });
    }

    next();
  };
};

export default validateRequest;
