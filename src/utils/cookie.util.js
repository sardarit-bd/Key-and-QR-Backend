import env from '../config/env.js';

const getBaseCookieOptions = (maxAge, httpOnly = true) => {
  // Determine if we're in a production environment
  const isProd = env.isProduction || env.isVercel;
  
  return {
    httpOnly,
    secure: isProd, // Always true in production, false in development (or true if HTTPS)
    sameSite: isProd ? 'none' : 'lax',
    maxAge,
    path: '/',
    // Add domain for production if needed
    ...(isProd && env.nodeEnv === 'production' ? { domain: process.env.COOKIE_DOMAIN } : {})
  };
};

// Access Token Cookie Options (short lived)
export const accessTokenCookieOptions = getBaseCookieOptions(15 * 60 * 1000, true);

// Refresh Token Cookie Options (long lived)
export const refreshTokenCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, true);

// User Role Cookie Options (not httpOnly)
export const userRoleCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, false);

// Set Refresh Token Cookie only
export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
};

// Clear Refresh Token Cookie only
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    path: '/',
    secure: env.isProduction || env.isVercel,
    sameSite: env.isProduction || env.isVercel ? 'none' : 'lax',
  });
};

// Set All Auth Cookies (Access + Refresh + Role)
export const setAuthCookies = (res, accessToken, refreshToken, userRole) => {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
  res.cookie('userRole', userRole, userRoleCookieOptions);
  
  // Debug log
  console.log('Cookies set:', {
    accessToken: !!accessToken,
    refreshToken: !!refreshToken,
    userRole,
    options: accessTokenCookieOptions
  });
};

// Clear All Auth Cookies
export const clearAuthCookies = (res) => {
  const clearOptions = {
    path: '/',
    secure: env.isProduction || env.isVercel,
    sameSite: env.isProduction || env.isVercel ? 'none' : 'lax',
  };
  
  res.clearCookie('accessToken', clearOptions);
  res.clearCookie('refreshToken', clearOptions);
  res.clearCookie('userRole', clearOptions);
};

// Helper to verify if cookies are set
export const hasAuthCookies = (req) => {
  return !!(req.cookies?.accessToken || req.cookies?.refreshToken);
};