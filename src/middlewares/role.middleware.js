import httpStatus from "../constants/httpStatus.js";
import AppError from "../utils/AppError.js";

const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(httpStatus.UNAUTHORIZED, "Unauthorized access"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(httpStatus.FORBIDDEN, "Forbidden"));
    }

    next();
  };
};

export default roleMiddleware;