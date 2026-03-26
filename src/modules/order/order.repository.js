import Order from "./order.model.js";

const createOrder = (payload) => Order.create(payload);

const findById = (id) => {
  return Order.findById(id)
    .populate("product")
    .populate("assignedTag", "tagCode");
};

const updateOrder = (id, payload) => {
  return Order.findByIdAndUpdate(id, payload, { new: true });
};


const findByUser = (userId) => {
  return Order.find({ user: userId })
    .populate("product")
    .populate("assignedTag", "tagCode")
    .sort({ createdAt: -1 });
};

export default {
  createOrder,
  findById,
  updateOrder,
  findByUser,
};