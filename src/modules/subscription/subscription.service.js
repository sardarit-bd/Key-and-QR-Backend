import env from "../../config/env.js";
import stripe from "../../config/stripe.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import subscriptionRepository from "./subscription.repository.js";
import tagRepository from "../tag/tag.repository.js";
import subscriptionRules from "./subscription.config.js";
import authRepository from "../auth/auth.repository.js";
import sendEmail from "../../utils/sendEmail.js";
import logger from "../../utils/logger.js";
import User from "../../models/user.model.js";
import Tag from "../tag/tag.model.js";
import Subscription from "./subscription.model.js";

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

const getRules = (subscriptionType = "free") => {
  return subscriptionRules[subscriptionType] || subscriptionRules.free;
};

const getPlans = async () => {
  // Single source of truth for pricing is the live Stripe Price attached to
  // the configured subscription Price ID. subscription.config.js only defines
  // feature rules (limits), never pricing — so future Stripe price changes
  // automatically propagate to the Billing UI without any code change.
  let livePrice = null;
  try {
    if (env.stripeSubscriptionPriceId) {
      const stripePrice = await stripe.prices.retrieve(env.stripeSubscriptionPriceId, {
        expand: ["product"],
      });
      livePrice = {
        amount: (stripePrice.unit_amount || 0) / 100,
        currency: stripePrice.currency || "usd",
        interval: stripePrice.recurring?.interval || "month",
        priceId: stripePrice.id,
      };
    }
  } catch (error) {
    console.error("Failed to retrieve Stripe subscription price:", error?.message);
  }

  return Object.entries(subscriptionRules).map(([name, rule]) => ({
    name,
    ...rule,
    // The subscriber plan carries the live Stripe price; other plans use 0.
    price: name === "subscriber" && livePrice ? livePrice.amount : 0,
    priceId: name === "subscriber" ? livePrice?.priceId : null,
    currency: name === "subscriber" ? livePrice?.currency : "usd",
    interval: name === "subscriber" ? livePrice?.interval : "month",
  }));
};

const getMySubscriptions = async (userId) => {
  return subscriptionRepository.findUserSubscriptions(userId);
};

const createCheckoutSession = async (userId, tagCode = null, preferredCategory = null) => {
  let tag = null;
  const isTagSpecific = Boolean(tagCode);

  if (tagCode) {
    tag = await tagRepository.findByTagCode(tagCode);

    if (!tag) {
      throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
    }

    if (!tag.owner || tag.owner.toString() !== userId.toString()) {
      throw new AppError(httpStatus.FORBIDDEN, "You don't own this tag");
    }

    if (!tag.isActive) {
      throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
    }
  } else {
    // 1. For account-level subscription, link primary active tag if user owns one
    const userTags = await tagRepository.findTagsByOwner(userId);
    if (userTags && userTags.length > 0) {
      tag = userTags[0];
    }
  }

  // Check if user already holds an active Premium subscription
  const existingSubs = await subscriptionRepository.findActiveSubscriptionsByUser(userId);
  if (existingSubs && existingSubs.length > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have an active Premium subscription"
    );
  }

  if (!env.stripeSubscriptionPriceId) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Stripe subscription price ID is not configured"
    );
  }

  // Using authRepository instead of userRepository
  const user = await authRepository.findUserById(userId);
  let customerId = user?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: userId.toString(),
      },
    });
    customerId = customer.id;

    // Using authRepository.updateUser
    await authRepository.updateUser(userId, { stripeCustomerId: customerId });
  }

  const successUrl = tagCode
    ? `${env.clientUrl}/subscription/success?tagCode=${tag.tagCode}`
    : `${env.clientUrl}/subscription/success`;
  const cancelUrl = tagCode
    ? `${env.clientUrl}/subscription/cancel?tagCode=${tag.tagCode}`
    : `${env.clientUrl}/subscription/cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: customerId,
    line_items: [
      {
        price: env.stripeSubscriptionPriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: userId.toString(),
      tagId: tag ? tag._id.toString() : "",
      tagCode: tag ? tag.tagCode : "",
      isTagSpecific: isTagSpecific ? "true" : "false",
      preferredCategory: preferredCategory || "",
    },
  });

  const subscription = await subscriptionRepository.upsertSubscriptionByUserAndTag(
    userId,
    tag ? tag._id : null,
    {
      user: userId,
      tag: tag ? tag._id : null,
      subscriptionType: "free",
      status: "checkout_pending",
      stripeCheckoutSessionId: session.id,
      stripePriceId: env.stripeSubscriptionPriceId,
      preferredCategory: preferredCategory || null,
      stripeCustomerId: customerId,
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

const createCustomerPortalSession = async (userId) => {
  // Using authRepository instead of userRepository
  const user = await authRepository.findUserById(userId);

  if (!user || !user.stripeCustomerId) {
    throw new AppError(httpStatus.NOT_FOUND, "No Stripe customer found for this user");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.clientUrl}/new-dashboard/user/premium`,
  });

  return {
    portalUrl: session.url,
  };
};

