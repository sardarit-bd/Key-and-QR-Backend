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

// NEW: Find orders by guest email
const findByGuestEmail = (email) => {
    return Order.find({ 
        isGuestOrder: true,
        "guestCustomer.email": email 
    })
        .populate("product")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 });
};

// NEW: Find order by guest email and order ID
const findByIdAndGuestEmail = (id, email) => {
    return Order.findOne({
        _id: id,
        isGuestOrder: true,
        "guestCustomer.email": email,
    })
        .populate("product")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode");
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
    findByGuestEmail,
    findByIdAndGuestEmail,
    findByIdWithDetails,
};