import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import pendingQuoteRepository from "./pendingQuote.repository.js";
import quoteRepository from "../quote/quote.repository.js";
import orderRepository from "../order/order.repository.js";
import subscriptionRepository from "../subscription/subscription.repository.js";

// ---------------------------------------------------------------------------
// Quote submission limits
// The limit is based on SUCCESSFUL community quote submissions.
//   FREE       → 1 submission every 7 days
//   SUBSCRIBER → 1 submission every 24 hours
// Only successfully created submissions start the cooldown. Validation
// failures, cancelled forms, and failed API requests never consume it.
// ---------------------------------------------------------------------------
const SUBMISSION_COOLDOWN = {
  free: 7 * 24 * 60 * 60 * 1000, // 7 days
  subscriber: 24 * 60 * 60 * 1000, // 1 day
};

// Resolve the user's plan: subscriber when they hold an active/trialing
// subscriber subscription (same source of truth as the quote receive engine).
const resolvePlan = async (userId) => {
  const activeSubscriptions =
    await subscriptionRepository.findActiveSubscriptionsByUser(userId);
  return activeSubscriptions.length > 0 ? "subscriber" : "free";
};

/**
 * Compute the user's current submission eligibility.
 * Returns:
 *   { canSubmit, plan, cooldownEndsAt, lastSubmittedAt, remainingMs }
 * The backend is the sole source of truth — the frontend only displays
 * what this returns.
 */
const getSubmissionStatus = async (userId) => {
  const plan = await resolvePlan(userId);
  const cooldownMs = SUBMISSION_COOLDOWN[plan] || SUBMISSION_COOLDOWN.free;
  const latest = await pendingQuoteRepository.getLatestCommunitySubmission(userId);

  if (!latest?.submittedAt) {
    return {
      canSubmit: true,
      plan,
      cooldownDays: plan === "subscriber" ? 1 : 7,
      cooldownEndsAt: null,
      lastSubmittedAt: null,
      remainingMs: 0,
    };
  }

  const submittedAt = new Date(latest.submittedAt).getTime();
  const cooldownEndsAt = submittedAt + cooldownMs;
  const now = Date.now();
  const remainingMs = Math.max(cooldownEndsAt - now, 0);
  const canSubmit = remainingMs <= 0;

  return {
    canSubmit,
    plan,
    cooldownDays: plan === "subscriber" ? 1 : 7,
    cooldownEndsAt: canSubmit ? null : new Date(cooldownEndsAt).toISOString(),
    lastSubmittedAt: new Date(submittedAt).toISOString(),
    remainingMs,
  };
};

// Throw the machine-readable cooldown error used by the submit endpoint.
const assertCanSubmit = async (userId) => {
  const status = await getSubmissionStatus(userId);
  if (!status.canSubmit) {
    const err = new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      `You can submit another quote in ${Math.ceil(status.remainingMs / 3600000)} hour(s).`,
      "SUBMISSION_COOLDOWN_ACTIVE"
    );
    // Surfaced by the global error handler as `nextAllowedAt` — the exact
    // timestamp the frontend countdown counts down to.
    err.nextAllowedAt = status.cooldownEndsAt;
    err.remainingDays = status.cooldownDays;
    throw err;
  }
  return status;
};

// The main Quote collection only accepts the 5 core categories.
// Submissions may use the full premium list — map any extended category
// to the closest core category at approval time so publishing never fails.
// Core categories pass through unchanged (existing behavior preserved).
const CORE_QUOTE_CATEGORIES = ["love", "strength", "healing", "faith", "gratitude"];
const CATEGORY_FALLBACK_MAP = {
  inspire: "faith",
  hope: "faith",
  wisdom: "faith",
  mindfulness: "faith",
  peace: "faith",
  purpose: "strength",
  discipline: "strength",
  courage: "strength",
  success: "strength",
  motivation: "strength",
  leadership: "strength",
  "self-growth": "strength",
  positivity: "strength",
  dreams: "strength",
  life: "gratitude",
  happiness: "gratitude",
  kindness: "love",
  family: "love",
  friendship: "love",
  healing: "healing",
  other: "faith",
};

const resolveApprovedCategory = (category) => {
  const normalized = (category || "other").toLowerCase();
  if (CORE_QUOTE_CATEGORIES.includes(normalized)) return normalized;
  return CATEGORY_FALLBACK_MAP[normalized] || "faith";
};

