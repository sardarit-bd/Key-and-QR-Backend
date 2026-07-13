import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderRepository from "./order.repository.js";
import tagRepository from "../tag/tag.repository.js";
import productRepository from "../product/product.repository.js";
import stripe from "../../config/stripe.js";
import PAYMENT_CONFIG from "../../config/payment.config.js";
import env from "../../config/env.js";
import Order from "./order.model.js";
import mongoose from "mongoose";
import pendingQuoteRepository from "../pendingQuote/pendingQuote.repository.js";



// ============================================================
// HELPER: Build order items from cart
// ============================================================

const buildOrderItems = async (items, isGuest = false) => {
    if (!items || items.length === 0) {
        throw new AppError(httpStatus.BAD_REQUEST, "At least one item is required");
    }

    // Validate unique products
    const productIds = items.map(item => item.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
        throw new AppError(httpStatus.BAD_REQUEST, "Duplicate products in cart");
    }

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
        // Validate product exists
        const product = await productRepository.getProductById(item.productId);
        if (!product) {
            throw new AppError(httpStatus.NOT_FOUND, `Product ${item.productId} not found`);
        }

        // Validate stock
        if (product.stock < (item.quantity || 1)) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                `Not enough stock for ${product.name}. Available: ${product.stock}`
            );
        }

        const unitPrice = product.price;
        const quantity = item.quantity || 1;
        const itemSubtotal = unitPrice * quantity;
        subtotal += itemSubtotal;

        orderItems.push({
            product: product._id,
            quantity: quantity,
            unitPrice: unitPrice,
            subtotal: itemSubtotal,
            purchaseType: item.purchaseType || "self",
            giftMessage: item.purchaseType === "gift" ? item.giftMessage || null : null,
            assignedTags: [],
        });
    }

    return { items: orderItems, subtotal };
};

// ============================================================
// HELPER: Calculate order totals
// ============================================================

const calculateTotals = (subtotal, shippingCost = 0, discount = 0) => {
    const grandTotal = subtotal + shippingCost - discount;
    return {
        subtotal,
        shippingCost,
        discount,
        grandTotal: Math.max(grandTotal, 0),
    };
};


// ============================================================
// HELPER: Create Stripe line items
// ============================================================

const createStripeLineItems = (order) => {
    const lineItems = [];

    // Multi-product: use items
    if (order.items && order.items.length > 0) {
        for (const item of order.items) {
            const product = item.product || {};
            lineItems.push({
                price_data: {
                    currency: PAYMENT_CONFIG.getCurrency(),
                    product_data: {
                        name: product.name || "Product",
                        images: product.image?.url ? [product.image.url] : [],
                    },
                    unit_amount: Math.round(item.unitPrice * 100),
                },
                quantity: item.quantity,
            });
        }
    } else if (order.product) {
        // Legacy: single product
        const product = order.product || {};
        lineItems.push({
            price_data: {
                currency: PAYMENT_CONFIG.getCurrency(),
                product_data: {
                    name: product.name || "Product",
                    images: product.image?.url ? [product.image.url] : [],
                },
                unit_amount: Math.round((order.product.price || 0) * 100),
            },
            quantity: order.quantity || 1,
        });
    }

    return lineItems;
};

// ============================================================
// HELPER: Get product stock with caching (for backend)
// ============================================================

const _stockCache = new Map();
const _STOCK_CACHE_TTL = 5000;

const getCachedStock = async (productId) => {
    const cacheKey = `stock_${productId}`;
    const cached = _stockCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < _STOCK_CACHE_TTL) {
        return cached.stock;
    }

    const product = await productRepository.getProductById(productId);
    const stock = product?.stock || 0;

    _stockCache.set(cacheKey, {
        stock,
        timestamp: Date.now(),
    });

    return stock;
};

// ============================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================

/**
 * Build shipping address from payload
 */
const buildShippingAddress = (payload) => ({
    fullName: payload.fullName || payload.shippingAddress?.fullName || null,
    email: payload.email || payload.shippingAddress?.email || null,
    phone: payload.phone || payload.shippingAddress?.phone || null,
    address: payload.address || payload.shippingAddress?.address || null,
    city: payload.city || payload.shippingAddress?.city || null,
    postalCode: payload.postalCode || payload.shippingAddress?.postalCode || null,
    country: payload.country || payload.shippingAddress?.country || null,
});

/**
 * Build guest customer data from payload
 */
const buildGuestCustomer = (payload) => ({
    fullName: payload.guestCustomer?.fullName || payload.fullName || null,
    email: payload.guestCustomer?.email || payload.email || null,
    phone: payload.guestCustomer?.phone || payload.phone || null,
});

/**
 * Ensure order tags are editable
 */
const ensureOrderTagsEditable = (order) => {
    if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            "Tags cannot be changed after the order has been shipped or delivered",
        );
    }

    if (["cancelled", "returned"].includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            "Tags cannot be manually changed for cancelled or returned orders",
        );
    }
};

/**
 * Get tag ID from various formats
 */
const getTagId = (item) => {
    const value = item?.tag || item;
    if (!value) return null;
    if (value._id) return value._id.toString();
    return value.toString();
};

/**
 * Build tag assignment status
 */
const buildTagAssignmentStatus = (assignedCount, requiredQty) => {
    if (assignedCount === 0) return "none";
    if (assignedCount < requiredQty) return "partial";
    return "complete";
};

/**
 * Ensure tag is available for order assignment
 */
