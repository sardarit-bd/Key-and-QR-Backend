import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import orderRepository from "./order.repository.js";
import tagRepository from "../tag/tag.repository.js";
import productRepository from "../product/product.repository.js";
import stripe from "../../config/stripe.js";
import env from "../../config/env.js";
import Order from "./order.model.js";
import mongoose from "mongoose";
import pendingQuoteRepository from "../pendingQuote/pendingQuote.repository.js";
import PAYMENT_CONFIG from "../../config/payment.config.js";
import PAYMENT_STATUS from "../../config/paymentStatus.js";
import logger from "../../utils/logger.js";
import { generateGuestAccessToken } from "../../utils/jwt.js";

// ============================================================
// HELPER: Build order items from cart
// ============================================================

const buildOrderItems = async (items, isGuest = false) => {
  if (!items || items.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "At least one item is required");
  }

  // Validate unique products
  const productIds = items.map((item) => item.productId);
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
      throw new AppError(
        httpStatus.NOT_FOUND,
        `Product ${item.productId} not found`,
      );
    }

    // Validate stock
    if (product.stock < (item.quantity || 1)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Not enough stock for ${product.name}. Available: ${product.stock}`,
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
      giftMessage:
        item.purchaseType === "gift" ? item.giftMessage || null : null,
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

  if (cached && Date.now() - cached.timestamp < _STOCK_CACHE_TTL) {
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
  state: payload.state || payload.shippingAddress?.state || null,
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
 * Build tag assignment status — single source of truth
 * Used by: webhook, admin assignment, manual update, unassign
 */
const buildTagAssignmentStatus = (assignedCount, requiredQty) => {
  if (assignedCount === 0) return "pending_assignment";
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
  return order.isGuestOrder ? order.guestCustomer?.email : order.user?.email;
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
    const productIds = payload.items.map(
      (item) => item.productId || item.product,
    );
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
        throw new AppError(
          httpStatus.NOT_FOUND,
          `Product ${productId} not found`,
        );
      }

      // Check stock
      const stock = await getCachedStock(productId);
      if (stock < (item.quantity || 1)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Not enough stock for ${product.name}. Available: ${stock}`,
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
        giftMessage:
          item.purchaseType === "gift" ? item.giftMessage || null : null,
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

    items = [
      {
        product: product._id,
        quantity: quantity,
        unitPrice: unitPrice,
        subtotal: subtotal,
        purchaseType: payload.purchaseType || "self",
        giftMessage:
          payload.purchaseType === "gift" ? payload.giftMessage || null : null,
        assignedTags: [],
      },
    ];
  } else {
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
    postalCode:
      payload.postalCode || payload.shippingAddress?.postalCode || null,
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
    giftMessage:
      payload.purchaseType === "gift" ? payload.giftMessage || null : null,
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

    if (order.paymentStatus === PAYMENT_STATUS.SUCCEEDED) {
      throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");
    }

    // Update shipping address
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

  // ************* Return order, not session *************
  // Session creation moved to Payment Service
  return order;
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

  // ✅ Generate guest access token for guest orders
  let guestAccessToken = null;
  if (order.isGuestOrder) {
    guestAccessToken = generateGuestAccessToken(order._id);
  }

  // ✅ Use centralized config for URLs
  const successUrl = PAYMENT_CONFIG.getSuccessUrl(orderId, guestAccessToken);
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
 *
 * Called by the Stripe webhook handler AFTER webhook-level idempotency.
 * Assumes the event has already been claimed by the webhook route.
 * Uses MongoDB withTransaction for full atomicity:
 *   - Tag assignment and order update commit together or roll back together.
 */
const confirmPaymentAndAssignTag = async (
  orderId,
  paymentIntentId,
) => {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      // ✅ 1. GET ORDER WITH LOCK (inside transaction)
      const order = await Order.findById(orderId).session(session);
      if (!order) {
        throw new AppError(httpStatus.NOT_FOUND, "Order not found");
      }

      // ✅ 2. ALREADY PAID — idempotent
      if (order.paymentStatus === PAYMENT_STATUS.SUCCEEDED) {
        logger.info(`Order ${orderId} already paid — returning`);
        return order;
      }

      // ✅ 3. CANCELLED — reject
      if (order.fulfillmentStatus === "cancelled") {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          "Cannot confirm payment for cancelled order",
        );
      }

      // ✅ 4. VERIFY PAYMENT INTENT
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "succeeded") {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            `Payment not completed. Status: ${paymentIntent.status}`,
          );
        }

        const expectedAmount = Math.round(order.grandTotal * 100);
        if (paymentIntent.amount !== expectedAmount) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            `Payment amount mismatch. Expected: ${expectedAmount}, Received: ${paymentIntent.amount}`,
          );
        }

        if (paymentIntent.currency !== PAYMENT_CONFIG.getCurrency()) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            `Currency mismatch. Expected: ${PAYMENT_CONFIG.getCurrency()}, Received: ${paymentIntent.currency}`,
          );
        }
      } catch (error) {
        if (error.type === "StripeInvalidRequestError") {
          throw new AppError(httpStatus.BAD_REQUEST, "Invalid payment intent ID");
        }
        throw error;
      }

      // ✅ 5. CALCULATE REQUIRED TAGS
      let requiredQty = 0;
      if (order.items && order.items.length > 0) {
        requiredQty = order.items.reduce(
          (sum, item) => sum + (item.quantity || 1),
          0,
        );
      } else {
        requiredQty = order.quantity || 1;
      }

      // ✅ 6. ATOMIC TAG ASSIGNMENT (best-effort — payment never fails)
      const assignedTags = [];

      if (requiredQty > 0) {
        const found = await tagRepository.findAndAssignMultipleTags(
          requiredQty,
          order.user || null,
          orderId,
          session,
        );

        if (found.length > 0) {
          assignedTags.push(...found);

          // Update order items with assigned tags
          if (order.items && order.items.length > 0) {
            let tagIndex = 0;
            for (const item of order.items) {
              const itemTagCount = item.quantity || 1;
              const itemTags = found.slice(
                tagIndex,
                tagIndex + itemTagCount,
              );
              if (itemTags.length > 0) {
                await Order.updateOne(
                  { _id: orderId, "items._id": item._id },
                  { $set: { "items.$.assignedTags": itemTags } },
                  { session },
                );
              }
              tagIndex += itemTagCount;
            }
          }
        }
      }

      const tagAssignmentStatus = buildTagAssignmentStatus(
        assignedTags.length,
        requiredQty,
      );

      // ✅ 7. BUILD UPDATE DATA
      const updateData = {
        paymentStatus: PAYMENT_STATUS.SUCCEEDED,
        stripePaymentIntentId: paymentIntentId,
        tagAssignmentStatus,
        fulfillmentStatus:
          tagAssignmentStatus === "complete" ? "assigned" : "pending",
      };

      if (assignedTags.length > 0) {
        updateData.assignedTag = assignedTags[0];
        updateData.assignedTags = assignedTags.map((tagId) => ({
          tag: tagId,
          assignedAt: new Date(),
          assignedBy: "auto",
        }));
      }

      // ✅ 8. UPDATE ORDER (inside transaction — same session)
      const updatedOrder = await orderRepository.updateOrder(
        orderId,
        updateData,
        session,
      );

      logger.info(
        `✅ Order ${orderId} confirmed with ${assignedTags.length} tags assigned (status: ${tagAssignmentStatus})`,
      );

      return updatedOrder;
    });

    return result;
  } catch (error) {
    logger.error(`❌ Failed to confirm payment for order ${orderId}:`, error.message);
    throw error;
  } finally {
    session.endSession();
  }
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
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This order is not a gift order",
    );
  }

  if (order.paymentStatus !== "paid") {
    throw new AppError(httpStatus.BAD_REQUEST, "Gift order is not paid yet");
  }

  // ✅ Get all tags from order
  const allTags = await order.getAllTags();
  if (!allTags || allTags.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "No tags assigned to this gift order",
    );
  }

  if (order.giftStatus === "claimed") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This gift has already been claimed",
    );
  }

  // ✅ Claim all tags
  for (const tagId of allTags) {
    const tag = await tagRepository.findById(tagId);
    if (!tag) {
      throw new AppError(httpStatus.NOT_FOUND, `Tag ${tagId} not found`);
    }
    if (tag.owner) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Tag ${tag.tagCode} is already owned by someone`,
      );
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
  const normalizedOrders = orders.map((order) =>
    orderRepository.normalizeOrder(order),
  );

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
const getAllOrders = async (
  page = 1,
  limit = 10,
  search = "",
  fulfillmentStatus = null,
  tagAssignmentStatus = null,
) => {
  const skip = (page - 1) * limit;

  const filter = {};
  if (fulfillmentStatus && fulfillmentStatus !== "all") {
    filter.fulfillmentStatus = fulfillmentStatus;
  }
  if (tagAssignmentStatus && tagAssignmentStatus !== "all") {
    filter.tagAssignmentStatus = tagAssignmentStatus;
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
      if (order.shippingAddress?.address?.toLowerCase().includes(searchLower))
        return true;
      if (order.shippingAddress?.fullName?.toLowerCase().includes(searchLower))
        return true;
      if (order.assignedTag?.tagCode?.toLowerCase().includes(searchLower))
        return true;
      if (
        order.isGuestOrder &&
        order.guestCustomer?.email?.toLowerCase().includes(searchLower)
      )
        return true;

      // ✅ Search items
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (item.product?.name?.toLowerCase().includes(searchLower))
            return true;
        }
      }

      return false;
    });
    total = orders.length;
  }

  const paginatedOrders = orders.slice(skip, skip + limit);

  // ✅ Normalize each order
  const normalizedOrders = paginatedOrders.map((order) =>
    orderRepository.normalizeOrder(order),
  );

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
    authenticatedOrders: orders.filter(
      (o) => o.isGuestOrder === false || o.user !== null,
    ).length,
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
const updateOrder = async (id, payload, session = null, user = null) => {
  // Get order with session support if provided
  let order;
  if (session) {
    order = await orderRepository.findByIdWithSession(id, session);
  } else {
    order = await orderRepository.findById(id);
  }

  if (!order) {
    throw new AppError(404, "Order not found");
  }

  // ✅ 1. CANCELLED/RETURNED ORDER BLOCK
  if (order.fulfillmentStatus === "cancelled") {
    throw new AppError(400, "Cannot update a cancelled order");
  }

  if (order.fulfillmentStatus === "returned") {
    throw new AppError(400, "Cannot update a returned order");
  }

  // ✅ 2. VALIDATE STATUS TRANSITION (MOVED UP FOR EARLY VALIDATION)
  const allowedTransitions = {
    pending: ["assigned", "cancelled", "pending_assignment"],
    pending_assignment: ["assigned", "cancelled"],
    assigned: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: ["returned"],
    cancelled: [],
    returned: [],
  };

  if (payload.fulfillmentStatus) {
    const currentStatus = order.fulfillmentStatus;
    const newStatus = payload.fulfillmentStatus;

    // Check if status is valid
    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new AppError(
        400,
        `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowedTransitions[currentStatus]?.join(", ") || "none"}`,
      );
    }

    // ✅ 3. ADDITIONAL STATUS VALIDATIONS
    if (newStatus === "shipped") {
      // Must be paid before shipping
      if (
        order.paymentStatus !== "paid" &&
        order.paymentStatus !== "succeeded"
      ) {
        throw new AppError(400, "Order must be paid before shipping");
      }

      // Must have complete tag assignment
      const tagStatus =
        payload.tagAssignmentStatus || order.tagAssignmentStatus;
      if (tagStatus !== "complete") {
        throw new AppError(
          400,
          `Cannot ship order with incomplete tag assignment. Status: ${tagStatus}`,
        );
      }
    }

    if (newStatus === "delivered") {
      if (order.fulfillmentStatus !== "shipped") {
        throw new AppError(400, "Order must be shipped before delivery");
      }
    }

    if (newStatus === "returned") {
      // Check return window (if delivered)
      if (order.fulfillmentStatus === "delivered" && order.deliveredAt) {
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
      }
    }

    if (newStatus === "cancelled") {
      // Cannot cancel if already shipped
      if (["shipped", "delivered"].includes(order.fulfillmentStatus)) {
        throw new AppError(
          400,
          `Cannot cancel order after it has been ${order.fulfillmentStatus}`,
        );
      }
    }
  }

  // ✅ 4. BACKWARD COMPATIBILITY: SINGLE TAG ASSIGNMENT
  if (payload.assignedTag) {
    const tag = await tagRepository.findById(payload.assignedTag);

    if (!tag) {
      throw new AppError(404, "Tag not found");
    }

    // Check if tag is already assigned to another user
    if (tag.owner && tag.owner.toString() !== order.user?.toString()) {
      throw new AppError(
        400,
        "This tag is already assigned to another user/order",
      );
    }

    // Check if tag is already assigned to another active order
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

    // Update tag ownership
    const updateOptions = session ? { session } : {};
    await tagRepository.updateTag(
      tag._id,
      {
        owner: order.user,
        isActivated: true,
        activatedAt: new Date(),
        assignedOrderId: id,
      },
      updateOptions,
    );

    // Add to order's assigned tags (deduplicate)
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

    // Set primary assigned tag if not set
    if (!order.assignedTag) {
      payload.assignedTag = tag._id;
    }
  }

  // ✅ 5. CALCULATE TAG ASSIGNMENT STATUS
  const requiredQty =
    order.items?.length > 0
      ? order.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      : order.quantity || 1;

  const existingAssignedTags = order.assignedTags || [];
  const newAssignedTags = payload.assignedTags || existingAssignedTags;

  let finalAssignedCount = 0;

  // Count unique tags
  const uniqueTagIds = new Set();
  for (const item of newAssignedTags) {
    const tagId = item.tag?._id?.toString() || item.tag?.toString();
    if (tagId) {
      uniqueTagIds.add(tagId);
    }
  }

  // Also check assignedTag field
  if (payload.assignedTag || order.assignedTag) {
    const tagId =
      payload.assignedTag?.toString() || order.assignedTag?.toString();
    if (tagId) {
      uniqueTagIds.add(tagId);
    }
  }

  finalAssignedCount = uniqueTagIds.size;

  // Determine tag assignment status
  if (finalAssignedCount === 0) {
    payload.tagAssignmentStatus = "none";
  } else if (finalAssignedCount < requiredQty) {
    payload.tagAssignmentStatus = "partial";
  } else {
    payload.tagAssignmentStatus = "complete";
  }

  // ✅ 6. VALIDATE FULFILLMENT STATUS WITH TAG ASSIGNMENT
  if (
    ["assigned", "shipped", "delivered"].includes(payload.fulfillmentStatus) &&
    finalAssignedCount < requiredQty
  ) {
    throw new AppError(
      400,
      `Cannot set status to "${payload.fulfillmentStatus}" without complete tag assignment. Required: ${requiredQty}, Assigned: ${finalAssignedCount}`,
    );
  }

  if (
    payload.fulfillmentStatus === "assigned" &&
    finalAssignedCount < requiredQty
  ) {
    throw new AppError(
      400,
      `All tags must be assigned before marking as "assigned". Required: ${requiredQty}, Assigned: ${finalAssignedCount}`,
    );
  }

  // ✅ 7. SET TIMESTAMPS FOR STATUS CHANGES
  if (
    payload.fulfillmentStatus === "delivered" &&
    order.fulfillmentStatus !== "delivered"
  ) {
    payload.deliveredAt = new Date();
  }

  if (
    payload.fulfillmentStatus === "cancelled" &&
    order.fulfillmentStatus !== "cancelled"
  ) {
    payload.cancelledAt = new Date();
    payload.cancelledBy = user?.userId || user?._id?.toString() || "admin";

    // Log cancellation reason
    if (!payload.cancellationReason) {
      payload.cancellationReason = "Order cancelled by admin";
    }

    // ✅ 8. HANDLE TAG RELEASE ON CANCELLATION
    if (finalAssignedCount > 0) {
      const tagIds = Array.from(uniqueTagIds);
      try {
        for (const tagId of tagIds) {
          const releaseOptions = session ? { session } : {};
          await tagRepository.resetTag(tagId, releaseOptions);
        }
        logger.info(
          `✅ Released ${tagIds.length} tags from cancelled order ${id}`,
        );
      } catch (error) {
        logger.error(`❌ Failed to release tags for order ${id}:`, error);
        // Don't block cancellation if tag release fails
        // The tags will be cleaned up by the media cleanup job
        payload._tagReleaseErrors = error.message;
      }
    }

    // ✅ 9. HANDLE REFUND FOR PAID ORDERS
    if (order.paymentStatus === "paid" || order.paymentStatus === "succeeded") {
      if (order.stripePaymentIntentId) {
        try {
          const refundAmount = order.grandTotal || 0;
          const refund = await stripe.refunds.create({
            payment_intent: order.stripePaymentIntentId,
            amount: Math.round(refundAmount * 100),
            reason: "requested_by_customer",
            metadata: {
              orderId: order._id.toString(),
              cancellationReason:
                payload.cancellationReason || "Order cancelled",
            },
          });

          payload.paymentStatus = "refunded";
          payload.refundStatus = "completed";
          payload.refundProcessedAt = new Date();
          payload.refundTransactionId = refund.id;
          payload.refundAmount = refundAmount;

          logger.info(`✅ Refund processed for order ${id}: ${refund.id}`);
        } catch (error) {
          logger.error(`❌ Refund failed for order ${id}:`, error);
          // Don't block cancellation if refund fails
          payload._refundError = error.message;

          // Create admin notification for failed refund
          await createAdminNotification({
            type: "REFUND_FAILED",
            orderId: order._id,
            userId: order.user,
            error: error.message,
            message: `Refund failed for cancelled order ${order._id}`,
          });
        }
      }
    }
  }

  // ✅ 10. UPDATE ORDER WITH SESSION SUPPORT
  let updatedOrder;
  if (session) {
    updatedOrder = await orderRepository.updateOrder(id, payload, session);
  } else {
    updatedOrder = await orderRepository.updateOrder(id, payload);
  }

  // ✅ 11. LOG STATUS CHANGE (AUDIT TRAIL)
  if (
    payload.fulfillmentStatus &&
    payload.fulfillmentStatus !== order.fulfillmentStatus
  ) {
    const changeLog = {
      orderId: order._id,
      from: order.fulfillmentStatus,
      to: payload.fulfillmentStatus,
      changedAt: new Date(),
      changedBy: user?.userId || user?._id?.toString() || "system",
      reason: payload.changeReason || null,
      metadata: {
        tagAssignmentStatus: payload.tagAssignmentStatus,
        paymentStatus: payload.paymentStatus || order.paymentStatus,
      },
    };

    try {
      // Save to order status history (if you have a collection for this)
      // await OrderStatusHistory.create(changeLog);

      // Or log it
      logger.info(
        `📝 Order ${id} status changed: ${changeLog.from} → ${changeLog.to}`,
      );
    } catch (error) {
      logger.error(`Failed to log status change for order ${id}:`, error);
    }
  }

  // ✅ 12. NOTIFICATIONS FOR ADMIN
  if (payload.fulfillmentStatus === "pending_assignment") {
    // Tag assignment is pending
    await createAdminNotification({
      type: "TAG_ASSIGNMENT_PENDING",
      orderId: order._id,
      userId: order.user,
      requiredQty,
      assignedCount: finalAssignedCount,
      message: `Order ${order._id} requires tag assignment. Required: ${requiredQty}, Assigned: ${finalAssignedCount}`,
    });
  }

  if (payload.fulfillmentStatus === "cancelled") {
    await createAdminNotification({
      type: "ORDER_CANCELLED",
      orderId: order._id,
      userId: order.user,
      reason: payload.cancellationReason,
      refundProcessed: !!payload.refundTransactionId,
      message: `Order ${order._id} was cancelled${payload.cancellationReason ? `: ${payload.cancellationReason}` : ""}`,
    });
  }

  // ✅ 13. TRACK DELIVERY METRICS
  if (payload.fulfillmentStatus === "delivered" && !order.deliveredAt) {
    const timeToDeliver =
      (new Date() - new Date(order.createdAt)) / (1000 * 60 * 60 * 24);
    logger.info(`📦 Order ${id} delivered in ${timeToDeliver.toFixed(1)} days`);
  }

  return updatedOrder;
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
      postalCode:
        shippingAddress.postalCode || order.shippingAddress?.postalCode,
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
    assignedOrderId: orderId,
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


  const result = await orderRepository.updateOrder(orderId, {
    assignedTags: updatedAssignedTags,
    assignedTag: order.assignedTag || tag._id,
    tagAssignmentStatus,
    fulfillmentStatus:
      tagAssignmentStatus === "complete" ? "assigned" : "pending",
  });

  return result;
};

/**
 * Remove Tag from Order (Admin)
 * Supports optional session for transactional bulk operations
 */
const removeTagFromOrder = async (orderId, tagId, session = null) => {
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

  await tagRepository.resetTag(targetTagId, session);

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

  const result = await orderRepository.updateOrder(orderId, {
    assignedTags: updatedAssignedTags,
    assignedTag: updatedAssignedTags[0]?.tag || null,
    tagAssignmentStatus,
    fulfillmentStatus:
      tagAssignmentStatus === "complete" ? "assigned" : "pending",
  }, session);

  return result;
};

/**
 * Bulk Unassign Tags — orchestrates from the Order module
 *
 * For each tag ID, finds the related order and calls removeTagFromOrder()
 * so that Tag reset + Order update always stay synchronized.
 * Wrapped in a single MongoDB transaction.
 */
const bulkUnassignTags = async (tagIds) => {
  if (!tagIds || tagIds.length === 0) {
    throw new AppError(400, "No tag IDs provided");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      let totalModified = 0;

      for (const tagId of tagIds) {
        // Find the order that currently references this tag
        const order = await Order.findOne({
          fulfillmentStatus: { $nin: ["cancelled", "returned"] },
          $or: [
            { assignedTag: tagId },
            { "assignedTags.tag": tagId },
          ],
        }).session(session);

        if (!order) {
          // Tag may already be free — skip silently
          continue;
        }

        await removeTagFromOrder(order._id, tagId, session);
        totalModified++;
      }

      return { modifiedCount: totalModified };
    });

    return result;
  } finally {
    session.endSession();
  }
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
    assignedOrderId: orderId,
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


  const result = await orderRepository.updateOrder(orderId, {
    assignedTags: updatedAssignedTags,
    assignedTag: oldExistsInAssignedTag
      ? newTag._id
      : order.assignedTag || updatedAssignedTags[0]?.tag,
    tagAssignmentStatus,
    fulfillmentStatus:
      tagAssignmentStatus === "complete" ? "assigned" : "pending",
  });

  return result;
};

// ============================================================
// HELPER: Admin Notification
// ============================================================

const createAdminNotification = async (data) => {
  try {
    // You can implement this with email, Slack, or database
    // For now, log it
    logger.warn(`🔔 ADMIN NOTIFICATION: ${data.type}`, data);

    // Example: Save to admin_notifications collection
    // await AdminNotification.create(data);
  } catch (error) {
    logger.error("Failed to create admin notification:", error);
  }
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
  bulkUnassignTags,
  claimGiftOrder,
};
