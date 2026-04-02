import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}

const getEnv = (key, defaultValue = null) => {
  return process.env[key] || defaultValue;
};

const env = {
  // Server
  port: parseInt(getEnv('PORT', '5000')),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  isProduction: getEnv('NODE_ENV') === 'production',
  
  // Database
  mongoURI: getEnv('MONGO_URI'),
  
  // JWT
  jwtAccessSecret: getEnv('JWT_ACCESS_SECRET'),
  jwtAccessExpiresIn: getEnv('JWT_ACCESS_EXPIRES_IN', '15m'),
  jwtRefreshSecret: getEnv('JWT_REFRESH_SECRET'),
  jwtRefreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  
  // Bcrypt
  bcryptSaltRounds: parseInt(getEnv('BCRYPT_SALT_ROUNDS', '10')),
  
  clientUrl: getEnv('CLIENT_URL', 'http://localhost:3000'),
  apiUrl: getEnv('API_URL', 'http://localhost:5000'),
  
  adminEmail: getEnv('ADMIN_EMAIL'),
  adminPassword: getEnv('ADMIN_PASSWORD'),
  
  // Email
  emailHost: getEnv('EMAIL_HOST'),
  emailPort: parseInt(getEnv('EMAIL_PORT', '587')),
  emailUser: getEnv('EMAIL_USER'),
  emailPass: getEnv('EMAIL_PASS'),
  emailFrom: getEnv('EMAIL_FROM'),
  
  // Cloudinary
  cloudinaryCloudName: getEnv('CLOUDINARY_CLOUD_NAME'),
  cloudinaryApiKey: getEnv('CLOUDINARY_API_KEY'),
  cloudinaryApiSecret: getEnv('CLOUDINARY_API_SECRET'),
  
  // Stripe
  stripeSecretKey: getEnv('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: getEnv('STRIPE_WEBHOOK_SECRET'),
  
  // Google OAuth
  googleClientId: getEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: getEnv('GOOGLE_CLIENT_SECRET'),
  
  cookieOptions: {
    httpOnly: true,
    secure: getEnv('NODE_ENV') === 'production',
    sameSite: getEnv('NODE_ENV') === 'production' ? 'none' : 'lax',
    domain: getEnv('COOKIE_DOMAIN', null),
    path: '/',
  },
};

const requiredEnvVars = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MONGO_URI'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  console.warn(`⚠️ Missing env vars: ${missingVars.join(', ')}`);
  if (!env.isProduction) {
    console.warn('⚠️ Using fallback values for development');
  }
}

console.log(`✅ Environment: ${env.nodeEnv}`);
console.log(`✅ Client URL: ${env.clientUrl}`);
console.log(`✅ API URL: ${env.apiUrl}`);

export default env;