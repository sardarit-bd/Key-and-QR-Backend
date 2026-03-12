import httpStatus from "../constants/httpStatus.js";
import User from "../models/user.model.js";
import AppError from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

const auth = (...requiredRoles) => {
    return async (req, res, next) => {
        try {
            const authorization = req.headers.authorization;
            if (!authorization || !authorization.startsWith("Bearer ")) {
                throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized access");
            }

            const token = authorization.split(" ")[1];
            const decoded = verifyAccessToken(token);
            
            const userId = decoded.id || decoded._id || decoded.userId;
            const user = await User.findById(userId).select("-password");
            
            if (!user) throw new AppError(httpStatus.UNAUTHORIZED, "User not found");

            req.user = user;

            if (requiredRoles.length && !requiredRoles.includes(user.role)) {
                throw new AppError(httpStatus.FORBIDDEN, "You are not allowed to access this route");
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

export default auth;