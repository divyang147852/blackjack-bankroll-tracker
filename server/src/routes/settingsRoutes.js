const express = require("express");
const { z } = require("zod");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const settingsSchema = z.object({
  stopLossPercent: z.number().min(0).max(100),
  profitTargetPercent: z.number().min(0).max(100),
  withdrawalPercent: z.number().min(0).max(100),
  yearlyTarget: z.number().min(0),
  currency: z.string().min(1).max(8),
  theme: z.enum(["dark", "light"])
});

router.use(authMiddleware);

router.get("/", async (req, res) => {
  const settings = await db.get(
    `SELECT stop_loss_percent, profit_target_percent, withdrawal_percent, yearly_target, currency, theme
     FROM settings WHERE user_id = ?`,
    [req.user.id]
  );

  if (!settings) {
    return res.status(404).json({ message: "Settings not found" });
  }

  return res.json({
    stopLossPercent: settings.stop_loss_percent,
    profitTargetPercent: settings.profit_target_percent,
    withdrawalPercent: settings.withdrawal_percent,
    yearlyTarget: settings.yearly_target,
    currency: settings.currency,
    theme: settings.theme
  });
});

router.put("/", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid settings payload" });
  }

  const p = parsed.data;
  await db.run(
    `UPDATE settings
     SET stop_loss_percent = ?, profit_target_percent = ?, withdrawal_percent = ?, yearly_target = ?, currency = ?, theme = ?
     WHERE user_id = ?`,
    [
      p.stopLossPercent,
      p.profitTargetPercent,
      p.withdrawalPercent,
      p.yearlyTarget,
      p.currency,
      p.theme,
      req.user.id
    ]
  );

  return res.json({ message: "Settings updated" });
});

module.exports = router;
