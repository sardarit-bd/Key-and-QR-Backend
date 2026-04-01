import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}

let clientUrl = process.env.CLIENT_URL;
if (clientUrl && clientUrl.includes('# CLIENT_URL')) {
  const urls = clientUrl.split('\n').filter(url => url && !url.startsWith('#'));
  clientUrl = urls[0] || 'http://localhost:3000';
}

let apiUrl = process.env.API_URL;
if (apiUrl && apiUrl.includes('# API_URL')) {
  const urls = apiUrl.split('\n').filter(url => url && !url.startsWith('#'));
  apiUrl = urls[0] || 'http://localhost:5000';
}

const env = {
  // Server Configuration
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoURI: process.env.MONGO_URI || process.env.MONGO_URL,

  // JWT Configuration
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  // Bcrypt Configuration
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  
  // URLs
  clientUrl: clientUrl || "http://localhost:3000",
  apiUrl: apiUrl || "http://localhost:5000",

  // Admin Configuration
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,

  // Email Configuration
  emailHost: process.env.EMAIL_HOST,
  emailPort: Number(process.env.EMAIL_PORT) || 587,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM,

  // Cloudinary Configuration
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,

  // Stripe Configuration
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

// Validate required environment variables
const requiredEnvVars = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGO_URI',
];

const hasMongoURI = env.mongoURI;
const missingEnvVars = requiredEnvVars.filter(varName => {
  if (varName === 'MONGO_URI') {
    return !hasMongoURI;
  }
  return !process.env[varName];
});

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.log('Current values:', {
    JWT_ACCESS_SECRET: env.jwtAccessSecret ? '✅ Set' : '❌ Missing',
    JWT_REFRESH_SECRET: env.jwtRefreshSecret ? '✅ Set' : '❌ Missing',
    MONGO_URI: env.mongoURI ? '✅ Set' : '❌ Missing',
  });
  
  if (env.nodeEnv === 'production') {
    console.warn('⚠️ Warning: Some environment variables are missing. App may not work correctly.');
  }
} else {
  console.log('✅ All required environment variables are set');
}

// Log OAuth status (without exposing secrets)
console.log('Environment loaded:', {
  nodeEnv: env.nodeEnv,
  clientUrl: env.clientUrl,
  apiUrl: env.apiUrl,
  port: env.port,
  mongoURI: env.mongoURI ? '✅ Set' : '❌ Missing',
  googleOAuth: env.googleClientId ? '✅ Configured' : '❌ Not configured',
  stripe: env.stripeSecretKey ? '✅ Configured' : '❌ Not configured',
  email: env.emailUser ? '✅ Configured' : '❌ Not configured',
  cloudinary: env.cloudinaryCloudName ? '✅ Configured' : '❌ Not configured',
});

export default env;