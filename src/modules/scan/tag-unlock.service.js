import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";
import Quote from "../quote/quote.model.js";
import Order from "../order/order.model.js";
import subscriptionService from "../subscription/subscription.service.js";
import quoteAssignmentService from "../quoteAssignment/quoteAssignment.service.js";

import mongoose from "mongoose";
import Category from "../category/category.model.js";
import ReceivedQuote from "../received-quote/receivedQuote.model.js";
import receivedQuoteRepository from "../received-quote/receivedQuote.repository.js";
import subscriptionRepository from "../subscription/subscription.repository.js";
import streakService from "../streak/streak.service.js";
import { getDayKey } from "../../utils/dateUtils.js";

const syncReceivedQuoteForUser = async (targetUserId, quoteDoc, quoteSource, tag, explicitTodayKey = null, tz = null) => {
    if (!targetUserId || !quoteDoc?._id) return;
    try {
        const todayKey = explicitTodayKey || getDayKey(tz);
        const alreadyExists = await receivedQuoteRepository.existsForToday(targetUserId, todayKey);
        if (!alreadyExists) {
            let categoryDoc = null;
            if (quoteDoc.category) {
                categoryDoc = await Category.findOne({
                    $or: [
                        { slug: quoteDoc.category.toString().toLowerCase() },
                        { name: new RegExp(`^${quoteDoc.category}$`, "i") },
                    ],
                });
            }

            const created = await receivedQuoteRepository.createReceivedQuote({
                user: targetUserId,
                quote: quoteDoc._id,
                category: categoryDoc?._id || null,
                categorySlug: categoryDoc?.slug || (quoteDoc.category ? quoteDoc.category.toString().toLowerCase() : "inspire"),
                receivedAt: new Date(),
                source: "scan",
                dayKey: todayKey,
                isRead: true,
                metadata: {
                    tagCode: tag?.tagCode,
                    tagId: tag?._id,
                    sourceType: quoteSource,
                },
            });

            try {
                await streakService.updateStreakAfterReceive(targetUserId, created.receivedAt, tz || todayKey);
            } catch (streakErr) {
                // Non-fatal
            }
        }
    } catch (err) {
        // Non-fatal
    }
};

// Helper to format consistent quote response with audit status flags
const formatQuotePayload = (q, srcType, { isNewQuote = true, isAlreadyUnlocked = false, statusMessage = null, giftInfo = null } = {}) => {
    const imageUrl = q?.image?.url || (typeof q?.image === "string" ? q.image : null);
    return {
        _id: q?._id,
        quote: q?.text || "",
        text: q?.text || "",
        category: q?.category || "faith",
        author: q?.author || null,
        description: q?.description || null,
        image: imageUrl,
        theme: q?.theme || null,
        editorData: q?.editorData || null,
        renderedImages: q?.renderedImages || null,
        audioTrack: q?.audioTrack || q?.backgroundMusic || null,
        allowReuse: typeof q?.allowReuse === "boolean" ? q.allowReuse : true,
        sourceType: srcType,
        isPersonalMessage: false,
        isNewQuoteToday: isNewQuote,
        isAlreadyUnlockedToday: isAlreadyUnlocked,
        message: statusMessage,
        gift: giftInfo,
        isGift: Boolean(giftInfo?.isGift),
        giftOrderId: giftInfo?.orderId || null,
        isClaimable: Boolean(giftInfo?.isClaimable),
    };
};

// ===============================
// 🆕 PUBLIC SCAN PREVIEW - No Auth Required, Zero Quota Consumption
// ===============================

/**
 * ✅ Public QR Code Scan Preview
 * 
 * Inspects tag status and returns quota metadata:
 * - canReveal: boolean (true if today's limit is not reached; free: 1/day, subscriber: 3/day)
 * - remainingQuotesToday: number
 * - latestQuote: revealed quote if already revealed today and limit reached, or null if eligible for new reveal
 * 
 * CRITICAL: Zero writes to PublicScan, ScanHistory, or ReceivedQuote. Zero streak updates.
 */
