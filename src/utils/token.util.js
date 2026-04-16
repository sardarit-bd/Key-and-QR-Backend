/**
 * Create auth response with tokens in response body
 * @param {Object} res - Express response object
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token  
 * @param {string} userRole - User role (admin/user)
 * @returns {Object} Tokens object for response body
 */
export const setAuthResponse = (res, accessToken, refreshToken, userRole) => {
  return { 
    accessToken, 
    refreshToken, 
    userRole 
  };
};


export const clearAuthCookies = (res) => {
  // Intentionally empty - client handles cleanup
  return;
};

export const setRefreshTokenCookie = (res, refreshToken) => {
  // Deprecated - no longer used
  return;
};


export const setAuthCookies = (res, accessToken, refreshToken, userRole) => {
  // Deprecated - no longer used
  return;
};

// Deprecated exports - kept to prevent import errors
export const accessTokenCookieOptions = {};
export const refreshTokenCookieOptions = {};
export const userRoleCookieOptions = {};