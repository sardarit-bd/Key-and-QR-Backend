import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.join(process.cwd(), ".env") });
}

const getEnv = (key, defaultValue = null) => {
  const value = process.env[key];
  return value !== undefined && value !== "" ? value : defaultValue;
};

const env = {
  // Server
  port: Number(getEnv("PORT", "5000")),
  nodeEnv: getEnv("NODE_ENV", "development"),
  isProduction: getEnv("NODE_ENV", "development") === "production",

  // Database
  mongoURI: getEnv("MONGO_URI"),

  // JWT
  jwtAccessSecret: getEnv("JWT_ACCESS_SECRET"),
  jwtAccessExpiresIn: getEnv("JWT_ACCESS_EXPIRES_IN", "15m"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET"),
  jwtRefreshExpiresIn: getEnv("JWT_REFRESH_EXPIRES_IN", "7d"),

  // Bcrypt
  bcryptSaltRounds: Number(getEnv("BCRYPT_SALT_ROUNDS", "10")),

  // URLs
  clientUrl: getEnv("CLIENT_URL", "http://localhost:3000"),
  apiUrl: getEnv("API_URL", "http://localhost:5000"),

  // Cookie
  cookieDomain: getEnv("COOKIE_DOMAIN", undefined),
  cookieOptions: {
    httpOnly: true,
    secure: getEnv("NODE_ENV", "development") === "production",
    sameSite: getEnv("NODE_ENV", "development") === "production" ? "none" : "lax",
    domain: getEnv("COOKIE_DOMAIN", undefined),
    path: "/",
  },

  // Admin
  adminEmail: getEnv("ADMIN_EMAIL"),
  adminPassword: getEnv("ADMIN_PASSWORD"),

  // Email
  emailHost: getEnv("EMAIL_HOST"),
  emailPort: Number(getEnv("EMAIL_PORT", "587")),
  emailUser: getEnv("EMAIL_USER"),
  emailPass: getEnv("EMAIL_PASS"),
  emailFrom: getEnv("EMAIL_FROM"),

  // Cloudinary
  cloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME"),
  cloudinaryApiKey: getEnv("CLOUDINARY_API_KEY"),
  cloudinaryApiSecret: getEnv("CLOUDINARY_API_SECRET"),

  // Stripe
  stripeSecretKey: getEnv("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET"),

  // Google OAuth
  googleClientId: getEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
};

const requiredEnvVars = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "MONGO_URI",
  "CLIENT_URL",
  "API_URL",
];

const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.warn(`⚠️ Missing env vars: ${missingVars.join(", ")}`);

  if (!env.isProduction) {
    console.warn("⚠️ Using fallback values for development");
  } else {
    console.error("❌ Required production environment variables are missing");
  }
}

console.log(`✅ Environment: ${env.nodeEnv}`);
console.log(`✅ Client URL: ${env.clientUrl}`);
console.log(`✅ API URL: ${env.apiUrl}`);
console.log(`✅ Cookie Domain: ${env.cookieDomain || "not set"}`);

export default env;