const ensureTagAvailableForOrder = async (tagId, orderId, orderUserId) => {
    const tag = await tagRepository.findById(tagId);

    if (!tag) {
        throw new AppError(404, "Tag not found");
    }

    if (!tag.isActive) {
        throw new AppError(400, "This tag is disabled");
    }

    if (tag.owner && tag.owner.toString() !== orderUserId.toString()) {
        throw new AppError(
            400,
            "This tag is already assigned to another user/order",
        );
    }

    const existingOrderWithTag = await Order.findOne({
        _id: { $ne: orderId },
        fulfillmentStatus: { $nin: ["cancelled", "returned"] },
        $or: [{ assignedTag: tagId }, { "assignedTags.tag": tagId }],
    });

    if (existingOrderWithTag) {
        throw new AppError(
            400,
            "This tag is already assigned to another active order",
        );
    }

    return tag;
};

/**
 * Build checkout metadata for Stripe
 */
const buildCheckoutMetadata = (order) => {
    const metadata = {
        orderId: order._id.toString(),
    };

    if (order.user) {
        metadata.userId = order.user.toString();
    }

    if (order.isGuestOrder && order.guestCustomer) {
        metadata.guestEmail = order.guestCustomer.email;
        metadata.guestName = order.guestCustomer.fullName;
        metadata.isGuestOrder = "true";
    }

    return metadata;
};

/**
 * Get customer email for Stripe
 */
const getCustomerEmail = (order) => {
    return order.isGuestOrder
        ? order.guestCustomer?.email
        : order.user?.email;
};

/**
 * Handle existing order update for checkout
 */
