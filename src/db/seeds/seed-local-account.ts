import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { applySqliteSchema } from "@/shared/lib/server/sqlite-schema";

const EMAIL = process.env.LOCAL_SEED_EMAIL || "localtester@mumur.local";
const PASSWORD = process.env.LOCAL_SEED_PASSWORD || "mumur1234!";
const NAME = process.env.LOCAL_SEED_NAME || "Local Tester";
const WORKSPACE_NAME = process.env.LOCAL_SEED_TEAM || "Local Workspace";
const DB_PATH = process.env.NEXT_DB_PATH || path.resolve(process.cwd(), "data", "mumur.db");

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function run() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applySqliteSchema(sqlite);

  const now = Date.now();
  const passwordHash = hashPassword(PASSWORD);
  const existingUser = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL) as { id: number } | undefined;

  let userId: number;
  if (existingUser) {
    userId = existingUser.id;
    sqlite.prepare("UPDATE users SET name = ?, password_hash = ? WHERE id = ?").run(NAME, passwordHash, userId);
  } else {
    const inserted = sqlite.prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(NAME, EMAIL, passwordHash, now);
    userId = Number(inserted.lastInsertRowid);
  }

  let workspace = sqlite
    .prepare("SELECT id FROM workspaces WHERE name = ? AND owner_id = ? LIMIT 1")
    .get(WORKSPACE_NAME, userId) as { id: number } | undefined;
  if (!workspace) {
    const created = sqlite.prepare("INSERT INTO workspaces (name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(WORKSPACE_NAME, userId, now, now);
    workspace = { id: Number(created.lastInsertRowid) };
  }

  sqlite.prepare("INSERT OR IGNORE INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
    workspace.id,
    userId,
    "admin",
    now
  );

  process.stdout.write("Local seed account ready\n");
  process.stdout.write(`email=${EMAIL}\n`);
  process.stdout.write(`password=${PASSWORD}\n`);
  process.stdout.write(`workspace=${WORKSPACE_NAME}\n`);
  process.stdout.write(`db=${DB_PATH}\n`);

  sqlite.close();
}

run();
