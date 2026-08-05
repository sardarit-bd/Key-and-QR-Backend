import Joi from "joi";

// Password pattern: 8+ chars, at least 1 uppercase, 1 lowercase, 1 number
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,100}$/;
const PASSWORD_MIN_MESSAGE = "Password must be at least 8 characters with uppercase, lowercase, and a number";
const PASSWORD_PATTERN_MESSAGE = "Password must contain at least one uppercase letter, one lowercase letter, and one number";

export const registerValidationSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  email: Joi.string().trim().email().required().messages({
    "string.email": "Valid email is required",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
  password: Joi.string().pattern(PASSWORD_PATTERN).min(8).max(100).required().messages({
    "string.pattern.base": PASSWORD_PATTERN_MESSAGE,
    "string.min": PASSWORD_MIN_MESSAGE,
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

export const loginValidationSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.email": "Valid email is required",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

export const refreshTokenValidationSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "string.empty": "Refresh token is required",
    "any.required": "Refresh token is required",
  }),
});

export const forgotPasswordValidationSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "string.email": "Valid email is required",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
});

export const resetPasswordValidationSchema = Joi.object({
  token: Joi.string().required().messages({
    "string.empty": "Reset token is required",
    "any.required": "Reset token is required",
  }),
  newPassword: Joi.string().pattern(PASSWORD_PATTERN).min(8).max(100).required().messages({
    "string.pattern.base": PASSWORD_PATTERN_MESSAGE,
    "string.min": PASSWORD_MIN_MESSAGE,
    "string.empty": "New password is required",
    "any.required": "New password is required",
  }),
});

export const changePasswordValidationSchema = Joi.object({
  oldPassword: Joi.string().required().messages({
    "string.empty": "Old password is required",
    "any.required": "Old password is required",
  }),
  newPassword: Joi.string().pattern(PASSWORD_PATTERN).min(8).max(100).required().messages({
    "string.pattern.base": PASSWORD_PATTERN_MESSAGE,
    "string.min": PASSWORD_MIN_MESSAGE,
    "string.empty": "New password is required",
    "any.required": "New password is required",
  }),
});

export const updateProfileValidationSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).optional().messages({
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 50 characters",
  }),
  profileImage: Joi.any().allow(null).optional(),
}).options({ stripUnknown: true });
