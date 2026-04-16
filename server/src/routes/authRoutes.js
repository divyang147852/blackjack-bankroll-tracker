const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const db = require("../db");
const config = require("../config");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const authSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(6).max(120)
});

const registerSchema = authSchema.extend({
  initialBalance: z.number().min(0).optional().default(0)
});

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: "7d" });
}

router.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid registration payload" });
  }

  const { username, password, initialBalance } = parsed.data;
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    return res.status(409).json({ message: "Username already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const insertUser = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
  const result = insertUser.run(username, passwordHash);

  db.prepare(
    `INSERT INTO settings (user_id, stop_loss_percent, profit_target_percent, withdrawal_percent, yearly_target, currency, theme)
     VALUES (?, 5, 3, 1, 80000, 'USD', 'dark')`
  ).run(result.lastInsertRowid);

  // Seed the user's bankroll baseline so dashboard calculations are available immediately.
  const start = Math.max(0, Number(initialBalance || 0));
  db.prepare(
    `INSERT INTO sessions (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
     VALUES (?, date('now'), ?, 0, 0, ?, 'Initial bankroll', 0, NULL)`
  ).run(result.lastInsertRowid, start, start);

  const user = { id: result.lastInsertRowid, username };
  const token = signToken(user);

  return res.status(201).json({ token, user });
});

router.post("/login", (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid username or password" });
  }

  const { username, password } = parsed.data;
  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, username: user.username } });
});

router.get("/me", authMiddleware, (req, res) => {
  const user = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?").get(req.user.id);
  return res.json(user);
});

module.exports = router;
