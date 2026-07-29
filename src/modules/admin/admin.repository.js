import mongoose from "mongoose";
import User from "../../models/user.model.js";

const createAdmin = async (payload) => {
    return User.create(payload);
};

const getAllUsers = async ({ search, role, status, sort, page, limit } = {}) => {
    const filter = { isDeleted: false };

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
        ];
    }

    if (role && role !== "all") {
        filter.role = role;
    }

    if (status && status !== "all") {
        if (status === "active") {
            filter.isSuspended = false;
        } else if (status === "suspended") {
            filter.isSuspended = true;
        }
    }

    const sortOption = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [data, total] = await Promise.all([
        User.find(filter)
            .select("-password -passwordResetToken -passwordResetExpires -refreshToken")
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit)),
        User.countDocuments(filter),
    ]);

    return {
        users: data,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalItems: total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

const getUsersStats = async () => {
    const [totalUsers, activeUsers, suspendedUsers, adminCount, moderatorCount] = await Promise.all([
        User.countDocuments({ isDeleted: false }),
        User.countDocuments({ isDeleted: false, isSuspended: false }),
        User.countDocuments({ isDeleted: false, isSuspended: true }),
        User.countDocuments({ role: "admin", isDeleted: false }),
        User.countDocuments({ role: "moderator", isDeleted: false }),
    ]);

    return {
        totalUsers,
        activeUsers,
        suspendedUsers,
        adminCount,
        moderatorCount,
    };
};

const getUserById = async (id) => {
    try {
        const userId = id?.toString();
        if (!mongoose.Types.ObjectId.isValid(userId)) return null;
        return await User.findById(userId);
    } catch (error) {
        return null;
    }
};

const updateUserRole = async (id, role) => {
    return User.findByIdAndUpdate(id, { role }, { new: true });
};

const updateAdminProfile = async (id, payload) => {
    return User.findByIdAndUpdate(id, payload, { returnDocument: 'after' });
};

const deleteUser = async (id) => {
    return User.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
};

const suspendUser = async (id) => {
    return User.findByIdAndUpdate(id, { isSuspended: true }, { new: true }).select("-password -passwordResetToken -passwordResetExpires -refreshToken");
};

const activateUser = async (id) => {
    return User.findByIdAndUpdate(id, { isSuspended: false, isDeleted: false }, { new: true }).select("-password -passwordResetToken -passwordResetExpires -refreshToken");
};

const updateUser = async (id, updates) => {
    return User.findByIdAndUpdate(id, updates, { new: true }).select("-password -passwordResetToken -passwordResetExpires -refreshToken");
};

export default {
    createAdmin,
    getAllUsers,
    getUsersStats,
    getUserById,
    updateUserRole,
    updateAdminProfile,
    deleteUser,
    suspendUser,
    activateUser,
    updateUser,
};