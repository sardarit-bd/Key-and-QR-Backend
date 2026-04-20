import httpStatus from "../constants/httpStatus.js";
import User from "../models/user.model.js";
import AppError from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

const auth = (...requiredRoles) => {
  return async (req, res, next) => {
    try {
      let token = null;

      // ONLY get token from Authorization header (no cookies)
      const authorization = req.headers.authorization;
      if (authorization && authorization.startsWith("Bearer ")) {
        token = authorization.split(" ")[1];
      }

      if (!token) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized access");
      }

      // Verify token
      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch (tokenError) {
        if (tokenError.name === 'TokenExpiredError') {
          throw new AppError(httpStatus.UNAUTHORIZED, "Access token expired");
        }
        throw new AppError(httpStatus.UNAUTHORIZED, "Invalid token");
      }

      // Get user from database
      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        throw new AppError(httpStatus.UNAUTHORIZED, "User not found");
      }

      if (user.isDeleted) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Account has been deleted");
      }

      // Set user in request
      req.user = {
        userId: user._id.toString(),
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      // Check role permissions
      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "You are not allowed to access this route"
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;