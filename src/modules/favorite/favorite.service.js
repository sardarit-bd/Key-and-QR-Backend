import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import favoriteRepository from "./favorite.repository.js";
import productRepository from "../product/product.repository.js";
import quoteRepository from "../quote/quote.repository.js";

/**
 * Add a favorite (Product or Quote)
 * 
 * Flow:
 * 1. Validate input (productId or quoteId)
 * 2. Check if item exists
 * 3. Check if already favorited
 * 4. Create favorite
 */
const addFavorite = async (userId, { productId, quoteId }) => {
    // Validate: Must have either product or quote
    if (!productId && !quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Either productId or quoteId is required"
        );
    }

    // Validate: Cannot have both
    if (productId && quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Cannot favorite both product and quote at the same time"
        );
    }

    // Check if already favorited
    const existing = await favoriteRepository.findFavorite(
        userId,
        productId,
        quoteId
    );

    if (existing) {
        throw new AppError(
            httpStatus.CONFLICT,
            "Item is already in favorites"
        );
    }

    // Validate existence
    let itemName = '';
    if (productId) {
        const product = await productRepository.getProductById(productId);
        if (!product) {
            throw new AppError(httpStatus.NOT_FOUND, "Product not found");
        }
        itemName = product.name;
    }

    if (quoteId) {
        const quote = await quoteRepository.findById(quoteId);
        if (!quote) {
            throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
        }
        itemName = quote.text.substring(0, 50);
    }

    // Create favorite
    const favorite = await favoriteRepository.createFavorite({
        user: userId,
        product: productId || null,
        quote: quoteId || null,
        type: productId ? 'product' : 'quote',
    });

    // Populate for response
    const populatedFavorite = await favoriteRepository.getFavoriteById(
        favorite._id,
        userId
    );

    // Log activity for dashboard
    try {
        await activityService.logActivity({
            userId,
            type: 'favorite_added',
            targetType: productId ? 'product' : 'quote',
            targetId: productId || quoteId,
            description: `Added "${itemName}" to favorites`,
            metadata: {
                favoriteId: favorite._id,
                productId: productId || null,
                quoteId: quoteId || null,
            },
        });
    } catch (error) {
        // Non-blocking: Don't fail if activity logging fails
        console.error('Failed to log favorite activity:', error);
    }

    return populatedFavorite;
};

/**
 * Get user favorites with pagination and filtering
 */
const getUserFavorites = async (userId, options = {}) => {
    const {
        page = 1,
        limit = 10,
        type = null,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search = '',
    } = options;

    return favoriteRepository.getUserFavorites(userId, {
        page,
        limit,
        type,
        sortBy,
        sortOrder,
        search,
    });
};

/**
 * Remove a favorite (hard delete)
 */
const removeFavorite = async (favoriteId, userId) => {
    // Get favorite before deletion for activity logging
    const favorite = await favoriteRepository.getFavoriteById(favoriteId, userId);

    if (!favorite) {
        // Idempotent: Return null if already removed
        return null;
    }

    // Delete
    const deleted = await favoriteRepository.deleteFavorite(favoriteId, userId);

    if (!deleted) {
        return null;
    }

    // Log activity
    try {
        const itemName = favorite.product?.name ||
            (favorite.quote?.text || '').substring(0, 50) ||
            'Favorite';

        await activityService.logActivity({
            userId,
            type: 'favorite_removed',
            targetType: favorite.type || 'unknown',
            targetId: favorite.product?._id || favorite.quote?._id || favoriteId,
            description: `Removed "${itemName}" from favorites`,
            metadata: {
                favoriteId: favorite._id,
                productId: favorite.product?._id || null,
                quoteId: favorite.quote?._id || null,
            },
        });
    } catch (error) {
        // Non-blocking
        console.error('Failed to log favorite removal activity:', error);
    }

    return deleted;
};

/**
 * Remove favorite by reference (product or quote)
 */
