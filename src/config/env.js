import dotenv from "dotenv";
import path from "path";

// Load environment variables
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
  isVercel: !!process.env.VERCEL, // Vercel detection

  // Database
  mongoURI: getEnv("MONGO_URI"),

  // JWT
  jwtAccessSecret: getEnv("JWT_ACCESS_SECRET"),
  jwtAccessExpiresIn: getEnv("JWT_ACCESS_EXPIRES_IN", "15m"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET"),
  jwtRefreshExpiresIn: getEnv("JWT_REFRESH_EXPIRES_IN", "7d"),

  // Bcrypt
  bcryptSaltRounds: Number(getEnv("BCRYPT_SALT_ROUNDS", "10")),

  // URLs - Dynamic based on environment
  clientUrl: getEnv("CLIENT_URL", 
    process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000"
  ),
  apiUrl: getEnv("API_URL",
    process.env.VERCEL_URL && process.env.BACKEND_URL
      ? process.env.BACKEND_URL
      : `http://localhost:5000`
  ),

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
  stripeSubscriptionPriceId: getEnv("STRIPE_SUBSCRIPTION_PRICE_ID"),

  // Google OAuth
  googleClientId: getEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
};

// Validate required env vars
const requiredEnvVars = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "MONGO_URI"];

if (env.isProduction) {
  requiredEnvVars.push("CLIENT_URL", "API_URL");
}

const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error(`❌ Missing env vars: ${missingVars.join(", ")}`);
  if (!env.isProduction) {
    console.warn("⚠️ Using fallback values for development");
  }
}

console.log(`✅ Environment: ${env.nodeEnv}`);
console.log(`✅ Client URL: ${env.clientUrl}`);
console.log(`✅ API URL: ${env.apiUrl}`);
console.log(`✅ Vercel: ${env.isVercel}`);

export default env;