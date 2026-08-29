import QuoteAssignment from "./quoteAssignment.model.js";

/**
 * Create assignment
 */
const createAssignment = (payload) => {
  return QuoteAssignment.create(payload);
};

const QUOTE_POPULATE_FIELDS = "text category author description image theme allowReuse editorData renderedImages isActive";

/**
 * Get all assignments (admin use)
 */
const getAllAssignments = async ({
  page = 1,
  limit = 10,
  quote,
  tag,
  user,
  assignmentType,
  isActive,
}) => {
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  const filter = {};

  if (quote) {
    filter.quote = quote;
  }

  if (tag) {
    filter.tag = tag;
  }

  if (user) {
    filter.user = user;
  }

  if (assignmentType) {
    filter.assignmentType = assignmentType;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  const [data, total] = await Promise.all([
    QuoteAssignment.find(filter)
      .populate("quote", QUOTE_POPULATE_FIELDS)
      .populate("tag", "tagCode isActive isActivated")
      .populate("user", "name email role")
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),

    QuoteAssignment.countDocuments(filter),
  ]);

  return {
    meta: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPage: Math.ceil(total / parsedLimit),
    },
    data,
  };
};

/**
 * Find existing assignments for given quote and targets
 */
const findExistingAssignments = async (quoteId, assignmentType, targetIds) => {
  const filter = {
    quote: quoteId,
    assignmentType,
  };

  if (assignmentType === "tag") {
    filter.tag = { $in: targetIds };
  } else if (assignmentType === "user") {
    filter.user = { $in: targetIds };
  }

  return QuoteAssignment.find(filter);
};

/**
 * Bulk create assignments
 */
const bulkCreateAssignments = async (assignments) => {
  if (!assignments || assignments.length === 0) return [];
  return QuoteAssignment.insertMany(assignments);
};

/**
 * Bulk delete assignments by IDs
 */
const bulkDeleteAssignments = async (ids) => {
  if (!ids || ids.length === 0) return { deletedCount: 0 };
  return QuoteAssignment.deleteMany({ _id: { $in: ids } });
};

/**
 * Find assignment by ID
 */
const findById = (id) => {
  return QuoteAssignment.findById(id)
    .populate("quote", QUOTE_POPULATE_FIELDS)
    .populate("tag", "tagCode isActive isActivated")
    .populate("user", "name email role");
};

/**
 * Update assignment
 */
const updateAssignment = (id, payload) => {
  return QuoteAssignment.findByIdAndUpdate(id, payload, { new: true })
    .populate("quote", QUOTE_POPULATE_FIELDS)
    .populate("tag", "tagCode isActive isActivated")
    .populate("user", "name email role");
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
    .populate("quote", QUOTE_POPULATE_FIELDS)
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
    .populate("quote", QUOTE_POPULATE_FIELDS)
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
    .populate("quote", QUOTE_POPULATE_FIELDS)
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
    .populate("quote", QUOTE_POPULATE_FIELDS)
    .sort({ priority: -1, createdAt: -1 });
};

const getAssignmentsByTag = async (tagId) => {
  return QuoteAssignment.find({
    tag: tagId,
    assignmentType: "tag",
    isActive: true,
  })
    .populate("quote", QUOTE_POPULATE_FIELDS)
    .sort({ priority: -1, createdAt: -1 });
};

export default {
  createAssignment,
  bulkCreateAssignments,
  bulkDeleteAssignments,
  findExistingAssignments,
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