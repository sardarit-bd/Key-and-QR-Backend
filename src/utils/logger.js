import winston from "winston";

const isVercel = process.env.VERCEL === "1";

const transports = [
  new winston.transports.Console({
    format: winston.format.simple(),
  }),
];

// Only use file logging locally
if (!isVercel) {
  transports.push(
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    })
  );
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports,
});

export default logger;