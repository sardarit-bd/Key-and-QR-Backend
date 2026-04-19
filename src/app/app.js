import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import passport from "passport";
import env from "../config/env.js";
import globalErrorHandler from "../middlewares/error.middleware.js";
import notFoundHandler from "../middlewares/notFound.middleware.js";
import apiLimiter from "../middlewares/rateLimiter.js";
import router from "../routes/index.js";
import stripeWebhook from "../routes/stripe.webhook.js";

const app = express();

app.set("trust proxy", 1);

const getAllowedOrigins = () => {
  const origins = [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:3001",
    "https://localhost:3000",
    env.clientUrl,
    process.env.FRONTEND_URL,
  ].filter(Boolean);
  return origins;
};

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = getAllowedOrigins();
    const isAllowed = allowedOrigins.some((allowed) => allowed === origin);

    if (!env.isProduction && origin.includes("localhost")) {
      return callback(null, true);
    }

    if (isAllowed) {
      return callback(null, true);
    }

    console.warn("CORS blocked origin:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cookie",
    "X-Requested-With",
    "x-refresh-token",
  ],
  exposedHeaders: ["Set-Cookie", "Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// CORS
app.use(cors(corsOptions));
// app.options("/*", cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);

app.use(morgan("dev"));
app.use(apiLimiter);

app.use(passport.initialize());

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