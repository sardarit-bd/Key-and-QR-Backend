import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import favoriteService from "./favorite.service.js";

/**
 * 
 * Guest Response: 401 Unauthorized with clear message
 * Authenticated: Creates favorite
 * 
 * Body: { productId: string } OR { quoteId: string }
 */
const addFavorite = catchAsync(async (req, res) => {
    // User must be authenticated (handled by auth middleware)
    // But we double-check for safety
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to add favorites. Please log in and try again.",
            "FAVORITE_AUTH_REQUIRED"
        );
    }

    const { productId, quoteId } = req.body;
    
    // Validate input
    if (!productId && !quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Either productId or quoteId is required"
        );
    }

    if (productId && quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Cannot favorite both product and quote at the same time"
        );
    }

    const result = await favoriteService.addFavorite(
        req.user.userId,
        { productId, quoteId }
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Added to favorites successfully",
        data: result,
    });
});

/**
 * ✅ Remove from favorites
 * DELETE /api/v1/favorites/:id
 * 
 * Idempotent: Returns success even if already removed
 */
const removeFavorite = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to remove favorites"
        );
    }

    const result = await favoriteService.removeFavorite(
        req.params.id,
        req.user.userId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result ? "Removed from favorites" : "Favorite already removed",
        data: result,
    });
});

/**
 * ✅ Get user favorites with filtering and pagination
 * GET /api/v1/favorites
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - type: 'product' | 'quote' (optional)
 * - sortBy: 'createdAt' | 'updatedAt' (default: createdAt)
 * - sortOrder: 'asc' | 'desc' (default: desc)
 */
const getUserFavorites = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to view favorites"
        );
    }

    const {
        page = 1,
        limit = 10,
        type = null,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search = '',
    } = req.query;

    const result = await favoriteService.getUserFavorites(
        req.user.userId,
        {
            page: parseInt(page),
            limit: parseInt(limit),
            type,
            sortBy,
            sortOrder,
            search,
        }
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Favorites fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

/**
 * ✅ Check if item is in favorites
 * GET /api/v1/favorites/check
 * 
 * Query params: ?productId=xxx OR ?quoteId=xxx
 * 
 * Returns: { exists: boolean, favoriteId: string | null }
 */
const checkFavorite = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to check favorites"
        );
    }

    const { productId, quoteId } = req.query;
    
    if (!productId && !quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Either productId or quoteId is required"
        );
    }

    const result = await favoriteService.isFavorite(
        req.user.userId,
        productId,
        quoteId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        data: result,
    });
});

/**
 * ✅ Get favorite by ID
 * GET /api/v1/favorites/:id
 */
const getFavoriteById = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to view favorite"
        );
    }

    const result = await favoriteService.getFavoriteById(
        req.params.id,
        req.user.userId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Favorite fetched successfully",
        data: result,
    });
});

/**
 * ✅ Remove favorite by reference
 * DELETE /api/v1/favorites/remove-by-reference
 * 
 * Body: { productId: string } OR { quoteId: string }
 * 
 * Idempotent: Returns success even if already removed
 */
const removeFavoriteByReference = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to remove favorites"
        );
    }

    const { productId, quoteId } = req.body;
    
    if (!productId && !quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Either productId or quoteId is required"
        );
    }

    const result = await favoriteService.removeFavoriteByReference(
        req.user.userId,
        productId,
        quoteId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result ? "Removed from favorites" : "Favorite already removed",
        data: result,
    });
});

/**
 * ✅ Get favorite statistics
 * GET /api/v1/favorites/stats
 * 
 * Returns: { total: number, products: number, quotes: number }
 */
const getFavoriteStats = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to view favorite stats"
        );
    }

    const stats = await favoriteService.getFavoriteStats(req.user.userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Favorite stats fetched successfully",
        data: stats,
    });
});

/**
 * ✅ Batch add favorites
 * POST /api/v1/favorites/batch
 * 
 * Body: { items: [{ productId: 'xxx' }] or [{ quoteId: 'xxx' }] }
 */
const batchAddFavorites = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to add favorites"
        );
    }

    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "At least one item is required"
        );
    }

    const result = await favoriteService.batchAddFavorites(
        req.user.userId,
        items
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Favorites added successfully",
        data: result,
    });
});

/**
 * ✅ Check multiple favorites at once
 * POST /api/v1/favorites/check-batch
 * 
 * Body: { items: [{ productId: 'xxx' }] or [{ quoteId: 'xxx' }] }
 * 
 * Returns: Array of items with isFavorite status
 */
const checkMultipleFavorites = catchAsync(async (req, res) => {
    if (!req.user || !req.user.userId) {
        throw new AppError(
            httpStatus.UNAUTHORIZED,
            "Authentication required to check favorites"
        );
    }

    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "At least one item is required"
        );
    }

    const result = await favoriteService.checkMultipleFavorites(
        req.user.userId,
        items
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Favorite statuses fetched successfully",
        data: result,
    });
});

export default {
    addFavorite,
    getUserFavorites,
    removeFavorite,
    checkFavorite,
    getFavoriteById,
    removeFavoriteByReference,
    getFavoriteStats,
    batchAddFavorites,
    checkMultipleFavorites,
};