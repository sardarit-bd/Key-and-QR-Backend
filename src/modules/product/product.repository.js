import Product from "../../models/product.model.js";

const createProduct = async (payload) => {
  return Product.create(payload);
};

const getAllProducts = async () => {
  return Product.find({ isActive: true });
};

const getProductById = async (id) => {
  return Product.findById(id);
};

const updateProduct = async (id, payload) => {
  return Product.findByIdAndUpdate(id, payload, { new: true });
};

const deleteProduct = async (id) => {
  return Product.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );
};

export default {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};