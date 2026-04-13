import httpStatus from "../constants/httpStatus.js";
import User from "../models/user.model.js";
import AppError from "../utils/AppError.js";
import { verifyAccessToken, verifyRefreshToken } from "../utils/jwt.js";
import { generateAccessToken } from "../utils/jwt.js";

const auth = (...requiredRoles) => {
  return async (req, res, next) => {
    try {
      let token = null;

      // Try to get token from Authorization header
      const authorization = req.headers.authorization;
      if (authorization && authorization.startsWith("Bearer ")) {
        token = authorization.split(" ")[1];
      }
      
      // If no token in header, try cookies
      if (!token && req.cookies?.accessToken) {
        token = req.cookies.accessToken;
      }

      if (!token) {
        // Check if refresh token exists for silent refresh
        if (req.cookies?.refreshToken) {
          // Token expired but has refresh token - will be handled by frontend
          throw new AppError(httpStatus.UNAUTHORIZED, "Access token expired");
        }
        throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized access");
      }

      // Verify token
      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch (tokenError) {
        // If token is expired but has refresh token
        if (tokenError.name === 'TokenExpiredError' && req.cookies?.refreshToken) {
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