const submitQuote = async (userId, payload) => {
  // Backend enforcement — a user cannot bypass the limit via API calls,
  // multiple tabs, or payload manipulation.
  const status = await assertCanSubmit(userId);

  // Atomicity guard: derive the cooldown window key for the user's plan so
  // the unique index rejects concurrent duplicate submissions at the DB
  // level (read-then-write race protection).
  const cooldownMs = SUBMISSION_COOLDOWN[status.plan] || SUBMISSION_COOLDOWN.free;
  const windowIndex = Math.floor(Date.now() / cooldownMs);
  const cooldownWindowKey = `${userId}:community:${status.plan}:${windowIndex}`;

  let created;
  try {
    created = await pendingQuoteRepository.createPendingQuote({
      user: userId,
      text: payload.text,
      category: payload.category || "other",
      type: payload.type || "community",
      author: payload.author || null,
      order: payload.orderId || null,
      submittedAt: new Date(),
      cooldownWindowKey,
    });
  } catch (err) {
    // Duplicate key on the cooldown window → a concurrent request already
    // created a submission for this window. Treat it exactly like a cooldown
    // rejection; never create a second record.
    if (err?.code === 11000) {
      const e = new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        `You can submit another quote in ${Math.ceil(cooldownMs / 3600000)} hour(s).`,
        "SUBMISSION_COOLDOWN_ACTIVE"
      );
      e.nextAllowedAt = new Date(
        (windowIndex + 1) * cooldownMs
      ).toISOString();
      e.remainingDays = status.cooldownDays;
      throw e;
    }
    throw err;
  }

  // Return the created submission plus the refreshed cooldown state so the
  // frontend can immediately display the countdown.
  return {
    submission: created,
    cooldown: {
      canSubmit: false,
      plan: status.plan,
      cooldownEndsAt: new Date(
        new Date(created.submittedAt).getTime() + cooldownMs
      ).toISOString(),
      lastSubmittedAt: new Date(created.submittedAt).toISOString(),
    },
  };
};

const getPendingQuotes = async (page, limit, search, status) => {
  return pendingQuoteRepository.getPendingQuotes(page, limit, search, status);
};

const getPendingQuoteById = async (id) => {
  const quote = await pendingQuoteRepository.getPendingQuoteById(id);
  if (!quote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }
  return quote;
};

const approveQuote = async (id, adminNote = null) => {
  const pendingQuote = await pendingQuoteRepository.getPendingQuoteById(id);

  if (!pendingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }

  if (pendingQuote.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, `Quote already ${pendingQuote.status}`);
  }

  await quoteRepository.createQuote({
    text: pendingQuote.text,
    category: resolveApprovedCategory(pendingQuote.category),
    author: pendingQuote.author || null,
    isActive: true,
  });

  const updated = await pendingQuoteRepository.approveQuote(id, adminNote);

  if (pendingQuote.order) {
    await orderRepository.updateOrder(pendingQuote.order, {
      giftMessageStatus: "approved",
      giftMessageReviewedAt: new Date(),
      giftMessageAdminNote: adminNote,
    });
  }

  return updated;
};

const rejectQuote = async (id, adminNote = null) => {
  const pendingQuote = await pendingQuoteRepository.getPendingQuoteById(id);

  if (!pendingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }

  if (pendingQuote.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, `Quote already ${pendingQuote.status}`);
  }

  const updated = await pendingQuoteRepository.rejectQuote(id, adminNote);

  if (pendingQuote.order) {
    await orderRepository.updateOrder(pendingQuote.order, {
      giftMessageStatus: "rejected",
      giftMessageReviewedAt: new Date(),
      giftMessageAdminNote: adminNote,
    });
  }

  return updated;
};

const deletePendingQuote = async (id) => {
  const pendingQuote = await pendingQuoteRepository.getPendingQuoteById(id);
  if (!pendingQuote) {
    throw new AppError(httpStatus.NOT_FOUND, "Pending quote not found");
  }

  return pendingQuoteRepository.deletePendingQuote(id);
};

const getMyQuotes = async (userId, page, limit, search = "", category = "all", status = "all", sortBy = "newest") => {
  return pendingQuoteRepository.getMyQuotes(userId, page, limit, search, category, status, sortBy);
};

export default {
  submitQuote,
  getPendingQuotes,
  getPendingQuoteById,
  approveQuote,
  rejectQuote,
  deletePendingQuote,
  getMyQuotes,
  getSubmissionStatus,
};