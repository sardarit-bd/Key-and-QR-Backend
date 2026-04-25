import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import tagRepository from "./tag.repository.js";

const createTag = async (payload) => {
  const existing = await tagRepository.findByTagCode(payload.tagCode);

  if (existing) {
    throw new AppError(httpStatus.CONFLICT, "Tag code already exists");
  }

  return tagRepository.createTag(payload);
};

const getAllTags = async (query) => {
  return tagRepository.getAllTags(query);
};

const getTagByCode = async (tagCode) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  return tag;
};

const updateTag = async (id, payload) => {
  const tag = await tagRepository.findById(id);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  return tagRepository.updateTag(id, payload);
};

const activateTag = async (tagCode, userId) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  if (!tag.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, "Tag is disabled");
  }

  if (tag.isActivated) {
    throw new AppError(httpStatus.CONFLICT, "Tag already activated");
  }

  return tagRepository.updateTag(tag._id, {
    owner: userId,
    isActivated: true,
    activatedAt: new Date(),
  });
};

const getUnusedTag = async () => {
  const tag = await tagRepository.findUnusedTagStrict();

  if (!tag) {
    return null;
  }

  return tag;
};

// Set personal message
const setPersonalMessage = async (tagCode, userId, message) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  // Check if user owns the tag
  if (!tag.owner || tag.owner.toString() !== userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You don't own this tag");
  }

  // Validate message length
  if (message && message.length > 500) {
    throw new AppError(httpStatus.BAD_REQUEST, "Personal message cannot exceed 500 characters");
  }

  const updated = await tagRepository.updateTag(tag._id, {
    personalMessage: message || null,
  });

  return {
    personalMessage: updated.personalMessage,
    tagCode: updated.tagCode,
  };
};

// Get personal message
const getPersonalMessage = async (tagCode) => {
  const tag = await tagRepository.findByTagCode(tagCode);

  if (!tag) {
    throw new AppError(httpStatus.NOT_FOUND, "Tag not found");
  }

  return {
    hasPersonalMessage: !!tag.personalMessage,
    personalMessage: tag.personalMessage,
    tagCode: tag.tagCode,
  };
};

const getMyTags = async (userId) => {
  return tagRepository.findTagsByOwner(userId);
};

export default {
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  activateTag,
  getUnusedTag,
  setPersonalMessage,
  getPersonalMessage,
  getMyTags,
};