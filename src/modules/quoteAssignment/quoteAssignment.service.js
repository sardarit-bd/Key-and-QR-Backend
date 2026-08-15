import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import quoteAssignmentRepository from "./quoteAssignment.repository.js";
import quoteRepository from "../quote/quote.repository.js";
import tagRepository from "../tag/tag.repository.js";
import User from "../../models/user.model.js";
import Tag from "../tag/tag.model.js";

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
 * Bulk assign quote to multiple tags or users
 */
const bulkAssign = async (payload) => {
    const {
        quote: quoteId,
        assignmentType,
        targetIds,
        priority = 0,
        isActive = true,
        startAt = null,
        endAt = null,
    } = payload;

    const quote = await quoteRepository.findById(quoteId);
    if (!quote) {
        throw new AppError(httpStatus.NOT_FOUND, "Quote not found");
    }

    if (quote.isActive === false) {
        throw new AppError(httpStatus.BAD_REQUEST, "Cannot assign an inactive quote");
    }

    // Verify target recipients exist
    if (assignmentType === "tag") {
        const validTags = await Tag.find({ _id: { $in: targetIds } }, "_id");
        const validTagIds = new Set(validTags.map((t) => t._id.toString()));
        const missing = targetIds.filter((id) => !validTagIds.has(id.toString()));
        if (missing.length > 0) {
            throw new AppError(httpStatus.NOT_FOUND, `Some tags were not found`);
        }
    } else if (assignmentType === "user") {
        const validUsers = await User.find({ _id: { $in: targetIds } }, "_id");
        const validUserIds = new Set(validUsers.map((u) => u._id.toString()));
        const missing = targetIds.filter((id) => !validUserIds.has(id.toString()));
        if (missing.length > 0) {
            throw new AppError(httpStatus.NOT_FOUND, `Some users were not found`);
        }
    }

    // Find already existing assignments for this quote and target set
    const existingAssignments = await quoteAssignmentRepository.findExistingAssignments(
        quoteId,
        assignmentType,
        targetIds
    );
    const alreadyAssignedTargetIds = new Set();

    existingAssignments.forEach((a) => {
        if (assignmentType === "tag" && a.tag) {
            alreadyAssignedTargetIds.add(a.tag.toString());
        } else if (assignmentType === "user" && a.user) {
            alreadyAssignedTargetIds.add(a.user.toString());
        }
    });

    const newTargetIds = targetIds.filter(
        (id) => !alreadyAssignedTargetIds.has(id.toString())
    );

    const newDocs = newTargetIds.map((id) => ({
        quote: quoteId,
        tag: assignmentType === "tag" ? id : null,
        user: assignmentType === "user" ? id : null,
        assignmentType,
        priority,
        isActive,
        startAt,
        endAt,
    }));

    const created = await quoteAssignmentRepository.bulkCreateAssignments(newDocs);

    return {
        summary: {
            total: targetIds.length,
            newlyAssigned: created.length,
            alreadyAssigned: alreadyAssignedTargetIds.size,
            failed: 0,
        },
        data: created,
    };
};

/**
 * Bulk delete assignments
 */
const bulkDelete = async (ids) => {
    return quoteAssignmentRepository.bulkDeleteAssignments(ids);
};

/**
 * Get all assignments
 */
const getAllAssignments = async ({ page, limit, quote, tag, user, assignmentType, isActive }) => {
    return quoteAssignmentRepository.getAllAssignments({
        page,
        limit,
        quote,
        tag,
        user,
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
    bulkAssign,
    bulkDelete,
    getAllAssignments,
    getAssignmentById,
    updateAssignment,
    deleteAssignment,
    getTopAssignmentByTag,
    getTopAssignmentByUser,
    getAssignmentsByTag,
};