/**
 * Get the latest paid invoice PDF for the authenticated user.
 * Only returns invoices belonging to the user's Stripe customer ID.
 * Prefers invoice_pdf (direct download) falling back to hosted_invoice_url.
 */
const getLatestInvoice = async (userId) => {
  const user = await authRepository.findUserById(userId);

  if (!user || !user.stripeCustomerId) {
    throw new AppError(httpStatus.NOT_FOUND, "No Stripe customer found for this user");
  }

  // Find an active subscription for this user to confirm they are a paying customer.
  const activeSubs = await subscriptionRepository.findActiveSubscriptionsByUser(userId);
  if (!activeSubs || activeSubs.length === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "No active subscription found");
  }

  // Fetch the most recent paid invoices for this customer.
  const invoices = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    status: "paid",
    limit: 1,
  });

  if (!invoices.data || invoices.data.length === 0) {
    return { invoicePdf: null, hostedInvoiceUrl: null };
  }

  const latest = invoices.data[0];

  return {
    invoicePdf: latest.invoice_pdf || null,
    hostedInvoiceUrl: latest.hosted_invoice_url || null,
  };
};

const activateFromCheckoutSession = async (session) => {
  let userId = session.metadata?.userId || null;
  let tagId = session.metadata?.tagId || null;
  const tagCode = session.metadata?.tagCode || null;
  const preferredCategory = session.metadata?.preferredCategory || null;

  // Retrieve full session with subscription and customer expanded
  let fullSession = session;
  try {
    fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["subscription", "customer"],
    });
  } catch (err) {
    logger.warn(`Could not retrieve full checkout session (${session.id}): ${err.message}. Using event payload.`);
  }

  let stripeSubscription = fullSession.subscription;
  const customerId =
    (typeof fullSession.customer === "object" ? fullSession.customer?.id : fullSession.customer) ||
    session.customer ||
    null;
  const customerEmail =
    fullSession.customer_details?.email ||
    fullSession.customer_email ||
    session.customer_details?.email ||
    session.customer_email ||
    null;

  // If subscription is string ID, retrieve the subscription object from Stripe
  if (typeof stripeSubscription === "string" || (!stripeSubscription?.id && fullSession.subscription)) {
    const subId = typeof stripeSubscription === "string" ? stripeSubscription : fullSession.subscription;
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(subId);
    } catch (subErr) {
      logger.warn(`Could not retrieve Stripe subscription (${subId}): ${subErr.message}`);
    }
  }

  // Fallback 1: Resolve existing subscription document by session ID
  let existingSub = null;
  if (!userId || !tagId) {
    existingSub = await subscriptionRepository.findByCheckoutSessionId(session.id);
    if (existingSub) {
      if (!userId && existingSub.user) {
        userId = (existingSub.user._id || existingSub.user).toString();
      }
      if (!tagId && existingSub.tag) {
        tagId = (existingSub.tag._id || existingSub.tag).toString();
      }
    }
  }

  // Fallback 2: Resolve user by customerId
  let userDoc = null;
  if (!userId && customerId) {
    userDoc = await User.findOne({ stripeCustomerId: customerId });
    if (userDoc) {
      userId = userDoc._id.toString();
    }
  }

  // Fallback 3: Resolve user by customerEmail
  if (!userId && customerEmail) {
    userDoc = await User.findOne({ email: customerEmail.toLowerCase().trim() });
    if (userDoc) {
      userId = userDoc._id.toString();
    }
  }

  if (!userId) {
    throw new AppError(httpStatus.BAD_REQUEST, "Unable to resolve user for subscription activation");
  }

  if (!userDoc) {
    userDoc = await User.findById(userId);
  }

  // Fallback for tagId if specified by tagCode
  if (!tagId && tagCode) {
    const matchedTag = await tagRepository.findByTagCode(tagCode);
    if (matchedTag) tagId = matchedTag._id.toString();
  }

  const rawStripeStatus = stripeSubscription?.status || "active";
  const mappedStatus = mapStripeStatusToLocal(rawStripeStatus);
  const resolvedStatus = ["active", "trialing", "past_due"].includes(mappedStatus) ? mappedStatus : "active";
  const stripeSubId = typeof stripeSubscription === "object" ? stripeSubscription?.id : (stripeSubscription || null);

  const currentPeriodStart = stripeSubscription?.items?.data?.[0]?.current_period_start
    ? new Date(stripeSubscription.items.data[0].current_period_start * 1000)
    : (stripeSubscription?.current_period_start ? new Date(stripeSubscription.current_period_start * 1000) : new Date());

  const currentPeriodEnd = stripeSubscription?.items?.data?.[0]?.current_period_end
    ? new Date(stripeSubscription.items.data[0].current_period_end * 1000)
    : (stripeSubscription?.current_period_end ? new Date(stripeSubscription.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const updated = await subscriptionRepository.upsertSubscriptionByUserAndTag(
    userId,
    tagId || null,
    {
      user: userId,
      tag: tagId || null,
      subscriptionType: "subscriber",
      status: resolvedStatus,
      preferredCategory,
      stripeCustomerId: customerId || userDoc?.stripeCustomerId,
      stripeSubscriptionId: stripeSubId,
      stripeCheckoutSessionId: session.id,
      stripePriceId:
        stripeSubscription?.items?.data?.[0]?.price?.id || env.stripeSubscriptionPriceId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end || false,
    }
  );

  // 1. Immediately update User model so profile and queries reflect subscriber tier
  await User.findByIdAndUpdate(userId, {
    isPremium: true,
    subscriptionTier: "subscriber",
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  });

  // 2. Update the specific tag if linked
  if (tagId) {
    await tagRepository.updateTag(tagId, {
      subscriptionType: "subscriber",
    });
  }

  // 3. Elevate ALL tags owned by this user so every physical tag reflects subscriber status
  await Tag.updateMany(
    { owner: userId },
    { subscriptionType: "subscriber" }
  );

  logger.info(`✅ Successfully activated Premium subscription for user ${userId} and updated tag(s) to subscriber tier`);

  // Dispatch Welcome/Confirmation Email (non-blocking)
  try {
    const recipientEmail = userDoc?.email || customerEmail;
    if (recipientEmail) {
      await sendEmail({
        to: recipientEmail,
        subject: "Welcome to MyInspireTag Premium!",
        html: `
          <div style="font-family: Arial, sans-serif; background-color: #121212; color: #ffffff; padding: 32px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(234, 179, 8, 0.3);">
            <h1 style="color: #eab308; margin-top: 0; font-size: 24px;">✨ Welcome to MyInspireTag Premium!</h1>
            <p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">
              Hi ${userDoc?.name || "Friend"},
            </p>
            <p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">
              Thank you for subscribing! Your Premium membership is now <strong>active</strong>.
            </p>
            <div style="background-color: #1c1917; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #292524;">
              <h3 style="color: #facc15; margin-top: 0; font-size: 16px;">Your Premium Privileges:</h3>
              <ul style="color: #e5e7eb; font-size: 14px; line-height: 1.8; margin-bottom: 0; padding-left: 20px;">
                <li>Unlimited daily inspirational quote unlocks (up to 3 daily quotes).</li>
                <li>Exclusive premium categories & mood themes.</li>
                <li>Full audio experiences with personalized dedication access.</li>
                <li>Save unlimited favorites and track your inspiration streak.</li>
              </ul>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
              You can manage your subscription anytime from your account dashboard.
            </p>
            <div style="margin-top: 28px; text-align: center;">
              <a href="${env.clientUrl}/dashboard/user" style="background-color: #eab308; color: #000000; padding: 12px 28px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block;">
                Go to Dashboard
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #27272a; margin: 32px 0;" />
            <p style="color: #71717a; font-size: 12px; text-align: center; margin: 0;">
              MyInspireTag — Daily words that awaken your purpose.
            </p>
          </div>
        `,
      });
      logger.info(`✅ Subscription confirmation email sent to ${recipientEmail}`);
    }
  } catch (emailErr) {
    logger.error(`⚠️ Failed to send subscription confirmation email: ${emailErr.message}`);
  }

  return updated;
};

const syncFromStripeSubscription = async (stripeSubscription) => {
  let local = await subscriptionRepository.findByStripeSubscriptionId(
    stripeSubscription.id
  );

  // Fallback: search by customer if not yet matched by subscription id
  if (!local && stripeSubscription.customer) {
    local = await subscriptionRepository.findByStripeCustomerId(stripeSubscription.customer);
    if (!local) {
      const user = await User.findOne({ stripeCustomerId: stripeSubscription.customer });
      if (user) {
        const userSubs = await subscriptionRepository.findUserSubscriptions(user._id);
        if (userSubs && userSubs.length > 0) local = userSubs[0];
      }
    }
  }

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

  const userId = local.user?._id || local.user;
  if (userId) {
    if (shouldBeSubscriber) {
      await User.findByIdAndUpdate(userId, {
        isPremium: true,
        subscriptionTier: "subscriber",
      });
      await Tag.updateMany(
        { owner: userId },
        { subscriptionType: "subscriber" }
      );
    } else {
      // Check if user has any other active subscriptions before downgrading
      const otherActive = await subscriptionRepository.findActiveSubscriptionsByUser(userId);
      const hasOther = otherActive.some((s) => s._id.toString() !== local._id.toString());
      if (!hasOther) {
        await User.findByIdAndUpdate(userId, {
          isPremium: false,
          subscriptionTier: "free",
        });
        await Tag.updateMany(
          { owner: userId },
          { subscriptionType: "free" }
        );
      }
    }
  }

  if (local.tag) {
    const tagId = local.tag?._id || local.tag;
    await tagRepository.updateTag(tagId, {
      subscriptionType: shouldBeSubscriber ? "subscriber" : "free",
    });
  }

  return updated;
};

const handleInvoicePaymentSucceeded = async (invoice) => {
  const stripeSubscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  if (!stripeSubscriptionId) {
    logger.info("invoice.payment_succeeded event has no subscription reference; skipping subscription update.");
    return null;
  }

  logger.info(`💳 Processing invoice payment for subscription ${stripeSubscriptionId}`);

  let stripeSub = null;
  try {
    stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (err) {
    logger.warn(`Could not retrieve Stripe subscription ${stripeSubscriptionId}: ${err.message}`);
  }

  let local = await subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId);

  // If not found by subscription ID, try finding by customer
  if (!local && invoice.customer) {
    let user = await User.findOne({ stripeCustomerId: invoice.customer });
    if (!user && invoice.customer_email) {
      user = await User.findOne({ email: invoice.customer_email.toLowerCase().trim() });
    }
    if (user) {
      const userSubs = await subscriptionRepository.findUserSubscriptions(user._id);
      if (userSubs && userSubs.length > 0) {
        local = userSubs[0];
        await subscriptionRepository.updateById(local._id, {
          stripeSubscriptionId,
        });
      } else {
        // Create active subscription record directly from invoice
        local = await subscriptionRepository.createSubscription({
          user: user._id,
          tag: null,
          subscriptionType: "subscriber",
          status: "active",
          stripeCustomerId: invoice.customer,
          stripeSubscriptionId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  if (local) {
    const status = stripeSub ? mapStripeStatusToLocal(stripeSub.status) : "active";
    const currentPeriodStart = stripeSub?.current_period_start
      ? new Date(stripeSub.current_period_start * 1000)
      : new Date();
    const currentPeriodEnd = stripeSub?.current_period_end
      ? new Date(stripeSub.current_period_end * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const updated = await subscriptionRepository.updateById(local._id, {
      status,
      subscriptionType: "subscriber",
      currentPeriodStart,
      currentPeriodEnd,
      stripeSubscriptionId,
    });

    const userId = local.user?._id || local.user;
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        isPremium: true,
        subscriptionTier: "subscriber",
      });
      await Tag.updateMany(
        { owner: userId },
        { subscriptionType: "subscriber" }
      );
    }

    const tagId = local.tag?._id || local.tag;
    if (tagId) {
      await tagRepository.updateTag(tagId, {
        subscriptionType: "subscriber",
      });
    }

    logger.info(`✅ Successfully updated subscription ${local._id} to subscriber status on invoice.paid`);
    return updated;
  }

  return null;
};

const handleInvoicePaymentFailed = async (invoice) => {
  const stripeSubscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;

  if (!stripeSubscriptionId) return null;

  const local = await subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId);
  if (local) {
    await subscriptionRepository.updateById(local._id, {
      status: "past_due",
    });
    logger.warn(`⚠️ Subscription ${local._id} marked past_due after invoice payment failure.`);
  }
  return null;
};


// Admin: Get all subscriptions with filters
const getAllSubscriptionsForAdmin = async (page = 1, limit = 10, search = "", status = "") => {
  const skip = (page - 1) * limit;

  const filter = {};

  if (status && status !== "all") {
    filter.status = status;
  }

  if (search) {
    filter.$or = [
      { "tag.tagCode": { $regex: search, $options: "i" } },
      { "user.email": { $regex: search, $options: "i" } },
      { "user.name": { $regex: search, $options: "i" } },
      { stripeSubscriptionId: { $regex: search, $options: "i" } }
    ];
  }

  const [subscriptions, total] = await Promise.all([
    subscriptionRepository.findSubscriptionsWithFilters(filter, skip, limit),
    subscriptionRepository.countSubscriptionsWithFilters(filter)
  ]);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit)
    },
    data: subscriptions
  };
};

