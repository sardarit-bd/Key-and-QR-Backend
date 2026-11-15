import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import guestClaimService from "./guestClaim.service.js";
import User from "../../models/user.model.js";

/**
 * ✅ Check if user has guest resources
 * GET /api/v1/auth/guest-resources
 */
const checkGuestResources = catchAsync(async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: "Authentication required",
        });
    }

    // Security Check: Retrieve authenticated user from database using req.user.userId
    const user = await User.findById(userId).lean();
    if (!user) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: "User not found",
        });
    }

    // Require isEmailVerified === true before allowing guest resource checking/discovery
    if (!user.isEmailVerified) {
        return sendResponse(res, {
            statusCode: httpStatus.FORBIDDEN,
            success: false,
            message: "Email verification is required to view or claim guest resources.",
        });
    }

    const email = user.email;
    const hasResources = await guestClaimService.hasGuestResources(email);
    const summary = await guestClaimService.getGuestResourceSummary(email);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Guest resources found",
        data: {
            hasResources,
            summary,
        },
    });
});

/**
 * ✅ Manually claim guest resources
 * POST /api/v1/auth/claim-guest-resources
 */
const claimGuestResources = catchAsync(async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: "Authentication required",
        });
    }

    // Security Check: Retrieve authenticated user from database using req.user.userId
    const user = await User.findById(userId).lean();
    if (!user) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: "User not found",
        });
    }

    // Require isEmailVerified === true before allowing guest resource claims
    if (!user.isEmailVerified) {
        return sendResponse(res, {
            statusCode: httpStatus.FORBIDDEN,
            success: false,
            message: "Email verification is required before claiming guest resources.",
        });
    }

    // Use verified database email, never user-submitted payload
    const email = user.email;

    const result = await guestClaimService.claimGuestResources(userId, email);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.ordersClaimed > 0 
            ? `Successfully claimed ${result.ordersClaimed} order(s) and ${result.tagsClaimed} tag(s)`
            : "No guest resources found to claim",
        data: result,
    });
});

export default {
    checkGuestResources,
    claimGuestResources,
};