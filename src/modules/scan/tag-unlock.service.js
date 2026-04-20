import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";
import Quote from "../quote/quote.model.js";
import subscriptionService from "../subscription/subscription.service.js";

const getTodayKey = () => {
  return new Date().toISOString().split("T")[0];
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

  // Personal message first
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
        remaining: null,
      }
    };
  }

  const rules = subscriptionService.getRules(tag.subscriptionType);

  let selectedCategory = null;
  if (user?.userId && rules.canChooseCategory && category) {
    selectedCategory = category;
  }

  // Logged-in user হলে only once/day logic থাকবে
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
          message: "You already unlocked a message today. Come back tomorrow for a new message!",
        },
      };
    }
  }

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
      message: "You've used all your unlocks for today. Come back tomorrow!",
      data: {
        remaining: 0,
        dailyLimit: rules.dailyLimit,
      },
    };
  }

  const query = { isActive: true };

  if (selectedCategory) {
    query.category = selectedCategory;
  }

  let usedQuoteIds = [];
  if (user?.userId) {
    usedQuoteIds = await scanRepository.getUsedQuoteIdsByUser(
      tag._id,
      user.userId,
      todayKey
    );
  }

  const validQuoteIds = usedQuoteIds.filter((id) => id !== null && id !== undefined);

  if (validQuoteIds.length > 0) {
    query._id = { $nin: validQuoteIds };
  }

  let quote = await Quote.aggregate([
    { $match: query },
    { $sample: { size: 1 } },
  ]);

  if (!quote.length) {
    const fallbackQuery = { isActive: true };

    if (selectedCategory) {
      fallbackQuery.category = selectedCategory;
    }

    quote = await Quote.aggregate([
      { $match: fallbackQuery },
      { $sample: { size: 1 } },
    ]);
  }

  if (!quote.length) {
    throw new AppError(httpStatus.NOT_FOUND, "No quote found in this category");
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
    user?.userId && rules.dailyLimit ? rules.dailyLimit - (scanCount + 1) : null;

  return {
    status: "SUCCESS",
    data: {
      _id: selectedQuote._id,
      quote: selectedQuote.text,
      category: selectedQuote.category,
      remaining,
      dailyLimit: user?.userId ? rules.dailyLimit : null,
      canChooseCategory: !!(user?.userId && rules.canChooseCategory),
    },
  };
};

export default {
  unlockTag,
};