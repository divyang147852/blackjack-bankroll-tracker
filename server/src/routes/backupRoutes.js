const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const config = require("../config");

const uploadDir = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });
const router = express.Router();
router.use(authMiddleware);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function importSessionsFromCsv(filePath, userId) {
  const workbook = new ExcelJS.Workbook();
  const sheet = await workbook.csv.readFile(filePath);

  if (sheet.rowCount < 2) {
    return { imported: 0 };
  }

  const headerValues = sheet
    .getRow(1)
    .values
    .slice(1)
    .map((h) => normalizeHeader(h));

  const col = {
    date: headerValues.indexOf("date"),
    startBalance: headerValues.indexOf("start_balance"),
    profitLoss: headerValues.indexOf("profit_loss"),
    withdrawal: headerValues.indexOf("withdrawal"),
    endBalance: headerValues.indexOf("end_balance"),
    notes: headerValues.indexOf("notes"),
    hoursPlayed: headerValues.indexOf("hours_played"),
    handsPlayed: headerValues.indexOf("hands_played")
  };

  if (
    col.date === -1 ||
    col.startBalance === -1 ||
    col.profitLoss === -1 ||
    col.withdrawal === -1 ||
    col.endBalance === -1
  ) {
    throw new Error("invalid_csv_format");
  }

  const upsert = db.prepare(
    `INSERT INTO sessions
     (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date)
     DO UPDATE SET
       start_balance = excluded.start_balance,
       profit_loss = excluded.profit_loss,
       withdrawal = excluded.withdrawal,
       end_balance = excluded.end_balance,
       notes = excluded.notes,
       hours_played = excluded.hours_played,
       hands_played = excluded.hands_played`
  );

  const txn = db.transaction(() => {
    let imported = 0;

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum += 1) {
      const values = sheet.getRow(rowNum).values.slice(1);
      const date = String(values[col.date] || "").trim();
      if (!date) {
        continue;
      }

      const startBalance = toNumber(values[col.startBalance], NaN);
      const profitLoss = toNumber(values[col.profitLoss], NaN);
      const withdrawal = toNumber(values[col.withdrawal], NaN);
      const endBalance = toNumber(values[col.endBalance], NaN);

      if (
        !Number.isFinite(startBalance) ||
        !Number.isFinite(profitLoss) ||
        !Number.isFinite(withdrawal) ||
        !Number.isFinite(endBalance) ||
        startBalance < 0 ||
        withdrawal < 0 ||
        endBalance < 0
      ) {
        continue;
      }

      const notes = String(values[col.notes] || "").trim();
      const hoursPlayed = col.hoursPlayed >= 0 ? toNumber(values[col.hoursPlayed], 0) : 0;
      const handsPlayed =
        col.handsPlayed >= 0 && values[col.handsPlayed] !== "" && values[col.handsPlayed] != null
          ? Number(values[col.handsPlayed])
          : null;

      upsert.run(
        userId,
        date,
        startBalance,
        profitLoss,
        withdrawal,
        endBalance,
        notes,
        Number.isFinite(hoursPlayed) ? hoursPlayed : 0,
        Number.isFinite(handsPlayed) ? Math.trunc(handsPlayed) : null
      );

      imported += 1;
    }

    return imported;
  });

  return { imported: txn() };
}

router.get("/download", (req, res) => {
  return res.download(config.dbPath, "blackjack_tracker_backup.db");
});

router.post("/restore", upload.single("backup"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No backup file uploaded" });
  }

  try {
    const isCsv = req.file.originalname.toLowerCase().endsWith(".csv");
    if (isCsv) {
      const result = await importSessionsFromCsv(req.file.path, req.user.id);
      fs.unlinkSync(req.file.path);

      if (result.imported === 0) {
        return res.status(400).json({ message: "No valid sessions found in CSV" });
      }

      return res.json({
        message: `CSV import completed. ${result.imported} sessions imported or updated.`
      });
    }

    fs.copyFileSync(req.file.path, config.dbPath);
    fs.unlinkSync(req.file.path);
    return res.json({ message: "Database restored. Restart server to reload DB safely." });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (String(error.message).includes("invalid_csv_format")) {
      return res.status(400).json({ message: "Invalid CSV format for session import" });
    }

    return res.status(500).json({ message: "Failed to restore backup" });
  }
});

module.exports = router;
