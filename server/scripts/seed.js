const bcrypt = require("bcryptjs");
const db = require("../src/db");

const demoUsername = "demo";
const demoPassword = "demo1234";

function seed() {
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(demoUsername);
  if (exists) {
    console.log("Demo user already exists. Skipping seed.");
    return;
  }

  const passwordHash = bcrypt.hashSync(demoPassword, 10);
  const userResult = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(demoUsername, passwordHash);

  const userId = userResult.lastInsertRowid;

  db.prepare(
    `INSERT INTO settings (user_id, stop_loss_percent, profit_target_percent, withdrawal_percent, yearly_target, currency, theme)
     VALUES (?, 5, 3, 1, 80000, 'USD', 'dark')`
  ).run(userId);

  const sessions = [
    ["2026-04-10", 12000, 450, 12450],
    ["2026-04-11", 12450, -320, 12130],
    ["2026-04-12", 12130, 710, 12840],
    ["2026-04-13", 12840, 130, 12970],
    ["2026-04-14", 12970, -500, 12470],
    ["2026-04-15", 12470, 980, 13450]
  ];

  const insertSession = db.prepare(
    `INSERT INTO sessions
     (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  sessions.forEach(([date, start, pl, end], i) => {
    insertSession.run(
      userId,
      date,
      start,
      pl,
      Math.max(end * 0.01, 0),
      end,
      `Sample session #${i + 1}`,
      3.5,
      220
    );
  });

  console.log("Seed completed.");
  console.log("Demo credentials:");
  console.log(`username: ${demoUsername}`);
  console.log(`password: ${demoPassword}`);
}

seed();
