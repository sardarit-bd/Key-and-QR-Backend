import crypto from "crypto";
import { ZipArchive } from "archiver";
import QRCode from "qrcode";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "./tag.repository.js";
import logger from "../../utils/logger.js";
import Tag from "./tag.model.js";
import TagBatch from "./tagBatch.model.js";
import env from "../../config/env.js";

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

/**
 * BULK DELETE TAGS
 * Safely deletes multiple tags, protecting claimed, activated, or order-assigned tags
 */
const bulkDeleteTags = async (tagIds) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "tagIds array is required");
  }

  if (tagIds.length > 5000) {
    throw new AppError(httpStatus.BAD_REQUEST, "Cannot delete more than 5,000 tags in one operation");
  }

  // Fetch all tags requested
  const tags = await Tag.find({ _id: { $in: tagIds } });
  const foundMap = new Map(tags.map((t) => [t._id.toString(), t]));

  // Check active order assignments in bulk
  const assignedTagIdsSet = new Set(
    (await tagRepository.getAssignedTagIdsFromActiveOrders()).map((id) => id.toString())
  );

  const eligibleIds = [];
  const failures = [];

  for (const id of tagIds) {
    const idStr = id.toString();
    const tag = foundMap.get(idStr);

    if (!tag) {
      failures.push({ tagId: idStr, tagCode: null, reason: "Tag not found" });
      continue;
    }

    if (tag.isActivated) {
      failures.push({ tagId: idStr, tagCode: tag.tagCode, reason: "Tag is already activated" });
      continue;
    }

    if (tag.owner) {
      failures.push({ tagId: idStr, tagCode: tag.tagCode, reason: "Tag is assigned to a user" });
      continue;
    }

    if (tag.assignedOrderId || assignedTagIdsSet.has(idStr)) {
      failures.push({ tagId: idStr, tagCode: tag.tagCode, reason: "Tag is linked to an order" });
      continue;
    }

    eligibleIds.push(tag._id);
  }

  let deletedCount = 0;
  if (eligibleIds.length > 0) {
    const deleteResult = await Tag.deleteMany({ _id: { $in: eligibleIds } });
    deletedCount = deleteResult.deletedCount || eligibleIds.length;
  }

  logger.info(`Bulk delete tags: requested=${tagIds.length}, deleted=${deletedCount}, failed=${failures.length}`);

  return {
    requested: tagIds.length,
    deleted: deletedCount,
    failed: failures.length,
    failures,
  };
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
 * Implements SEC-04 exact quantity guarantee with multi-round replenishment and batch tracking
 */
const bulkCreateTags = async (count, prefix = "TAG", adminUserId = null, batchType = "production") => {
  if (count < 1 || count > 5000) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Count must be between 1 and 5,000"
    );
  }

  const cleanPrefix = (prefix || "TAG").trim().toUpperCase();
  const validBatchType = batchType === "testing" ? "testing" : "production";
  const dateStr = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  const batchId = `BATCH-${dateStr}-${randomSuffix}`;

  // Create initial batch tracking record in pending/processing state
  let tagBatch;
  try {
    tagBatch = await TagBatch.create({
      batchId,
      prefix: cleanPrefix,
      requestedQuantity: count,
      createdQuantity: 0,
      status: "processing",
      batchType: validBatchType,
      createdBy: adminUserId || null,
    });
  } catch (err) {
    logger.error("Failed to create TagBatch record:", err);
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to initialize batch tracking");
  }

  let totalCreated = 0;
  const MAX_RETRY_ROUNDS = 5;
  let rounds = 0;

  try {
    while (totalCreated < count && rounds < MAX_RETRY_ROUNDS) {
      rounds++;
      const needed = count - totalCreated;
      const candidates = generateTagCodes(cleanPrefix, needed);

      // Pre-filter against existing codes in MongoDB
      const existing = await Tag.find({ tagCode: { $in: candidates } }).select("tagCode").lean();
      const existingCodeSet = new Set(existing.map((t) => t.tagCode));
      const freshCandidates = candidates.filter((code) => !existingCodeSet.has(code));

      if (freshCandidates.length > 0) {
        const insertResult = await tagRepository.bulkCreateTags(freshCandidates, 250, batchId);
        totalCreated += insertResult.success.length;
      }
    }

    if (totalCreated < count) {
      tagBatch.status = "failed";
      tagBatch.createdQuantity = totalCreated;
      tagBatch.errorMessage = `Could not reach exact requested quantity ${count}. Inserted ${totalCreated} tags before retry exhaustion.`;
      await tagBatch.save();

      throw new AppError(
        httpStatus.CONFLICT,
        `Exact quantity could not be met. Created ${totalCreated} out of ${count} tags after ${rounds} retry rounds.`
      );
    }

    // Success - update TagBatch record
    tagBatch.status = "completed";
    tagBatch.createdQuantity = totalCreated;
    await tagBatch.save();

    logger.info(`✅ Successfully bulk created exactly ${totalCreated} tags for ${batchId}`);

    return {
      batchId: tagBatch.batchId,
      total: totalCreated,
      created: totalCreated,
      failed: [],
      status: "completed",
    };
  } catch (error) {
    if (tagBatch && tagBatch.status !== "failed" && tagBatch.status !== "completed") {
      tagBatch.status = "failed";
      tagBatch.createdQuantity = totalCreated;
      tagBatch.errorMessage = error.message;
      await tagBatch.save().catch(() => {});
    }
    throw error;
  }
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