// Admin: Get subscription stats
const getSubscriptionStatsForAdmin = async () => {
  // Transition expired active subscriptions to past_due before counting
  await subscriptionRepository.bulkUpdateExpiredSubscriptions();

  const subscriptions = await subscriptionRepository.findAllSubscriptions();

  // Resolve the live subscription price once (Stripe is the source of truth).
  // Never falls back to a hardcoded amount — revenue reflects real Stripe data.
  let unitPrice = 0;
  try {
    if (env.stripeSubscriptionPriceId) {
      const p = await stripe.prices.retrieve(env.stripeSubscriptionPriceId);
      unitPrice = (p.unit_amount || 0) / 100;
    }
  } catch (error) {
    console.error("Failed to retrieve Stripe price for stats:", error?.message);
  }

  const stats = {
    total: subscriptions.length,
    active: subscriptions.filter(s => s.status === "active").length,
    trialing: subscriptions.filter(s => s.status === "trialing").length,
    pastDue: subscriptions.filter(s => s.status === "past_due").length,
    canceled: subscriptions.filter(s => s.status === "canceled").length,
    unpaid: subscriptions.filter(s => s.status === "unpaid").length,
    incomplete: subscriptions.filter(s => s.status === "incomplete").length,
    totalRevenue: subscriptions
      .filter(s => s.status === "active" || s.status === "trialing")
      .length * unitPrice,
    monthlyRecurringRevenue: subscriptions
      .filter(s => s.status === "active")
      .length * unitPrice,
  };

  return stats;
};

// Admin: Sync all subscriptions with Stripe
const syncAllSubscriptionsWithStripe = async () => {
  // First, mark any expired active subscriptions as past_due
  await subscriptionRepository.bulkUpdateExpiredSubscriptions();

  const subscriptions = await subscriptionRepository.findSubscriptionsWithStripeId();
  let synced = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    if (sub.stripeSubscriptionId) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        await syncFromStripeSubscription(stripeSub);
        synced++;
      } catch (error) {
        console.error(`Failed to sync subscription ${sub._id}:`, error);
        failed++;
      }
    }
  }

  return { synced, failed, total: subscriptions.length };
};

export default {
  getRules,
  getPlans,
  getMySubscriptions,
  createCheckoutSession,
  cancelMySubscription,
  createCustomerPortalSession,
  activateFromCheckoutSession,
  syncFromStripeSubscription,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  getAllSubscriptionsForAdmin,
  getSubscriptionStatsForAdmin,
  syncAllSubscriptionsWithStripe,
  getLatestInvoice,
};