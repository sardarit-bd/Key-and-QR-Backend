import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import productCategoryRepository from "./productCategory.repository.js";

const generateSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};

const createProductCategory = async (payload) => {
  const existingByName = await productCategoryRepository.findByName(payload.name);
  if (existingByName) {
    throw new AppError(httpStatus.CONFLICT, "A product category with this name already exists");
  }

  let slug = payload.slug ? generateSlug(payload.slug) : generateSlug(payload.name);

  const existingBySlug = await productCategoryRepository.findBySlug(slug);
  if (existingBySlug) {
    slug = `${slug}-${Date.now()}`;
  }

  const categoryData = {
    ...payload,
    slug,
  };

  return productCategoryRepository.createProductCategory(categoryData);
};

const getAllProductCategories = async (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;
  const search = query.search || "";
  const includeInactive = String(query.includeInactive).toLowerCase() === "true";
  let isActive = undefined;

  if (query.isActive !== undefined && query.isActive !== "all" && query.isActive !== "") {
    isActive = String(query.isActive).toLowerCase() === "true";
  }

  return productCategoryRepository.getAllProductCategories({
    page,
    limit,
    search,
    isActive,
    includeInactive,
  });
};

const getProductCategoryById = async (id) => {
  const category = await productCategoryRepository.findById(id);
  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Product category not found");
  }
  return category;
};

const getProductCategoryBySlug = async (slug) => {
  const category = await productCategoryRepository.findBySlug(slug);
  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Product category not found");
  }
  return category;
};

const updateProductCategory = async (id, payload) => {
  const existing = await productCategoryRepository.findById(id);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Product category not found");
  }

  if (payload.name && payload.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateName = await productCategoryRepository.findByName(payload.name);
    if (duplicateName && duplicateName._id.toString() !== id) {
      throw new AppError(httpStatus.CONFLICT, "A product category with this name already exists");
    }
  }

  if (payload.slug) {
    payload.slug = generateSlug(payload.slug);
    const duplicateSlug = await productCategoryRepository.findBySlug(payload.slug);
    if (duplicateSlug && duplicateSlug._id.toString() !== id) {
      throw new AppError(httpStatus.CONFLICT, "A product category with this slug already exists");
    }
  } else if (payload.name && payload.name !== existing.name) {
    let newSlug = generateSlug(payload.name);
    const duplicateSlug = await productCategoryRepository.findBySlug(newSlug);
    if (duplicateSlug && duplicateSlug._id.toString() !== id) {
      newSlug = `${newSlug}-${Date.now()}`;
    }
    payload.slug = newSlug;
  }

  return productCategoryRepository.updateProductCategory(id, payload);
};

const deleteProductCategory = async (id) => {
  const existing = await productCategoryRepository.findById(id);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Product category not found");
  }

  const productsCount = await productCategoryRepository.countProductsByCategoryId(id);
  if (productsCount > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot delete category "${existing.name}". There are ${productsCount} products assigned to it.`
    );
  }

  return productCategoryRepository.deleteProductCategory(id);
};

const toggleProductCategoryActive = async (id) => {
  const result = await productCategoryRepository.toggleActive(id);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Product category not found");
  }
  return result;
};

const reorderProductCategories = async (orderedIds) => {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "Ordered IDs array is required");
  }
  return productCategoryRepository.reorderProductCategories(orderedIds);
};

export default {
  createProductCategory,
  getAllProductCategories,
  getProductCategoryById,
  getProductCategoryBySlug,
  updateProductCategory,
  deleteProductCategory,
  toggleProductCategoryActive,
  reorderProductCategories,
};
