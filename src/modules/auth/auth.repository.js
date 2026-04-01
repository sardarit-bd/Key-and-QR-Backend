import User from "../../models/user.model.js";

const findUserByEmail = async (email, includePassword = false) => {
  if (includePassword) {
    return User.findOne({ email, isDeleted: false }).select("+password");
  }
  return User.findOne({ email, isDeleted: false });
};

const findUserById = async (id) => {
  return User.findOne({ _id: id, isDeleted: false });
};

const findUserByIdWithPassword = async (id) => {
  return User.findOne({ _id: id, isDeleted: false }).select("+password");
};

const findUserByGoogleId = async (googleId) => {
  return User.findOne({ googleId, isDeleted: false });
};

const findUserByAppleId = async (appleId) => {
  return User.findOne({ appleId, isDeleted: false });
};

const createUser = async (payload) => {
  return User.create(payload);
};

const savePasswordResetToken = async (userId, passwordResetToken, passwordResetExpires) => {
  return User.findByIdAndUpdate(
    userId,
    {
      passwordResetToken,
      passwordResetExpires,
    },
    { new: true }
  );
};

const findUserByResetToken = async (passwordResetToken) => {
  return User.findOne({
    passwordResetToken,
    passwordResetExpires: { $gt: new Date() },
    isDeleted: false,
  }).select("+passwordResetToken +passwordResetExpires");
};

const updatePassword = async (userId, password) => {
  return User.findByIdAndUpdate(
    userId,
    {
      password,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
    { new: true }
  );
};

const updateUser = async (userId, updateData) => {
  return User.findByIdAndUpdate(userId, updateData, { new: true });
};

export default {
  findUserByEmail,
  findUserById,
  findUserByIdWithPassword,
  findUserByGoogleId,
  findUserByAppleId,
  createUser,
  savePasswordResetToken,
  findUserByResetToken,
  updatePassword,
  updateUser,
};