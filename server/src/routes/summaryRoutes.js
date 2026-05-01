const express = require("express");
const dayjs = require("dayjs");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const { round2 } = require("../utils/calc");

const router = express.Router();
router.use(authMiddleware);

router.get("/daily", async (req, res) => {
  const row = await db.get(
    `SELECT
       COUNT(*) AS sessions,
       COALESCE(SUM(profit_loss), 0) AS total_pl,
       COALESCE(SUM(withdrawal), 0) AS total_withdrawals,
       COALESCE(AVG(profit_loss), 0) AS avg_pl
     FROM sessions
     WHERE user_id = ? AND date >= ?`,
    [req.user.id, dayjs().subtract(30, "day").format("YYYY-MM-DD")]
  );

  return res.json({
    sessions: Number(row.sessions || 0),
    totalPL30Days: round2(row.total_pl),
    totalWithdrawals30Days: round2(row.total_withdrawals),
    averageDailyPL30Days: round2(row.avg_pl)
  });
});

module.exports = router;