/**
 * GET CANONICAL PUBLIC TAG URL
 * Returns canonical public scan URL: ${clientUrl}/t/${tagCode}
 */
const getPublicTagUrl = (tagCode) => {
  const base = (env.clientUrl || "https://myinspiretag-frontend.vercel.app").replace(/\/+$/, "");
  return `${base}/t/${tagCode}`;
};

/**
 * GET ALL BATCHES
 * Includes real-time tag counts (available, claimed, total remaining)
 */
const getAllBatches = async (query = {}) => {
  const { page = 1, limit = 10 } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const [batches, total] = await Promise.all([
    TagBatch.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    TagBatch.countDocuments(),
  ]);

  // Aggregate current live tag counts for these batches
  const batchIds = batches.map((b) => b.batchId);
  const tagStats = await Tag.aggregate([
    { $match: { batchId: { $in: batchIds } } },
    {
      $group: {
        _id: "$batchId",
        remainingCount: { $sum: 1 },
        availableCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$isActive", true] },
                  { $eq: ["$isActivated", false] },
                  { $eq: ["$owner", null] },
                  { $eq: ["$assignedOrderId", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        claimedCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$isActivated", true] },
                  { $ne: ["$owner", null] },
                  { $ne: ["$assignedOrderId", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const statsMap = new Map(tagStats.map((s) => [s._id, s]));

  const enrichedBatches = batches.map((b) => {
    const stat = statsMap.get(b.batchId) || { remainingCount: 0, availableCount: 0, claimedCount: 0 };
    return {
      ...b,
      remainingCount: stat.remainingCount,
      availableCount: stat.availableCount,
      claimedCount: stat.claimedCount,
    };
  });

  return {
    data: enrichedBatches,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPage: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * GET BATCH BY ID
 */
const getBatchById = async (batchId) => {
  const batch = await TagBatch.findOne({ batchId }).populate("createdBy", "name email").lean();
  if (!batch) {
    throw new AppError(httpStatus.NOT_FOUND, "Batch not found");
  }

  const tagStats = await Tag.aggregate([
    { $match: { batchId: batch.batchId } },
    {
      $group: {
        _id: "$batchId",
        remainingCount: { $sum: 1 },
        availableCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$isActive", true] },
                  { $eq: ["$isActivated", false] },
                  { $eq: ["$owner", null] },
                  { $eq: ["$assignedOrderId", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        claimedCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$isActivated", true] },
                  { $ne: ["$owner", null] },
                  { $ne: ["$assignedOrderId", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const stat = tagStats[0] || { remainingCount: 0, availableCount: 0, claimedCount: 0 };

  return {
    ...batch,
    remainingCount: stat.remainingCount,
    availableCount: stat.availableCount,
    claimedCount: stat.claimedCount,
  };
};

/**
 * DELETE BATCH ELIGIBLE TAGS
 * Safely deletes only eligible tags belonging to a batch while preserving protected/claimed/order tags.
 * Updates batch statistics accurately.
 */
const deleteBatchTags = async (batchId) => {
  const batch = await TagBatch.findOne({ batchId });
  if (!batch) {
    throw new AppError(httpStatus.NOT_FOUND, "Batch not found");
  }

  // Find all remaining tags belonging to this specific batch
  const tags = await Tag.find({ batchId: batch.batchId });
  if (tags.length === 0) {
    return {
      batchId: batch.batchId,
      total: 0,
      deleted: 0,
      skipped: 0,
      failures: [],
      remainingCount: 0,
    };
  }

  // Get all active order tag IDs in bulk
  const assignedTagIdsSet = new Set(
    (await tagRepository.getAssignedTagIdsFromActiveOrders()).map((id) => id.toString())
  );

  const eligibleIds = [];
  const failures = [];

  for (const tag of tags) {
    const idStr = tag._id.toString();

    if (tag.isActivated) {
      failures.push({ tagCode: tag.tagCode, reason: "Tag is already activated" });
      continue;
    }

    if (tag.owner) {
      failures.push({ tagCode: tag.tagCode, reason: "Tag is assigned to a user" });
      continue;
    }

    if (tag.assignedOrderId || assignedTagIdsSet.has(idStr)) {
      failures.push({ tagCode: tag.tagCode, reason: "Tag is linked to an active order" });
      continue;
    }

    eligibleIds.push(tag._id);
  }

  let deletedCount = 0;
  // Chunked deletion (batches of 500) to protect database performance on large batches
  const CHUNK_SIZE = 500;
  for (let i = 0; i < eligibleIds.length; i += CHUNK_SIZE) {
    const chunk = eligibleIds.slice(i, i + CHUNK_SIZE);
    const deleteResult = await Tag.deleteMany({ _id: { $in: chunk } });
    deletedCount += deleteResult.deletedCount || chunk.length;
  }

  const remainingCount = tags.length - deletedCount;

  // Update TagBatch record with new live createdQuantity
  batch.createdQuantity = remainingCount;
  if (remainingCount === 0) {
    batch.errorMessage = "All batch tags deleted by administrator";
  }
  await batch.save();

  logger.info(
    `Batch delete: batchId=${batch.batchId}, total=${tags.length}, deleted=${deletedCount}, skipped=${failures.length}, remaining=${remainingCount}`
  );

  return {
    batchId: batch.batchId,
    total: tags.length,
    deleted: deletedCount,
    skipped: failures.length,
    failures,
    remainingCount,
  };
};

/**
 * EXPORT BATCH CSV
 * Generates UTF-8 CSV string with exact matching public URLs
 */
const exportBatchCsv = async (batchId) => {
  const batch = await getBatchById(batchId);
  const tags = await Tag.find({ batchId: batch.batchId })
    .select("tagCode isActive isActivated createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (!tags || tags.length === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "No tags found for this batch");
  }

  let csv = "Batch ID,Tag Code,Public QR URL,Status,Created At\n";
  for (const tag of tags) {
    const url = getPublicTagUrl(tag.tagCode);
    const status = !tag.isActive ? "Disabled" : tag.isActivated ? "Claimed" : "Available";
    const dateStr = tag.createdAt ? new Date(tag.createdAt).toISOString() : new Date().toISOString();
    // Quote and escape strings if necessary
    csv += `"${batch.batchId}","${tag.tagCode}","${url}","${status}","${dateStr}"\n`;
  }

  return {
    csv,
    filename: `MyInspireTag-Batch-${batch.batchId}.csv`,
    count: tags.length,
  };
};

/**
 * STREAM BATCH ZIP
 * Streams a ZIP archive directly to the response containing QR-Codes/*.png and manifest.csv
 */
const streamBatchZip = async (batchId, res) => {
  const batch = await getBatchById(batchId);
  const tags = await Tag.find({ batchId: batch.batchId })
    .select("tagCode isActive isActivated createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (!tags || tags.length === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "No tags found for this batch");
  }

  const filename = `MyInspireTag-Batch-${batch.batchId}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-cache");

  const archive = new ZipArchive({ zlib: { level: 6 } });

  archive.on("error", (err) => {
    logger.error("ZIP streaming error:", err);
    if (!res.headersSent) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send("Error generating ZIP");
    }
  });

  archive.pipe(res);

  let csvContent = "Batch ID,Tag Code,Public QR URL,Status,Created At\n";

  for (const tag of tags) {
    const url = getPublicTagUrl(tag.tagCode);
    const status = !tag.isActive ? "Disabled" : tag.isActivated ? "Claimed" : "Available";
    const dateStr = tag.createdAt ? new Date(tag.createdAt).toISOString() : new Date().toISOString();
    csvContent += `"${batch.batchId}","${tag.tagCode}","${url}","${status}","${dateStr}"\n`;

    // Generate high-resolution PNG buffer (width 400px, errorCorrection H)
    const qrBuffer = await QRCode.toBuffer(url, {
      type: "png",
      width: 400,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    archive.append(qrBuffer, { name: `QR-Codes/${tag.tagCode}.png` });
  }

  archive.append(csvContent, { name: "manifest.csv" });
  await archive.finalize();
};

/**
 * EXPORT SELECTED TAGS CSV
 * Generates UTF-8 CSV string for arbitrary list of tag IDs
 */
const exportSelectedCsv = async (tagIds) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "tagIds array is required");
  }

  const tags = await Tag.find({ _id: { $in: tagIds } })
    .select("tagCode isActive isActivated createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (!tags || tags.length === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "No tags found for the selected IDs");
  }

  let csv = "Tag Code,Public QR URL,Status,Created At\n";
  for (const tag of tags) {
    const url = getPublicTagUrl(tag.tagCode);
    const status = !tag.isActive ? "Disabled" : tag.isActivated ? "Claimed" : "Available";
    const dateStr = tag.createdAt ? new Date(tag.createdAt).toISOString() : new Date().toISOString();
    csv += `"${tag.tagCode}","${url}","${status}","${dateStr}"\n`;
  }

  return {
    csv,
    filename: `myinspiretag-selected-tags.csv`,
    count: tags.length,
  };
};

/**
 * STREAM SELECTED TAGS ZIP
 * Streams a ZIP archive directly to the response containing QR-Codes/*.png and manifest.csv for selected tag IDs
 */
const streamSelectedZip = async (tagIds, res) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "tagIds array is required");
  }

  const tags = await Tag.find({ _id: { $in: tagIds } })
    .select("tagCode isActive isActivated createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (!tags || tags.length === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "No tags found for the selected IDs");
  }

  const filename = "MyInspireTag-Selected-QR-Codes.zip";

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-cache");

  const archive = new ZipArchive({ zlib: { level: 6 } });

  archive.on("error", (err) => {
    logger.error("ZIP streaming error:", err);
    if (!res.headersSent) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).send("Error generating ZIP");
    }
  });

  archive.pipe(res);

  let csvContent = "Tag Code,Public QR URL,Status,Created At\n";

  for (const tag of tags) {
    const url = getPublicTagUrl(tag.tagCode);
    const status = !tag.isActive ? "Disabled" : tag.isActivated ? "Claimed" : "Available";
    const dateStr = tag.createdAt ? new Date(tag.createdAt).toISOString() : new Date().toISOString();
    csvContent += `"${tag.tagCode}","${url}","${status}","${dateStr}"\n`;

    const qrBuffer = await QRCode.toBuffer(url, {
      type: "png",
      width: 400,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    archive.append(qrBuffer, { name: `QR-Codes/${tag.tagCode}.png` });
  }

  archive.append(csvContent, { name: "manifest.csv" });
  await archive.finalize();
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
  bulkDeleteTags,
  deleteBatchTags,
  getAllBatches,
  getBatchById,
  exportBatchCsv,
  streamBatchZip,
  exportSelectedCsv,
  streamSelectedZip,
  getPublicTagUrl,
  getTagInventoryStatus,
  getUnassignedTagCount,
  checkTagAvailabilityForOrder,
  getTagLifecycleStats,
  generateTagCodes,
};