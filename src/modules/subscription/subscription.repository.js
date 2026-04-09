import Subscription from "./subscription.model.js";

const findByUserAndTag = async (userId, tagId) => {
  return Subscription.findOne({ user: userId, tag: tagId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

const createSubscription = async (payload) => {
  return Subscription.create(payload);
};

const upsertSubscriptionByUserAndTag = async (userId, tagId, payload) => {
  return Subscription.findOneAndUpdate(
    { user: userId, tag: tagId },
    payload,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  )
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

const findByStripeSubscriptionId = async (stripeSubscriptionId) => {
  return Subscription.findOne({ stripeSubscriptionId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

const findByCheckoutSessionId = async (stripeCheckoutSessionId) => {
  return Subscription.findOne({ stripeCheckoutSessionId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

const updateById = async (id, payload) => {
  return Subscription.findByIdAndUpdate(id, payload, { new: true })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

const findUserSubscriptions = async (userId) => {
  return Subscription.find({ user: userId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .sort({ createdAt: -1 });
};

// 🆕 Find active subscription by user and tag
const findActiveSubscriptionByUserAndTag = async (userId, tagId) => {
  return Subscription.findOne({
    user: userId,
    tag: tagId,
    status: { $in: ["active", "trialing"] },
    subscriptionType: "subscriber",
  })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

// 🆕 Find all active subscriptions for a user
const findActiveSubscriptionsByUser = async (userId) => {
  return Subscription.find({
    user: userId,
    status: { $in: ["active", "trialing"] },
    subscriptionType: "subscriber",
  })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .sort({ currentPeriodEnd: 1 });
};

// 🆕 Find subscriptions that need sync (for cron job)
const findSubscriptionsNeedingSync = async () => {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  return Subscription.find({
    stripeSubscriptionId: { $ne: null },
    $or: [
      { updatedAt: { $lt: threeDaysAgo } },
      { status: "past_due" },
      { status: "unpaid" },
    ],
  })
    .populate("tag", "tagCode")
    .populate("user", "email");
};

// 🆕 Count active subscriptions (for admin dashboard)
const countActiveSubscriptions = async () => {
  return Subscription.countDocuments({
    status: { $in: ["active", "trialing"] },
    subscriptionType: "subscriber",
  });
};

// 🆕 Get subscription by tag only (without user check)
const findByTag = async (tagId) => {
  return Subscription.findOne({ tag: tagId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email stripeCustomerId");
};

// 🆕 Bulk update for expired subscriptions (cron job)
const bulkUpdateExpiredSubscriptions = async () => {
  const now = new Date();

  return Subscription.updateMany(
    {
      status: "active",
      currentPeriodEnd: { $lt: now },
    },
    {
      status: "past_due",
    }
  );
};

// 🆕 Delete cancelled/expired subscriptions (cleanup)
const deleteExpiredSubscriptions = async () => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return Subscription.deleteMany({
    status: { $in: ["canceled", "unpaid", "incomplete"] },
    updatedAt: { $lt: sixMonthsAgo },
  });
};

// 🆕 Find subscription by Stripe Customer ID
const findByStripeCustomerId = async (stripeCustomerId) => {
  return Subscription.findOne({ stripeCustomerId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .populate("user", "name email");
};

// 🆕 Get subscription stats for a tag
const getTagSubscriptionStats = async (tagId) => {
  return Subscription.aggregate([
    { $match: { tag: tagId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
};

// 🆕 Check if tag has active subscription
const hasActiveSubscription = async (tagId) => {
  const subscription = await Subscription.findOne({
    tag: tagId,
    status: { $in: ["active", "trialing"] },
    subscriptionType: "subscriber",
  });
  return !!subscription;
};

// Find subscriptions with filters (for admin)
const findSubscriptionsWithFilters = async (filter, skip, limit) => {
  return Subscription.find(filter)
    .populate("user", "name email")
    .populate("tag", "tagCode")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count subscriptions with filters
const countSubscriptionsWithFilters = async (filter) => {
  return Subscription.countDocuments(filter);
};

// Find all subscriptions (for stats)
const findAllSubscriptions = async () => {
  return Subscription.find()
    .populate("user", "name email")
    .populate("tag", "tagCode");
};

// Find subscriptions with Stripe ID (for sync)
const findSubscriptionsWithStripeId = async () => {
  return Subscription.find({
    stripeSubscriptionId: { $ne: null, $exists: true }
  });
};



export default {
  findByUserAndTag,
  createSubscription,
  upsertSubscriptionByUserAndTag,
  findByStripeSubscriptionId,
  findByCheckoutSessionId,
  updateById,
  findUserSubscriptions,
  findActiveSubscriptionByUserAndTag, // 🆕
  findActiveSubscriptionsByUser, // 🆕
  findSubscriptionsNeedingSync, // 🆕
  countActiveSubscriptions, // 🆕
  findByTag, // 🆕
  bulkUpdateExpiredSubscriptions, // 🆕
  deleteExpiredSubscriptions, // 🆕
  findByStripeCustomerId, // 🆕
  getTagSubscriptionStats, // 🆕
  hasActiveSubscription, // 🆕
  findSubscriptionsWithFilters, // For admin
  countSubscriptionsWithFilters, // For admin
  findAllSubscriptions, // For stats
  findSubscriptionsWithStripeId, // For sync
};