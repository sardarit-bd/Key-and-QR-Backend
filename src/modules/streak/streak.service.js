import mongoose from "mongoose";
import httpStatus from "../../constants/httpStatus.js";
import AppError from "../../utils/AppError.js";
import Streak from "./streak.model.js";
import { getDayKey } from "../../utils/dateUtils.js";

const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
};

const getStreak = async (userId) => {
  return Streak.findOne({ user: userId });
};

// Returns the last 7 day keys (oldest → newest), ending today.
const getWeekKeys = (todayKey) => {
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(addDays(todayKey, -i));
  }
  return keys;
};

// Should the streak count a receive today?
// - No record yet → yes (first quote ever).
// - Already counted today → no (multiple same-day quotes count once).
// - lastReceivedDate is yesterday → yes (consecutive day).
// - lastReceivedDate is older → the streak is stale → reset + count.
const shouldIncreaseToday = (streak, todayKey) => {
  if (!streak || !streak.lastReceivedDate) return true;

  if (streak.lastReceivedDate === todayKey) return false;

  const yesterday = addDays(todayKey, -1);
  if (streak.lastReceivedDate === yesterday) return true;

  return true; // gap → reset then count
};

// If the streak is stale (no receive yesterday or today), reset current to 0.
const resetIfNeeded = (streak, todayKey) => {
  if (!streak || !streak.lastReceivedDate) return;

  const yesterday = addDays(todayKey, -1);
  if (
    streak.lastReceivedDate !== todayKey &&
    streak.lastReceivedDate !== yesterday
  ) {
    streak.current = 0;
  }
};

/**
 * Increment the streak because a NEW quote was successfully received.
 * Called by the Quote Receive Engine AFTER the ReceivedQuote is persisted.
 * Idempotent per day: a second quote on the same day does NOT re-increment.
 */
const updateStreakAfterReceive = async (userId, receivedAt = new Date(), tz = null) => {
  const todayKey = getDayKey(tz, receivedAt);
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const streak =
        (await Streak.findOne({ user: userId }).session(session)) ||
        new Streak({ user: userId });

      resetIfNeeded(streak, todayKey);

      const shouldIncrease = shouldIncreaseToday(streak, todayKey);

      if (shouldIncrease) {
        streak.current += 1;
        streak.longest = Math.max(streak.longest, streak.current);
        streak.lastReceivedDate = todayKey;
        streak.lastResetDate = todayKey;
      }

      // Maintain the 7-day rolling window
      const weekKeys = getWeekKeys(todayKey);
      const activeDates = new Set(
        streak.weekActivity.filter((w) => w.active).map((w) => w.date)
      );
      if (shouldIncrease) activeDates.add(todayKey);
      streak.weekActivity = weekKeys.map((key) => ({
        date: key,
        active: activeDates.has(key),
      }));

      await streak.save({ session });
      result = streak.toObject();
    });

    return result;
  } finally {
    await session.endSession();
  }
};

// Recompute current streak from the ReceivedQuote history (source of truth).
// Used only when a streak record is missing (e.g. legacy users).
const computeStreakFromHistory = async (userId, history, tz = null) => {
  const dates = [
    ...new Set(
      history.map((r) => getDayKey(tz, new Date(r.receivedAt)))
    ),
  ].sort();

  if (dates.length === 0) {
    return { current: 0, longest: 0, lastReceivedDate: null, weekActivity: [] };
  }

  const todayKey = getDayKey(tz);
  const yesterday = addDays(todayKey, -1);

  let current = 0;
  if (dates[dates.length - 1] === todayKey || dates[dates.length - 1] === yesterday) {
    current = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      if (addDays(dates[i + 1], -1) === dates[i]) {
        current++;
      } else {
        break;
      }
    }
  }

  let longest = 0;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    if (addDays(dates[i - 1], 1) === dates[i]) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  const weekKeys = getWeekKeys(todayKey);
  const dateSet = new Set(dates);
  const weekActivity = weekKeys.map((key) => ({
    date: key,
    active: dateSet.has(key),
  }));

  return {
    current,
    longest,
    lastReceivedDate: dates[dates.length - 1],
    weekActivity,
  };
};

/**
 * Get the current streak state for a user.
 * Prefers the stored Streak doc; if absent, derives from ReceivedQuote history
 * (the single source of truth) and persists it.
 */
const getCurrentStreak = async (userId, history = [], tz = null) => {
  let streak = await getStreak(userId);
  const todayKey = getDayKey(tz);

  if (!streak) {
    const computed = await computeStreakFromHistory(userId, history, tz);
    streak = await Streak.create({
      user: userId,
      ...computed,
      lastResetDate: todayKey,
    });
  } else {
    resetIfNeeded(streak, todayKey);
    if (streak.isModified() || streak.isNew) await streak.save();
  }

  return streak;
};

const getLongestStreak = async (userId) => {
  const streak = await getStreak(userId);
  return streak?.longest || 0;
};

const getStreakForDashboard = async (userId, history = [], tz = null) => {
  const streak = await getCurrentStreak(userId, history, tz);
  const todayKey = getDayKey(tz);

  return {
    current: streak.current || 0,
    longest: streak.longest || 0,
    lastReceivedDate: streak.lastReceivedDate || null,
    todayCounted: streak.lastReceivedDate === todayKey,
    weekActivity: streak.weekActivity || [],
  };
};

export default {
  updateStreakAfterReceive,
  getCurrentStreak,
  getLongestStreak,
  getStreakForDashboard,
  shouldIncreaseToday,
  resetIfNeeded,
  getStreak,
};
