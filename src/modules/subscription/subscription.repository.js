import Subscription from "./subscription.model.js";

const findByUserAndTag = async (userId, tagId) => {
  return Subscription.findOne({ user: userId, tag: tagId })
    .populate("tag", "tagCode subscriptionType owner")
    .populate("user", "name email");
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
    .populate("tag", "tagCode subscriptionType owner")
    .populate("user", "name email");
};

const findByStripeSubscriptionId = async (stripeSubscriptionId) => {
  return Subscription.findOne({ stripeSubscriptionId })
    .populate("tag")
    .populate("user", "name email");
};

const findByCheckoutSessionId = async (stripeCheckoutSessionId) => {
  return Subscription.findOne({ stripeCheckoutSessionId })
    .populate("tag")
    .populate("user", "name email");
};

const updateById = async (id, payload) => {
  return Subscription.findByIdAndUpdate(id, payload, { new: true })
    .populate("tag")
    .populate("user", "name email");
};

const findUserSubscriptions = async (userId) => {
  return Subscription.find({ user: userId })
    .populate("tag", "tagCode subscriptionType owner isActivated isActive")
    .sort({ createdAt: -1 });
};

export default {
  findByUserAndTag,
  createSubscription,
  upsertSubscriptionByUserAndTag,
  findByStripeSubscriptionId,
  findByCheckoutSessionId,
  updateById,
  findUserSubscriptions,
};