import Category from "./category.model.js";
import Quote from "../quote/quote.model.js";

const createCategory = (payload) => {
  return Category.create(payload);
};

const findById = (id) => {
  return Category.findById(id);
};

const findBySlug = (slug) => {
  return Category.findOne({ slug });
};

const findByName = (name) => {
  return Category.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
};

const getAllCategories = async ({
  page = 1,
  limit = 10,
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

  const [data, total, quoteCounts] = await Promise.all([
    Category.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).lean(),
    Category.countDocuments(filter),
    Quote.aggregate([
      {
        $group: {
          _id: { $toLower: { $toString: "$category" } },
          count: { $sum: 1 },
        },
      },
    ]).catch(() => []),
  ]);

  const countMap = {};
  if (Array.isArray(quoteCounts)) {
    for (const item of quoteCounts) {
      if (item._id) {
        countMap[item._id] = item.count;
      }
    }
  }

  const enhancedData = data.map((cat) => {
    const slugKey = (cat.slug || "").toLowerCase();
    const nameKey = (cat.name || "").toLowerCase();
    const idKey = (cat._id || "").toString().toLowerCase();
    const count = countMap[slugKey] ?? countMap[nameKey] ?? countMap[idKey] ?? 0;
    return {
      ...cat,
      quoteCount: count,
      quotesCount: count,
    };
  });

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: enhancedData,
  };
};

const updateCategory = (id, payload) => {
  return Category.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
};

const deleteCategory = (id) => {
  return Category.findByIdAndDelete(id);
};

const toggleActive = async (id) => {
  const category = await Category.findById(id);
  if (!category) return null;

  return Category.findByIdAndUpdate(
    id,
    { isActive: !category.isActive },
    { new: true, runValidators: true }
  );
};

const reorderCategories = async (orderedIds) => {
  const operations = orderedIds.map((categoryId, index) => ({
    updateOne: {
      filter: { _id: categoryId },
      update: { $set: { sortOrder: index } },
    },
  }));

  await Category.bulkWrite(operations);
  return Category.find({ _id: { $in: orderedIds } }).sort({ sortOrder: 1 });
};

export default {
  createCategory,
  findById,
  findBySlug,
  findByName,
  getAllCategories,
  updateCategory,
  deleteCategory,
  toggleActive,
  reorderCategories,
};
