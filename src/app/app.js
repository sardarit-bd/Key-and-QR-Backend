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

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(apiLimiter);
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running",
  });
});

app.use("/api/v1", router);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;