const handleExistingOrder = async (userId, payload, isGuest) => {
    const order = await orderRepository.findById(payload.orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Authorization check
    if (!isGuest) {
        if (order.user.toString() !== userId.toString()) {
            throw new AppError(httpStatus.FORBIDDEN, "Unauthorized");
        }
    } else {
        if (order.guestCustomer?.email !== payload.guestCustomer?.email) {
            throw new AppError(httpStatus.FORBIDDEN, "Invalid guest access");
        }
    }

    if (order.paymentStatus === "paid") {
        throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");
    }

    // Update shipping address if provided
    if (payload.address || payload.fullName) {
        const shippingAddress = {
            fullName: payload.fullName || order.shippingAddress?.fullName,
            email: payload.email || order.shippingAddress?.email,
            phone: payload.phone || order.shippingAddress?.phone,
            address: payload.address || order.shippingAddress?.address,
            city: payload.city || order.shippingAddress?.city,
            postalCode: payload.postalCode || order.shippingAddress?.postalCode,
            country: payload.country || order.shippingAddress?.country,
        };
        await orderRepository.updateOrder(payload.orderId, { shippingAddress });

        // Also update guest customer if guest
        if (isGuest && payload.guestCustomer) {
            await orderRepository.updateOrder(payload.orderId, {
                guestCustomer: {
                    fullName: payload.guestCustomer.fullName || shippingAddress.fullName,
                    email: payload.guestCustomer.email || shippingAddress.email,
                    phone: payload.guestCustomer.phone || shippingAddress.phone,
                },
            });
        }
    }

    return order;
};

// ============================================================
// PUBLIC SERVICE FUNCTIONS
// ============================================================

/**
 * Create Order (Supports both Guest & Authenticated)
 */

const createOrder = async (userId, payload, isGuest = false) => {
    let items = [];
    let subtotal = 0;

    // ************* Multi-product checkout *************
    if (payload.items && payload.items.length > 0) {
        // Validate unique products
        const productIds = payload.items.map(item => item.productId || item.product);
        const uniqueIds = new Set(productIds);
        if (uniqueIds.size !== productIds.length) {
            throw new AppError(httpStatus.BAD_REQUEST, "Duplicate products in cart");
        }

        // Parallel product validation and price calculation
        const productChecks = payload.items.map(async (item) => {
            // Support both productId and product field names
            const productId = item.productId || item.product;

            const product = await productRepository.getProductById(productId);
            if (!product) {
                throw new AppError(httpStatus.NOT_FOUND, `Product ${productId} not found`);
            }

            // Check stock
            const stock = await getCachedStock(productId);
            if (stock < (item.quantity || 1)) {
                throw new AppError(
                    httpStatus.BAD_REQUEST,
                    `Not enough stock for ${product.name}. Available: ${stock}`
                );
            }

            const quantity = item.quantity || 1;
            const unitPrice = product.price;
            const itemSubtotal = unitPrice * quantity;

            return {
                product: product._id,
                quantity: quantity,
                unitPrice: unitPrice,
                subtotal: itemSubtotal,
                purchaseType: item.purchaseType || "self",
                giftMessage: item.purchaseType === "gift" ? item.giftMessage || null : null,
                assignedTags: [],
            };
        });

        const results = await Promise.all(productChecks);
        items = results;

        // Calculate subtotal
        subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

    }
    // ************* Legacy: single product checkout *************
    else if (payload.productId) {
        const product = await productRepository.getProductById(payload.productId);
        if (!product) {
            throw new AppError(httpStatus.NOT_FOUND, "Product not found");
        }

        const stock = await getCachedStock(payload.productId);
        if (stock < (payload.quantity || 1)) {
            throw new AppError(httpStatus.BAD_REQUEST, "Not enough stock available");
        }

        const quantity = payload.quantity || 1;
        const unitPrice = product.price;
        subtotal = unitPrice * quantity;

        items = [{
            product: product._id,
            quantity: quantity,
            unitPrice: unitPrice,
            subtotal: subtotal,
            purchaseType: payload.purchaseType || "self",
            giftMessage: payload.purchaseType === "gift" ? payload.giftMessage || null : null,
            assignedTags: [],
        }];
    }
    else {
        throw new AppError(httpStatus.BAD_REQUEST, "No products specified");
    }

    // ************* Calculate order totals *************
    const totals = calculateTotals(subtotal, 0, 0);

    // ************* Build shipping address *************
    const shippingAddress = {
        fullName: payload.fullName || payload.shippingAddress?.fullName || null,
        email: payload.email || payload.shippingAddress?.email || null,
        phone: payload.phone || payload.shippingAddress?.phone || null,
        address: payload.address || payload.shippingAddress?.address || null,
        city: payload.city || payload.shippingAddress?.city || null,
        postalCode: payload.postalCode || payload.shippingAddress?.postalCode || null,
        country: payload.country || payload.shippingAddress?.country || null,
    };

    // ************* Build guest customer data *************
    let guestCustomer = null;
    if (isGuest) {
        guestCustomer = {
            fullName: payload.guestCustomer?.fullName || payload.fullName || null,
            email: payload.guestCustomer?.email || payload.email || null,
            phone: payload.guestCustomer?.phone || payload.phone || null,
        };
    }

    // ************* Build order data *************
    const orderData = {
        user: userId || null,
        guestCustomer,
        items,
        subtotal: totals.subtotal,
        shippingCost: totals.shippingCost,
        discount: totals.discount,
        grandTotal: totals.grandTotal,
        purchaseType: payload.purchaseType || "self",
        giftMessage: payload.purchaseType === "gift" ? payload.giftMessage || null : null,
        giftMessageStatus: payload.purchaseType === "gift" ? "pending" : "none",
        giftStatus: payload.purchaseType === "gift" ? "pending_claim" : "none",
        shippingAddress,
        isGuestOrder: isGuest,
        // Legacy fields for backward compatibility
        product: items[0]?.product || null,
        quantity: items[0]?.quantity || 1,
        assignedTag: null,
        assignedTags: [],
    };

    // ************* Create order *************
    const order = await orderRepository.createOrder(orderData);

    // ************* Handle gift messages *************
    if (payload.purchaseType === "gift" && payload.giftMessage) {
        await pendingQuoteRepository.createPendingQuote({
            text: payload.giftMessage,
            user: userId,
            order: order._id,
            status: "pending",
            category: "other",
        });
    }

    return order;
};


/**
 * Create Checkout (Supports both Guest & Authenticated)
 */
const createCheckout = async (userId, payload, isGuest = false) => {
    let order;

    if (payload.orderId) {
        order = await orderRepository.findById(payload.orderId);
        if (!order) {
            throw new AppError(httpStatus.NOT_FOUND, "Order not found");
        }

        // Authorization check
        if (!isGuest) {
            if (order.user?.toString() !== userId?.toString()) {
                throw new AppError(httpStatus.FORBIDDEN, "Unauthorized");
            }
        } else {
            if (order.guestCustomer?.email !== payload.guestCustomer?.email) {
                throw new AppError(httpStatus.FORBIDDEN, "Invalid guest access");
            }
        }

        if (order.paymentStatus === "paid") {
            throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");
        }

        // Update shipping address if provided
        if (payload.address || payload.fullName) {
            const shippingAddress = {
                fullName: payload.fullName || order.shippingAddress?.fullName,
                email: payload.email || order.shippingAddress?.email,
                phone: payload.phone || order.shippingAddress?.phone,
                address: payload.address || order.shippingAddress?.address,
                city: payload.city || order.shippingAddress?.city,
                postalCode: payload.postalCode || order.shippingAddress?.postalCode,
                country: payload.country || order.shippingAddress?.country,
            };
            await orderRepository.updateOrder(payload.orderId, { shippingAddress });
        }
    } else {
        order = await createOrder(userId, payload, isGuest);
    }

    return createCheckoutSession(order._id);
};


/**
 * Create Stripe Checkout Session
 */
const createCheckoutSession = async (orderId) => {
    const order = await orderRepository.findById(orderId);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // ✅ Build line items
    const lineItems = createStripeLineItems(order);

    // Build metadata
    const metadata = {
        orderId: orderId.toString(),
    };

    if (order.user) {
        metadata.userId = order.user.toString();
    }

    if (order.isGuestOrder && order.guestCustomer) {
        metadata.guestEmail = order.guestCustomer.email;
        metadata.guestName = order.guestCustomer.fullName;
        metadata.isGuestOrder = "true";
    }

    const customerEmail = order.isGuestOrder
        ? order.guestCustomer?.email
        : order.user?.email;

    // ✅ Use centralized config for URLs
    const successUrl = PAYMENT_CONFIG.getSuccessUrl(orderId);
    const cancelUrl = PAYMENT_CONFIG.getCancelUrl();

    // ✅ Create Stripe session with config values
    const session = await stripe.checkout.sessions.create({
        payment_method_types: PAYMENT_CONFIG.getPaymentMethodTypes(),
        mode: PAYMENT_CONFIG.stripe.mode,
        customer_email: customerEmail,
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: metadata,
    });

    await orderRepository.updateOrder(orderId, { stripeSessionId: session.id });

    return session;
};


/**
 * Confirm Payment & Assign Tags
 */
const confirmPaymentAndAssignTag = async (orderId, paymentIntentId) => {
    const order = await orderRepository.findById(orderId);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Update payment status
    const updateData = {
        paymentStatus: "paid",
        stripePaymentIntentId: paymentIntentId,
        fulfillmentStatus: "pending",
    };

    // Assign tags based on order type
    if (order.items && order.items.length > 0) {
        // Multi-product: parallel tag assignment
        let totalAssigned = 0;
        let totalRequired = 0;
        const tagUpdates = [];

        for (const item of order.items) {
            const requiredQty = item.quantity || 1;
            totalRequired += requiredQty;

            // Find tags in parallel
            const availableTags = await tagRepository.findMultipleUnusedTags(requiredQty);
            const tagIds = availableTags.map(tag => tag._id);

            // Prepare tag updates for parallel execution
            for (const tag of availableTags) {
                tagUpdates.push(
                    tagRepository.updateTag(tag._id, {
                        owner: order.user,
                        isActivated: true,
                        activatedAt: new Date(),
                    })
                );
            }

            // Update item with assigned tags
            await Order.updateOne(
                { _id: orderId, "items._id": item._id },
                { $set: { "items.$.assignedTags": tagIds } }
            );

            totalAssigned += tagIds.length;

            // Legacy: keep first tag in assignedTag
            if (tagIds.length > 0 && !updateData.assignedTag) {
                updateData.assignedTag = tagIds[0];
            }
        }

        // Execute all tag updates in parallel
        if (tagUpdates.length > 0) {
            await Promise.all(tagUpdates);
        }

        // Update tag assignment status
        if (totalAssigned === 0) {
            updateData.tagAssignmentStatus = "none";
        } else if (totalAssigned < totalRequired) {
            updateData.tagAssignmentStatus = "partial";
        } else {
            updateData.tagAssignmentStatus = "complete";
            updateData.fulfillmentStatus = "assigned";
        }

        // Legacy: update assignedTags array
        const allTags = [];
        const seenIds = new Set();

        for (const item of order.items) {
            if (item.assignedTags && item.assignedTags.length > 0) {
                for (const tagId of item.assignedTags) {
                    if (!seenIds.has(tagId.toString())) {
                        seenIds.add(tagId.toString());
                        allTags.push(tagId);
                    }
                }
            }
        }

        updateData.assignedTags = allTags.map(tagId => ({
            tag: tagId,
            assignedAt: new Date(),
            assignedBy: "auto",
        }));
    } else {
        // Legacy: single product tag assignment (optimized)
        const requiredQty = order.quantity || 1;
        const availableTags = await tagRepository.findMultipleUnusedTags(requiredQty);

        const assignedTags = availableTags.map((tag) => ({
            tag: tag._id,
            assignedAt: new Date(),
            assignedBy: "auto",
        }));

        // Update tags in parallel
        if (availableTags.length > 0) {
            const tagUpdates = availableTags.map((tag) =>
                tagRepository.updateTag(tag._id, {
                    owner: order.user,
                    isActivated: true,
                    activatedAt: new Date(),
                })
            );
            await Promise.all(tagUpdates);
        }

        updateData.assignedTags = assignedTags;

        if (assignedTags.length > 0) {
            updateData.assignedTag = assignedTags[0].tag;
        }

        if (assignedTags.length === 0) {
            updateData.tagAssignmentStatus = "none";
        } else if (assignedTags.length < requiredQty) {
            updateData.tagAssignmentStatus = "partial";
        } else {
            updateData.tagAssignmentStatus = "complete";
            updateData.fulfillmentStatus = "assigned";
        }
    }

    return orderRepository.updateOrder(orderId, updateData);
};


/**
 * Claim Gift Order
 */
const claimGiftOrder = async (orderId, userId) => {
    const order = await orderRepository.findById(orderId);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    if (order.purchaseType !== "gift") {
        throw new AppError(httpStatus.BAD_REQUEST, "This order is not a gift order");
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(httpStatus.BAD_REQUEST, "Gift order is not paid yet");
    }

    // ✅ Get all tags from order
    const allTags = await order.getAllTags();
    if (!allTags || allTags.length === 0) {
        throw new AppError(httpStatus.BAD_REQUEST, "No tags assigned to this gift order");
    }

    if (order.giftStatus === "claimed") {
        throw new AppError(httpStatus.BAD_REQUEST, "This gift has already been claimed");
    }

    // ✅ Claim all tags
    for (const tagId of allTags) {
        const tag = await tagRepository.findById(tagId);
        if (!tag) {
            throw new AppError(httpStatus.NOT_FOUND, `Tag ${tagId} not found`);
        }
        if (tag.owner) {
            throw new AppError(httpStatus.BAD_REQUEST, `Tag ${tag.tagCode} is already owned by someone`);
        }
        await tagRepository.updateTag(tag._id, {
            owner: userId,
            isActivated: true,
            activatedAt: new Date(),
        });
    }

    return orderRepository.updateOrder(orderId, {
        giftStatus: "claimed",
        giftClaimedBy: userId,
        giftClaimedAt: new Date(),
    });
};

/**
 * Get Order By ID
 */
const getOrderById = async (id) => {
    const order = await orderRepository.findById(id);
    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    return orderRepository.normalizeOrder(order);
};


/**
 * Get Authenticated User's Orders with Pagination
 */
const getUserOrders = async (userId, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    const total = await Order.countDocuments({ user: userId });
    const orders = await Order.find({ user: userId })
        .populate("product", "name price image")
        .populate("items.product", "name price image")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // ✅ Normalize each order
    const normalizedOrders = orders.map(order => orderRepository.normalizeOrder(order));

    return {
        data: normalizedOrders,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
        },
    };
};


