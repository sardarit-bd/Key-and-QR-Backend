import mongoose from "mongoose";
import Tag from "./tag.model.js";
import logger from "../../utils/logger.js";

// ================================
// EXISTING FUNCTIONS
// ================================

const createTag = async (payload) => {
  return Tag.create(payload);
};

const findByTagCode = async (tagCode) => {
  return Tag.findOne({ tagCode });
};

const getAllTags = async (query = {}) => {
  const { page = 1, limit = 10, search, isActivated, isActive, unused, subscriptionType, status } = query;

  const filter = {};

  if (search) {
    filter.tagCode = { $regex: search, $options: "i" };
  }

  if (isActivated !== undefined) {
    filter.isActivated = isActivated === "true";
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  if (subscriptionType && subscriptionType !== "all") {
    filter.subscriptionType = subscriptionType;
  }

  if (unused === "true") {
    const assignedTagIds = await getAssignedTagIdsFromActiveOrders();
    filter.owner = null;
    filter.isActive = true;
    filter._id = { $nin: assignedTagIds };
  }

  if (status && status !== "all") {
    if (status === "unused") {
      const assignedTagIds = await getAssignedTagIdsFromActiveOrders();
      filter.owner = null;
      filter.isActive = true;
      filter._id = { $nin: assignedTagIds };
    } else if (status === "assigned") {
      filter.owner = null;
      filter.isActive = true;
      filter.assignedOrderId = { $ne: null };
    } else if (status === "activated") {
      filter.owner = { $ne: null };
      filter.isActive = true;
    } else if (status === "disabled") {
      filter.isActive = false;
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [data, total] = await Promise.all([
    Tag.find(filter)
      .populate("owner", "name email")
      .populate({
        path: "assignedOrderId",
        populate: {
          path: "items.product",
          model: "Product",
          select: "name price"
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Tag.countDocuments(filter),
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

const findById = async (id) => {
  return Tag.findById(id);
};

const updateTag = async (id, payload, session = null) => {
  const options = { new: true };
  if (session) options.session = session;
  return Tag.findByIdAndUpdate(id, payload, options);
};

const findUnusedTag = async () => {
  const assignedTagIds = await getAssignedTagIdsFromActiveOrders();

  return Tag.findOne({
    owner: null,
    isActive: true,
    _id: { $nin: assignedTagIds },
  }).sort({ createdAt: 1 });
};

const findUnusedTagStrict = async () => {
  return Tag.findOne({
    isActivated: false,
    owner: null,
    isActive: true,
  }).sort({ createdAt: 1 });
};

const resetTag = async (tagId, session = null) => {
  const options = { new: true };
  if (session) options.session = session;
  
  return Tag.findByIdAndUpdate(
    tagId,
    {
      owner: null,
      isActivated: false,
      activatedAt: null,
      personalMessage: null,
      assignedOrderId: null,
    },
    options
  );
};

const removeOwner = async (tagId) => {
  return Tag.findByIdAndUpdate(
    tagId,
    {
      owner: null,
      isActivated: false,
      activatedAt: null,
    },
    { new: true }
  );
};

const updatePersonalMessage = async (tagCode, message) => {
  return Tag.findOneAndUpdate(
    { tagCode },
    { personalMessage: message },
    { new: true }
  );
};

const findByTagCodeWithOwner = async (tagCode) => {
  return Tag.findOne({ tagCode }).populate("owner", "name email");
};

const findTagsByOwner = async (ownerId) => {
  return Tag.find({ owner: ownerId })
    .populate("owner", "name email")
    .sort({ createdAt: -1 });
};

const isTagFree = async (tagId) => {
  const tag = await findById(tagId);
  return tag && tag.owner === null && tag.isActive === true;
};

const findMultipleUnusedTags = async (limit = 10) => {
  const assignedTagIds = await getAssignedTagIdsFromActiveOrders();

  return Tag.find({
    owner: null,
    isActive: true,
    isActivated: false,
    _id: { $nin: assignedTagIds },
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

const isTagAssignedToActiveOrder = async (tagId) => {
  const Order = mongoose.model("Order");
  const existingOrder = await Order.findOne({
    assignedTag: tagId,
    fulfillmentStatus: { $nin: ["cancelled", "returned"] },
  });
  return !!existingOrder;
};

// ================================
// NEW FUNCTIONS FROM IMPROVEMENTS
// ================================

/**
 * ATOMIC TAG ASSIGNMENT - Race Condition Fix
 * Find and assign multiple tags atomically using findOneAndUpdate
 */
const findAndAssignMultipleTags = async (limit = 10, userId, orderId, session = null) => {
  if (limit <= 0) return [];

  const assignedTagIds = await getAssignedTagIdsFromActiveOrders(session);
  const assignedTags = [];

  for (let i = 0; i < limit; i++) {
    const options = {
      new: true,
      sort: { createdAt: 1 }, // FIFO — oldest tags first
    };
    if (session) options.session = session;

    const tag = await Tag.findOneAndUpdate(
      {
        owner: null,
        isActive: true,
        isActivated: false,
        _id: { $nin: assignedTagIds.concat(assignedTags) },
      },
      {
        owner: userId,
        isActivated: true,
        activatedAt: new Date(),
        assignedOrderId: orderId,
      },
      options,
    );

    if (tag) {
      assignedTags.push(tag._id);
      logger.info(`✅ Tag ${tag.tagCode} assigned atomically to order ${orderId}`);
    } else {
      logger.warn(`⚠️ No more tags available for order ${orderId}. Needed: ${limit - i}, Found: ${assignedTags.length}`);
      break;
    }
  }

  return assignedTags;
};

/**
 * GET ASSIGNED TAG IDS FROM ACTIVE ORDERS
 * Optimized version with session support
 */
const getAssignedTagIdsFromActiveOrders = async (session = null) => {
  const Order = mongoose.model("Order");
  
  const result = await Order.aggregate([
    {
      $match: {
        fulfillmentStatus: { $nin: ["cancelled", "returned"] },
        $or: [
          { assignedTag: { $ne: null } },
          { "assignedTags.tag": { $ne: null } },
        ],
      },
    },
    {
      $project: {
        tags: {
          $concatArrays: [
            { $cond: [{ $ne: ["$assignedTag", null] }, ["$assignedTag"], []] },
            { $ifNull: ["$assignedTags.tag", []] },
          ],
        },
      },
    },
    { $unwind: "$tags" },
    { $group: { _id: null, tags: { $addToSet: "$tags" } } },
  ]);

  const tagIds = result.length > 0 ? result[0].tags : [];
  return tagIds.map(id => id.toString());
};

/**
 * COUNT UNASSIGNED TAGS
 * For inventory management
 */
const countUnassignedTags = async () => {
  const assignedTagIds = await getAssignedTagIdsFromActiveOrders();
  
  return Tag.countDocuments({
    owner: null,
    isActive: true,
    isActivated: false,
    _id: { $nin: assignedTagIds },
  });
};

/**
 * GET TAG AVAILABILITY STATUS
 * Returns detailed inventory info
 */
const getTagAvailabilityStatus = async () => {
  const totalTags = await Tag.countDocuments({ isActive: true });
  const assignedTagIds = await getAssignedTagIdsFromActiveOrders();
  
  const unassignedTags = await Tag.find({
    owner: null,
    isActive: true,
    isActivated: false,
    _id: { $nin: assignedTagIds },
  });

  return {
    total: totalTags,
    unassigned: unassignedTags.length,
    assigned: totalTags - unassignedTags.length,
    lowInventory: unassignedTags.length < 100,
    criticalInventory: unassignedTags.length < 50,
    tags: unassignedTags.map(tag => ({
      id: tag._id,
      tagCode: tag.tagCode,
      createdAt: tag.createdAt,
    })),
  };
};

/**
 * BULK CREATE TAGS
 * For admin inventory management
 */
const bulkCreateTags = async (tagCodes, batchSize = 100) => {
  const results = {
    success: [],
    failed: [],
    total: 0,
  };

  for (let i = 0; i < tagCodes.length; i += batchSize) {
    const batch = tagCodes.slice(i, i + batchSize);
    const tags = batch.map(code => ({
      tagCode: code,
      isActive: true,
      isActivated: false,
    }));

    try {
      const inserted = await Tag.insertMany(tags, { ordered: false });
      results.success.push(...inserted);
      results.total += inserted.length;
      logger.info(`✅ Created ${inserted.length} tags in batch ${i / batchSize + 1}`);
    } catch (error) {
      if (error.writeErrors) {
        for (const writeError of error.writeErrors) {
          if (writeError.code === 11000) {
            results.failed.push({
              code: writeError.op.tagCode,
              error: "Duplicate tag code",
            });
          } else {
            results.failed.push({
              code: writeError.op.tagCode,
              error: writeError.errmsg,
            });
          }
        }
        results.total += error.insertedDocs?.length || 0;
      } else {
        throw error;
      }
    }
  }

  return results;
};

// ================================
// EXPORTS
// ================================

/**
 * Atomically activate a discovered (unowned, not-yet-activated) tag.
 * Only matches tags that are isActivated:false AND owner:null, so it never
 * touches order-assigned tags (already isActivated:true) or tags a user is
 * claiming via POST /tags/activate — no conflict with order-based activation.
 */
const activateTagIfNotActivated = async (tagCode) => {
  return Tag.findOneAndUpdate(
    { tagCode, isActivated: false, owner: null, isActive: true },
    { isActivated: true, owner: null, activatedAt: new Date() },
    { new: true }
  );
};

const assignTagAtomically = async (tagId, orderId, ownerId = null) => {
  return Tag.findOneAndUpdate(
    {
      _id: tagId,
      isActive: true,
      $or: [
        { assignedOrderId: null },
        { assignedOrderId: orderId }
      ]
    },
    {
      owner: ownerId,
      isActivated: true,
      activatedAt: new Date(),
      assignedOrderId: orderId,
    },
    { new: true }
  );
};

export default {
  // Existing functions
  createTag,
  findByTagCode,
  getAllTags,
  findById,
  updateTag,
  findUnusedTag,
  findUnusedTagStrict,
  resetTag,
  removeOwner,
  updatePersonalMessage,
  findByTagCodeWithOwner,
  findTagsByOwner,
  isTagFree,
  findMultipleUnusedTags,
  isTagAssignedToActiveOrder,
  getAssignedTagIdsFromActiveOrders,
  activateTagIfNotActivated,
  assignTagAtomically,

  // NEW FUNCTIONS
  findAndAssignMultipleTags,
  countUnassignedTags,
  getTagAvailabilityStatus,
  bulkCreateTags,
};