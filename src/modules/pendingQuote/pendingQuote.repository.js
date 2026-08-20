import PendingQuote from "../../models/pendingQuote.model.js";


const createPendingQuote = (payload) => {
  return PendingQuote.create(payload);
};

const getPendingQuotes = async (page = 1, limit = 10, search = "", status = "") => {
  const skip = (page - 1) * limit;

  const filter = {};

  if (status && status !== "all") {
    filter.status = status;
  } else if (!status || status === "all") {
    // no filter — return all statuses
  } else {
    filter.status = "pending";
  }

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

const getMyQuotes = async (userId, page = 1, limit = 50, search = "", category = "all", status = "all", sortBy = "newest") => {
  const skip = (page - 1) * limit;

  const filter = { user: userId };

  if (status && status !== "all") {
    filter.status = status;
  }

  if (category && category !== "all") {
    filter.category = category;
  }

  if (search) {
    filter.$or = [
      { text: { $regex: search, $options: "i" } },
      { author: { $regex: search, $options: "i" } },
    ];
  }

  const sort = { createdAt: sortBy === "oldest" ? 1 : -1 };

  const [data, total] = await Promise.all([
    PendingQuote.find(filter)
      .sort(sort)
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

const countPendingQuotes = async () => {
  return PendingQuote.countDocuments({ status: "pending" });
};

/**
 * Get the most recent successful community submission for a user.
 * Used as the cooldown anchor. Only "community" submissions count
 * (gift-message submissions attached to orders are a separate flow).
 */
const getLatestCommunitySubmission = async (userId) => {
  return PendingQuote.findOne({ user: userId, type: "community" })
    .sort({ submittedAt: -1 })
    .select("submittedAt createdAt status text");
};


export default {
  createPendingQuote,
  getPendingQuotes,
  getPendingQuoteById,
  approveQuote,
  rejectQuote,
  deletePendingQuote,
  getMyQuotes,
  countPendingQuotes,
  getLatestCommunitySubmission,
};