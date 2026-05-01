const dayjs = require("dayjs");
const db = require("../db");

const WINDOW_DAYS = 365;

async function getWindow(userId) {
  const first = await db.get(
    `SELECT date
     FROM sessions
     WHERE user_id = ?
     ORDER BY date ASC
     LIMIT 1`,
    [userId]
  );

  if (!first || !first.date) {
    return null;
  }

  const start = dayjs(first.date);
  const end = start.add(WINDOW_DAYS - 1, "day");

  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD")
  };
}

async function validateDateInWindow(userId, dateText) {
  const day = dayjs(dateText, "YYYY-MM-DD", true);
  if (!day.isValid()) {
    return { ok: false, message: "Invalid date format (YYYY-MM-DD required)" };
  }

  if (day.isAfter(dayjs(), "day")) {
    return { ok: false, message: "Date cannot be in the future" };
  }

  const window = await getWindow(userId);
  if (!window) {
    return { ok: true };
  }

  if (day.isBefore(dayjs(window.start), "day") || day.isAfter(dayjs(window.end), "day")) {
    return {
      ok: false,
      message: `Only 365-day tracking is allowed (${window.start} to ${window.end})`
    };
  }

  return { ok: true };
}

module.exports = {
  WINDOW_DAYS,
  getWindow,
  validateDateInWindow
};
