import ProductCategory from "./productCategory.model.js";
import Product from "../../models/product.model.js";

const createProductCategory = (payload) => {
  return ProductCategory.create(payload);
};

const findById = (id) => {
  return ProductCategory.findById(id);
};

const findBySlug = (slug) => {
  return ProductCategory.findOne({ slug });
};

const findByName = (name) => {
  return ProductCategory.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
};

const getAllProductCategories = async ({
  page = 1,
  limit = 100,
  search = "",
  isActive,
  includeInactive = false,
}) => {
  const skip = (page - 1) * limit;
  const filter = {};

  if (!includeInactive && isActive === undefined) {
    filter.isActive = true;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  if (search) {
    const searchRegex = { $regex: search, $options: "i" };
    filter.$or = [
      { name: searchRegex },
      { slug: searchRegex },
      { description: searchRegex },
    ];
  }

  const [categories, total, totalProductsCount] = await Promise.all([
    ProductCategory.aggregate([
      { $match: filter },
      { $sort: { sortOrder: 1, name: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "products",
          let: { catId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$categoryId", "$$catId"] },
                    { $ne: ["$isActive", false] },
                  ],
                },
              },
            },
          ],
          as: "productsData",
        },
      },
      {
        $addFields: {
          productsCount: { $size: "$productsData" },
          productCount: { $size: "$productsData" },
        },
      },
      {
        $project: {
          productsData: 0,
        },
      },
    ]),
    ProductCategory.countDocuments(filter),
    Product.countDocuments({ isActive: true }),
  ]);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit),
      totalProducts: totalProductsCount || 0,
    },
    data: categories,
  };
};

const updateProductCategory = (id, payload) => {
  return ProductCategory.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
};

const deleteProductCategory = (id) => {
  return ProductCategory.findByIdAndDelete(id);
};

const countProductsByCategoryId = (categoryId) => {
  return Product.countDocuments({ categoryId, deletedAt: null });
};

const toggleActive = async (id) => {
  const category = await ProductCategory.findById(id);
  if (!category) return null;

  return ProductCategory.findByIdAndUpdate(
    id,
    { isActive: !category.isActive },
    { new: true, runValidators: true }
  );
};

const reorderProductCategories = async (orderedIds) => {
  const operations = orderedIds.map((categoryId, index) => ({
    updateOne: {
      filter: { _id: categoryId },
      update: { $set: { sortOrder: index } },
    },
  }));

  await ProductCategory.bulkWrite(operations);
  return ProductCategory.find({ _id: { $in: orderedIds } }).sort({ sortOrder: 1 });
};

export default {
  createProductCategory,
  findById,
  findBySlug,
  findByName,
  getAllProductCategories,
  updateProductCategory,
  deleteProductCategory,
  countProductsByCategoryId,
  toggleActive,
  reorderProductCategories,
};
