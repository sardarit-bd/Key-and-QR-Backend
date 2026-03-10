import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import productRepository from "./product.repository.js";

const createProduct = async (payload) => {
  return productRepository.createProduct(payload);
};

const getAllProducts = async () => {
  return productRepository.getAllProducts();
};

const getProductById = async (id) => {
  const product = await productRepository.getProductById(id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  return product;
};

const updateProduct = async (id, payload) => {
  const product = await productRepository.updateProduct(id, payload);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  return product;
};

const deleteProduct = async (id) => {
  const product = await productRepository.deleteProduct(id);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  return product;
};

export default {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};