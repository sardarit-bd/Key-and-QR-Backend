import mongoose from "mongoose";
import Tag from "./tag.model.js";

const createTag = (payload) => {
  return Tag.create(payload);
};

const findByTagCode = (tagCode) => {
  return Tag.findOne({ tagCode });
};

const getAllTags = async (query = {}) => {
  const { page = 1, limit = 10, search, isActivated, isActive, unused } = query;

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

  if (unused === "true") {
    const assignedTagIds = await getAssignedTagIdsFromActiveOrders();
    console.log("Assigned tag IDs from active orders:", assignedTagIds.length, assignedTagIds);

    filter.owner = null;
    filter.isActive = true;
    filter._id = { $nin: assignedTagIds };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [data, total] = await Promise.all([
    Tag.find(filter)
      .populate("owner", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Tag.countDocuments(filter)
  ]);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit)
    },
    data
  };
};

const findById = (id) => {
  return Tag.findById(id);
};

const updateTag = (id, payload) => {
  return Tag.findByIdAndUpdate(id, payload, { new: true });
};

const findUnusedTag = async () => {
  const assignedTagIds = await getAssignedTagIdsFromActiveOrders();

  return Tag.findOne({
    owner: null,
    isActive: true,
    _id: { $nin: assignedTagIds }
  }).sort({ createdAt: 1 });
};

const findUnusedTagStrict = async () => {
  return Tag.findOne({
    isActivated: false,
    owner: null,
    isActive: true,
  }).sort({ createdAt: 1 });
};

const resetTag = async (tagId) => {
  return Tag.findByIdAndUpdate(
    tagId,
    {
      owner: null,
      isActivated: false,
      activatedAt: null,
      personalMessage: null,
    },
    { new: true }
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

// tag.repository.js
const findMultipleUnusedTags = async (limit = 10) => {
  const assignedTagIds = await getAssignedTagIdsFromActiveOrders();

  return Tag.find({
    owner: null,
    isActive: true,
    isActivated: false,
    _id: { $nin: assignedTagIds }
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

const isTagAssignedToActiveOrder = async (tagId) => {
  const Order = mongoose.model("Order");
  const existingOrder = await Order.findOne({
    assignedTag: tagId,
    fulfillmentStatus: { $nin: ["cancelled", "returned"] }
  });
  return !!existingOrder;
};

const getAssignedTagIdsFromActiveOrders = async () => {
  const Order = mongoose.model("Order");
  const orders = await Order.find({
    assignedTag: { $ne: null },
    fulfillmentStatus: { $nin: ["cancelled", "returned"] }
  }).select("assignedTag");

  return orders.map(o => o.assignedTag.toString());
};

export default {
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
};