import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import httpStatus from "../../constants/httpStatus.js";
import quoteAssignmentService from "./quoteAssignment.service.js";

/**
 * Create assignment
 */
const createAssignment = catchAsync(async (req, res) => {
  const result = await quoteAssignmentService.createAssignment(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Quote assignment created successfully",
    data: result,
  });
});

/**
 Get all assignments
 */
const getAllAssignments = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const assignmentType = req.query.assignmentType || null;
  const isActive =
    req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;

  const result = await quoteAssignmentService.getAllAssignments({
    page,
    limit,
    assignmentType,
    isActive,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote assignments fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

/**
 * Get assignment by ID
 */
const getAssignmentById = catchAsync(async (req, res) => {
  const result = await quoteAssignmentService.getAssignmentById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote assignment fetched successfully",
    data: result,
  });
});

/**
 * Update assignment
 */
const updateAssignment = catchAsync(async (req, res) => {
  const result = await quoteAssignmentService.updateAssignment(
    req.params.id,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote assignment updated successfully",
    data: result,
  });
});

/**
 * Delete assignment
 */
const deleteAssignment = catchAsync(async (req, res) => {
  await quoteAssignmentService.deleteAssignment(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote assignment deleted successfully",
    data: null,
  });
});

export default {
  createAssignment,
  getAllAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
};