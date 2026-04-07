import env from '../config/env.js';

const getBaseCookieOptions = (maxAge, httpOnly = true) => {
  // Cross-domain cookie handling
  const isCrossDomain = env.isProduction && env.clientUrl !== env.apiUrl;
  
  return {
    httpOnly,
    secure: true,
    sameSite: isCrossDomain ? 'none' : 'lax',
    maxAge,
    path: '/',
    // domain: env.isProduction ? '.vercel.app' : undefined,
  };
};

export const accessTokenCookieOptions = getBaseCookieOptions(15 * 60 * 1000, true);
export const refreshTokenCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, true);
export const userRoleCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, false);

export const setAuthCookies = (res, accessToken, refreshToken, userRole) => {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
  res.cookie('userRole', userRole, userRoleCookieOptions);
};

export const clearAuthCookies = (res) => {
  const options = { path: '/' };
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
  res.clearCookie('userRole', options);
};