const publicUnlock = async (tagCode, user = null, tzOrReq = null) => {
    // 0. Validate QR Code format
    if (!tagCode || typeof tagCode !== "string" || !tagCode.trim()) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Invalid QR code",
            "INVALID_TAG_CODE"
        );
    }

    const tz = typeof tzOrReq === "string" ? tzOrReq : (tzOrReq?.headers?.["x-timezone"] || null);
    const todayKey = getDayKey(tz);

    let tag;
    try {
        tag = await tagRepository.findByTagCode(tagCode.trim());
    } catch (err) {
        throw new AppError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Unable to process QR code right now. Please try again.",
            "TAG_LOOKUP_FAILED"
        );
    }

    if (!tag) {
        throw new AppError(
            httpStatus.NOT_FOUND,
            "QR code not found",
            "TAG_NOT_FOUND"
        );
    }

    if (!tag.isActive) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "This QR code is no longer active",
            "TAG_INACTIVE"
        );
    }

    // First-scan activation for unowned tags (state flag only, no scan records)
    if (!tag.isActivated) {
        const activated = await tagRepository.activateTagIfNotActivated(tag.tagCode);
        if (activated) {
            tag = activated;
        } else {
            tag = await tagRepository.findByTagCode(tagCode.trim());
            if (!tag || !tag.isActivated) {
                throw new AppError(
                    httpStatus.BAD_REQUEST,
                    "This QR code has not been activated yet",
                    "TAG_NOT_ACTIVATED"
                );
            }
        }
    }

    // Resolve minimal safe gift claim metadata
    let giftInfo = null;
    if (tag.assignedOrderId) {
        try {
            const order = await Order.findById(tag.assignedOrderId).select("purchaseType giftStatus paymentStatus");
            if (order && order.purchaseType === "gift") {
                giftInfo = {
                    isGift: true,
                    orderId: order._id.toString(),
                    giftStatus: order.giftStatus || "pending_claim",
                    isClaimable: !tag.owner && order.giftStatus !== "claimed" && order.paymentStatus === "paid",
                };
            }
        } catch (e) {
            // non-fatal
        }
    }

    // Check Personal Message (Public) - Does NOT write to DB on preview
    if (tag.personalMessage && tag.personalMessage.trim() !== "") {
        const personalPayload = {
            _id: null,
            quote: tag.personalMessage,
            text: tag.personalMessage,
            category: "personal",
            author: null,
            description: null,
            image: null,
            theme: null,
            editorData: null,
            allowReuse: true,
            isPersonalMessage: true,
            sourceType: "personal",
            gift: giftInfo,
            isGift: Boolean(giftInfo?.isGift),
            giftOrderId: giftInfo?.orderId || null,
            isClaimable: Boolean(giftInfo?.isClaimable),
        };

        return {
            ...personalPayload,
            canReveal: false,
            remainingQuotesToday: 0,
            dailyLimit: 1,
            usedToday: 1,
            latestQuote: personalPayload,
        };
    }

    // Identify target user
    const targetUserId = user?.userId || user?._id || user?.id || (tag.owner ? tag.owner.toString() : null);

    // Resolve user tier and daily limit (free: 1, subscriber: 3)
    let isSubscriber = false;
    if (targetUserId) {
        try {
            const activeSubs = await subscriptionRepository.findActiveSubscriptionsByUser(targetUserId);
            isSubscriber = Boolean(activeSubs && activeSubs.length > 0);
        } catch (subErr) {
            // fallback free
        }
    }
    const dailyLimit = isSubscriber ? 3 : 1;

    // Check today's usage WITHOUT creating any records
    let usedToday = 0;
    let latestRevealedQuote = null;
    let latestSource = "random";

    if (targetUserId) {
        usedToday = await receivedQuoteRepository.countToday(targetUserId, todayKey);
        if (usedToday > 0) {
            const todayQuotes = await receivedQuoteRepository.getTodayReceivedQuotes(targetUserId, todayKey);
            if (todayQuotes && todayQuotes.length > 0 && todayQuotes[0]?.quote) {
                latestRevealedQuote = todayQuotes[0].quote;
                latestSource = todayQuotes[0].source || "scan";
            }
        }
    } else {
        const publicScan = await scanRepository.getPublicDailyScan(tag._id, todayKey);
        if (publicScan?.quote && publicScan.quote.isActive !== false) {
            usedToday = 1;
            latestRevealedQuote = publicScan.quote;
            latestSource = publicScan.sourceType || "random";
        }
    }

    const canReveal = usedToday < dailyLimit;
    const remainingQuotesToday = Math.max(0, dailyLimit - usedToday);

    // If eligible for a new reveal, latestQuote is null (ready for intermediary reveal screen).
    // If quota is exhausted, latestQuote contains the quote unlocked today.
    let formattedLatestQuote = null;
    if (!canReveal && latestRevealedQuote) {
        formattedLatestQuote = formatQuotePayload(latestRevealedQuote, latestSource, {
            isNewQuote: false,
            isAlreadyUnlocked: true,
            statusMessage: "Today's quote has already been unlocked. Come back tomorrow!",
            giftInfo,
        });
    }

    // Resolve preview category
    let previewCategory = formattedLatestQuote?.category || "inspire";
    if (!formattedLatestQuote) {
        try {
            const tagAssignment = await quoteAssignmentService.getTopAssignmentByTag(tag._id);
            if (tagAssignment?.quote?.category) {
                previewCategory = tagAssignment.quote.category;
            }
        } catch (assignErr) {}
    }

    return {
        canReveal,
        remainingQuotesToday,
        dailyLimit,
        usedToday,
        latestQuote: formattedLatestQuote,
        tagCode: tag.tagCode,
        category: previewCategory,
        gift: giftInfo,
        isGift: Boolean(giftInfo?.isGift),
        giftOrderId: giftInfo?.orderId || null,
        isClaimable: Boolean(giftInfo?.isClaimable),
        isPersonalMessage: false,
        ...(formattedLatestQuote || {}),
        canReveal,
        remainingQuotesToday,
        latestQuote: formattedLatestQuote,
    };
};