const removeFavoriteByReference = async (userId, productId = null, quoteId = null) => {
    if (!productId && !quoteId) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Either productId or quoteId is required"
        );
    }

    // Get favorite before deletion
    const favorite = await favoriteRepository.findFavorite(
        userId,
        productId,
        quoteId
    );

    if (!favorite) {
        // Idempotent
        return null;
    }

    // Delete
    const deleted = await favoriteRepository.deleteFavoriteByReference(
        userId,
        productId,
        quoteId
    );

    if (!deleted) {
        return null;
    }

    // Log activity (similar to above)
    try {
        const itemName = deleted.product?.name ||
            (deleted.quote?.text || '').substring(0, 50) ||
            'Favorite';

        await activityService.logActivity({
            userId,
            type: 'favorite_removed',
            targetType: deleted.type || 'unknown',
            targetId: deleted.product?._id || deleted.quote?._id || deleted._id,
            description: `Removed "${itemName}" from favorites`,
            metadata: {
                favoriteId: deleted._id,
                productId: deleted.product?._id || null,
                quoteId: deleted.quote?._id || null,
            },
        });
    } catch (error) {
        console.error('Failed to log favorite removal activity:', error);
    }

    return deleted;
};

/**
 * Check if item is favorited
 */
const isFavorite = async (userId, productId = null, quoteId = null) => {
    if (!productId && !quoteId) {
        return { exists: false, favoriteId: null };
    }

    const favorite = await favoriteRepository.findFavorite(
        userId,
        productId,
        quoteId
    );

    return {
        exists: !!favorite,
        favoriteId: favorite?._id || null,
    };
};

/**
 * Get favorite by ID with ownership validation
 */
const getFavoriteById = async (favoriteId, userId) => {
    const favorite = await favoriteRepository.getFavoriteById(favoriteId, userId);
    if (!favorite) {
        throw new AppError(httpStatus.NOT_FOUND, "Favorite not found");
    }
    return favorite;
};

/**
 * Batch add favorites
 */
const batchAddFavorites = async (userId, items) => {
    if (!items || items.length === 0) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "At least one item is required"
        );
    }

    // Validate each item
    const validatedItems = [];
    for (const item of items) {
        if (item.productId) {
            const product = await productRepository.getProductById(item.productId);
            if (!product) {
                throw new AppError(
                    httpStatus.NOT_FOUND,
                    `Product ${item.productId} not found`
                );
            }
            validatedItems.push({
                productId: item.productId,
                quoteId: null,
            });
        } else if (item.quoteId) {
            const quote = await quoteRepository.findById(item.quoteId);
            if (!quote) {
                throw new AppError(
                    httpStatus.NOT_FOUND,
                    `Quote ${item.quoteId} not found`
                );
            }
            validatedItems.push({
                productId: null,
                quoteId: item.quoteId,
            });
        } else {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                "Each item must have productId or quoteId"
            );
        }
    }

    // Create favorites
    return favoriteRepository.batchCreateFavorites(userId, validatedItems);
};

/**
 * Get favorite statistics for user
 */
const getFavoriteStats = async (userId) => {
    const [productCount, quoteCount] = await Promise.all([
        favoriteRepository.getFavoriteCountByType(userId, 'product'),
        favoriteRepository.getFavoriteCountByType(userId, 'quote'),
    ]);

    return {
        total: productCount + quoteCount,
        products: productCount,
        quotes: quoteCount,
    };
};

/**
 * Check multiple favorites at once
 */
const checkMultipleFavorites = async (userId, items) => {
    return favoriteRepository.checkMultipleFavorites(userId, items);
};

export default {
    addFavorite,
    getUserFavorites,
    removeFavorite,
    removeFavoriteByReference,
    isFavorite,
    getFavoriteById,
    batchAddFavorites,
    getFavoriteStats,
    checkMultipleFavorites,
};