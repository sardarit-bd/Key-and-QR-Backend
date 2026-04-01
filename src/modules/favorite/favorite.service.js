import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import favoriteRepository from "./favorite.repository.js";
import productRepository from "../product/product.repository.js";
import quoteRepository from "../quote/quote.repository.js";

const addFavorite = async (userId, { productId, quoteId }) => {
    let existing = null;

    if (productId) {
        existing = await favoriteRepository.findFavorite(userId, productId, null);
    } else if (quoteId) {
        existing = await favoriteRepository.findFavorite(userId, null, quoteId);
    }

    console.log("Checking for duplicate:", { userId, productId, quoteId });
    console.log("Existing found:", existing);

    if (existing) {
        throw new AppError(httpStatus.CONFLICT, "Item already in favorites");
    }

    // validate
    if (productId) {
        const product = await productRepository.getProductById(productId);
        if (!product) {
            throw new AppError(httpStatus.NOT_FOUND, "Product not found");
        }
    }

    if (quoteId) {
        const quote = await quoteRepository.findById(quoteId);
        if (!quote) {
            throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
        }
    }

    const newFavorite = await favoriteRepository.createFavorite({
        user: userId,
        product: productId || null,
        quote: quoteId || null,
    });

    console.log("New favorite created:", newFavorite);

    return newFavorite;
};

const getUserFavorites = async (userId, page, limit) => {
    return favoriteRepository.getUserFavorites(userId, page, limit);
};

const removeFavorite = async (favoriteId, userId) => {
    const favorite = await favoriteRepository.deleteFavorite(favoriteId, userId);
    if (!favorite) {
        throw new AppError(httpStatus.NOT_FOUND, "Favorite not found");
    }
    return favorite;
};

const removeFavoriteByProduct = async (userId, productId) => {
    const favorite = await favoriteRepository.deleteFavoriteByProduct(userId, productId);
    if (!favorite) {
        throw new AppError(httpStatus.NOT_FOUND, "Favorite not found");
    }
    return favorite;
};

const removeFavoriteByQuote = async (userId, quoteId) => {
    const favorite = await favoriteRepository.deleteFavoriteByQuote(userId, quoteId);
    if (!favorite) {
        throw new AppError(httpStatus.NOT_FOUND, "Favorite not found");
    }
    return favorite;
};

const isFavorite = async (userId, productId = null, quoteId = null) => {
    const favorite = await favoriteRepository.findFavorite(userId, productId, quoteId);
    return !!favorite;
};

const isFavoriteWithId = async (userId, productId = null, quoteId = null) => {
    const favorite = await favoriteRepository.findFavorite(userId, productId, quoteId);
    return {
        exists: !!favorite,
        favoriteId: favorite?._id || null
    };
};

export default {
    addFavorite,
    getUserFavorites,
    removeFavorite,
    removeFavoriteByProduct,
    removeFavoriteByQuote,
    isFavorite,
    isFavoriteWithId,
};