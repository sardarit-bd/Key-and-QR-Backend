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

  if (!tag.isActivated) {
    return {
      status: "NEEDS_ACTIVATION",
    };
  }

  const todayKey = getTodayKey();

  // ==================== 🆕 PERSONAL MESSAGE CHECK ====================
  if (tag.personalMessage && tag.personalMessage.trim() !== "") {
    await scanRepository.createScan({
      tag: tag._id,
      user: user.userId,
      quote: null,
      category: "personal",
      scanDateKey: todayKey,
    });

    return {
      status: "SUCCESS",
      data: {
        quote: tag.personalMessage,
        category: "personal",
        isPersonalMessage: true,
        remaining: null,
      },
    };
  }

  // ==================== LAST QUOTE CHECK (Today) ====================
  const todayScan = await scanRepository.getTodayScan(tag._id, todayKey);
  
  if (todayScan && todayScan.quote) {
    return {
      status: "ALREADY_SCANNED_TODAY",
      data: {
        quote: todayScan.quote.text,
        category: todayScan.quote.category,
        message: "You already unlocked a message today. Come back tomorrow for a new message!",
      },
    };
  }

  // ==================== SUBSCRIPTION RULES ====================
  const rules = subscriptionService.getRules(tag.subscriptionType);

  let scanCount = 0;
  if (rules.dailyLimit) {
    scanCount = await scanRepository.countTodayScans(tag._id, todayKey);
  }

  // limit check
  if (rules.dailyLimit && scanCount >= rules.dailyLimit) {
    return {
      status: "LIMIT_REACHED",
      message: "You've used all your unlocks for today. Come back tomorrow!",
      data: {
        remaining: 0,
        dailyLimit: rules.dailyLimit,
      },
    };
  }

  let selectedCategory = null;
  if (rules.canChooseCategory && category) {
    selectedCategory = category;
  }

  const query = { isActive: true };

  if (selectedCategory) {
    query.category = selectedCategory;
  }

  const usedQuoteIds = await scanRepository.getUsedQuoteIds(tag._id, todayKey);
  const validQuoteIds = usedQuoteIds.filter(id => id !== null && id !== undefined);

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

    delete fallbackQuery._id;

    quote = await Quote.aggregate([
      { $match: fallbackQuery },
      { $sample: { size: 1 } },
    ]);
  }

  if (!quote.length) {
    throw new AppError(httpStatus.NOT_FOUND, "No quote found in this category");
  }

  const selectedQuote = quote[0];

  // save scan history
  await scanRepository.createScan({
    tag: tag._id,
    user: user.userId,
    quote: selectedQuote._id,
    category: selectedQuote.category,
    scanDateKey: todayKey,
  });

  const remaining = rules.dailyLimit ? rules.dailyLimit - (scanCount + 1) : null;

  return {
    status: "SUCCESS",
    data: {
      quote: selectedQuote.text,
      category: selectedQuote.category,
      remaining: remaining,
      dailyLimit: rules.dailyLimit,
      canChooseCategory: rules.canChooseCategory,
    },
  };
};

export default {
  unlockTag,
};