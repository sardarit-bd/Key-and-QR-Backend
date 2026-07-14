import Order from "./order.model.js";

// ============================================================
// HELPER: Convert legacy order to items format
// ============================================================

const normalizeOrder = (order) => {
    if (!order) return null;

    // If already has items, return as-is
    if (order.items && order.items.length > 0) {
        return order;
    }

    // Convert legacy order to items format
    if (order.product && order.quantity) {
        const normalizedItems = [{
            product: order.product,
            quantity: order.quantity || 1,
            unitPrice: order.unitPrice || order.product?.price || 0,
            subtotal: (order.unitPrice || order.product?.price || 0) * (order.quantity || 1),
            purchaseType: order.purchaseType || "self",
            giftMessage: order.giftMessage || null,
            assignedTags: [],
        }];

        // Create a new object with items
        const normalized = order.toObject ? order.toObject() : order;
        normalized.items = normalizedItems;
        normalized.subtotal = normalized.subtotal || normalizedItems[0].subtotal;
        normalized.grandTotal = normalized.grandTotal || normalizedItems[0].subtotal;
        normalized.itemCount = 1;

        return normalized;
    }

    return order;
};

// ============================================================
// REPOSITORY METHODS
// ============================================================

const createOrder = (payload) => {
    // Ensure items array exists
    if (!payload.items || payload.items.length === 0) {
        // Legacy support: single product
        if (payload.product) {
            const unitPrice = payload.unitPrice || payload.product?.price || 0;
            const quantity = payload.quantity || 1;
            payload.items = [{
                product: payload.product,
                quantity: quantity,
                unitPrice: unitPrice,
                subtotal: unitPrice * quantity,
                purchaseType: payload.purchaseType || "self",
                giftMessage: payload.giftMessage || null,
                assignedTags: [],
            }];
            payload.subtotal = payload.subtotal || unitPrice * quantity;
            payload.grandTotal = payload.grandTotal || unitPrice * quantity;
        }
    }

    return Order.create(payload);
};

const findById = (id) => {
    return Order.findById(id)
        .populate("product")  // Legacy
        .populate("items.product")
        .populate("assignedTag", "tagCode")  // Legacy
        .populate("assignedTags.tag", "tagCode")  // Legacy
        .lean();
};

const updateOrder = (id, payload) => {
    return Order.findByIdAndUpdate(id, payload, { returnDocument: "after" })
        .populate("product")
        .populate("items.product")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .lean();
};

const findByUser = (userId) => {
    return Order.find({ user: userId })
        .populate("product")
        .populate("items.product")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 })
        .lean();
};

const findByGuestEmail = (email) => {
    return Order.find({
        isGuestOrder: true,
        "guestCustomer.email": email,
    })
        .populate("product")
        .populate("items.product")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 })
        .lean();
};

const findByIdAndGuestEmail = (id, email) => {
    return Order.findOne({
        _id: id,
        isGuestOrder: true,
        "guestCustomer.email": email,
    })
        .populate("product")
        .populate("items.product")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .lean();
};

const findByIdWithDetails = (id) => {
    return Order.findById(id)
        .populate("user", "name email")
        .populate("product", "name price image description")
        .populate("items.product", "name price image description")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .lean();
};

// NEW: Get order items with product details
const getOrderItems = async (orderId) => {
    const order = await Order.findById(orderId)
        .populate("items.product")
        .lean();

    if (!order) return null;

    return normalizeOrder(order);
};

// NEW: Get total items count
const getTotalItems = async (orderId) => {
    const order = await Order.findById(orderId).select("items quantity").lean();
    if (!order) return 0;
    if (order.items && order.items.length > 0) {
        return order.items.length;
    }
    return order.quantity || 1;
};

export default {
    createOrder,
    findById,
    updateOrder,
    findByUser,
    findByGuestEmail,
    findByIdAndGuestEmail,
    findByIdWithDetails,
    getOrderItems,
    getTotalItems,
    normalizeOrder,
};