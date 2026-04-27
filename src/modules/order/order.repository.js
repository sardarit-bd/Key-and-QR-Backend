import Order from "./order.model.js";

const createOrder = (payload) => Order.create(payload);

const findById = (id) => {
  return Order.findById(id)
    .populate("product")
    .populate("assignedTag", "tagCode")
    .populate("assignedTags.tag", "tagCode");
};

const updateOrder = (id, payload) => {
  return Order.findByIdAndUpdate(id, payload, { returnDocument: "after" })
    .populate("product")
    .populate("assignedTag", "tagCode")
    .populate("assignedTags.tag", "tagCode");
};

const findByUser = (userId) => {
  return Order.find({ user: userId })
    .populate("product")
    .populate("assignedTag", "tagCode")
    .populate("assignedTags.tag", "tagCode")
    .sort({ createdAt: -1 });
};

const findByIdWithDetails = (id) => {
  return Order.findById(id)
    .populate("user", "name email")
    .populate("product", "name price image description")
    .populate("assignedTag", "tagCode")
    .populate("assignedTags.tag", "tagCode");
};

export default {
  createOrder,
  findById,
  updateOrder,
  findByUser,
  findByIdWithDetails,
};