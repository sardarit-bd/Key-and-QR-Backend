import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";
import Quote from "../quote/quote.model.js";
import Order from "../order/order.model.js";
import subscriptionService from "../subscription/subscription.service.js";
import quoteAssignmentService from "../quoteAssignment/quoteAssignment.service.js";

import Category from "../category/category.model.js";
import receivedQuoteRepository from "../received-quote/receivedQuote.repository.js";
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
const publicUnlock = async (tagCode, user = null, tz = null) => {
    // ✅ 0. Validate QR Code format (basic input guard)
    if (!tagCode || typeof tagCode !== "string" || !tagCode.trim()) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "Invalid QR code",
            "INVALID_TAG_CODE"
        );
    }

    const todayKey = getDayKey(tz);

    let tag;
    try {
        // ✅ 1. Validate Tag exists (with owner + activation state)
        tag = await tagRepository.findByTagCode(tagCode.trim());
    } catch (err) {
        // Unexpected DB/lookup failure — do not leak internals
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

    // ✅ 2. Validate Active Tag
    if (!tag.isActive) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            "This QR code is no longer active",
            "TAG_INACTIVE"
        );
    }

    // ✅ 3. First-scan activation (P0.1)
    // Discovered (unowned) tags are activated atomically on first public scan.
    // activateTagIfNotActivated only matches isActivated:false + owner:null, so
    // it never conflicts with order-based activation (findAndAssignMultipleTags
    // requires isActivated:false — an already-activated tag is never re-assigned).
    if (!tag.isActivated) {
        const activated = await tagRepository.activateTagIfNotActivated(tag.tagCode);
        if (activated) {
            tag = activated;
        } else {
            // Another concurrent scan may have activated it — re-fetch
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

    // Resolve minimal safe gift claim metadata (no buyer/sensitive info leaked)
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

    // ✅ 4. Check Personal Message (Public)
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
            } catch (err) {
                // Non-fatal if scan history fails
            }
        }

        return {
            _id: null,
            quote: tag.personalMessage,
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
            isGift: !!giftInfo?.isGift,
            giftOrderId: giftInfo?.orderId || null,
            isClaimable: !!giftInfo?.isClaimable,
        };
    }

    // Helper to format consistent quote response with audit status flags
    const formatQuotePayload = (q, srcType, { isNewQuote = true, isAlreadyUnlocked = false, statusMessage = null } = {}) => {
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
            allowReuse: typeof q?.allowReuse === "boolean" ? q.allowReuse : true,
            sourceType: srcType,
            isPersonalMessage: false,
            isNewQuoteToday: isNewQuote,
            isAlreadyUnlockedToday: isAlreadyUnlocked,
            message: statusMessage,
            gift: giftInfo,
            isGift: !!giftInfo?.isGift,
            giftOrderId: giftInfo?.orderId || null,
            isClaimable: !!giftInfo?.isClaimable,
        };
    };

    // Check existing scans for today (User-specific and Public)
    let userTodayScan = null;
    if (user?.userId) {
        try {
            userTodayScan = await scanRepository.getTodayScanByUser(tag._id, user.userId, todayKey);
        } catch (err) {
            // Non-fatal
        }
    }
    const existingPublicScan = await scanRepository.getPublicDailyScan(tag._id, todayKey);

    // ✅ 5. Priority 1 & 2: Check active Quote Assignment (Tag Assignment > User Assignment)
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
    } catch (err) {
        // Fallback gracefully on assignment lookup error
    }

    const targetUserId = user?.userId || (tag.owner ? tag.owner.toString() : null);

    // If an assigned quote exists, check if it was already delivered to this user on a prior calendar day.
    // If so, do NOT trap the user on the same static assignment indefinitely — allow daily rotation.
    if (assignedQuote && targetUserId) {
        try {
            const alreadyReceivedOnPriorDay = await receivedQuoteRepository.hasReceivedQuoteOnPriorDay(
                targetUserId,
                assignedQuote._id,
                todayKey
            );

            if (alreadyReceivedOnPriorDay) {
                // Check if this assigned quote was already unlocked today (e.g. repeat scan today)
                const unlockedTodayWithThisQuote = await receivedQuoteRepository.hasReceivedQuoteToday(
                    targetUserId,
                    assignedQuote._id,
                    todayKey
                );

                if (!unlockedTodayWithThisQuote) {
                    // It was consumed on a prior day and not unlocked today -> bypass static assignment
                    assignedQuote = null;
                    assignmentSourceType = null;
                }
            }
        } catch (err) {
            // Non-fatal, continue with normal assignment check
        }
    }

    if (assignedQuote) {
        // Save/update daily scan record so history reflects the active assignment
        await scanRepository.createPublicScan({
            tag: tag._id,
            quote: assignedQuote._id,
            category: assignedQuote.category,
            scanDateKey: todayKey,
            sourceType: assignmentSourceType,
        });

        if (user?.userId && !userTodayScan) {
            try {
                await scanRepository.createScan({
                    tag: tag._id,
                    user: user.userId,
                    quote: assignedQuote._id,
                    category: assignedQuote.category,
                    scanDateKey: todayKey,
                    sourceType: assignmentSourceType,
                });
            } catch (err) {
                // Non-fatal if scan history fails
            }
        }

        if (targetUserId) {
            await syncReceivedQuoteForUser(targetUserId, assignedQuote, assignmentSourceType, tag, todayKey);
        }

        const isRepeat = Boolean(user?.userId && userTodayScan);

        return formatQuotePayload(assignedQuote, assignmentSourceType, {
            isNewQuote: !isRepeat,
            isAlreadyUnlocked: isRepeat,
            statusMessage: isRepeat
                ? "Today's quote has already been unlocked. Come back tomorrow for a new one!"
                : null,
        });
    }

    // ✅ 6. Priority 3: No explicit assignment exists -> Use daily random quote cache
    // Only reuse existingScan if it was actually a random quote scan (not a stale, deleted assignment)
    if (
        existingPublicScan &&
        existingPublicScan.quote &&
        existingPublicScan.quote.isActive !== false &&
        existingPublicScan.sourceType === "random"
    ) {
        if (user?.userId && !userTodayScan) {
            try {
                await scanRepository.createScan({
                    tag: tag._id,
                    user: user.userId,
                    quote: existingPublicScan.quote._id,
                    category: existingPublicScan.quote.category,
                    scanDateKey: todayKey,
                    sourceType: "random",
                });
            } catch (err) {
                // Non-fatal if scan history fails
            }
        }

        if (targetUserId) {
            await syncReceivedQuoteForUser(targetUserId, existingPublicScan.quote, "random", tag, todayKey);
        }

        const isRepeat = Boolean(user?.userId && userTodayScan);

        return formatQuotePayload(existingPublicScan.quote, "random", {
            isNewQuote: !isRepeat,
            isAlreadyUnlocked: isRepeat,
            statusMessage: isRepeat
                ? "Today's quote has already been unlocked. Come back tomorrow for a new one!"
                : null,
        });
    }

    // Pick new random quote for today (First scan of the day)
    let quote = null;
    try {
        const randomQuotes = await Quote.aggregate([
            { $match: { isActive: true } },
            { $sample: { size: 1 } },
        ]);
        if (randomQuotes.length > 0) {
            quote = randomQuotes[0];
        }
    } catch (err) {
        throw new AppError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Unable to fetch a quote for this QR code right now. Please try again.",
            "QUOTE_LOOKUP_FAILED"
        );
    }

    if (!quote) {
        throw new AppError(
            httpStatus.NOT_FOUND,
            "No quote available for this QR code",
            "NO_QUOTE_AVAILABLE"
        );
    }

    await scanRepository.createPublicScan({
        tag: tag._id,
        quote: quote._id,
        category: quote.category,
        scanDateKey: todayKey,
        sourceType: "random",
    });

    if (user?.userId && !userTodayScan) {
        try {
            await scanRepository.createScan({
                tag: tag._id,
                user: user.userId,
                quote: quote._id,
                category: quote.category,
                scanDateKey: todayKey,
                sourceType: "random",
            });
        } catch (err) {
            // Non-fatal if scan history fails
        }
    }

    if (targetUserId) {
        await syncReceivedQuoteForUser(targetUserId, quote, "random", tag, todayKey);
    }

    return formatQuotePayload(quote, "random", {
        isNewQuote: true,
        isAlreadyUnlocked: false,
        statusMessage: null,
    });
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
const unlockTag = async (tagCode, user, category, tz = null) => {
    const tag = await tagRepository.findByTagCode(tagCode);

    if (!tag) {
        throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
    }

    if (!tag.isActive) {
        throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
    }

    const todayKey = getDayKey(tz);

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
            await syncReceivedQuoteForUser(user.userId, selectedQuote, assigned.source, tag, todayKey);
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
        await syncReceivedQuoteForUser(user.userId, selectedQuote, "random", tag, todayKey);
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