import User from "../../models/user.model.js";


const createAdmin = async (payload) => {
    return User.create(payload);
};

const getAllUsers = async () => {
    return User.find({ isDeleted: false });
};

const getUserById = async (id) => {
    return User.findById(id);
};

const updateUserRole = async (id, role) => {
    return User.findByIdAndUpdate(
        id,
        { role },
        { new: true }
    );
};

const deleteUser = async (id) => {
    return User.findByIdAndUpdate(
        id,
        { isDeleted: true },
        { new: true }
    );
};

export default {
    createAdmin,
    getAllUsers,
    getUserById,
    updateUserRole,
    deleteUser,
};