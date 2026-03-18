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

const getAllTags = async () => {
  return tagRepository.getAllTags();
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

export default {
  createTag,
  getAllTags,
  getTagByCode,
  updateTag,
  activateTag,
};
