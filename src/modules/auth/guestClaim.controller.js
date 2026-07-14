import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import guestClaimService from "./guestClaim.service.js";

/**
 * ✅ Check if user has guest resources
 * GET /api/v1/auth/guest-resources
 */
const checkGuestResources = catchAsync(async (req, res) => {
    const email = req.user?.email;
    if (!email) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "User email not found",
        });
    }

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
    const userId = req.user.userId;
    const email = req.user.email;

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