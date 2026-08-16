import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import quoteAssignmentRepository from "./quoteAssignment.repository.js";
import QuoteAssignment from "./quoteAssignment.model.js";
import quoteRepository from "../quote/quote.repository.js";
import tagRepository from "../tag/tag.repository.js";
import scanRepository from "../scan/scan.repository.js";
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

    // Check for existing duplicate assignment
    const existing = await QuoteAssignment.findOne({
        quote: payload.quote,
        tag: payload.tag || null,
        user: payload.user || null,
        assignmentType: payload.assignmentType,
    });

    if (existing) {
        throw new AppError(
            httpStatus.CONFLICT,
            "This quote assignment already exists"
        );
    }

    try {
        const result = await quoteAssignmentRepository.createAssignment(payload);
        if (payload.tag) {
            await scanRepository.invalidatePublicDailyScan(payload.tag);
        } else if (payload.user) {
            const userTags = await Tag.find({ owner: payload.user }, "_id");
            if (userTags.length > 0) {
                await scanRepository.invalidatePublicDailyScan(userTags.map((t) => t._id));
            }
        }
        return result;
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

    if (assignmentType === "tag" && newTargetIds.length > 0) {
        await scanRepository.invalidatePublicDailyScan(newTargetIds);
    } else if (assignmentType === "user" && newTargetIds.length > 0) {
        const userTags = await Tag.find({ owner: { $in: newTargetIds } }, "_id");
        if (userTags.length > 0) {
            await scanRepository.invalidatePublicDailyScan(userTags.map((t) => t._id));
        }
    }

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
    // Find assignments to get affected tag IDs and user IDs before deleting
    const existing = await QuoteAssignment.find({ _id: { $in: ids } }, "tag user assignmentType");
    const tagIds = existing.map((a) => a.tag).filter(Boolean);
    const userIds = existing.map((a) => a.user).filter(Boolean);

    const result = await quoteAssignmentRepository.bulkDeleteAssignments(ids);

    if (tagIds.length > 0) {
        await scanRepository.invalidatePublicDailyScan(tagIds);
    }
    if (userIds.length > 0) {
        const userTags = await Tag.find({ owner: { $in: userIds } }, "_id");
        if (userTags.length > 0) {
            await scanRepository.invalidatePublicDailyScan(userTags.map((t) => t._id));
        }
    }

    return result;
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

        const affectedTagId = updated.tag?._id || updated.tag;
        const affectedUserId = updated.user?._id || updated.user;
        if (affectedTagId) {
            await scanRepository.invalidatePublicDailyScan(affectedTagId);
        }
        if (affectedUserId) {
            const userTags = await Tag.find({ owner: affectedUserId }, "_id");
            if (userTags.length > 0) {
                await scanRepository.invalidatePublicDailyScan(userTags.map((t) => t._id));
            }
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

    const tagId = assignment.tag?._id || assignment.tag;
    const userId = assignment.user?._id || assignment.user;
    const result = await quoteAssignmentRepository.deleteAssignment(id);

    if (tagId) {
        await scanRepository.invalidatePublicDailyScan(tagId);
    }
    if (userId) {
        const userTags = await Tag.find({ owner: userId }, "_id");
        if (userTags.length > 0) {
            await scanRepository.invalidatePublicDailyScan(userTags.map((t) => t._id));
        }
    }

    return result;
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