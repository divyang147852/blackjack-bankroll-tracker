const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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

const requestDeleteOtpSchema = z.object({
  password: z.string().min(6).max(120)
});

const deleteAccountSchema = z.object({
  password: z.string().min(6).max(120),
  otp: z.string().regex(/^\d{6}$/)
});

const DELETE_OTP_TTL_MS = 10 * 60 * 1000;
const DELETE_OTP_COOLDOWN_MS = 30 * 1000;
const DELETE_OTP_MAX_ATTEMPTS = 5;
const deleteOtpStore = new Map();

function hashDeleteOtp(userId, otp) {
  return crypto.createHash("sha256").update(`${userId}:${otp}:${config.jwtSecret}`).digest("hex");
}

async function verifyPasswordForUser(userId, password) {
  const user = await db.get("SELECT id, password_hash FROM users WHERE id = ?", [userId]);
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { ok: false, status: 401, message: "Invalid credentials" };
  }

  return { ok: true, user };
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: "7d" });
}

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid registration payload" });
  }

  const { username, password, initialBalance } = parsed.data;
  const exists = await db.get("SELECT id FROM users WHERE username = ?", [username]);
  if (exists) {
    return res.status(409).json({ message: "Username already exists" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = await db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
    username,
    passwordHash
  ]);
  const userId = Number(result.lastInsertRowid);

  await db.run(
    `INSERT INTO settings (user_id, stop_loss_percent, profit_target_percent, withdrawal_percent, yearly_target, currency, theme)
     VALUES (?, 5, 3, 1, 80000, 'USD', 'dark')`,
    [userId]
  );

  // Seed the user's bankroll baseline so dashboard calculations are available immediately.
  const start = Math.max(0, Number(initialBalance || 0));
  await db.run(
    `INSERT INTO sessions (user_id, date, start_balance, profit_loss, withdrawal, end_balance, notes, hours_played, hands_played)
     VALUES (?, CURRENT_DATE, ?, 0, 0, ?, 'Initial bankroll', 0, NULL)`,
    [userId, start, start]
  );

  const user = { id: userId, username };
  const token = signToken(user);

  return res.status(201).json({ token, user });
});

router.post("/login", async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid username or password" });
  }

  const { username, password } = parsed.data;
  const user = await db.get("SELECT id, username, password_hash FROM users WHERE username = ?", [username]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, username: user.username } });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await db.get("SELECT id, username, created_at FROM users WHERE id = ?", [req.user.id]);
  return res.json(user);
});

router.post("/delete/request-otp", authMiddleware, async (req, res) => {
  const parsed = requestDeleteOtpSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Password is required" });
  }

  const verified = await verifyPasswordForUser(req.user.id, parsed.data.password);
  if (!verified.ok) {
    return res.status(verified.status).json({ message: verified.message });
  }

  const existing = deleteOtpStore.get(req.user.id);
  if (existing && Date.now() - existing.lastRequestedAt < DELETE_OTP_COOLDOWN_MS) {
    return res.status(429).json({ message: "Please wait before requesting another OTP" });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  deleteOtpStore.set(req.user.id, {
    otpHash: hashDeleteOtp(req.user.id, otp),
    expiresAt: Date.now() + DELETE_OTP_TTL_MS,
    attempts: 0,
    lastRequestedAt: Date.now()
  });

  return res.json({
    message: "Deletion OTP generated",
    otp,
    expiresInSeconds: Math.floor(DELETE_OTP_TTL_MS / 1000)
  });
});

router.delete("/me", authMiddleware, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Password and 6-digit OTP are required" });
  }

  const verified = await verifyPasswordForUser(req.user.id, parsed.data.password);
  if (!verified.ok) {
    return res.status(verified.status).json({ message: verified.message });
  }

  const otpState = deleteOtpStore.get(req.user.id);
  if (!otpState || Date.now() > otpState.expiresAt) {
    deleteOtpStore.delete(req.user.id);
    return res.status(400).json({ message: "OTP missing or expired. Request a new OTP." });
  }

  if (otpState.attempts >= DELETE_OTP_MAX_ATTEMPTS) {
    deleteOtpStore.delete(req.user.id);
    return res.status(429).json({ message: "Too many invalid OTP attempts. Request a new OTP." });
  }

  const suppliedHash = hashDeleteOtp(req.user.id, parsed.data.otp);
  const isOtpValid =
    suppliedHash.length === otpState.otpHash.length &&
    crypto.timingSafeEqual(Buffer.from(suppliedHash, "hex"), Buffer.from(otpState.otpHash, "hex"));

  if (!isOtpValid) {
    otpState.attempts += 1;
    deleteOtpStore.set(req.user.id, otpState);
    return res.status(401).json({ message: "Invalid OTP" });
  }

  const result = await db.run("DELETE FROM users WHERE id = ?", [req.user.id]);
  if (result.changes === 0) {
    return res.status(500).json({ message: "Unable to delete account" });
  }

  deleteOtpStore.delete(req.user.id);

  return res.json({ message: "Account and related data deleted" });
});

module.exports = router;
