import mongoose from "mongoose";

const streakSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    current: {
      type: Number,
      default: 0,
      min: 0,
    },

    longest: {
      type: Number,
      default: 0,
      min: 0,
    },

    // UTC day key (YYYY-MM-DD) of the last day the streak counted a receive.
    lastReceivedDate: {
      type: String,
      default: null,
    },

    // UTC day key of the last time streak was evaluated/reset.
    lastResetDate: {
      type: String,
      default: null,
    },

    // Rolling 7-day activity map (keys = weekday labels, e.g. "2026-08-02").
    // Clean backend data — frontend renders the weekly indicator from this.
    weekActivity: {
      type: [
        {
          date: { type: String, required: true },
          active: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Streak = mongoose.model("Streak", streakSchema);
export default Streak;
