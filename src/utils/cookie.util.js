import env from '../config/env.js';

const getBaseCookieOptions = (maxAge, httpOnly = true) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;
  
  const useCrossDomain = isProduction || isVercel;
  
  return {
    httpOnly,
    secure: true,
    sameSite: 'none',
    maxAge,
    path: '/',
  };
};

// ✅ Access Token Cookie Options (short lived)
export const accessTokenCookieOptions = getBaseCookieOptions(15 * 60 * 1000, true);

// ✅ Refresh Token Cookie Options (long lived)
export const refreshTokenCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, true);

// ✅ User Role Cookie Options (not httpOnly)
export const userRoleCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, false);

// ✅ Set Refresh Token Cookie only
export const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
};

// ✅ Clear Refresh Token Cookie only
export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    path: '/',
    secure: true,
    sameSite: 'none',
  });
};

// ✅ Set All Auth Cookies (Access + Refresh + Role)
export const setAuthCookies = (res, accessToken, refreshToken, userRole) => {
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
  res.cookie('userRole', userRole, userRoleCookieOptions);
};

// ✅ Clear All Auth Cookies
export const clearAuthCookies = (res) => {
  const clearOptions = {
    path: '/',
    secure: true,
    sameSite: 'none',
  };
  
  res.clearCookie('accessToken', clearOptions);
  res.clearCookie('refreshToken', clearOptions);
  res.clearCookie('userRole', clearOptions);
};