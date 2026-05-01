const express = require("express");
const { z } = require("zod");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const { computeSessionMetrics, round2 } = require("../utils/calc");
const { getUserSettings } = require("../services/statsService");
const { validateDateInWindow } = require("../utils/trackingWindow");

const router = express.Router();

const createSessionSchema = z.object({
  date: z.string().min(10).max(10),
  startBalance: z.number().min(0),
  profitLoss: z.number(),
  notes: z.string().max(1000).optional().default(""),
  hoursPlayed: z.number().min(0).max(24).optional().default(0),
  handsPlayed: z.number().int().min(0).optional()
});

router.use(authMiddleware);

router.get("/", async (req, res) => {
  const { type, startDate, endDate } = req.query;

  const filters = ["user_id = ?"];
  const params = [req.user.id];

  if (startDate) {
    filters.push("date >= ?");
    params.push(startDate);
  }

  if (endDate) {
    filters.push("date <= ?");
    params.push(endDate);
  }

  if (type === "profit") {
    filters.push("profit_loss > 0");
  }

  if (type === "loss") {
    filters.push("profit_loss < 0");
  }

  if (type === "withdraw") {
    filters.push("withdrawal > 0");
  }

  const query = `
    SELECT id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played, created_at
    FROM sessions
    WHERE ${filters.join(" AND ")}
    ORDER BY date DESC
  `;

  const rows = await db.all(query, params);
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid session payload" });
  }

  const settings = await getUserSettings(req.user.id);
  if (!settings) {
    return res.status(404).json({ message: "Settings not found" });
  }

  const payload = parsed.data;
  const allowedDate = await validateDateInWindow(req.user.id, payload.date);
  if (!allowedDate.ok) {
    return res.status(400).json({ message: allowedDate.message });
  }

  const metrics = computeSessionMetrics({
    startBalance: payload.startBalance,
    profitLoss: payload.profitLoss,
    withdrawalPercent: settings.withdrawal_percent,
    stopLossPercent: settings.stop_loss_percent,
    profitTargetPercent: settings.profit_target_percent
  });

  if (metrics.endBalance < 0) {
    return res.status(400).json({ message: "End balance cannot be negative" });
  }

  try {
    const result = await db.run(
      `INSERT INTO sessions
       (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        payload.date,
        round2(payload.startBalance),
        round2(payload.profitLoss),
        metrics.suggestedWithdrawal,
        metrics.endBalance,
        payload.notes || "",
        payload.hoursPlayed || 0,
        payload.handsPlayed ?? null
      ]
    );

    return res.status(201).json({
      id: result.lastInsertRowid,
      ...payload,
      withdrawal: metrics.suggestedWithdrawal,
      endBalance: metrics.endBalance,
      unitSize: metrics.unitSize,
      nextDayStopLoss: metrics.nextDayStopLoss,
      nextDayProfitTarget: metrics.nextDayProfitTarget
    });
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "A session entry for this date already exists" });
    }

    return res.status(500).json({ message: "Unable to save session" });
  }
});

function addDays(dateText, days) {
  // Handle Date objects from Postgres by converting to YYYY-MM-DD string
  let dateStr = dateText;
  if (dateText instanceof Date) {
    dateStr = dateText.toISOString().slice(0, 10);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) {
    return null;
  }

  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

router.post("/next", async (req, res) => {
  const settings = await getUserSettings(req.user.id);
  if (!settings) {
    return res.status(404).json({ message: "Settings not found" });
  }

  const latest = await db.get(
    `SELECT date, end_balance
     FROM sessions
     WHERE user_id = ?
     ORDER BY date DESC, id DESC
     LIMIT 1`,
    [req.user.id]
  );

  if (!latest) {
    return res.status(400).json({ message: "No previous session found" });
  }

  const nextDate = addDays(latest.date, 1);
  if (!nextDate) {
    return res.status(400).json({ message: "Unable to calculate next session date" });
  }

  const allowedDate = await validateDateInWindow(req.user.id, nextDate, { allowFuture: true });
  if (!allowedDate.ok) {
    return res.status(400).json({ message: allowedDate.message });
  }

  const startBalance = round2(Number(latest.end_balance || 0));
  const profitLoss = round2(startBalance * (Number(settings.profit_target_percent || 0) / 100));
  const metrics = computeSessionMetrics({
    startBalance,
    profitLoss,
    withdrawalPercent: settings.withdrawal_percent,
    stopLossPercent: settings.stop_loss_percent,
    profitTargetPercent: settings.profit_target_percent
  });

  try {
    const result = await db.run(
      `INSERT INTO sessions
       (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      [
        req.user.id,
        nextDate,
        startBalance,
        profitLoss,
        metrics.suggestedWithdrawal,
        metrics.endBalance,
        "Next session entry (auto advanced)"
      ]
    );

    return res.status(201).json({
      id: result.lastInsertRowid,
      date: nextDate,
      startBalance,
      profitLoss,
      withdrawal: metrics.suggestedWithdrawal,
      endBalance: metrics.endBalance,
      notes: "Next session entry (auto advanced)",
      hoursPlayed: 0,
      handsPlayed: null,
      unitSize: metrics.unitSize,
      nextDayStopLoss: metrics.nextDayStopLoss,
      nextDayProfitTarget: metrics.nextDayProfitTarget
    });
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "The next session entry already exists" });
    }

    return res.status(500).json({ message: "Unable to create next session" });
  }
});

router.post("/auto", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getUserSettings(req.user.id);

  if (!settings) {
    return res.status(404).json({ message: "Settings not found" });
  }

  const allowedDate = await validateDateInWindow(req.user.id, today);
  if (!allowedDate.ok) {
    return res.status(400).json({ message: allowedDate.message });
  }

  const latest = await db.get(
    `SELECT end_balance
     FROM sessions
     WHERE user_id = ?
     ORDER BY date DESC, id DESC
     LIMIT 1`,
    [req.user.id]
  );

  const startBalance = round2(latest ? Number(latest.end_balance || 0) : 0);
  const profitLoss = round2(startBalance * (Number(settings.profit_target_percent || 0) / 100));
  const metrics = computeSessionMetrics({
    startBalance,
    profitLoss,
    withdrawalPercent: settings.withdrawal_percent,
    stopLossPercent: settings.stop_loss_percent,
    profitTargetPercent: settings.profit_target_percent
  });

  try {
    const result = await db.run(
      `INSERT INTO sessions
       (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      [
        req.user.id,
        today,
        startBalance,
        profitLoss,
        metrics.suggestedWithdrawal,
        metrics.endBalance,
        "Auto entry (target hit)"
      ]
    );

    return res.status(201).json({
      id: result.lastInsertRowid,
      date: today,
      startBalance,
      profitLoss,
      withdrawal: metrics.suggestedWithdrawal,
      endBalance: metrics.endBalance,
      notes: "Auto entry (target hit)",
      hoursPlayed: 0,
      handsPlayed: null,
      unitSize: metrics.unitSize,
      nextDayStopLoss: metrics.nextDayStopLoss,
      nextDayProfitTarget: metrics.nextDayProfitTarget
    });
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      return res.status(409).json({ message: "Today's session already exists" });
    }

    return res.status(500).json({ message: "Unable to create auto session" });
  }
});

router.delete("/:id", async (req, res) => {
  const result = await db.run("DELETE FROM sessions WHERE id = ? AND user_id = ?", [
    req.params.id,
    req.user.id
  ]);

  if (result.changes === 0) {
    return res.status(404).json({ message: "Session not found" });
  }

  return res.json({ message: "Deleted" });
});

module.exports = router;
