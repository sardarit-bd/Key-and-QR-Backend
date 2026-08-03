import AppError from "../../utils/AppError.js";
import httpStatus from "../../constants/httpStatus.js";
import categoryRepository from "./category.repository.js";

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const createCategory = async (payload) => {
  const slug = payload.slug || slugify(payload.name);

  const slugExists = await categoryRepository.findBySlug(slug);
  if (slugExists) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Category slug already exists",
      "CATEGORY_SLUG_EXISTS"
    );
  }

  const nameExists = await categoryRepository.findByName(payload.name);
  if (nameExists) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Category name already exists",
      "CATEGORY_NAME_EXISTS"
    );
  }

  return categoryRepository.createCategory({ ...payload, slug });
};

const getAllCategories = async (query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 100;
  const search = query.search || "";
  const isActive =
    query.isActive !== undefined && query.isActive !== ""
      ? query.isActive === "true"
      : undefined;
  const includeInactive = query.includeInactive === "true";

  return categoryRepository.getAllCategories({
    page,
    limit,
    search,
    isActive,
    includeInactive,
  });
};

const getCategoryById = async (id) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found", "CATEGORY_NOT_FOUND");
  }

  return category;
};

const getCategoryBySlug = async (slug) => {
  const category = await categoryRepository.findBySlug(slug);

  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found", "CATEGORY_NOT_FOUND");
  }

  return category;
};

const updateCategory = async (id, payload) => {
  const existing = await categoryRepository.findById(id);

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found", "CATEGORY_NOT_FOUND");
  }

  const data = { ...payload };

  if (payload.slug) {
    data.slug = payload.slug;
  } else if (payload.name && payload.name !== existing.name) {
    data.slug = slugify(payload.name);
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await categoryRepository.findBySlug(data.slug);
    if (slugExists && slugExists._id.toString() !== id) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Category slug already exists",
        "CATEGORY_SLUG_EXISTS"
      );
    }
  }

  if (payload.name && payload.name.toLowerCase() !== existing.name.toLowerCase()) {
    const nameExists = await categoryRepository.findByName(payload.name);
    if (nameExists && nameExists._id.toString() !== id) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Category name already exists",
        "CATEGORY_NAME_EXISTS"
      );
    }
  }

  return categoryRepository.updateCategory(id, data);
};

const deleteCategory = async (id) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found", "CATEGORY_NOT_FOUND");
  }

  return categoryRepository.deleteCategory(id);
};

const toggleCategoryActive = async (id) => {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new AppError(httpStatus.NOT_FOUND, "Category not found", "CATEGORY_NOT_FOUND");
  }

  return categoryRepository.toggleActive(id);
};

const reorderCategories = async (orderedIds) => {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "Ordered category IDs are required", "INVALID_ORDER");
  }

  return categoryRepository.reorderCategories(orderedIds);
};

export default {
  createCategory,
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  updateCategory,
  deleteCategory,
  toggleCategoryActive,
  reorderCategories,
};
