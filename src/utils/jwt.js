import jwt from "jsonwebtoken";
import env from "../config/env.js";

export const generateAccessToken = (user) => {
    const payload = { id: user._id, email: user.email, role: user.role };
    return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpiresIn });
};

export const generateRefreshToken = (user) => {
    const payload = { id: user._id, email: user.email, role: user.role };
    return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn });
};

export const verifyAccessToken = (token) => {
    return jwt.verify(token, env.jwtAccessSecret);
};

export const verifyRefreshToken = (token) => {
    return jwt.verify(token, env.jwtRefreshSecret);
};