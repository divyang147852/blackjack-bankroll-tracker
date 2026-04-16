const express = require("express");
const { z } = require("zod");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const { computeSessionMetrics, round2 } = require("../utils/calc");
const { getUserSettings } = require("../services/statsService");

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

router.get("/", (req, res) => {
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

  const rows = db.prepare(query).all(...params);
  return res.json(rows);
});

router.post("/", (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid session payload" });
  }

  const settings = getUserSettings(req.user.id);
  const payload = parsed.data;

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
    const result = db
      .prepare(
        `INSERT INTO sessions
         (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        payload.date,
        round2(payload.startBalance),
        round2(payload.profitLoss),
        metrics.suggestedWithdrawal,
        metrics.endBalance,
        payload.notes || "",
        payload.hoursPlayed || 0,
        payload.handsPlayed ?? null
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
    if (String(error.message).includes("UNIQUE constraint failed: sessions.user_id, sessions.date")) {
      return res.status(409).json({ message: "A session entry for this date already exists" });
    }

    return res.status(500).json({ message: "Unable to save session" });
  }
});

router.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ message: "Session not found" });
  }

  return res.json({ message: "Deleted" });
});

module.exports = router;
