import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import scanService from "./tag-unlock.service.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "./scan.repository.js";

// ===============================
// PUBLIC SCAN - No Auth Required
// ===============================

/**
 * Public QR Scan
 * GET /api/v1/scan/public/:tagCode
 * 
 * Returns ONLY public quote data
 * No authentication required
 * Rate limited
 */
const publicScan = catchAsync(async (req, res) => {
    const { tagCode } = req.params;
    
    // Use public service method with optional authenticated user
    const result = await scanService.publicUnlock(tagCode, req.user);

    // Send sanitized public response
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "QR code scanned successfully",
        data: result,
    });
});

// ===============================
// EXISTING CONTROLLER FUNCTIONS
// ===============================

// Unlock tag (existing - kept for backward compatibility)
const unlockTag = catchAsync(async (req, res) => {
    const { tagCode } = req.params;
    const { category } = req.body || {};

    const result = await scanService.unlockTag(tagCode, req.user, category);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Unlock processed",
        data: result,
    });
});

// Get last unlock (existing)
const getLastUnlock = catchAsync(async (req, res) => {
    const { tagCode } = req.params;

    const tag = await tagRepository.findByTagCode(tagCode);
    if (!tag) {
        throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
    }

    const lastScan = await scanRepository.getLastScan(tag._id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        data: lastScan ? {
            quote: lastScan.quote?.text,
            category: lastScan.category,
            scannedAt: lastScan.createdAt,
            scanDateKey: lastScan.scanDateKey,
        } : null,
    });
});

// Get user scan history (existing)
const getUserScanHistory = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const category = req.query.category || "";
    const sortOrder = req.query.sortOrder || "desc";

    const result = await scanRepository.getUserScanHistory({
        userId: req.user.userId,
        page,
        limit,
        search,
        category,
        sortOrder,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Scan history fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// Get user scan stats (existing)
const getUserScanStats = catchAsync(async (req, res) => {
    const result = await scanRepository.getUserScanStats(req.user.userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Scan stats fetched successfully",
        data: result,
    });
});

// ===============================
// EXPORTS
// ===============================

export default {
    publicScan,
    unlockTag,
    getLastUnlock,
    getUserScanHistory,
    getUserScanStats,
};