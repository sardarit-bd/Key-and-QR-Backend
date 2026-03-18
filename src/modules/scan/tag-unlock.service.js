import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";
import Quote from "../quote/quote.model.js"; // later create korba

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

  const todayScans = await scanRepository.getTodayScans(
    tag._id,
    todayKey
  );

  const scanCount = todayScans.length;

  // 🔑 FREE USER
  if (tag.subscriptionType === "free") {
    if (scanCount >= 1) {
      return {
        status: "LIMIT_REACHED",
        message: "Come back tomorrow",
      };
    }
  }

  // 💎 SUBSCRIBER
  if (tag.subscriptionType === "subscriber") {
    if (scanCount >= 3) {
      return {
        status: "LIMIT_REACHED",
        message: "Come back tomorrow",
      };
    }
  }

  // 🎯 Get quote
  let query = { isActive: true };

  if (category) {
    query.category = category;
  }

  const quote = await Quote.aggregate([
    { $match: query },
    { $sample: { size: 1 } },
  ]);

  if (!quote.length) {
    throw new AppError(httpStatus.NOT_FOUND, "No quote found");
  }

  const selectedQuote = quote[0];

  // 💾 Save scan
  await scanRepository.createScan({
    tag: tag._id,
    user: tag.owner,
    quote: selectedQuote._id,
    category: selectedQuote.category,
    scanDateKey: todayKey,
  });

  return {
    status: "SUCCESS",
    data: {
      quote: selectedQuote.text,
      category: selectedQuote.category,
    },
  };
};

export default {
  unlockTag,
};