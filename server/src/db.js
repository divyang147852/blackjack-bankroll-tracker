const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { Pool } = require("pg");
const config = require("./config");

let usingPostgres = Boolean(config.databaseUrl);

let sqliteDb = null;
let pgPool = null;

function toPgSql(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => {
    idx += 1;
    return `$${idx}`;
  });
}

async function initPostgres() {
  pgPool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      stop_loss_percent DOUBLE PRECISION NOT NULL DEFAULT 5,
      profit_target_percent DOUBLE PRECISION NOT NULL DEFAULT 3,
      withdrawal_percent DOUBLE PRECISION NOT NULL DEFAULT 1,
      yearly_target DOUBLE PRECISION NOT NULL DEFAULT 80000,
      currency TEXT NOT NULL DEFAULT 'USD',
      theme TEXT NOT NULL DEFAULT 'dark',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      start_balance DOUBLE PRECISION NOT NULL,
      profit_loss DOUBLE PRECISION NOT NULL,
      withdrawal DOUBLE PRECISION NOT NULL DEFAULT 0,
      end_balance DOUBLE PRECISION NOT NULL,
      notes TEXT,
      hours_played DOUBLE PRECISION DEFAULT 0,
      hands_played INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, date),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      CHECK(start_balance >= 0),
      CHECK(end_balance >= 0),
      CHECK(withdrawal >= 0)
    )
  `);
}

function initSqlite() {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sqliteDb = new Database(config.dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");

  const schemaPath = path.resolve(__dirname, "../../database/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  sqliteDb.exec(schema);
}

async function init() {
  if (usingPostgres) {
    try {
      await initPostgres();
      return;
    } catch (error) {
      if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
        throw error;
      }

      console.warn("DATABASE_URL is set but unavailable, falling back to SQLite for local use.");
      usingPostgres = false;
      pgPool = null;
    }
  }
  initSqlite();
}

async function get(sql, params = [], client = null) {
  if (usingPostgres) {
    const runner = client || pgPool;
    const result = await runner.query(toPgSql(sql), params);
    return result.rows[0] || null;
  }

  return sqliteDb.prepare(sql).get(...params) || null;
}

async function all(sql, params = [], client = null) {
  if (usingPostgres) {
    const runner = client || pgPool;
    const result = await runner.query(toPgSql(sql), params);
    return result.rows;
  }

  return sqliteDb.prepare(sql).all(...params);
}

async function run(sql, params = [], client = null) {
  if (usingPostgres) {
    const runner = client || pgPool;
    const hasReturning = /\breturning\b/i.test(sql);
    const finalSql = hasReturning ? sql : `${sql} RETURNING id`;
    const result = await runner.query(toPgSql(finalSql), params);
    return {
      changes: result.rowCount || 0,
      lastInsertRowid: result.rows[0] ? result.rows[0].id : undefined
    };
  }

  const result = sqliteDb.prepare(sql).run(...params);
  return {
    changes: result.changes || 0,
    lastInsertRowid: result.lastInsertRowid
  };
}

async function withTransaction(callback) {
  if (!usingPostgres) {
    const txn = sqliteDb.transaction(() => callback({ get, all, run }));
    return txn();
  }

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const tx = {
      get: (sql, params = []) => get(sql, params, client),
      all: (sql, params = []) => all(sql, params, client),
      run: (sql, params = []) => run(sql, params, client)
    };
    const result = await callback(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function isPostgres() {
  return usingPostgres;
}

module.exports = {
  init,
  get,
  all,
  run,
  withTransaction,
  isPostgres,
  dbPath: config.dbPath
};
