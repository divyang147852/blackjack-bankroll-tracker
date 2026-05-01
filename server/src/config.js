const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "change_me",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  dbPath: path.resolve(__dirname, process.env.DB_PATH || "../../database/blackjack_tracker.db"),
  databaseUrl: (process.env.DATABASE_URL || "").trim()
};
