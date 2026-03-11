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

export default {
  createProduct,
  getProductById,
  getAllProducts,
  updateProduct,
  softDeleteProduct,
  restoreProduct,
  permanentDeleteProduct,
};