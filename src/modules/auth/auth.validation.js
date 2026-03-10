import Joi from "joi";

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
  password: Joi.string().min(6).max(100).required().messages({
    "string.min": "Password must be at least 6 characters",
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
  newPassword: Joi.string().min(6).max(100).required().messages({
    "string.min": "New password must be at least 6 characters",
    "string.empty": "New password is required",
    "any.required": "New password is required",
  }),
});

export const changePasswordValidationSchema = Joi.object({
  oldPassword: Joi.string().required().messages({
    "string.empty": "Old password is required",
    "any.required": "Old password is required",
  }),
  newPassword: Joi.string().min(6).max(100).required().messages({
    "string.min": "New password must be at least 6 characters",
    "string.empty": "New password is required",
    "any.required": "New password is required",
  }),
});