import Favorite from "../../models/favorite.model.js";


const createFavorite = (payload) => {
  return Favorite.create(payload);
};

const findFavorite = (userId, productId = null, quoteId = null) => {
  const filter = { user: userId };
  if (productId) filter.product = productId;
  if (quoteId) filter.quote = quoteId;
  return Favorite.findOne(filter);
};

const getUserFavorites = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  const [data, total] = await Promise.all([
    Favorite.find({ user: userId })
      .populate("product", "name price description image")
      .populate("quote", "text category author")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Favorite.countDocuments({ user: userId })
  ]);
  
  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit)
    },
    data
  };
};

const deleteFavorite = (id, userId) => {
  return Favorite.findOneAndDelete({ _id: id, user: userId });
};

const deleteFavoriteByProduct = (userId, productId) => {
  return Favorite.findOneAndDelete({ user: userId, product: productId });
};

const deleteFavoriteByQuote = (userId, quoteId) => {
  return Favorite.findOneAndDelete({ user: userId, quote: quoteId });
};

export default {
  createFavorite,
  findFavorite,
  getUserFavorites,
  deleteFavorite,
  deleteFavoriteByProduct,
  deleteFavoriteByQuote,
};