/**
 * Get User's Total Spent
 */
const getUserTotalSpent = async (userId) => {
    try {
        // Convert string ID to ObjectId safely
        let objectId;
        try {
            objectId = new mongoose.Types.ObjectId(userId);
        } catch (err) {
            console.error("Invalid userId format:", userId);
            return 0;
        }

        const result = await Order.aggregate([
            {
                $match: {
                    user: objectId,
                    paymentStatus: "paid",
                },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productData",
                },
            },
            {
                $unwind: {
                    path: "$productData",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ["$productData.price", 0] },
                                { $ifNull: ["$quantity", 1] },
                            ],
                        },
                    },
                },
            },
        ]);

        return result[0]?.total || 0;
    } catch (error) {
        console.error("Error in getUserTotalSpent:", error);
        // Fallback to simple calculation
        try {
            const orders = await Order.find({
                user: userId,
                paymentStatus: "paid",
            }).populate("product", "price");

            return orders.reduce((sum, order) => {
                const price = order.product?.price || 0;
                const quantity = order.quantity || 1;
                return sum + price * quantity;
            }, 0);
        } catch (fallbackError) {
            console.error("Fallback calculation also failed:", fallbackError);
            return 0;
        }
    }
};

/**
 * Get All Orders (Admin) with Search & Filter
 */
