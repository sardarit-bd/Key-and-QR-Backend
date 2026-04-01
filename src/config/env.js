import dotenv from "dotenv";

dotenv.config();

const env = {
  // Server
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  mongoURI: process.env.MONGO_URI,

  // JWT
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  // Bcrypt
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  // URLs
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  apiUrl: process.env.API_URL || "http://localhost:5000",

  // Admin
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,

  // Email
  emailHost: process.env.EMAIL_HOST,
  emailPort: Number(process.env.EMAIL_PORT) || 587,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM,

  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,

  // Apple OAuth
  appleClientId: process.env.APPLE_CLIENT_ID,
  appleTeamId: process.env.APPLE_TEAM_ID,
  appleKeyId: process.env.APPLE_KEY_ID,
  applePrivateKey: process.env.APPLE_PRIVATE_KEY,
};

const requiredEnvVars = [
  "MONGO_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missingEnvVars.join(", ")}`
  );

  console.log("Current values:", {
    MONGO_URI: env.mongoURI ? "✅ Set" : "❌ Missing",
    JWT_ACCESS_SECRET: env.jwtAccessSecret ? "✅ Set" : "❌ Missing",
    JWT_REFRESH_SECRET: env.jwtRefreshSecret ? "✅ Set" : "❌ Missing",
  });

  if (env.nodeEnv === "production") {
    process.exit(1);
  }
} else {
  console.log("✅ Required environment variables are set");
}

console.log("Environment loaded:", {
  nodeEnv: env.nodeEnv,
  port: env.port,
  clientUrl: env.clientUrl,
  apiUrl: env.apiUrl,
  googleOAuth:
    env.googleClientId && env.googleClientSecret
      ? "✅ Configured"
      : "❌ Not configured",
  appleOAuth:
    env.appleClientId &&
    env.appleTeamId &&
    env.appleKeyId &&
    env.applePrivateKey
      ? "✅ Configured"
      : "⏸️ Not configured",
  stripe: env.stripeSecretKey ? "✅ Configured" : "❌ Not configured",
  email: env.emailUser ? "✅ Configured" : "❌ Not configured",
  cloudinary: env.cloudinaryCloudName ? "✅ Configured" : "❌ Not configured",
});

export default env;