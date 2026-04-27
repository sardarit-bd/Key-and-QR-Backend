import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";
import Quote from "../quote/quote.model.js";
import subscriptionService from "../subscription/subscription.service.js";
import quoteAssignmentService from "../quoteAssignment/quoteAssignment.service.js";

const getTodayKey = () => {
  return new Date().toISOString().split("T")[0];
};

/**
 * Smart assignment (user > tag + rotation + allowReuse)
 */
const getAssignedQuote = async (tagId, usedQuoteIds = []) => {
  //  Tag-based assignment only
  const assignments =
    await quoteAssignmentService.getAssignmentsByTag(tagId);

  if (!assignments || !assignments.length) return null;

  // filter by allowReuse + already used
  const filtered = assignments.filter((a) => {
    if (!a.quote) return false;

    const qId = a.quote._id.toString();

    if (!a.quote.allowReuse && usedQuoteIds.includes(qId)) {
      return false;
    }

    return true;
  });

  const finalList = filtered.length ? filtered : assignments;

  // random rotation
  const randomIndex = Math.floor(Math.random() * finalList.length);

  return {
    source: "tag",
    quote: finalList[randomIndex].quote,
  };
};

const unlockTag = async (tagCode, user, category) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  if (!tag.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
  }

  const todayKey = getTodayKey();

  // 1. Personal message
  if (tag.personalMessage && tag.personalMessage.trim() !== "") {
    if (user?.userId) {
      await scanRepository.createScan({
        tag: tag._id,
        user: user.userId,
        quote: null,
        category: "personal",
        scanDateKey: todayKey,
      });
    }

    return {
      status: "SUCCESS",
      data: {
        _id: null,
        quote: tag.personalMessage,
        category: "personal",
        isPersonalMessage: true,
        sourceType: "personal",
        remaining: null,
      },
    };
  }

  const rules = subscriptionService.getRules(tag.subscriptionType);

  let selectedCategory = null;
  if (user?.userId && rules.canChooseCategory && category) {
    selectedCategory = category;
  }

  // Already scanned today
  if (user?.userId) {
    const todayScan = await scanRepository.getTodayScanByUser(
      tag._id,
      user.userId,
      todayKey
    );

    if (todayScan && todayScan.quote) {
      return {
        status: "ALREADY_SCANNED_TODAY",
        data: {
          _id: todayScan.quote._id,
          quote: todayScan.quote.text,
          category: todayScan.quote.category,
          message:
            "You already unlocked a message today. Come back tomorrow!",
        },
      };
    }
  }

  // Limit check
  let scanCount = 0;
  if (user?.userId && rules.dailyLimit) {
    scanCount = await scanRepository.countTodayScansByUser(
      tag._id,
      user.userId,
      todayKey
    );
  }

  if (user?.userId && rules.dailyLimit && scanCount >= rules.dailyLimit) {
    return {
      status: "LIMIT_REACHED",
      message: "You've used all your unlocks for today.",
      data: {
        remaining: 0,
        dailyLimit: rules.dailyLimit,
      },
    };
  }

  // Used quotes
  let usedQuoteIds = [];
  if (user?.userId) {
    usedQuoteIds = await scanRepository.getUsedQuoteIdsByUser(
      tag._id,
      user.userId,
      todayKey
    );
  }

  const usedIds = usedQuoteIds.map((id) => id?.toString());

  // 2. Assignment logic
  const assigned = await getAssignedQuote(tag._id, user?.userId, usedIds);

  if (assigned && assigned.quote) {
    const selectedQuote = assigned.quote;

    if (user?.userId) {
      await scanRepository.createScan({
        tag: tag._id,
        user: user.userId,
        quote: selectedQuote._id,
        category: selectedQuote.category,
        scanDateKey: todayKey,
      });
    }

    return {
      status: "SUCCESS",
      data: {
        _id: selectedQuote._id,
        quote: selectedQuote.text,
        category: selectedQuote.category,
        author: selectedQuote.author,
        image: selectedQuote.image || null,
        theme: selectedQuote.theme || null,
        sourceType: assigned.source,
        remaining: null,
      },
    };
  }

  // 3. Random fallback
  const query = { isActive: true };

  if (selectedCategory) {
    query.category = selectedCategory;
  }

  if (usedIds.length > 0) {
    query._id = { $nin: usedIds };
  }

  let quote = await Quote.aggregate([
    { $match: query },
    { $sample: { size: 1 } },
  ]);

  if (!quote.length) {
    quote = await Quote.aggregate([
      { $match: { isActive: true } },
      { $sample: { size: 1 } },
    ]);
  }

  if (!quote.length) {
    throw new AppError(httpStatus.NOT_FOUND, "No quote found");
  }

  const selectedQuote = quote[0];

  if (user?.userId) {
    await scanRepository.createScan({
      tag: tag._id,
      user: user.userId,
      quote: selectedQuote._id,
      category: selectedQuote.category,
      scanDateKey: todayKey,
    });
  }

  const remaining =
    user?.userId && rules.dailyLimit
      ? rules.dailyLimit - (scanCount + 1)
      : null;

  return {
    status: "SUCCESS",
    data: {
      _id: selectedQuote._id,
      quote: selectedQuote.text,
      category: selectedQuote.category,
      author: selectedQuote.author,
      image: selectedQuote.image || null,
      theme: selectedQuote.theme || null,
      sourceType: "random",
      remaining,
      dailyLimit: user?.userId ? rules.dailyLimit : null,
      canChooseCategory: !!(user?.userId && rules.canChooseCategory),
    },
  };
};

export default {
  unlockTag,
};