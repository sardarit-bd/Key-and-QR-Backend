import AppError from "../../utils/AppError.js";
import httpStatus from "../../constants/httpStatus.js";
import receivedQuoteRepository from "./receivedQuote.repository.js";
import categoryRepository from "../category/category.repository.js";
import quoteRepository from "../quote/quote.repository.js";
import subscriptionRepository from "../subscription/subscription.repository.js";
import streakService from "../streak/streak.service.js";
import favoriteRepository from "../favorite/favorite.repository.js";
import ScanHistory from "../scan/scan.model.js";

// Daily limits for the new dashboard quote engine.
// Kept here (not in subscription.config.js) so the existing ScanHistory
// flow, which reads subscription.config.js, is NOT affected.
const DASHBOARD_DAILY_LIMITS = {
  free: 1,
  subscriber: 3,
};

const getDayKey = () => {
  return new Date().toISOString().split("T")[0];
};

// UTC midnight following the current instant — when the daily limit resets.
const getNextAvailableAt = () => {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
};

// Resolve the CURRENT favorite state for a batch of received quotes using a
// single favorites query — the old isFavoriteSnapshot is never trusted alone.
const annotateFavorites = async (receivedQuotes, userId) => {
  if (!receivedQuotes || receivedQuotes.length === 0) return receivedQuotes;

  const quoteIds = receivedQuotes
    .filter((rq) => rq.quote)
    .map((rq) => rq.quote._id);

  const favoriteMap = await favoriteRepository.getFavoritesByQuoteIds(
    userId,
    quoteIds
  );

  return receivedQuotes.map((rq) => {
    const rqObj = rq.toObject ? rq.toObject() : rq;
    const quote = rqObj.quote;
    const quoteId = quote?._id?.toString();
    const quoteCat = quote?.category;
    const category = rqObj.category;
    const isGenericPool = !category || category.slug === "inspire" || rqObj.categorySlug === "inspire";

    let resolvedCategory = category;
    if (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire") {
      resolvedCategory = {
        ...(category && typeof category === 'object' ? (category.toObject ? category.toObject() : category) : {}),
        name: quoteCat.charAt(0).toUpperCase() + quoteCat.slice(1),
        slug: quoteCat.toLowerCase(),
      };
    }

    return {
      ...rqObj,
      category: resolvedCategory,
      favorite: quoteId ? favoriteMap.has(quoteId) : false,
    };
  });
};

const saveReceivedQuote = async (payload) => {
  return receivedQuoteRepository.createReceivedQuote(payload);
};

const getLatestQuote = async (userId) => {
  const receivedQuote = await receivedQuoteRepository.getLatestReceivedQuote(
    userId
  );

  if (!receivedQuote) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No received quotes found",
      "NO_RECEIVED_QUOTES"
    );
  }

  const [annotated] = await annotateFavorites([receivedQuote], userId);
  return annotated;
};

const getReceivedQuoteById = async (id, userId) => {
  const receivedQuote = await receivedQuoteRepository.getReceivedQuoteById(
    id,
    userId
  );

  if (!receivedQuote) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Received quote not found",
      "RECEIVED_QUOTE_NOT_FOUND"
    );
  }

  const [annotated] = await annotateFavorites([receivedQuote], userId);
  return annotated;
};

const getHistory = async (query, userId) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const category = query.category || null;
  const source = query.source || null;

  const result = await receivedQuoteRepository.getUserHistory({
    userId,
    page,
    limit,
    category,
    source,
  });

  result.data = await annotateFavorites(result.data, userId);
  return result;
};

const getTodayHistory = async (userId) => {
  const dayKey = getDayKey();
  const result = await receivedQuoteRepository.getTodayReceivedQuotes(
    userId,
    dayKey
  );
  return annotateFavorites(result, userId);
};

const getStatistics = async (userId) => {
  return receivedQuoteRepository.getStatistics(userId);
};

// ===============================
// READ AGAIN
// ===============================

