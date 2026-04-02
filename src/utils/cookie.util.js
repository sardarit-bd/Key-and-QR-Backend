import env from '../config/env.js';

export const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: env.isProduction ? 'none' : 'lax',
  maxAge: maxAge,
  path: '/',
});

export const accessTokenCookieOptions = getCookieOptions(15 * 60 * 1000); // 15 minutes
export const refreshTokenCookieOptions = getCookieOptions(7 * 24 * 60 * 60 * 1000); // 7 days
export const userRoleCookieOptions = {
  httpOnly: false,
  secure: env.isProduction,
  sameSite: env.isProduction ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export const clearCookies = (res) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.clearCookie('userRole', { path: '/' });
};