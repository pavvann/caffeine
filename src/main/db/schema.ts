import Database, { type Database as Db } from "better-sqlite3";
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "caffeine.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Db): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      last_session_id TEXT,
      last_opened_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
  `);
}
