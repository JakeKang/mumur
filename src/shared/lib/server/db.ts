import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applySqliteSchema } from "@/shared/lib/server/sqlite-schema";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveDbPath() {
  if (process.env.NEXT_DB_PATH) {
    return process.env.NEXT_DB_PATH;
  }

  return path.resolve(process.cwd(), "data", "mumur.db");
}

function createDb() {
  const dbPath = resolveDbPath();
  ensureDir(path.dirname(dbPath));
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applySqliteSchema(sqlite);
  return sqlite;
}

const globalRef = globalThis;

if (!globalRef.__mumurDb) {
  globalRef.__mumurDb = createDb();
}

export const db = globalRef.__mumurDb;
export { ensureDir };