const getAllOrders = async (page = 1, limit = 10, search = "", fulfillmentStatus = null) => {
    const skip = (page - 1) * limit;

    const filter = {};
    if (fulfillmentStatus && fulfillmentStatus !== "all") {
        filter.fulfillmentStatus = fulfillmentStatus;
    }

    let orders = await Order.find(filter)
        .populate("user", "name email")
        .populate("product", "name price image")
        .populate("items.product", "name price image")
        .populate("assignedTag", "tagCode")
        .populate("assignedTags.tag", "tagCode")
        .sort({ createdAt: -1 })
        .lean();

    let total = orders.length;

    // Search filter
    if (search && search.trim() !== "") {
        const searchLower = search.toLowerCase().trim();
        orders = orders.filter((order) => {
            if (order._id.toString().toLowerCase().includes(searchLower)) return true;
            if (order.user?.name?.toLowerCase().includes(searchLower)) return true;
            if (order.user?.email?.toLowerCase().includes(searchLower)) return true;
            if (order.product?.name?.toLowerCase().includes(searchLower)) return true;
            if (order.shippingAddress?.address?.toLowerCase().includes(searchLower)) return true;
            if (order.shippingAddress?.fullName?.toLowerCase().includes(searchLower)) return true;
            if (order.assignedTag?.tagCode?.toLowerCase().includes(searchLower)) return true;
            if (order.isGuestOrder && order.guestCustomer?.email?.toLowerCase().includes(searchLower)) return true;

            // ✅ Search items
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    if (item.product?.name?.toLowerCase().includes(searchLower)) return true;
                }
            }

            return false;
        });
        total = orders.length;
    }

    const paginatedOrders = orders.slice(skip, skip + limit);

    // ✅ Normalize each order
    const normalizedOrders = paginatedOrders.map(order => orderRepository.normalizeOrder(order));

    return {
        meta: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPage: Math.ceil(total / limit),
        },
        data: normalizedOrders,
    };
};

/**
 * Get Order Stats (Admin)
 */
const getOrderStats = async () => {
    const orders = await Order.find();

    const stats = {
        total: orders.length,
        pending: orders.filter((o) => o.fulfillmentStatus === "pending").length,
        assigned: orders.filter((o) => o.fulfillmentStatus === "assigned").length,
        shipped: orders.filter((o) => o.fulfillmentStatus === "shipped").length,
        delivered: orders.filter((o) => o.fulfillmentStatus === "delivered").length,
        cancelled: orders.filter((o) => o.fulfillmentStatus === "cancelled").length,
        returned: orders.filter((o) => o.fulfillmentStatus === "returned").length,
        paid: orders.filter((o) => o.paymentStatus === "paid").length,
        unpaid: orders.filter((o) => o.paymentStatus === "pending").length,
        refunded: orders.filter((o) => o.paymentStatus === "refunded").length,
        guestOrders: orders.filter((o) => o.isGuestOrder === true).length,
        authenticatedOrders: orders.filter((o) => o.isGuestOrder === false || o.user !== null).length,
    };

    return stats;
};

/**
 * Get Guest Orders by Email
 */
const getGuestOrdersByEmail = async (email, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    const filter = {
        isGuestOrder: true,
        "guestCustomer.email": email,
    };

    const [data, total] = await Promise.all([
        Order.find(filter)
            .populate("product", "name price image")
            .populate("assignedTag", "tagCode")
            .populate("assignedTags.tag", "tagCode")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(filter),
    ]);

    return {
        data,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
        },
    };
};

/**
 * Update Order (Admin)
 */
const updateOrder = async (id, payload) => {
    const order = await orderRepository.findById(id);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.fulfillmentStatus === "cancelled") {
        throw new AppError(400, "Cannot update a cancelled order");
    }

    if (order.fulfillmentStatus === "returned") {
        throw new AppError(400, "Cannot update a returned order");
    }

    // Backward compatibility: single assignedTag manual assign
    if (payload.assignedTag) {
        const tag = await tagRepository.findById(payload.assignedTag);

        if (!tag) {
            throw new AppError(404, "Tag not found");
        }

        if (tag.owner && tag.owner.toString() !== order.user.toString()) {
            throw new AppError(
                400,
                "This tag is already assigned to another user/order",
            );
        }

        const existingOrderWithTag = await Order.findOne({
            $or: [
                { assignedTag: payload.assignedTag },
                { "assignedTags.tag": payload.assignedTag },
            ],
            fulfillmentStatus: { $nin: ["cancelled", "returned"] },
            _id: { $ne: id },
        });

        if (existingOrderWithTag) {
            throw new AppError(
                400,
                "This tag is already assigned to another active order",
            );
        }

        await tagRepository.updateTag(tag._id, {
            owner: order.user,
            isActivated: true,
            activatedAt: new Date(),
        });

        const existingAssignedTags = order.assignedTags || [];
        const alreadyExists = existingAssignedTags.some(
            (item) =>
                item.tag?._id?.toString() === tag._id.toString() ||
                item.tag?.toString() === tag._id.toString(),
        );

        if (!alreadyExists) {
            payload.assignedTags = [
                ...existingAssignedTags.map((item) => ({
                    tag: item.tag?._id || item.tag,
                    assignedAt: item.assignedAt || new Date(),
                    assignedBy: item.assignedBy || "admin",
                })),
                {
                    tag: tag._id,
                    assignedAt: new Date(),
                    assignedBy: "admin",
                },
            ];
        }

        payload.assignedTag = order.assignedTag || tag._id;
    }

    const finalAssignedCount =
        payload.assignedTags?.length ||
        order.assignedTags?.length ||
        (payload.assignedTag || order.assignedTag ? 1 : 0);

    const requiredQty = order.quantity || 1;

    if (finalAssignedCount === 0) {
        payload.tagAssignmentStatus = "none";
    } else if (finalAssignedCount < requiredQty) {
        payload.tagAssignmentStatus = "partial";
    } else {
        payload.tagAssignmentStatus = "complete";
    }

    if (
        ["assigned", "shipped", "delivered"].includes(payload.fulfillmentStatus) &&
        finalAssignedCount < requiredQty
    ) {
        throw new AppError(
            400,
            `Assign all required tags before changing fulfillment status. Required: ${requiredQty}, Assigned: ${finalAssignedCount}`,
        );
    }

    if (
        payload.fulfillmentStatus === "assigned" &&
        finalAssignedCount < requiredQty
    ) {
        throw new AppError(400, "Assign all required tags first");
    }

    // Status transition validation
    const allowedTransitions = {
        pending: ["assigned", "cancelled"],
        assigned: ["shipped", "cancelled"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
        returned: [],
    };

    if (
        payload.fulfillmentStatus &&
        !allowedTransitions[order.fulfillmentStatus]?.includes(
            payload.fulfillmentStatus,
        )
    ) {
        throw new AppError(
            400,
            `Invalid status transition from ${order.fulfillmentStatus} to ${payload.fulfillmentStatus}`,
        );
    }

    if (
        payload.fulfillmentStatus === "shipped" &&
        order.paymentStatus !== "paid"
    ) {
        throw new AppError(400, "Order must be paid before shipping");
    }

    if (payload.fulfillmentStatus === "delivered") {
        payload.deliveredAt = new Date();
    }

    if (payload.fulfillmentStatus === "cancelled") {
        payload.cancelledAt = new Date();
    }

    return orderRepository.updateOrder(id, payload);
};

