/**
 * Date Utilities for Timezone-Aware Day Boundaries
 * 
 * Provides consistent 'YYYY-MM-DD' calendar day resolution respecting
 * the client's local timezone (via IANA timezone name or UTC offset),
 * preventing day boundary drift caused by strict UTC toISOString().
 */

/**
 * Resolves the calendar day key 'YYYY-MM-DD' for a given timezone, offset, or request,
 * falling back to UTC if no valid timezone is specified.
 * 
 * @param {string|number|object|null} [tz] - IANA timezone (e.g. 'America/New_York'),
 *                                           offset in minutes (number or numeric string),
 *                                           or an Express request object with headers
 * @param {Date} [baseDate=new Date()] - Date to format
 * @returns {string} Date key in 'YYYY-MM-DD' format
 */
export const getDayKey = (tz = null, baseDate = new Date()) => {
  if (tz instanceof Date) {
    baseDate = tz;
    tz = null;
  }
  let timeZone = null;
  let offsetMinutes = null;

  if (tz && typeof tz === "object") {
    if (tz.headers) {
      timeZone = tz.headers["x-timezone"] || tz.headers["x-client-timezone"] || null;
      if (tz.headers["x-timezone-offset"] !== undefined && tz.headers["x-timezone-offset"] !== "") {
        offsetMinutes = Number(tz.headers["x-timezone-offset"]);
      }
    } else if (tz.timeZone || tz.timezone) {
      timeZone = tz.timeZone || tz.timezone;
    } else if (tz.offsetMinutes !== undefined) {
      offsetMinutes = Number(tz.offsetMinutes);
    }
  } else if (typeof tz === "string") {
    const trimmed = tz.trim();
    if (/^[+-]?\d+$/.test(trimmed)) {
      offsetMinutes = Number(trimmed);
    } else if (trimmed) {
      timeZone = trimmed;
    }
  } else if (typeof tz === "number" && !isNaN(tz)) {
    offsetMinutes = tz;
  }

  // 1. Try IANA timezone with Intl.DateTimeFormat (en-CA standard outputs YYYY-MM-DD)
  if (timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(baseDate);
    } catch (e) {
      // Invalid timezone name, fall through
    }
  }

  // 2. Try timezone offset (in minutes, JS getTimezoneOffset(): UTC - local)
  if (offsetMinutes !== null && !isNaN(offsetMinutes)) {
    try {
      const localTimeMs = baseDate.getTime() - (offsetMinutes * 60 * 1000);
      return new Date(localTimeMs).toISOString().split("T")[0];
    } catch (e) {
      // fall through
    }
  }

  // 3. Fallback: UTC date
  return baseDate.toISOString().split("T")[0];
};

/**
 * Calculates the next daily quota reset timestamp (local midnight).
 * 
 * @param {string|number|object|null} [tz] - Timezone/offset/req object
 * @param {Date} [baseDate=new Date()] - Current date
 * @returns {string} ISO timestamp of the next midnight reset
 */
export const getNextAvailableAt = (tz = null, baseDate = new Date()) => {
  if (tz instanceof Date) {
    baseDate = tz;
    tz = null;
  }
  let offsetMinutes = null;

  if (tz && typeof tz === "object") {
    if (tz.headers && tz.headers["x-timezone-offset"] !== undefined && tz.headers["x-timezone-offset"] !== "") {
      offsetMinutes = Number(tz.headers["x-timezone-offset"]);
    } else if (tz.offsetMinutes !== undefined) {
      offsetMinutes = Number(tz.offsetMinutes);
    }
  } else if (typeof tz === "number" && !isNaN(tz)) {
    offsetMinutes = tz;
  } else if (typeof tz === "string" && /^[+-]?\d+$/.test(tz.trim())) {
    offsetMinutes = Number(tz.trim());
  }

  if (offsetMinutes !== null && !isNaN(offsetMinutes)) {
    try {
      // Shift baseDate to local time
      const localNow = new Date(baseDate.getTime() - (offsetMinutes * 60 * 1000));
      // Advance to next local midnight
      const nextLocalMidnight = new Date(localNow);
      nextLocalMidnight.setUTCHours(24, 0, 0, 0);
      // Shift back to UTC timestamp
      const nextUtcMs = nextLocalMidnight.getTime() + (offsetMinutes * 60 * 1000);
      return new Date(nextUtcMs).toISOString();
    } catch (e) {
      // Fall through to UTC
    }
  }

  // Fallback: next UTC midnight
  const next = new Date(baseDate);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
};

export default {
  getDayKey,
  getNextAvailableAt,
};
