import env from '../config/env.js';

const getBaseCookieOptions = (maxAge, httpOnly = true) => {
  const isProduction = env.isProduction || process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL || env.isVercel;
  
  const isCrossDomain = isProduction || isVercel;
  
  console.log('Cookie Config:', {
    isProduction,
    isVercel,
    isCrossDomain,
    clientUrl: env.clientUrl,
    apiUrl: env.apiUrl,
  });
  
  return {
    httpOnly,
    secure: true,
    sameSite: 'none',  
    maxAge,
    path: '/',
    // domain: '.vercel.app', 
  };
};

export const accessTokenCookieOptions = getBaseCookieOptions(15 * 60 * 1000, true);
export const refreshTokenCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, true);
export const userRoleCookieOptions = getBaseCookieOptions(7 * 24 * 60 * 60 * 1000, false);

export const setAuthCookies = (res, accessToken, refreshToken, userRole) => {
  // ✅ Ensure headers are sent before setting cookies
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', env.clientUrl);
  
  res.cookie('accessToken', accessToken, accessTokenCookieOptions);
  res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
  res.cookie('userRole', userRole, userRoleCookieOptions);
  
  console.log('Cookies set successfully');
};

export const clearAuthCookies = (res) => {
  const isProduction = env.isProduction || process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL || env.isVercel;
  const isCrossDomain = isProduction || isVercel;
  
  const clearOptions = {
    path: '/',
    secure: true,
    sameSite: 'none',
  };

  res.clearCookie('accessToken', clearOptions);
  res.clearCookie('refreshToken', clearOptions);
  res.clearCookie('userRole', clearOptions);
};