const db = require("../db");

const WINDOW_DAYS = 365;

function parseDateOnly(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ""));
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

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

  const start = parseDateOnly(first.date);
  if (!start) {
    return null;
  }

  const end = addUtcDays(start, WINDOW_DAYS - 1);

  return {
    start: formatUtcDate(start),
    end: formatUtcDate(end)
  };
}

async function validateDateInWindow(userId, dateText, options = {}) {
  const allowFuture = Boolean(options.allowFuture);
  const day = parseDateOnly(dateText);
  if (!day) {
    return { ok: false, message: "Invalid date format (YYYY-MM-DD required)" };
  }

  const todayUtc = new Date();
  const currentUtcDay = new Date(
    Date.UTC(
      todayUtc.getUTCFullYear(),
      todayUtc.getUTCMonth(),
      todayUtc.getUTCDate()
    )
  );
  const maxAllowedDate = addUtcDays(currentUtcDay, 1);

  if (!allowFuture && day.getTime() > maxAllowedDate.getTime()) {
    return { ok: false, message: "Date cannot be in the future" };
  }

  const window = await getWindow(userId);
  if (!window) {
    return { ok: true };
  }

  if (dateText < window.start || dateText > window.end) {
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
