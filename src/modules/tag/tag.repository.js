import Tag from "./tag.model.js";

const createTag = (payload) => {
  return Tag.create(payload);
};

const findByTagCode = (tagCode) => {
  return Tag.findOne({ tagCode });
};

const getAllTags = () => {
  return Tag.find().populate("owner", "name email");
};

const findById = (id) => {
  return Tag.findById(id);
};

const updateTag = (id, payload) => {
  return Tag.findByIdAndUpdate(id, payload, { new: true });
};

export default {
  createTag,
  findByTagCode,
  getAllTags,
  findById,
  updateTag,
};