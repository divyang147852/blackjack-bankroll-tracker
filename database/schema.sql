CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  stop_loss_percent REAL NOT NULL DEFAULT 5,
  profit_target_percent REAL NOT NULL DEFAULT 3,
  withdrawal_percent REAL NOT NULL DEFAULT 1,
  yearly_target REAL NOT NULL DEFAULT 80000,
  currency TEXT NOT NULL DEFAULT 'USD',
  theme TEXT NOT NULL DEFAULT 'dark',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  start_balance REAL NOT NULL,
  profit_loss REAL NOT NULL,
  withdrawal REAL NOT NULL DEFAULT 0,
  end_balance REAL NOT NULL,
  notes TEXT,
  hours_played REAL DEFAULT 0,
  hands_played INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(start_balance >= 0),
  CHECK(end_balance >= 0),
  CHECK(withdrawal >= 0)
);