/**
 * Re-open an existing received quote.
 * Marks the quote as read, resolves the CURRENT favorite state, and returns
 * the complete quote. MUST NOT create a ReceivedQuote, change the streak,
 * consume daily usage, or advance the category cycle.
 */
const readAgain = async (receivedQuoteId, userId) => {
  const receivedQuote = await receivedQuoteRepository.getReceivedQuoteById(
    receivedQuoteId,
    userId
  );

  if (!receivedQuote) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Received quote not found",
      "RECEIVED_QUOTE_NOT_FOUND"
    );
  }

  if (!receivedQuote.quote) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "The quote for this record is no longer available",
      "QUOTE_NOT_FOUND"
    );
  }

  // Mark as read (idempotent — no duplicate history, no new doc).
  if (!receivedQuote.isRead) {
    await receivedQuoteRepository.updateReadStatus(
      receivedQuote._id,
      true,
      userId
    );
    receivedQuote.isRead = true;
  }

  // Resolve current favorite state from the Favorites module.
  const favoriteMap = await favoriteRepository.getFavoritesByQuoteIds(userId, [
    receivedQuote.quote._id,
  ]);
  const favoriteId = favoriteMap.get(receivedQuote.quote._id.toString()) || null;

  const quote = receivedQuote.quote;
  const category = receivedQuote.category;
  const quoteCat = quote?.category;
  const isGenericPool = !category || category.slug === "inspire" || receivedQuote.categorySlug === "inspire";

  const resolvedCategoryName = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire")
    ? quoteCat.charAt(0).toUpperCase() + quoteCat.slice(1)
    : (category?.name || receivedQuote.categorySlug || "Inspire");

  const resolvedCategorySlug = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire")
    ? quoteCat.toLowerCase()
    : (category?.slug || receivedQuote.categorySlug || "inspire");

  return {
    receivedQuoteId: receivedQuote._id,
    quote: {
      _id: quote._id,
      text: quote.text,
      author: quote.author || "InspireTag",
      description: quote.description || null,
      image: quote.image || null,
      theme: quote.theme || null,
      editorData: quote.editorData || null,
      renderedImages: quote.renderedImages || null,
    },
    category: {
      id: category?._id || null,
      name: resolvedCategoryName,
      slug: resolvedCategorySlug,
      icon: category?.icon || null,
      color: category?.color || null,
    },
    receivedAt: receivedQuote.receivedAt,
    favorite: !!favoriteId,
    favoriteId,
    isRead: true,
  };
};

// Shared daily-usage resolution used by BOTH the receive engine and the
// dashboard home API, so the limits stay consistent in one place.
const getDailyUsage = async (userId) => {
  const plan = await resolvePlan(userId);
  const dailyLimit = DASHBOARD_DAILY_LIMITS[plan];
  const dayKey = getDayKey();

  const usedToday = await receivedQuoteRepository.countToday(userId, dayKey);
  const remainingToday = Math.max(dailyLimit - usedToday, 0);
  const isLimitReached = usedToday >= dailyLimit;

  return {
    plan,
    dailyLimit,
    usedToday,
    remainingToday,
    isLimitReached,
    nextAvailableAt: isLimitReached ? getNextAvailableAt() : null,
  };
};

// ===============================
// QUOTE RECEIVE ENGINE
// ===============================

// Resolve the plan for a user: subscriber when they hold an active/trialing
// subscriber subscription, otherwise free.
const resolvePlan = async (userId) => {
  const activeSubscriptions =
    await subscriptionRepository.findActiveSubscriptionsByUser(userId);
  const isSubscriber = activeSubscriptions.length > 0;

  return isSubscriber ? "subscriber" : "free";
};

// The Inspire category is special: it pools quotes from every active category.
// Returns the Quote category string filter for selection (null = all active quotes).
const resolveQuoteCategory = (requestedSlug, isPremium, category) => {
  if (requestedSlug === "inspire") {
    if (!category) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "Category not found",
        "CATEGORY_NOT_FOUND"
      );
    }
    return null;
  }

  if (category.isPremium && !isPremium) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "This category requires a premium subscription",
      "PREMIUM_CATEGORY_REQUIRED"
    );
  }

  return category.slug;
};