/**
 * Cancel Order (User or Admin)
 */
const cancelOrder = async (orderId, userId, reason, cancelledBy = "user") => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    const cancellableStatuses = ["pending", "assigned"];
    if (!cancellableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            `Order cannot be cancelled in ${order.fulfillmentStatus} status`,
        );
    }

    if (cancelledBy === "user" && order.user.toString() !== userId) {
        throw new AppError(403, "You are not authorized to cancel this order");
    }

    let refundProcessed = false;
    let refundTransactionId = null;
    const refundAmount = (order.product.price || 0) * (order.quantity || 1);

    if (order.paymentStatus === "paid" && order.stripePaymentIntentId) {
        try {
            const refund = await stripe.refunds.create({
                payment_intent: order.stripePaymentIntentId,
                reason: "requested_by_customer",
            });
            refundProcessed = true;
            refundTransactionId = refund.id;
        } catch (error) {
            console.error("Refund failed:", error);
            throw new AppError(500, "Refund failed. Please contact support.");
        }
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        fulfillmentStatus: "cancelled",
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancelledBy,
        ...(refundProcessed && {
            paymentStatus: "refunded",
            refundStatus: "completed",
            refundProcessedAt: new Date(),
            refundTransactionId,
            refundAmount,
        }),
    });

    if (
        order.paymentStatus === "paid" &&
        order.fulfillmentStatus !== "cancelled"
    ) {
        await productRepository.increaseStock(
            order.product._id,
            order.quantity || 1,
        );
    }

    if (order.assignedTag) {
        await tagRepository.resetTag(order.assignedTag._id);
    }

    return updatedOrder;
};

/**
 * Request Refund (User)
 */
const requestRefund = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.user.toString() !== userId) {
        throw new AppError(
            403,
            "You are not authorized to request refund for this order",
        );
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be refunded");
    }

    if (order.refundStatus !== "none") {
        throw new AppError(400, "Refund already requested or processed");
    }

    if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            "For shipped or delivered orders, please request a return first",
        );
    }

    if (order.fulfillmentStatus === "returned") {
        throw new AppError(400, "This order is already returned");
    }

    return orderRepository.updateOrder(orderId, {
        refundStatus: "requested",
        refundReason: reason,
        refundRequestedAt: new Date(),
    });
};

/**
 * Process Refund (Admin)
 */
const processRefund = async (orderId, approve = true, rejectReason = null) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.refundStatus !== "requested") {
        throw new AppError(400, "No pending refund request");
    }

    if (!approve) {
        return orderRepository.updateOrder(orderId, {
            refundStatus: "rejected",
            refundReason: rejectReason || "Refund request rejected",
        });
    }

    if (!order.stripePaymentIntentId) {
        throw new AppError(400, "No payment intent found for this order");
    }

    try {
        const refundAmount = (order.product.price || 0) * (order.quantity || 1);

        const refund = await stripe.refunds.create({
            payment_intent: order.stripePaymentIntentId,
            amount: refundAmount * 100,
            reason: "requested_by_customer",
        });

        const updatePayload = {
            refundStatus: "completed",
            paymentStatus: "refunded",
            refundProcessedAt: new Date(),
            refundTransactionId: refund.id,
            refundAmount,
        };

        if (
            ["pending", "assigned", "cancelled"].includes(order.fulfillmentStatus)
        ) {
            updatePayload.fulfillmentStatus = "cancelled";
            updatePayload.cancelledAt = new Date();
            updatePayload.cancelledBy = "admin";
            updatePayload.cancellationReason = "Refund processed";
        }

        const updatedOrder = await orderRepository.updateOrder(
            orderId,
            updatePayload,
        );

        if (["pending", "assigned"].includes(order.fulfillmentStatus)) {
            await productRepository.increaseStock(
                order.product._id,
                order.quantity || 1,
            );
        }

        if (order.assignedTag && ["assigned"].includes(order.fulfillmentStatus)) {
            await tagRepository.resetTag(order.assignedTag._id);
        }

        return updatedOrder;
    } catch (error) {
        console.error("Stripe refund failed:", error);
        throw new AppError(
            500,
            "Refund processing failed. Please try again or contact support.",
        );
    }
};

/**
 * Request Return (User)
 */
