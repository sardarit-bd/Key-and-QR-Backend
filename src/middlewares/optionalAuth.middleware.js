import User from "../models/user.model.js";
import { verifyAccessToken } from "../utils/jwt.js";

const optionalAuth = () => {
  return async (req, res, next) => {
    try {
      let token = null;

      const authorization = req.headers.authorization;
      if (authorization && authorization.startsWith("Bearer ")) {
        token = authorization.split(" ")[1];
      }

      if (!token) {
        req.user = null;
        return next();
      }

      try {
        const decoded = verifyAccessToken(token);
        const user = await User.findById(decoded.userId).select("-password");

        if (!user || user.isDeleted) {
          req.user = null;
          return next();
        }

        req.user = {
          userId: user._id.toString(),
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        };

        return next();
      } catch {
        req.user = null;
        return next();
      }
    } catch {
      req.user = null;
      return next();
    }
  };
};

export default optionalAuth;