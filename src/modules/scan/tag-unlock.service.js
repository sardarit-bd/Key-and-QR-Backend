// modules/scan/tag-unlock.service.js

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

// ===============================
// 🆕 PUBLIC UNLOCK - No Auth Required
// ===============================

/**
 * ✅ Public QR Code Scan
 * 
 * Returns ONLY public quote information
 * No authentication required
 * No scan history recorded (privacy)
 */
const publicUnlock = async (tagCode) => {
    // ✅ 1. Validate Tag
    const tag = await tagRepository.findByTagCode(tagCode);

    if (!tag) {
        throw new AppError(httpStatus.NOT_FOUND, "QR code not found");
    }

    if (!tag.isActive) {
        throw new AppError(httpStatus.BAD_REQUEST, "This QR code is no longer active");
    }

    if (!tag.isActivated) {
        throw new AppError(httpStatus.BAD_REQUEST, "This QR code has not been activated yet");
    }

    // ✅ 2. Check Personal Message (Public)
    if (tag.personalMessage && tag.personalMessage.trim() !== "") {
        return {
            _id: null,
            quote: tag.personalMessage,
            category: "personal",
            author: null,
            image: null,
            theme: null,
            isPersonalMessage: true,
            // ✅ No internal data
        };
    }

    // ✅ 3. Get Assigned Quote (Public)
    let quote = null;
    let sourceType = "random";

    // Priority 1: Tag assignment
    const tagAssignment = await quoteAssignmentService.getTopAssignmentByTag(tag._id);
    if (tagAssignment?.quote) {
        quote = tagAssignment.quote;
        sourceType = "tag_assignment";
    }

    // Priority 2: User assignment (if owner exists)
    if (!quote && tag.owner) {
        const userAssignment = await quoteAssignmentService.getTopAssignmentByUser(tag.owner);
        if (userAssignment?.quote) {
            quote = userAssignment.quote;
            sourceType = "user_assignment";
        }
    }

    // Priority 3: Random fallback
    if (!quote) {
        const randomQuote = await Quote.aggregate([
            { $match: { isActive: true } },
            { $sample: { size: 1 } },
        ]);
        if (randomQuote.length > 0) {
            quote = randomQuote[0];
            sourceType = "random";
        }
    }

    if (!quote) {
        throw new AppError(httpStatus.NOT_FOUND, "No quote available for this QR code");
    }

    // ✅ 4. Return ONLY Public Data
    return {
        _id: null,  // ✅ Do not expose internal ID
        quote: quote.text,
        category: quote.category,
        author: quote.author || null,
        image: quote.image?.url || null,
        theme: quote.theme || null,
        sourceType: sourceType,
        isPersonalMessage: false,
        // ✅ No internal data
    };
};

// ===============================
// EXISTING SERVICE FUNCTIONS
// ===============================

/**
 * Smart assignment (user > tag + rotation + allowReuse)
 */
const getAssignedQuote = async (tagId, usedQuoteIds = []) => {
    // Tag-based assignment only
    const assignments = await quoteAssignmentService.getAssignmentsByTag(tagId);

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
    const randomIndex = Math.floor(Math.random() * finalList.length);

    return {
        source: "tag",
        quote: finalList[randomIndex].quote,
    };
};

/**
 * Unlock tag (existing - for authenticated/optional auth)
 */
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
                    message: "You already unlocked a message today. Come back tomorrow!",
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
    const assigned = await getAssignedQuote(tag._id, usedIds);

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

    const remaining = user?.userId && rules.dailyLimit
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

// ===============================
// EXPORTS
// ===============================

export default {
    publicUnlock,
    unlockTag,
    getAssignedQuote,
};