const requestReturn = async (orderId, userId, reason) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.user.toString() !== userId) {
        throw new AppError(
            403,
            "You are not authorized to request return for this order",
        );
    }

    if (order.paymentStatus !== "paid") {
        throw new AppError(400, "Only paid orders can be returned");
    }

    const returnableStatuses = ["delivered"];
    if (!returnableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            400,
            `Order cannot be returned in ${order.fulfillmentStatus} status`,
        );
    }

    if (!order.deliveredAt) {
        throw new AppError(400, "Delivery date not found");
    }

    const returnWindowDays = 3;
    const now = new Date();
    const deliveredAt = new Date(order.deliveredAt);
    const diffTime = now - deliveredAt;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays > returnWindowDays) {
        throw new AppError(
            400,
            `Return request is allowed only within ${returnWindowDays} days of delivery`,
        );
    }

    if (order.returnStatus !== "none") {
        throw new AppError(400, "Return already requested or processed");
    }

    return orderRepository.updateOrder(orderId, {
        returnStatus: "requested",
        returnReason: reason,
        returnRequestedAt: new Date(),
    });
};

/**
 * Process Return (Admin)
 */
const processReturn = async (
    orderId,
    approve = true,
    trackingNumber = null,
    rejectReason = null,
) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (order.returnStatus !== "requested") {
        throw new AppError(400, "No pending return request");
    }

    if (!approve) {
        return orderRepository.updateOrder(orderId, {
            returnStatus: "rejected",
            returnReason: rejectReason || "Return request rejected",
        });
    }

    const updateData = {
        returnStatus: "approved",
        returnApprovedAt: new Date(),
    };

    if (trackingNumber) {
        updateData.returnTrackingNumber = trackingNumber;
        updateData.returnStatus = "shipped";
        updateData.returnShippedAt = new Date();
    }

    return orderRepository.updateOrder(orderId, updateData);
};

/**
 * Complete Return (Admin)
 */
const completeReturn = async (orderId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (!["approved", "shipped", "received"].includes(order.returnStatus)) {
        throw new AppError(400, "Return is not ready to complete");
    }

    const refundAmount = (order.product.price || 0) * (order.quantity || 1);
    let refundTransactionId = null;

    // Paid order must be refunded before marking return completed
    if (order.paymentStatus === "paid") {
        if (!order.stripePaymentIntentId) {
            throw new AppError(
                400,
                "No payment intent found for this order. Cannot complete return without refund.",
            );
        }

        try {
            const refund = await stripe.refunds.create({
                payment_intent: order.stripePaymentIntentId,
                amount: refundAmount * 100,
                reason: "requested_by_customer",
            });

            refundTransactionId = refund.id;
        } catch (error) {
            console.error("Refund failed:", error);
            throw new AppError(500, "Refund failed while completing return");
        }
    }

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        returnStatus: "completed",
        returnReceivedAt: new Date(),
        fulfillmentStatus: "returned",
        ...(order.paymentStatus === "paid" && {
            paymentStatus: "refunded",
            refundStatus: "completed",
            refundProcessedAt: new Date(),
            refundTransactionId,
            refundAmount,
        }),
    });

    await productRepository.increaseStock(order.product._id, order.quantity || 1);

    if (order.assignedTag) {
        await tagRepository.resetTag(order.assignedTag._id);
    }

    return updatedOrder;
};

/**
 * Update Shipping Address (User)
 */
const updateShippingAddress = async (orderId, userId, shippingAddress) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Check if user owns the order
    if (order.user.toString() !== userId) {
        throw new AppError(
            httpStatus.FORBIDDEN,
            "You don't have permission to update this order",
        );
    }

    // Check if address can be updated (only before shipping)
    const uneditableStatuses = ["shipped", "delivered", "cancelled", "returned"];
    if (uneditableStatuses.includes(order.fulfillmentStatus)) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            `Cannot update address when order status is ${order.fulfillmentStatus}`,
        );
    }

    // Update shipping address
    const updatedOrder = await orderRepository.updateOrder(orderId, {
        shippingAddress: {
            fullName: shippingAddress.fullName || order.shippingAddress?.fullName,
            phone: shippingAddress.phone || order.shippingAddress?.phone,
            address: shippingAddress.address || order.shippingAddress?.address,
            city: shippingAddress.city || order.shippingAddress?.city,
            postalCode: shippingAddress.postalCode || order.shippingAddress?.postalCode,
            country: shippingAddress.country || order.shippingAddress?.country,
        },
    });

    return updatedOrder;
};

/**
 * Approve Gift Message (Admin)
 */
const approveGiftMessage = async (orderId, adminNote = null) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (!order.giftMessage) {
        throw new AppError(400, "No gift message found");
    }

    if (order.giftMessageStatus === "approved") {
        throw new AppError(400, "Gift message already approved");
    }

    if (order.giftMessageStatus === "rejected") {
        throw new AppError(400, "Gift message already rejected");
    }

    return orderRepository.updateOrder(orderId, {
        giftMessageStatus: "approved",
        giftMessageReviewedAt: new Date(),
        giftMessageAdminNote: adminNote,
    });
};

/**
 * Reject Gift Message (Admin)
 */
const rejectGiftMessage = async (orderId, adminNote = null) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    if (!order.giftMessage) {
        throw new AppError(400, "No gift message found");
    }

    if (order.giftMessageStatus === "rejected") {
        throw new AppError(400, "Gift message already rejected");
    }

    if (order.giftMessageStatus === "approved") {
        throw new AppError(400, "Gift message already approved");
    }

    return orderRepository.updateOrder(orderId, {
        giftMessageStatus: "rejected",
        giftMessageReviewedAt: new Date(),
        giftMessageAdminNote: adminNote,
    });
};

/**
 * Add Tag to Order (Admin)
 */
