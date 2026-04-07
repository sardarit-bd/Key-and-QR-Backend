import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import env from "../config/env.js";
import globalErrorHandler from "../middlewares/error.middleware.js";
import notFoundHandler from "../middlewares/notFound.middleware.js";
import apiLimiter from "../middlewares/rateLimiter.js";
import router from "../routes/index.js";
import stripeWebhook from "../routes/stripe.webhook.js";

const app = express();

app.set("trust proxy", 1);

// Dynamic allowed origins
const getAllowedOrigins = () => {
  const origins = [
    "http://localhost:3000",
    "http://localhost:5000",
    env.clientUrl,
  ];
  
  // Add Vercel URLs if in production
  if (env.isProduction) {
    origins.push(/\.vercel\.app$/);
    if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL);
  }
  
  return origins.filter(Boolean);
};

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, postman)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = getAllowedOrigins();
      
      // Check if origin is allowed
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return allowed === origin;
      });
      
      if (isAllowed) {
        return callback(null, true);
      }
      
      console.warn("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(morgan("dev"));
app.use(apiLimiter);

app.use("/api/v1/stripe", stripeWebhook);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running",
    environment: env.nodeEnv,
  });
});

app.use("/api/v1", router);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;