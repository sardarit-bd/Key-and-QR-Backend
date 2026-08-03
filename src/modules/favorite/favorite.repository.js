import Favorite from "./favorite.model.js";

/**
 * Create a favorite
 */
const createFavorite = (payload) => {
    return Favorite.create(payload);
};

/**
 * Find a single favorite by user and reference
 */
const findFavorite = (userId, productId = null, quoteId = null) => {
    const filter = {
        user: userId,
        isDeleted: false,
    };
    
    if (productId) filter.product = productId;
    if (quoteId) filter.quote = quoteId;
    
    return Favorite.findOne(filter);
};

/**
 * Get user favorites with filtering, sorting, and pagination
 */
const getUserFavorites = async (
    userId,
    options = {}
) => {
    const {
        page = 1,
        limit = 10,
        type = null,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search = '',
    } = options;

    const skip = (page - 1) * limit;

    // Build filter
    const filter = {
        user: userId,
        isDeleted: false,
    };

    // Filter by type — handle three cases:
    // 1. type field matches exactly
    // 2. type field doesn't exist (created before type field was added)
    // 3. type field is null/undefined (schema default not applied to old docs)
    if (type && ['product', 'quote'].includes(type)) {
        if (type === 'quote') {
            filter.$or = [
                { type: 'quote' },
                { type: { $exists: false }, quote: { $ne: null } },
            ];
        } else {
            filter.$or = [
                { type: 'product' },
                { type: { $exists: false }, product: { $ne: null } },
            ];
        }
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Determine populate fields
    let populateFields = '';
    if (type === 'product' || !type) {
        populateFields = 'product';
    }
    if (type === 'quote' || !type) {
        populateFields = populateFields ? `${populateFields} quote` : 'quote';
    }

    // Build query
    let query = Favorite.find(filter)
        .populate('product', 'name price image description')
        .populate('quote', 'text category author image theme')
        .sort(sort)
        .skip(skip)
        .limit(limit);

    // Search in populated fields (if needed)
    // Note: Search in populated fields requires additional handling
    // This is a simplified version

    const [data, total] = await Promise.all([
        query.lean(),
        Favorite.countDocuments(filter),
    ]);

    return {
        meta: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPage: Math.ceil(total / limit),
        },
        data,
    };
};

/**
 * Get favorite by ID (with ownership check)
 */
const getFavoriteById = (id, userId) => {
    return Favorite.findOne({
        _id: id,
        user: userId,
        isDeleted: false,
    })
    .populate('product', 'name price image')
    .populate('quote', 'text category author image');
};

/**
 * Delete favorite (hard delete for simplicity)
 */
const deleteFavorite = (id, userId) => {
    return Favorite.findOneAndDelete({
        _id: id,
        user: userId,
    });
};

/**
 * Soft delete favorite (keep for audit)
 */
const softDeleteFavorite = (id, userId) => {
    return Favorite.findOneAndUpdate(
        {
            _id: id,
            user: userId,
            isDeleted: false,
        },
        {
            isDeleted: true,
        },
        {
            new: true,
        }
    );
};

/**
 * Delete favorite by reference (product or quote)
 */
const deleteFavoriteByReference = (userId, productId = null, quoteId = null) => {
    const filter = {
        user: userId,
        isDeleted: false,
    };
    
    if (productId) filter.product = productId;
    if (quoteId) filter.quote = quoteId;
    
    return Favorite.findOneAndDelete(filter);
};

/**
 * Batch create favorites
 */
const batchCreateFavorites = async (userId, items) => {
    const favorites = items.map(item => ({
        user: userId,
        product: item.productId || null,
        quote: item.quoteId || null,
        type: item.productId ? 'product' : 'quote',
    }));

    return Favorite.insertMany(favorites, { ordered: false });
};

/**
 * Get favorite count by type
 */
const getFavoriteCountByType = async (userId, type = null) => {
    const filter = {
        user: userId,
        isDeleted: false,
    };
    
    if (type && ['product', 'quote'].includes(type)) {
        filter.type = type;
    }
    
    return Favorite.countDocuments(filter);
};

/**
 * Check if multiple items are favorited
 */
const checkMultipleFavorites = async (userId, items) => {
    const results = [];
    
    for (const item of items) {
        const filter = {
            user: userId,
            isDeleted: false,
        };
        
        if (item.productId) filter.product = item.productId;
        if (item.quoteId) filter.quote = item.quoteId;
        
        const favorite = await Favorite.findOne(filter);
        results.push({
            ...item,
            isFavorite: !!favorite,
            favoriteId: favorite?._id || null,
        });
    }
    
    return results;
};

/**
 * Get favorites for a batch of quote ids (single query — avoids N+1).
 * Returns a Map of quoteId → favoriteId for the given user.
 */
const getFavoritesByQuoteIds = async (userId, quoteIds) => {
    if (!quoteIds || quoteIds.length === 0) return new Map();

    const favorites = await Favorite.find({
        user: userId,
        isDeleted: false,
        quote: { $in: quoteIds },
    }).select("quote _id");

    const map = new Map();
    for (const fav of favorites) {
        map.set(fav.quote.toString(), fav._id.toString());
    }
    return map;
};

export default {
    createFavorite,
    findFavorite,
    getUserFavorites,
    getFavoriteById,
    deleteFavorite,
    softDeleteFavorite,
    deleteFavoriteByReference,
    batchCreateFavorites,
    getFavoriteCountByType,
    checkMultipleFavorites,
    getFavoritesByQuoteIds,
};