// ===============================
// 🚀 EXPLICIT REVEAL - Consumes Quota, Persists ReceivedQuote, Updates Streak
// ===============================

/**
 * ✅ Explicit Quote Reveal
 * 
 * Called ONLY when the user taps "Reveal Today's Quote".
 * Validates quota eligibility (free: 1, subscriber: 3).
 * Fetches the next rotating quote (bypassing already received quotes).
 * Persists ReceivedQuote and updates streak.
 */
const revealQuote = async (tagCode, user = null, category = null, tzOrReq = null, req = null) => {
    if (!tagCode || typeof tagCode !== "string" || !tagCode.trim()) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Invalid QR code",
            "INVALID_TAG_CODE"
        );
    }

    const tz = typeof tzOrReq === "string"
        ? tzOrReq
        : (tzOrReq?.headers?.["x-timezone"] || req?.headers?.["x-timezone"] || null);
    const todayKey = getDayKey(tz);

    let tag;
    try {
        tag = await tagRepository.findByTagCode(tagCode.trim());
    } catch (err) {
        throw new AppError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Unable to process QR code right now. Please try again.",
            "TAG_LOOKUP_FAILED"
        );
    }

    if (!tag) {
        throw new AppError(httpStatus.NOT_FOUND, "QR code not found", "TAG_NOT_FOUND");
    }

    if (!tag.isActive) {
        throw new AppError(httpStatus.BAD_REQUEST, "This QR code is no longer active", "TAG_INACTIVE");
    }

    if (!tag.isActivated) {
        const activated = await tagRepository.activateTagIfNotActivated(tag.tagCode);
        if (activated) tag = activated;
    }

    // Resolve gift info
    let giftInfo = null;
    if (tag.assignedOrderId) {
        try {
            const order = await Order.findById(tag.assignedOrderId).select("purchaseType giftStatus paymentStatus");
            if (order && order.purchaseType === "gift") {
                giftInfo = {
                    isGift: true,
                    orderId: order._id.toString(),
                    giftStatus: order.giftStatus || "pending_claim",
                    isClaimable: !tag.owner && order.giftStatus !== "claimed" && order.paymentStatus === "paid",
                };
            }
        } catch (e) {}
    }

    // Personal message handling
    if (tag.personalMessage && tag.personalMessage.trim() !== "") {
        if (user?.userId) {
            try {
                await scanRepository.createScan({
                    tag: tag._id,
                    user: user.userId,
                    quote: null,
                    category: "personal",
                    scanDateKey: todayKey,
                    sourceType: "personal",
                });
            } catch (err) {}
        }

        const personalPayload = {
            _id: null,
            quote: tag.personalMessage,
            text: tag.personalMessage,
            category: "personal",
            author: null,
            description: null,
            image: null,
            theme: null,
            editorData: null,
            allowReuse: true,
            isPersonalMessage: true,
            sourceType: "personal",
            gift: giftInfo,
            isGift: Boolean(giftInfo?.isGift),
            giftOrderId: giftInfo?.orderId || null,
            isClaimable: Boolean(giftInfo?.isClaimable),
        };

        return {
            ...personalPayload,
            canReveal: false,
            remainingQuotesToday: 0,
            dailyLimit: 1,
            usedToday: 1,
            latestQuote: personalPayload,
        };
    }

    // Target user identification
    const targetUserId = user?.userId || user?._id || user?.id || (tag.owner ? tag.owner.toString() : null);

    // Resolve tier & limits
    let isSubscriber = false;
    if (targetUserId) {
        try {
            const activeSubs = await subscriptionRepository.findActiveSubscriptionsByUser(targetUserId);
            isSubscriber = Boolean(activeSubs && activeSubs.length > 0);
        } catch (subErr) {}
    }
    const dailyLimit = isSubscriber ? 3 : 1;

    // Quota eligibility check
    const usedToday = targetUserId
        ? await receivedQuoteRepository.countToday(targetUserId, todayKey)
        : (await scanRepository.getPublicDailyScan(tag._id, todayKey) ? 1 : 0);

    if (usedToday >= dailyLimit) {
        throw new AppError(
            httpStatus.TOO_MANY_REQUESTS,
            "You've reached your daily quote limit. Come back tomorrow!",
            "DAILY_LIMIT_REACHED"
        );
    }

    // Quote Selection: Priority 1 & 2: Active Quote Assignment (Tag > User)
    let assignedQuote = null;
    let assignmentSourceType = null;
    try {
        const tagAssignment = await quoteAssignmentService.getTopAssignmentByTag(tag._id);
        if (tagAssignment?.quote && tagAssignment.quote.isActive !== false) {
            assignedQuote = tagAssignment.quote;
            assignmentSourceType = "tag_assignment";
        } else if (tag.owner) {
            const userAssignment = await quoteAssignmentService.getTopAssignmentByUser(tag.owner);
            if (userAssignment?.quote && userAssignment.quote.isActive !== false) {
                assignedQuote = userAssignment.quote;
                assignmentSourceType = "user_assignment";
            }
        }
    } catch (err) {}

    // Avoid trapping user on static assignment if already received on prior calendar day
    let bypassedAssignedQuoteId = null;
    if (assignedQuote && targetUserId) {
        try {
            const alreadyReceivedOnPriorDay = await receivedQuoteRepository.hasReceivedQuoteOnPriorDay(
                targetUserId,
                assignedQuote._id,
                todayKey
            );
            if (alreadyReceivedOnPriorDay) {
                const unlockedTodayWithThisQuote = await receivedQuoteRepository.hasReceivedQuoteToday(
                    targetUserId,
                    assignedQuote._id,
                    todayKey
                );
                if (!unlockedTodayWithThisQuote) {
                    bypassedAssignedQuoteId = assignedQuote._id;
                    assignedQuote = null;
                    assignmentSourceType = null;
                }
            }
        } catch (err) {}
    }

    let selectedQuote = null;
    let quoteSource = null;

    if (assignedQuote) {
        selectedQuote = assignedQuote;
        quoteSource = assignmentSourceType;
    } else {
        // Priority 3: Rotating random quote bypassing already received quotes
        const excludeIds = [];
        if (bypassedAssignedQuoteId) {
            try {
                excludeIds.push(new mongoose.Types.ObjectId(bypassedAssignedQuoteId));
            } catch {
                excludeIds.push(bypassedAssignedQuoteId);
            }
        }

        if (targetUserId) {
            try {
                const receivedQuoteIds = await ReceivedQuote.find({ user: targetUserId }).distinct("quote");
                if (Array.isArray(receivedQuoteIds) && receivedQuoteIds.length > 0) {
                    for (const rid of receivedQuoteIds) {
                        if (rid) excludeIds.push(rid);
                    }
                }
            } catch (err) {}
        }

        const matchFilter = { isActive: true };
        if (excludeIds.length > 0) {
            matchFilter._id = { $nin: excludeIds };
        }

        let randomQuotes = await Quote.aggregate([
            { $match: matchFilter },
            { $sample: { size: 1 } },
        ]);

        if (!randomQuotes || randomQuotes.length === 0) {
            // If all quotes in database have been received, restart cycle (exclude only today's quotes)
            const todayReceivedIds = targetUserId
                ? (await ReceivedQuote.find({ user: targetUserId, dayKey: todayKey }).distinct("quote"))
                : [];
            const cycleFilter = { isActive: true };
            if (todayReceivedIds.length > 0) {
                cycleFilter._id = { $nin: todayReceivedIds };
            }
            randomQuotes = await Quote.aggregate([
                { $match: cycleFilter },
                { $sample: { size: 1 } },
            ]);
        }

        if (!randomQuotes || randomQuotes.length === 0) {
            randomQuotes = await Quote.aggregate([
                { $match: { isActive: true } },
                { $sample: { size: 1 } },
            ]);
        }

        if (!randomQuotes || randomQuotes.length === 0) {
            throw new AppError(
                httpStatus.NOT_FOUND,
                "No quote available for this QR code",
                "NO_QUOTE_AVAILABLE"
            );
        }

        selectedQuote = randomQuotes[0];
        quoteSource = "random";
    }

    // Persist scan history & public scan
    await scanRepository.createPublicScan({
        tag: tag._id,
        quote: selectedQuote._id,
        category: selectedQuote.category,
        scanDateKey: todayKey,
        sourceType: quoteSource,
    });

    if (user?.userId) {
        try {
            await scanRepository.createScan({
                tag: tag._id,
                user: user.userId,
                quote: selectedQuote._id,
                category: selectedQuote.category,
                scanDateKey: todayKey,
                sourceType: quoteSource,
            });
        } catch (err) {}
    }

    // Persist ReceivedQuote and update streak at this exact moment
    let updatedStreak = null;
    if (targetUserId) {
        try {
            let categoryDoc = null;
            if (selectedQuote.category) {
                categoryDoc = await Category.findOne({
                    $or: [
                        { slug: selectedQuote.category.toString().toLowerCase() },
                        { name: new RegExp(`^${selectedQuote.category}$`, "i") },
                    ],
                });
            }

            const createdReceived = await receivedQuoteRepository.createReceivedQuote({
                user: targetUserId,
                quote: selectedQuote._id,
                category: categoryDoc?._id || null,
                categorySlug: categoryDoc?.slug || (selectedQuote.category ? selectedQuote.category.toString().toLowerCase() : "inspire"),
                receivedAt: new Date(),
                source: "scan",
                dayKey: todayKey,
                isRead: true,
                metadata: {
                    tagCode: tag?.tagCode,
                    tagId: tag?._id,
                    sourceType: quoteSource,
                },
            });

            try {
                updatedStreak = await streakService.updateStreakAfterReceive(
                    targetUserId,
                    createdReceived.receivedAt,
                    tz || todayKey
                );
            } catch (streakErr) {}
        } catch (syncErr) {
            console.error("Failed to persist received quote on reveal:", syncErr);
        }
    }

    const newUsedToday = usedToday + 1;
    const remainingQuotesToday = Math.max(0, dailyLimit - newUsedToday);
    const canRevealNext = remainingQuotesToday > 0;

    const formattedQuote = formatQuotePayload(selectedQuote, quoteSource, {
        isNewQuote: true,
        isAlreadyUnlocked: false,
        statusMessage: null,
        giftInfo,
    });

    return {
        ...formattedQuote,
        canReveal: canRevealNext,
        remainingQuotesToday,
        dailyLimit,
        usedToday: newUsedToday,
        latestQuote: formattedQuote,
        streak: updatedStreak ? {
            current: updatedStreak.current,
            longest: updatedStreak.longest,
            lastReceivedDate: updatedStreak.lastReceivedDate,
        } : null,
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
 * Unlock tag (legacy alias for revealQuote)
 */
const unlockTag = async (tagCode, user, category, tz = null) => {
    return revealQuote(tagCode, user, category, tz);
};

// ===============================
// EXPORTS
// ===============================

export default {
    publicUnlock,
    revealQuote,
    unlockTag,
    getAssignedQuote,
};