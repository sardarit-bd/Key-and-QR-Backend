import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import adminService from "./admin.service.js";




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
    const result = await adminService.getAllUsers();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Users fetched successfully",
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
    const result = await adminService.updateUserRole(
        req.params.id,
        req.body.role
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User role updated",
        data: result,
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

export default {
    createAdmin,
    getAllUsers,
    getUserById,
    updateUserRole,
    deleteUser,
};