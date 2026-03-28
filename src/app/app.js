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

// ✅ Allowed origins
const allowedOrigins = [
  "http://localhost:3000",
  "https://key-and-qr.vercel.app",
  env.clientUrl,
].filter(Boolean);

// ✅ CORS CONFIG (FIXED)
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // 🔥 Allow ngrok + predefined origins
    if (
      allowedOrigins.includes(origin) ||
      origin.includes("ngrok-free.dev")
    ) {
      callback(null, true);
    } else {
      console.log("❌ CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));

// ✅ Handle preflight request (VERY IMPORTANT)
// app.options("/*", cors(corsOptions));

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Logger
app.use(morgan("dev"));

// Rate limiter
app.use(apiLimiter);

// =======================================
// STRIPE WEBHOOK (RAW BODY - BEFORE JSON)
// =======================================
app.use("/api/v1/stripe", stripeWebhook);

// =======================================
// BODY PARSER (AFTER WEBHOOK)
// =======================================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookies
app.use(cookieParser());

// =======================================
// HEALTH CHECK
// =======================================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running",
  });
});

// =======================================
// API ROUTES
// =======================================
app.use("/api/v1", router);

// =======================================
// 404 HANDLER
// =======================================
app.use(notFoundHandler);

// =======================================
// GLOBAL ERROR HANDLER
// =======================================
app.use(globalErrorHandler);

export default app;