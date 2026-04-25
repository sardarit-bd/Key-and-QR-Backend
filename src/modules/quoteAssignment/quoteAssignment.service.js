import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import quoteAssignmentRepository from "./quoteAssignment.repository.js";
import quoteRepository from "../quote/quote.repository.js";
import tagRepository from "../tag/tag.repository.js";
import User from "../../models/user.model.js";

/**
 * Create assignment
 */
const createAssignment = async (payload) => {
    const quote = await quoteRepository.findById(payload.quote);

    if (!quote) {
        throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
    }

    if (payload.assignmentType === "tag") {
        const tag = await tagRepository.findById(payload.tag);

        if (!tag) {
            throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
        }
    }

    if (payload.assignmentType === "user") {
        const user = await User.findById(payload.user);

        if (!user) {
            throw new AppError(httpStatus.NOT_FOUND, "User not found");
        }
    }

    try {
        return await quoteAssignmentRepository.createAssignment(payload);
    } catch (error) {
        if (error.code === 11000) {
            throw new AppError(
                httpStatus.CONFLICT,
                "This quote assignment already exists"
            );
        }
        throw error;
    }
};

/**
 * Get all assignments
 */
const getAllAssignments = async ({ page, limit, assignmentType, isActive }) => {
    return quoteAssignmentRepository.getAllAssignments({
        page,
        limit,
        assignmentType,
        isActive,
    });
};

/**
 * Get single assignment
 */
const getAssignmentById = async (id) => {
    const assignment = await quoteAssignmentRepository.findById(id);

    if (!assignment) {
        throw new AppError(httpStatus.NOT_FOUND, "Quote assignment not found");
    }

    return assignment;
};

/**
 * Update assignment
 */
const updateAssignment = async (id, payload) => {
    const existingAssignment = await quoteAssignmentRepository.findById(id);

    if (!existingAssignment) {
        throw new AppError(httpStatus.NOT_FOUND, "Quote assignment not found");
    }

    if (payload.quote) {
        const quote = await quoteRepository.findById(payload.quote);

        if (!quote) {
            throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
        }
    }

    if (payload.assignmentType === "tag" || payload.tag) {
        const tagId = payload.tag || existingAssignment.tag?._id || existingAssignment.tag;

        if (tagId) {
            const tag = await tagRepository.findById(tagId);

            if (!tag) {
                throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
            }
        }
    }

    if (payload.assignmentType === "user" || payload.user) {
        const userId = payload.user || existingAssignment.user?._id || existingAssignment.user;

        if (userId) {
            const user = await User.findById(userId);

            if (!user) {
                throw new AppError(httpStatus.NOT_FOUND, "User not found");
            }
        }
    }

    try {
        const updated = await quoteAssignmentRepository.updateAssignment(id, payload);

        if (!updated) {
            throw new AppError(httpStatus.NOT_FOUND, "Quote assignment not found");
        }

        return updated;
    } catch (error) {
        if (error.code === 11000) {
            throw new AppError(
                httpStatus.CONFLICT,
                "This quote assignment already exists"
            );
        }
        throw error;
    }
};

/**
 * Delete assignment
 */
const deleteAssignment = async (id) => {
    const assignment = await quoteAssignmentRepository.findById(id);

    if (!assignment) {
        throw new AppError(httpStatus.NOT_FOUND, "Quote assignment not found");
    }

    return quoteAssignmentRepository.deleteAssignment(id);
};

/**
 * Get top assignment by tag
 */
const getTopAssignmentByTag = async (tagId) => {
    return quoteAssignmentRepository.getTopAssignmentByTag(tagId);
};

/**
 * Get top assignment by user
 */
const getTopAssignmentByUser = async (userId) => {
    return quoteAssignmentRepository.getTopAssignmentByUser(userId);
};

const getAssignmentsByTag = async (tagId) => {
    return quoteAssignmentRepository.getAssignmentsByTag(tagId);
};


export default {
    createAssignment,
    getAllAssignments,
    getAssignmentById,
    updateAssignment,
    deleteAssignment,
    getTopAssignmentByTag,
    getTopAssignmentByUser,
    getAssignmentsByTag,
};