// Execute one no-repeat selection pass.
// Returns { quote, cycle } or { exhausted: true } when every quote in the
// pool has already been received within the current cycle.
const selectQuoteFromPool = async (userId, categoryId, quoteCategory, cycle) => {
  const receivedIds = await receivedQuoteRepository.getReceivedQuoteIdsForCycle(
    userId,
    categoryId,
    cycle
  );

  const quote = await quoteRepository.getRandomQuoteByCategory(
    quoteCategory,
    receivedIds
  );

  if (quote) {
    return { quote, cycle };
  }

  const totalInCategory = await quoteRepository.countActiveQuotes(quoteCategory);

  if (totalInCategory > 0 && receivedIds.length < totalInCategory) {
    // Unavailable only when the pool is exhausted (every quote already received).
    return { exhausted: true };
  }

  // Cycle is complete (or pool is empty): restart from a fresh cycle.
  return { quote: null, cycle: cycle + 1 };
};

const receiveDashboardQuote = async (userId, categorySlug) => {
  const plan = await resolvePlan(userId);
  const isPremium = plan === "subscriber";
  const dailyLimit = DASHBOARD_DAILY_LIMITS[plan];
  const dayKey = getDayKey();

  // 1. Category lookup
  const slug = categorySlug || "inspire";
  const category = await categoryRepository.findBySlug(slug);

  if (!category) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Category not found",
      "CATEGORY_NOT_FOUND"
    );
  }

  if (!category.isActive) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Category is not active",
      "CATEGORY_INACTIVE"
    );
  }

  const quoteCategory = resolveQuoteCategory(slug, isPremium, category);

  // 2. Daily limit
  const todayCount = await receivedQuoteRepository.countToday(userId, dayKey);

  if (todayCount >= dailyLimit) {
    throw new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      "You've reached your daily quote limit. Come back tomorrow!",
      "DAILY_LIMIT_REACHED"
    );
  }

  // 2.1. Check if user already scanned a tag today without a ReceivedQuote (Fail-safe bridge)
  if (todayCount === 0) {
    try {
      const todayScan = await ScanHistory.findOne({
        user: userId,
        scanDateKey: dayKey,
        quote: { $ne: null },
      }).populate("quote").sort({ createdAt: -1 });

      if (todayScan?.quote && todayScan.quote.isActive !== false) {
        const scanQuote = todayScan.quote;
        const categoryId = category._id;
        const currentCycle = await receivedQuoteRepository.getCurrentCycle(userId, categoryId);

        const receivedQuote = await receivedQuoteRepository.createReceivedQuote({
          user: userId,
          quote: scanQuote._id,
          category: categoryId,
          categorySlug: category.slug,
          receivedAt: new Date(),
          source: "scan",
          dayKey,
          isRead: true,
          isFavoriteSnapshot: false,
          cycle: currentCycle || 1,
          metadata: {
            plan,
            categorySlug: category.slug,
            quoteCategory: quoteCategory || "inspire",
            fromScanBridge: true,
          },
        });

        const streak = await streakService.updateStreakAfterReceive(
          userId,
          receivedQuote.receivedAt
        );

        const remainingToday = dailyLimit - 1;
        const quoteCat = scanQuote.category;
        const isGenericPool = slug === "inspire" || !category || category.slug === "inspire";

        const resolvedCategoryName = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire")
          ? quoteCat.charAt(0).toUpperCase() + quoteCat.slice(1)
          : category.name;

        const resolvedCategorySlug = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire")
          ? quoteCat.toLowerCase()
          : category.slug;

        return {
          _id: receivedQuote._id,
          quote: {
            _id: scanQuote._id,
            text: scanQuote.text,
            author: scanQuote.author || "InspireTag",
            description: scanQuote.description || null,
            image: scanQuote.image || null,
            theme: scanQuote.theme || null,
            editorData: scanQuote.editorData || null,
            renderedImages: scanQuote.renderedImages || null,
          },
          category: {
            _id: category._id,
            name: resolvedCategoryName,
            slug: resolvedCategorySlug,
            icon: category.icon,
            color: category.color,
          },
          receivedAt: receivedQuote.receivedAt,
          remainingToday,
          dailyLimit,
          streak: streak
            ? {
                current: streak.current,
                longest: streak.longest,
                lastReceivedDate: streak.lastReceivedDate,
                todayCounted: streak.lastReceivedDate === dayKey,
              }
            : null,
        };
      }
    } catch (bridgeErr) {
      // Fall through to normal quote selection if bridge fails
    }
  }

  // 3. No-repeat selection (per category; Inspire pools all active quotes)
  const categoryId = category._id;
  const currentCycle = await receivedQuoteRepository.getCurrentCycle(
    userId,
    categoryId
  );

  let selection = await selectQuoteFromPool(
    userId,
    categoryId,
    quoteCategory,
    currentCycle
  );

  if (selection.exhausted) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No available quotes in this category right now",
      "NO_QUOTES_AVAILABLE"
    );
  }

  if (!selection.quote) {
    // Cycle complete — restart with a fresh cycle
    selection = await selectQuoteFromPool(
      userId,
      categoryId,
      quoteCategory,
      selection.cycle
    );
  }

  if (!selection.quote) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No available quotes in this category right now",
      "NO_QUOTES_AVAILABLE"
    );
  }

  // 4. Persist
  const receivedQuote = await receivedQuoteRepository.createReceivedQuote({
    user: userId,
    quote: selection.quote._id,
    category: categoryId,
    categorySlug: category.slug,
    receivedAt: new Date(),
    source: "dashboard",
    dayKey,
    isRead: false,
    isFavoriteSnapshot: false,
    cycle: selection.cycle,
    metadata: {
      plan,
      categorySlug: category.slug,
      quoteCategory: quoteCategory || "inspire",
    },
  });

  // 5. Streak — only after the quote is successfully saved.
  // Increases once per day, driven exclusively by new dashboard receives.
  const streak = await streakService.updateStreakAfterReceive(
    userId,
    receivedQuote.receivedAt
  );

  const remainingToday = dailyLimit - (todayCount + 1);

  const quoteCat = selection.quote?.category;
  const isGenericPool = slug === "inspire" || !category || category.slug === "inspire";

  const resolvedCategoryName = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire")
    ? quoteCat.charAt(0).toUpperCase() + quoteCat.slice(1)
    : category.name;

  const resolvedCategorySlug = (isGenericPool && quoteCat && quoteCat.toLowerCase() !== "inspire")
    ? quoteCat.toLowerCase()
    : category.slug;

  return {
    _id: receivedQuote._id,
    quote: {
      _id: selection.quote._id,
      text: selection.quote.text,
      author: selection.quote.author || "InspireTag",
      description: selection.quote.description || null,
      image: selection.quote.image || null,
      theme: selection.quote.theme || null,
      editorData: selection.quote.editorData || null,
      renderedImages: selection.quote.renderedImages || null,
    },
    category: {
      _id: category._id,
      name: resolvedCategoryName,
      slug: resolvedCategorySlug,
      icon: category.icon,
      color: category.color,
    },
    receivedAt: receivedQuote.receivedAt,
    remainingToday,
    dailyLimit,
    streak: streak
      ? {
          current: streak.current,
          longest: streak.longest,
          lastReceivedDate: streak.lastReceivedDate,
          todayCounted: streak.lastReceivedDate === dayKey,
        }
      : null,
  };
};

export default {
  saveReceivedQuote,
  getLatestQuote,
  getReceivedQuoteById,
  getHistory,
  getTodayHistory,
  getStatistics,
  getDailyUsage,
  readAgain,
  receiveDashboardQuote,
};
