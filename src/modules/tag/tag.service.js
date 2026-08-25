import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "./tag.repository.js";
import logger from "../../utils/logger.js";
import Tag from "./tag.model.js";

// ================================
// EXISTING FUNCTIONS
// ================================

const createTag = async (payload) => {
  // Validate tag code format
  if (!payload.tagCode || payload.tagCode.length < 3) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Tag code must be at least 3 characters"
    );
  }

  const existing = await tagRepository.findByTagCode(payload.tagCode);
  if (existing) {
    throw new AppError(httpStatus.CONFLICT, "Tag code already exists");
  }

  return tagRepository.createTag({
    ...payload,
    owner: null,
    isActivated: false,
    isActive: true,
  });
};

const getAllTags = async (query) => {
  return tagRepository.getAllTags(query);
};

const getTagByCode = async (tagCode) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  return tag;
};

const updateTag = async (id, payload) => {
  const tag = await tagRepository.findById(id);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  return tagRepository.updateTag(id, payload);
};

const deleteTag = async (id) => {
  const tag = await tagRepository.findById(id);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  // Guardrail: Assigned or activated tags cannot be hard-deleted to preserve relational integrity
  if (tag.isActivated || tag.owner || tag.assignedOrderId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Assigned or activated tags cannot be deleted. You can disable them instead."
    );
  }

  const isAssigned = await tagRepository.isTagAssignedToActiveOrder(tag._id);
  if (isAssigned) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This tag is linked to an active order and cannot be deleted. You can disable it instead."
    );
  }

  return tagRepository.deleteTagById(id);
};

const activateTag = async (tagCode, userId) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  if (!tag.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
  }

  if (tag.isActivated) {
    throw new AppError(httpStatus.CONFLICT, "Tag already activated");
  }

  return tagRepository.updateTag(tag._id, {
    owner: userId,
    isActivated: true,
    activatedAt: new Date(),
  });
};

const getUnusedTag = async () => {
  const tag = await tagRepository.findUnusedTagStrict();

  if (!tag) {
    return null;
  }

  return tag;
};

const setPersonalMessage = async (tagCode, userId, message) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  // Check if user owns the tag
  if (!tag.owner || tag.owner.toString() !== userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You don't own this tag");
  }

  // Validate message length
  if (message && message.length > 500) {
    throw new AppError(httpStatus.BAD_REQUEST, "Personal message cannot exceed 500 characters");
  }

  const updated = await tagRepository.updateTag(tag._id, {
    personalMessage: message || null,
  });

  return {
    personalMessage: updated.personalMessage,
    tagCode: updated.tagCode,
  };
};

const getPersonalMessage = async (tagCode) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  return {
    hasPersonalMessage: !!tag.personalMessage,
    personalMessage: tag.personalMessage,
    tagCode: tag.tagCode,
  };
};

const getMyTags = async (userId) => {
  return tagRepository.findTagsByOwner(userId);
};

// ================================
// NEW FUNCTIONS FROM IMPROVEMENTS
// ================================

/**
 * GENERATE TAG CODES
 * Helper for bulk tag generation
 */
const generateTagCodes = (prefix = "TAG", count = 1) => {
  const codes = [];
  const timestamp = Date.now().toString(36).toUpperCase();
  
  for (let i = 0; i < count; i++) {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sequential = String(i + 1).padStart(4, '0');
    codes.push(`${prefix}-${timestamp}-${sequential}`);
  }
  
  return codes;
};

/**
 * BULK CREATE TAGS - Admin Feature
 */
const bulkCreateTags = async (count, prefix = "TAG") => {
  if (count < 1 || count > 10000) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Count must be between 1 and 10,000"
    );
  }

  // Generate unique tag codes
  const tagCodes = generateTagCodes(prefix, count);
  
  // Check for existing tags
  const existingTags = await tagRepository.getAllTags({ 
    search: prefix,
    limit: 10000 
  });
  
  const existingCodes = new Set(existingTags.data.map(t => t.tagCode));
  const newCodes = tagCodes.filter(code => !existingCodes.has(code));

  if (newCodes.length === 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "All generated tag codes already exist. Try a different prefix."
    );
  }

  // Create tags in batches
  const result = await tagRepository.bulkCreateTags(newCodes);
  
  logger.info(`✅ Bulk created ${result.total} tags (${result.failed.length} failed)`);
  
  return {
    total: result.total,
    created: result.success.length,
    failed: result.failed,
    warning: result.failed.length > 0 ? "Some tags failed to create (duplicates)" : null,
  };
};

/**
 * GET TAG INVENTORY STATUS
 * For admin dashboard
 */
const getTagInventoryStatus = async () => {
  const status = await tagRepository.getTagAvailabilityStatus();
  
  return {
    ...status,
    alerts: {
      lowInventory: status.lowInventory,
      criticalInventory: status.criticalInventory,
      recommendedAction: status.criticalInventory 
        ? "⚠️ CRITICAL: Generate more tags immediately!"
        : status.lowInventory 
          ? "⚠️ Low inventory: Consider generating more tags"
          : "✅ Inventory is healthy",
    },
  };
};

/**
 * GET UNASSIGNED TAG COUNT
 * Quick check for order processing
 */
const getUnassignedTagCount = async () => {
  return tagRepository.countUnassignedTags();
};

/**
 * CHECK TAG AVAILABILITY FOR ORDER
 * Validate if enough tags exist for an order
 */
const checkTagAvailabilityForOrder = async (requiredQuantity) => {
  const available = await tagRepository.countUnassignedTags();
  return {
    available,
    required: requiredQuantity,
    sufficient: available >= requiredQuantity,
    shortage: Math.max(0, requiredQuantity - available),
  };
};

/**
 * GET TAG LIFECYCLE STATS
 * Track tag usage patterns
 */
const getTagLifecycleStats = async () => {
  const stats = await Tag.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        activated: { $sum: { $cond: ["$isActivated", 1, 0] } },
        withPersonalMessage: { 
          $sum: { 
            $cond: [
              { $and: [
                { $ne: ["$personalMessage", null] },
                { $ne: ["$personalMessage", ""] }
              ]},
              1,
              0
            ]
          }
        },
        active: { $sum: { $cond: ["$isActive", 1, 0] } },
        withOwner: { $sum: { $cond: [{ $ne: ["$owner", null] }, 1, 0] } },
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    activated: 0,
    withPersonalMessage: 0,
    active: 0,
    withOwner: 0,
  };
};

// ================================
// EXPORTS
// ================================

export default {
  // Existing functions
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  deleteTag,
  activateTag,
  getUnusedTag,
  setPersonalMessage,
  getPersonalMessage,
  getMyTags,
  
  // NEW FUNCTIONS
  bulkCreateTags,
  getTagInventoryStatus,
  getUnassignedTagCount,
  checkTagAvailabilityForOrder,
  getTagLifecycleStats,
  generateTagCodes,
};