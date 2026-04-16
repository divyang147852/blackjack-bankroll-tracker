const express = require("express");
const ExcelJS = require("exceljs");
const { stringify } = require("csv-stringify/sync");
const db = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

function getSessionRows(userId) {
  return db
    .prepare(
      `SELECT date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played, created_at
       FROM sessions
       WHERE user_id = ?
       ORDER BY date ASC`
    )
    .all(userId);
}

router.get("/csv", (req, res) => {
  const rows = getSessionRows(req.user.id);
  const csv = stringify(rows, { header: true });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=blackjack_sessions.csv");
  return res.send(csv);
});

router.get("/excel", async (req, res) => {
  const rows = getSessionRows(req.user.id);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sessions");

  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Start Balance", key: "start_balance", width: 16 },
    { header: "Profit/Loss", key: "profit_loss", width: 14 },
    { header: "Withdrawal", key: "withdrawal", width: 14 },
    { header: "End Balance", key: "end_balance", width: 16 },
    { header: "Notes", key: "notes", width: 30 },
    { header: "Hours Played", key: "hours_played", width: 14 },
    { header: "Hands Played", key: "hands_played", width: 14 },
    { header: "Created At", key: "created_at", width: 22 }
  ];

  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=blackjack_sessions.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
