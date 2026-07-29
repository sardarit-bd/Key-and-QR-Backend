import Product from "../../models/product.model.js";

const createProduct = async (payload) => {
  return Product.create(payload);
};

const getProductById = async (id) => {
  return Product.findById(id);
};

const getAllProducts = async ({
  search,
  page = 1,
  limit = 10,
  isActive = true,
}) => {
  const skip = (page - 1) * limit;

  const filter = { isActive };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
      { brand: { $regex: search, $options: "i" } },
    ];
  }

  const [data, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data,
  };
};

const updateProduct = async (id, payload) => {
  return Product.findByIdAndUpdate(id, payload, { new: true });
};

const softDeleteProduct = async (id) => {
  return Product.findByIdAndUpdate(
    id,
    {
      isActive: false,
      deletedAt: new Date(),
    },
    { new: true }
  );
};

const restoreProduct = async (id) => {
  return Product.findByIdAndUpdate(
    id,
    {
      isActive: true,
      deletedAt: null,
    },
    { new: true }
  );
};

const permanentDeleteProduct = async (id) => {
  return Product.findByIdAndDelete(id);
};

const getCategories = async () => {
  return Product.distinct("category", { isActive: true });
};

const searchProducts = async ({ q, page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;

  const filter = {
    isActive: true,
    $or: [
      { name: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { brand: { $regex: q, $options: "i" } },
    ],
  };

  const [data, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data,
  };
};

const getRelatedProducts = async (productId, limit = 4) => {
  const product = await Product.findById(productId);
  if (!product) return [];

  return Product.find({
    _id: { $ne: productId },
    category: product.category,
    isActive: true,
  }).limit(limit);
};

const countProducts = async (filter = {}) => {
  return Product.countDocuments(filter);
};

const decreaseStock = async (id, quantity) => {
  return Product.findOneAndUpdate(
    { _id: id, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { new: true }
  );
};

const increaseStock = async (id, quantity) => {
  return Product.findByIdAndUpdate(
    id,
    { $inc: { stock: quantity } },
    { new: true }
  );
};

export default {
  createProduct,
  getProductById,
  getAllProducts,
  getCategories,
  searchProducts,
  getRelatedProducts,
  updateProduct,
  softDeleteProduct,
  restoreProduct,
  permanentDeleteProduct,
  decreaseStock,
  increaseStock,
  countProducts,
};