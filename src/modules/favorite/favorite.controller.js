import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import favoriteService from "./favorite.service.js";

// Add to favorites
const addFavorite = catchAsync(async (req, res) => {
    const { productId, quoteId } = req.body;
    const result = await favoriteService.addFavorite(req.user.userId, { productId, quoteId });

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Added to favorites",
        data: result,
    });
});

// Get user favorites
const getUserFavorites = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await favoriteService.getUserFavorites(req.user.userId, page, limit);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Favorites fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// Remove from favorites
const removeFavorite = catchAsync(async (req, res) => {
    await favoriteService.removeFavorite(req.params.id, req.user.userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Removed from favorites",
        data: null,
    });
});

// Check if product is in favorites
const checkFavorite = catchAsync(async (req, res) => {
    const { productId, quoteId } = req.query;
    const result = await favoriteService.isFavoriteWithId(req.user.userId, productId, quoteId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        data: {
            isFavorite: result.exists,
            favoriteId: result.favoriteId
        },
    });
});

export default {
    addFavorite,
    getUserFavorites,
    removeFavorite,
    checkFavorite,
};