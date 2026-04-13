import mongoose from "mongoose";
import User from "../../models/user.model.js";

const createAdmin = async (payload) => {
    return User.create(payload);
};

const getAllUsers = async () => {
    return User.find({ isDeleted: false });
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

export default {
    createAdmin,
    getAllUsers,
    getUserById,
    updateUserRole,
    updateAdminProfile,
    deleteUser,
};