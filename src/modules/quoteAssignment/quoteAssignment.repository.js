import QuoteAssignment from "./quoteAssignment.model.js";

/**
 * Create assignment
 */
const createAssignment = (payload) => {
  return QuoteAssignment.create(payload);
};

/**
 * Get all assignments (admin use)
 */
const getAllAssignments = async ({
  page = 1,
  limit = 10,
  assignmentType,
  isActive,
}) => {
  const skip = (page - 1) * limit;

  const filter = {};

  if (assignmentType) {
    filter.assignmentType = assignmentType;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  const [data, total] = await Promise.all([
    QuoteAssignment.find(filter)
      .populate("quote", "text category author image theme allowReuse")
      .populate("tag", "tagCode")
      .populate("user", "name email")
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),

    QuoteAssignment.countDocuments(filter),
  ]);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit),
    },
    data,
  };
};

/**
 * Find assignment by ID
 */
const findById = (id) => {
  return QuoteAssignment.findById(id)
    .populate("quote", "text category author image theme allowReuse")
    .populate("tag", "tagCode")
    .populate("user", "name email");
};

/**
 * Update assignment
 */
const updateAssignment = (id, payload) => {
  return QuoteAssignment.findByIdAndUpdate(id, payload, { new: true })
    .populate("quote", "text category author image theme allowReuse")
    .populate("tag", "tagCode")
    .populate("user", "name email");
};

/**
 * Delete assignment
 */
const deleteAssignment = (id) => {
  return QuoteAssignment.findByIdAndDelete(id);
};

/**
 * Get active assignments by tag (IMPORTANT for scan)
 */
const getActiveAssignmentsByTag = async (tagId) => {
  return QuoteAssignment.find({
    tag: tagId,
    assignmentType: "tag",
    isActive: true,
  })
    .populate("quote", "text category author image theme allowReuse")
    .sort({ priority: -1, createdAt: -1 });
};

/**
 * Get active assignment for user
 */
const getActiveAssignmentsByUser = async (userId) => {
  return QuoteAssignment.find({
    user: userId,
    assignmentType: "user",
    isActive: true,
  })
    .populate("quote", "text category author image theme allowReuse")
    .sort({ priority: -1, createdAt: -1 });
};

/**
 * Get single highest priority assignment for tag
 */
const getTopAssignmentByTag = async (tagId) => {
  return QuoteAssignment.findOne({
    tag: tagId,
    assignmentType: "tag",
    isActive: true,
  })
    .populate("quote", "text category author image theme allowReuse")
    .sort({ priority: -1, createdAt: -1 });
};

/**
 * Get single highest priority assignment for user
 */
const getTopAssignmentByUser = async (userId) => {
  return QuoteAssignment.findOne({
    user: userId,
    assignmentType: "user",
    isActive: true,
  })
    .populate("quote", "text category author image theme allowReuse")
    .sort({ priority: -1, createdAt: -1 });
};

const getAssignmentsByTag = async (tagId) => {
  return QuoteAssignment.find({
    tag: tagId,
    assignmentType: "tag",
    isActive: true,
  })
    .populate("quote", "text category author image theme allowReuse")
    .sort({ priority: -1, createdAt: -1 });
};

export default {
  createAssignment,
  getAllAssignments,
  findById,
  updateAssignment,
  deleteAssignment,
  getActiveAssignmentsByTag,
  getActiveAssignmentsByUser,
  getTopAssignmentByTag,
  getTopAssignmentByUser,
    getAssignmentsByTag,
};