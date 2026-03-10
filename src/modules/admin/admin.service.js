import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import adminRepository from "./admin.repository.js";
import bcrypt from "bcryptjs";
import roles from "../../constants/roles.js";
import env from "../../config/env.js";

const createAdmin = async (payload) => {
    const hashedPassword = await bcrypt.hash(
        payload.password,
        env.bcryptSaltRounds
    );

    return adminRepository.createAdmin({
        ...payload,
        password: hashedPassword,
        role: roles.ADMIN,
    });
};

const getAllUsers = async () => {
    return adminRepository.getAllUsers();
};

const getUserById = async (id) => {
    const user = await adminRepository.getUserById(id);

    if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    return user;
};

const updateUserRole = async (id, role) => {
    const user = await adminRepository.updateUserRole(id, role);

    if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    return user;
};

const deleteUser = async (id) => {
    const user = await adminRepository.deleteUser(id);

    if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
    }

    return user;
};

export default {
    createAdmin,
    getAllUsers,
    getUserById,
    updateUserRole,
    deleteUser,
};