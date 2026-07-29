import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import adminService from "./admin.service.js";
import adminRepository from "./admin.repository.js";
import productRepository from "../product/product.repository.js";
import orderService from "../order/order.service.js";
import tagRepository from "../tag/tag.repository.js";
import quoteRepository from "../quote/quote.repository.js";

const createAdmin = catchAsync(async (req, res) => {
    const result = await adminService.createAdmin(req.body);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Admin created successfully",
        data: result,
    });
});

const getAllUsers = catchAsync(async (req, res) => {
    const { search, role, status, sort, page, limit } = req.query;
    const result = await adminService.getAllUsers({ search, role, status, sort, page, limit });
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Users fetched successfully",
        data: result,
    });
});

const getUsersStats = catchAsync(async (req, res) => {
    const result = await adminRepository.getUsersStats();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Users stats fetched successfully",
        data: result,
    });
});

const getUserById = catchAsync(async (req, res) => {
    const result = await adminService.getUserById(req.params.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User fetched successfully",
        data: result,
    });
});

const updateUserRole = catchAsync(async (req, res) => {
    const result = await adminService.updateUserRole(req.params.id, req.body.role);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User role updated",
        data: result,
    });
});

const updateAdminProfile = catchAsync(async (req, res) => {
    const userId = req.user._id.toString();
    const image = req.file;
    const result = await adminService.updateAdminProfile(userId, req.body, image);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Profile updated successfully",
        data: result,
    });
});

const getDashboardOverview = catchAsync(async (req, res) => {
    const [usersStats, orderStats, pendingQuotesCount] =
        await Promise.all([
            adminRepository.getUsersStats(),
            orderService.getOrderStats(),
            (await import("../pendingQuote/pendingQuote.repository.js")).default.countPendingQuotes(),
        ]);

    const productCount = await productRepository.countProducts({});
    const unassignedTagCount = await tagRepository.countUnassignedTags();

    const overview = {
        stats: {
            totalUsers: usersStats.totalUsers,
            totalOrders: orderStats.total,
            totalProducts: productCount,
            totalRevenue: 0,
            activeTags: 0,
            pendingTags: unassignedTagCount,
            totalQuotes: 0,
            totalPendingQuotes: pendingQuotesCount || 0,
        },
        ordersByStatus: {
            pending: orderStats.pending,
            assigned: orderStats.assigned,
            shipped: orderStats.shipped,
            delivered: orderStats.delivered,
            cancelled: orderStats.cancelled,
            returned: orderStats.returned,
        },
        revenueByDate: [],
        userGrowth: [],
        recentOrders: [],
        recentUsers: [],
        recentActivity: [],
    };

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Dashboard overview fetched successfully",
        data: overview,
    });
});

const deleteUser = catchAsync(async (req, res) => {
    const result = await adminService.deleteUser(req.params.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User deleted",
        data: result,
    });
});

const suspendUser = catchAsync(async (req, res) => {
    const result = await adminService.suspendUser(req.params.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User suspended",
        data: result,
    });
});

const activateUser = catchAsync(async (req, res) => {
    const result = await adminService.activateUser(req.params.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User activated",
        data: result,
    });
});

const updateUser = catchAsync(async (req, res) => {
    const result = await adminService.updateUser(req.params.id, req.body);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User updated",
        data: result,
    });
});

export default {
    createAdmin,
    getAllUsers,
    getUsersStats,
    getDashboardOverview,
    getUserById,
    updateUserRole,
    updateAdminProfile,
    deleteUser,
    suspendUser,
    activateUser,
    updateUser,
};