const addTagToOrder = async (orderId, tagId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    ensureOrderTagsEditable(order);

    const requiredQty = order.quantity || 1;
    const existingAssignedTags = order.assignedTags || [];

    if (existingAssignedTags.length >= requiredQty) {
        throw new AppError(400, "All required tags are already assigned");
    }

    const alreadyExists = existingAssignedTags.some(
        (item) => getTagId(item) === tagId.toString(),
    );

    if (alreadyExists) {
        throw new AppError(400, "This tag is already assigned to this order");
    }

    const tag = await ensureTagAvailableForOrder(tagId, orderId, order.user);

    await tagRepository.updateTag(tag._id, {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
    });

    const updatedAssignedTags = [
        ...existingAssignedTags.map((item) => ({
            tag: item.tag?._id || item.tag,
            assignedAt: item.assignedAt || new Date(),
            assignedBy: item.assignedBy || "admin",
        })),
        {
            tag: tag._id,
            assignedAt: new Date(),
            assignedBy: "admin",
        },
    ];

    const tagAssignmentStatus = buildTagAssignmentStatus(
        updatedAssignedTags.length,
        requiredQty,
    );

    return orderRepository.updateOrder(orderId, {
        assignedTags: updatedAssignedTags,
        assignedTag: order.assignedTag || tag._id,
        tagAssignmentStatus,
        fulfillmentStatus: tagAssignmentStatus === "complete" ? "assigned" : "pending",
    });
};

/**
 * Remove Tag from Order (Admin)
 */
const removeTagFromOrder = async (orderId, tagId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    ensureOrderTagsEditable(order);

    const targetTagId = tagId.toString();
    const existingAssignedTags = order.assignedTags || [];

    const existsInAssignedTags = existingAssignedTags.some(
        (item) => getTagId(item) === targetTagId,
    );

    const existsInAssignedTag = getTagId(order.assignedTag) === targetTagId;

    if (!existsInAssignedTags && !existsInAssignedTag) {
        throw new AppError(404, "Tag is not assigned to this order");
    }

    await tagRepository.resetTag(targetTagId);

    const updatedAssignedTags = existingAssignedTags
        .filter((item) => getTagId(item) !== targetTagId)
        .map((item) => ({
            tag: getTagId(item),
            assignedAt: item.assignedAt || new Date(),
            assignedBy: item.assignedBy || "admin",
        }));

    const requiredQty = order.quantity || 1;

    const tagAssignmentStatus = buildTagAssignmentStatus(
        updatedAssignedTags.length,
        requiredQty,
    );

    return orderRepository.updateOrder(orderId, {
        assignedTags: updatedAssignedTags,
        assignedTag: updatedAssignedTags[0]?.tag || null,
        tagAssignmentStatus,
        fulfillmentStatus: tagAssignmentStatus === "complete" ? "assigned" : "pending",
    });
};

/**
 * Replace Order Tag (Admin)
 */
const replaceOrderTag = async (orderId, oldTagId, newTagId) => {
    const order = await orderRepository.findById(orderId);

    if (!order) {
        throw new AppError(404, "Order not found");
    }

    ensureOrderTagsEditable(order);

    const targetOldTagId = oldTagId.toString();
    const targetNewTagId = newTagId.toString();

    if (targetOldTagId === targetNewTagId) {
        throw new AppError(400, "Old tag and new tag cannot be the same");
    }

    const existingAssignedTags = order.assignedTags || [];

    const oldExistsInAssignedTags = existingAssignedTags.some(
        (item) => getTagId(item) === targetOldTagId,
    );

    const oldExistsInAssignedTag = getTagId(order.assignedTag) === targetOldTagId;

    if (!oldExistsInAssignedTags && !oldExistsInAssignedTag) {
        throw new AppError(404, "Old tag is not assigned to this order");
    }

    const newTag = await ensureTagAvailableForOrder(
        targetNewTagId,
        orderId,
        order.user,
    );

    await tagRepository.resetTag(targetOldTagId);

    await tagRepository.updateTag(newTag._id, {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
    });

    let updatedAssignedTags = existingAssignedTags.map((item) => {
        if (getTagId(item) === targetOldTagId) {
            return {
                tag: newTag._id,
                assignedAt: new Date(),
                assignedBy: "admin",
            };
        }

        return {
            tag: getTagId(item),
            assignedAt: item.assignedAt || new Date(),
            assignedBy: item.assignedBy || "admin",
        };
    });

    if (!oldExistsInAssignedTags && oldExistsInAssignedTag) {
        updatedAssignedTags = [
            {
                tag: newTag._id,
                assignedAt: new Date(),
                assignedBy: "admin",
            },
            ...updatedAssignedTags,
        ];
    }

    const requiredQty = order.quantity || 1;

    const tagAssignmentStatus = buildTagAssignmentStatus(
        updatedAssignedTags.length,
        requiredQty,
    );

    return orderRepository.updateOrder(orderId, {
        assignedTags: updatedAssignedTags,
        assignedTag: oldExistsInAssignedTag
            ? newTag._id
            : order.assignedTag || updatedAssignedTags[0]?.tag,
        tagAssignmentStatus,
        fulfillmentStatus: tagAssignmentStatus === "complete" ? "assigned" : "pending",
    });
};

// ============================================================
// EXPORTS
// ============================================================

export default {
    createOrder,
    createCheckout,
    createCheckoutSession,
    confirmPaymentAndAssignTag,
    claimGiftOrder,
    getOrderById,
    getUserOrders,
    getUserTotalSpent,
    getAllOrders,
    getOrderStats,
    getGuestOrdersByEmail,
    updateOrder,
    cancelOrder,
    requestRefund,
    processRefund,
    requestReturn,
    processReturn,
    completeReturn,
    updateShippingAddress,
    approveGiftMessage,
    rejectGiftMessage,
    addTagToOrder,
    replaceOrderTag,
    removeTagFromOrder,
    claimGiftOrder,
};