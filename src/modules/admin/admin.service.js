import mongoose from "mongoose";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import adminRepository from "./admin.repository.js";
import bcrypt from "bcryptjs";
import roles from "../../constants/roles.js";
import env from "../../config/env.js";
import { deleteCloudinaryImage, uploadImageBuffer } from "../../utils/cloudinary.util.js";

const createAdmin = async (payload) => {
    const hashedPassword = await bcrypt.hash(payload.password, env.bcryptSaltRounds);
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
    if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");
    return user;
};

const updateUserRole = async (id, role) => {
    const user = await adminRepository.updateUserRole(id, role);
    if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");
    return user;
};

const updateAdminProfile = async (userId, payload, image) => {
    if (!userId) throw new AppError(httpStatus.BAD_REQUEST, "User ID is required");
    if (!mongoose.Types.ObjectId.isValid(userId)) throw new AppError(httpStatus.BAD_REQUEST, "Invalid user ID format");

    const user = await adminRepository.getUserById(userId);
    if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

    let profileImage = user.profileImage;

    if (image) {
        const uploaded = await uploadImageBuffer(image.buffer);
        if (user.profileImage?.public_id) {
            try { await deleteCloudinaryImage(user.profileImage.public_id); } catch (error) { }
        }
        profileImage = { public_id: uploaded.public_id, url: uploaded.secure_url };
    }

    if (payload.password) {
        payload.password = await bcrypt.hash(payload.password, env.bcryptSaltRounds);
    }

    const updateData = {
        ...(payload.name && { name: payload.name }),
        ...(payload.email && { email: payload.email }),
        ...(payload.password && { password: payload.password }),
        ...(payload.role && { role: payload.role }),
        profileImage,
    };

    const updatedUser = await adminRepository.updateAdminProfile(userId, updateData);
    if (!updatedUser) throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to update profile");

    const userToReturn = updatedUser.toObject();
    delete userToReturn.password;
    delete userToReturn.passwordResetToken;
    delete userToReturn.passwordResetExpires;

    return userToReturn;
};

const deleteUser = async (id) => {
    const user = await adminRepository.deleteUser(id);
    if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");
    return user;
};

export default {
    createAdmin,
    getAllUsers,
    getUserById,
    updateUserRole,
    updateAdminProfile,
    deleteUser,
};