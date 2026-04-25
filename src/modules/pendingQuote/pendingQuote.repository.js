import PendingQuote from "../../models/pendingQuote.model.js";


const createPendingQuote = (payload) => {
  return PendingQuote.create(payload);
};

const getPendingQuotes = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;

  const filter = { status: "pending" };

  if (search) {
    filter.$or = [
      { text: { $regex: search, $options: "i" } },
      { "user.name": { $regex: search, $options: "i" } },
      { "user.email": { $regex: search, $options: "i" } },
    ];
  }

  const [data, total] = await Promise.all([
    PendingQuote.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PendingQuote.countDocuments(filter)
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

const getPendingQuoteById = (id) => {
  return PendingQuote.findById(id).populate("user", "name email");
};

const approveQuote = async (id, adminNote = null) => {
  const updated = await PendingQuote.findByIdAndUpdate(
    id,
    {
      status: "approved",
      approvedAt: new Date(),
      adminNote: adminNote,
    },
    { new: true }
  );
  return updated;
};

const rejectQuote = async (id, adminNote = null) => {
  const updated = await PendingQuote.findByIdAndUpdate(
    id,
    {
      status: "rejected",
      rejectedAt: new Date(),
      adminNote: adminNote,
    },
    { new: true }
  );
  return updated;
};

const deletePendingQuote = (id) => {
  return PendingQuote.findByIdAndDelete(id);
};

const getMyQuotes = async (userId, page = 1, limit = 50) => {
  const skip = (page - 1) * limit;

  const filter = { user: userId };

  const [data, total] = await Promise.all([
    PendingQuote.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PendingQuote.countDocuments(filter)
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


export default {
  createPendingQuote,
  getPendingQuotes,
  getPendingQuoteById,
  approveQuote,
  rejectQuote,
  deletePendingQuote,
  getMyQuotes,
};