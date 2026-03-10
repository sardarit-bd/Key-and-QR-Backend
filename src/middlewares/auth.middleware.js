import httpStatus from "../constants/httpStatus.js";
import AppError from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

const auth = (...requiredRoles) => {
  return (req, res, next) => {
    try {
      const authorization = req.headers.authorization;

      if (!authorization || !authorization.startsWith("Bearer ")) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized access");
      }

      const token = authorization.split(" ")[1];
      const decoded = verifyAccessToken(token);

      req.user = decoded;

      if (requiredRoles.length && !requiredRoles.includes(decoded.role)) {
        throw new AppError(httpStatus.FORBIDDEN, "You are not allowed to access this route");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;