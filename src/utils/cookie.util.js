import env from '../config/env.js';

const getBaseCookieOptions = (maxAge, httpOnly = true) => {
  const isCrossDomain = env.isProduction && env.clientUrl !== env.apiUrl;
  
  return {
    httpOnly,
    secure: env.isProduction,
    sameSite: isCrossDomain ? 'none' : 'lax',
    maxAge,
    path: '/',
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
  const isCrossDomain = env.isProduction && env.clientUrl !== env.apiUrl;
  
  const clearOptions = {
    path: '/',
    secure: env.isProduction,
    sameSite: isCrossDomain ? 'none' : 'lax',
  };

  res.clearCookie('accessToken', clearOptions);
  res.clearCookie('refreshToken', clearOptions);
  res.clearCookie('userRole', clearOptions);
};