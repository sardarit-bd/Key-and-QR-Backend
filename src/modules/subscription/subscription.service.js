import env from "../../config/env.js";
import stripe from "../../config/stripe.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import subscriptionRepository from "./subscription.repository.js";
import tagRepository from "../tag/tag.repository.js";
import subscriptionRules from "./subscription.config.js";

const mapStripeStatusToLocal = (status) => {
  const allowed = [
    "incomplete",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
  ];

  if (allowed.includes(status)) return status;
  return "inactive";
};

const getPlans = async () => {
  return Object.entries(subscriptionRules).map(([name, rule]) => ({
    name,
    ...rule,
  }));
};

const getMySubscriptions = async (userId) => {
  return subscriptionRepository.findUserSubscriptions(userId);
};

const createCheckoutSession = async (userId, tagCode) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  if (!tag.owner || tag.owner.toString() !== userId.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, "You don't own this tag");
  }

  if (!tag.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
  }

  const existing = await subscriptionRepository.findByUserAndTag(userId, tag._id);

  if (
    existing &&
    ["active", "trialing", "past_due"].includes(existing.status) &&
    existing.subscriptionType === "subscriber"
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "This tag already has an active subscription"
    );
  }

  if (!env.stripeSubscriptionPriceId) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe subscription price ID is not configured"
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: env.stripeSubscriptionPriceId,
        quantity: 1,
      },
    ],
    success_url: `${env.clientUrl}/subscription/success?tagCode=${tagCode}`,
    cancel_url: `${env.clientUrl}/subscription/cancel?tagCode=${tagCode}`,
    metadata: {
      userId: userId.toString(),
      tagId: tag._id.toString(),
      tagCode: tag.tagCode,
    },
  });

  const subscription = await subscriptionRepository.upsertSubscriptionByUserAndTag(
    userId,
    tag._id,
    {
      user: userId,
      tag: tag._id,
      subscriptionType: "free",
      status: "checkout_pending",
      stripeCheckoutSessionId: session.id,
      stripePriceId: env.stripeSubscriptionPriceId,
    }
  );

  return {
    checkoutUrl: session.url,
    subscription,
  };
};

const cancelMySubscription = async (userId, tagCode) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  if (!tag.owner || tag.owner.toString() !== userId.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, "You don't own this tag");
  }

  const subscription = await subscriptionRepository.findByUserAndTag(userId, tag._id);

  if (!subscription || !subscription.stripeSubscriptionId) {
    throw new AppError(httpStatus.NOT_FOUND, "Subscription not found");
  }

  if (!["active", "trialing", "past_due"].includes(subscription.status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Subscription is not active");
  }

  const stripeSub = await stripe.subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      cancel_at_period_end: true,
    }
  );

  const updated = await subscriptionRepository.updateById(subscription._id, {
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    status: mapStripeStatusToLocal(stripeSub.status),
    currentPeriodStart: stripeSub.items?.data?.[0]?.current_period_start
      ? new Date(stripeSub.items.data[0].current_period_start * 1000)
      : subscription.currentPeriodStart,
    currentPeriodEnd: stripeSub.items?.data?.[0]?.current_period_end
      ? new Date(stripeSub.items.data[0].current_period_end * 1000)
      : subscription.currentPeriodEnd,
  });

  return updated;
};

const activateFromCheckoutSession = async (session) => {
  const userId = session.metadata?.userId;
  const tagId = session.metadata?.tagId;

  if (!userId || !tagId) {
    throw new AppError(httpStatus.BAD_REQUEST, "Missing checkout metadata");
  }

  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["subscription"],
  });

  const stripeSubscription = fullSession.subscription;

  const updated = await subscriptionRepository.upsertSubscriptionByUserAndTag(
    userId,
    tagId,
    {
      user: userId,
      tag: tagId,
      subscriptionType: "subscriber",
      status: mapStripeStatusToLocal(stripeSubscription.status),
      stripeCustomerId: fullSession.customer || null,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCheckoutSessionId: session.id,
      stripePriceId:
        stripeSubscription.items?.data?.[0]?.price?.id || env.stripeSubscriptionPriceId,
      currentPeriodStart: stripeSubscription.items?.data?.[0]?.current_period_start
        ? new Date(stripeSubscription.items.data[0].current_period_start * 1000)
        : null,
      currentPeriodEnd: stripeSubscription.items?.data?.[0]?.current_period_end
        ? new Date(stripeSubscription.items.data[0].current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
    }
  );

  await tagRepository.updateTag(tagId, {
    subscriptionType: "subscriber",
  });

  return updated;
};

const syncFromStripeSubscription = async (stripeSubscription) => {
  const local = await subscriptionRepository.findByStripeSubscriptionId(
    stripeSubscription.id
  );

  if (!local) {
    return null;
  }

  const localStatus = mapStripeStatusToLocal(stripeSubscription.status);
  const shouldBeSubscriber = ["active", "trialing", "past_due"].includes(localStatus);

  const updated = await subscriptionRepository.updateById(local._id, {
    status: localStatus,
    stripeCustomerId: stripeSubscription.customer || local.stripeCustomerId,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId:
      stripeSubscription.items?.data?.[0]?.price?.id || local.stripePriceId,
    currentPeriodStart: stripeSubscription.items?.data?.[0]?.current_period_start
      ? new Date(stripeSubscription.items.data[0].current_period_start * 1000)
      : local.currentPeriodStart,
    currentPeriodEnd: stripeSubscription.items?.data?.[0]?.current_period_end
      ? new Date(stripeSubscription.items.data[0].current_period_end * 1000)
      : local.currentPeriodEnd,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
    subscriptionType: shouldBeSubscriber ? "subscriber" : "free",
  });

  await tagRepository.updateTag(local.tag._id, {
    subscriptionType: shouldBeSubscriber ? "subscriber" : "free",
  });

  return updated;
};

export default {
  getPlans,
  getMySubscriptions,
  createCheckoutSession,
  cancelMySubscription,
  activateFromCheckoutSession,
  syncFromStripeSubscription,
};