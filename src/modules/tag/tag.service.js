import crypto from "crypto";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "./tag.repository.js";
import logger from "../../utils/logger.js";
import Tag from "./tag.model.js";

import User from "../../models/user.model.js";

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

  if (tag.owner && tag.owner.toString() !== userId.toString()) {
    throw new AppError(httpStatus.BAD_REQUEST, "This tag is already claimed by another account");
  }

  if (!tag.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
  }

  if (tag.isActivated) {
    throw new AppError(httpStatus.CONFLICT, "Tag already activated");
  }

  const user = await User.findById(userId).lean();
  const isSubscriber = Boolean(user?.isPremium || user?.subscriptionTier === "subscriber");

  return tagRepository.updateTag(tag._id, {
    owner: userId,
    isActivated: true,
    activatedAt: new Date(),
    ...(isSubscriber ? { subscriptionType: "subscriber" } : {}),
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
 * SEC-04 Cryptographically Secure Crockford Base32 Alphabet
 * 32 characters (2^5 = 32), excluding visually ambiguous characters (0, 1, I, O, L).
 * Exactly 32 characters ensures 256 % 32 = 0 (ZERO modulo bias across byte values 0..255).
 */
const CROCKFORD_BASE32_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * GENERATE SINGLE SECURE TAG CODE
 * Generates 20 random Crockford Base32 characters formatted into 4 groups of 5:
 * Total entropy: 20 characters * 5 bits/character = 100 bits of pure cryptographic entropy (>= 96 bits).
 * Zero modulo bias: 256 % 32 = 0.
 */
const generateSecureTagCode = (cleanPrefix = "TAG") => {
  const randomBytes = crypto.randomBytes(20);
  let chars = "";
  for (let i = 0; i < 20; i++) {
    chars += CROCKFORD_BASE32_ALPHABET[randomBytes[i] % 32];
  }
  return `${cleanPrefix}-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}`;
};

/**
 * GENERATE TAG CODES
 * Helper for bulk tag generation using cryptographically secure random bytes
 */
const generateTagCodes = (prefix = "TAG", count = 1) => {
  const cleanPrefix = (prefix || "TAG").trim().toUpperCase();
  const codeSet = new Set();
  const maxAttempts = count * 10;
  let attempts = 0;

  while (codeSet.size < count && attempts < maxAttempts) {
    attempts++;
    const code = generateSecureTagCode(cleanPrefix);
    codeSet.add(code);
  }

  if (codeSet.size < count) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to generate sufficient unique tag codes"
    );
  }

  return Array.from(codeSet);
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

  const cleanPrefix = (prefix || "TAG").trim().toUpperCase();
  const uniqueCodes = new Set();
  const MAX_RETRY_ROUNDS = 5;
  let rounds = 0;

  // Bounded collision regeneration loop against existing database records
  while (uniqueCodes.size < count && rounds < MAX_RETRY_ROUNDS) {
    rounds++;
    const needed = count - uniqueCodes.size;
    const candidates = generateTagCodes(cleanPrefix, needed);

    // Check which candidate codes already exist in the database
    const existing = await Tag.find({ tagCode: { $in: candidates } }).select("tagCode").lean();
    const existingCodeSet = new Set(existing.map((t) => t.tagCode));

    for (const code of candidates) {
      if (!existingCodeSet.has(code)) {
        uniqueCodes.add(code);
        if (uniqueCodes.size === count) break;
      }
    }
  }

  if (uniqueCodes.size === 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "All generated tag codes already exist. Try a different prefix."
    );
  }

  const newCodes = Array.from(uniqueCodes);

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