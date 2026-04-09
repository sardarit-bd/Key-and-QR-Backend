import Tag from "./tag.model.js";

const createTag = (payload) => {
  return Tag.create(payload);
};

const findByTagCode = (tagCode) => {
  return Tag.findOne({ tagCode });
};

const getAllTags = async (query = {}) => {
  const { page = 1, limit = 10, search, isActivated, isActive, unused } = query;

  const filter = {};

  if (search) {
    filter.tagCode = { $regex: search, $options: "i" };
  }

  if (isActivated !== undefined) {
    filter.isActivated = isActivated === "true";
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  if (unused === "true") {
    filter.owner = null;
    filter.isActive = true;
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Tag.find(filter)
      .populate("owner", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Tag.countDocuments(filter)
  ]);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPage: Math.ceil(total / limit)
    },
    data
  };
};

const findById = (id) => {
  return Tag.findById(id);
};

const updateTag = (id, payload) => {
  return Tag.findByIdAndUpdate(id, payload, { new: true });
};

const findUnusedTag = async () => {
  return Tag.findOne({
    owner: null,
    isActive: true,
  }).sort({ createdAt: 1 });
};

const findUnusedTagStrict = async () => {
  return Tag.findOne({
    isActivated: false,
    owner: null,
    isActive: true,
  }).sort({ createdAt: 1 });
};

const resetTag = async (tagId) => {
  return Tag.findByIdAndUpdate(
    tagId,
    {
      owner: null,
      isActivated: false,
      activatedAt: null,
      personalMessage: null,
    },
    { new: true }
  );
};


const removeOwner = async (tagId) => {
  return Tag.findByIdAndUpdate(
    tagId,
    {
      owner: null,
      isActivated: false,
      activatedAt: null,
    },
    { new: true }
  );
};

const updatePersonalMessage = async (tagCode, message) => {
  return Tag.findOneAndUpdate(
    { tagCode },
    { personalMessage: message },
    { new: true }
  );
};

const findByTagCodeWithOwner = async (tagCode) => {
  return Tag.findOne({ tagCode }).populate("owner", "name email");
};

const findTagsByOwner = async (ownerId) => {
  return Tag.find({ owner: ownerId })
    .populate("owner", "name email")
    .sort({ createdAt: -1 });
};

const isTagFree = async (tagId) => {
  const tag = await findById(tagId);
  return tag && tag.owner === null && tag.isActive === true;
};

const findMultipleUnusedTags = async (limit = 10) => {
  return Tag.find({
    owner: null,
    isActive: true,
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

export default {
  createTag,
  findByTagCode,
  getAllTags,
  findById,
  updateTag,
  findUnusedTag,
  findUnusedTagStrict,
  resetTag,
  removeOwner,
  updatePersonalMessage,
  findByTagCodeWithOwner,
  findTagsByOwner,
  isTagFree,
  findMultipleUnusedTags,
};