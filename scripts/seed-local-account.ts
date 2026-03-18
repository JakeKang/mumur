import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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

function ensureSchema(db: InstanceType<typeof Database>) {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, owner_id INTEGER NOT NULL,
      icon TEXT NOT NULL DEFAULT '📁', color TEXT NOT NULL DEFAULT '#6366f1',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workspace_members (
      team_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
      title TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
      blocks_json TEXT NOT NULL, ai_summary TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      parent_id INTEGER, block_id TEXT, content TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES comments(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL, user_id INTEGER NOT NULL, emoji TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'idea', target_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      UNIQUE(idea_id, user_id, emoji, target_type, target_id),
      FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS idea_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL, version_label TEXT NOT NULL,
      notes TEXT, file_name TEXT, file_path TEXT,
      created_by INTEGER NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS discussion_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL, title TEXT NOT NULL,
      description TEXT, status TEXT NOT NULL, conclusion TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS discussion_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      content TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES discussion_threads(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL, vote_value INTEGER NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(idea_id, user_id, vote_type),
      FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL, idea_id INTEGER, user_id INTEGER,
      event_type TEXT NOT NULL, payload_json TEXT, created_at INTEGER NOT NULL,
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id INTEGER NOT NULL, event_id INTEGER NOT NULL, read_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, event_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workspace_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL, platform TEXT NOT NULL,
      webhook_url TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(team_id, platform),
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY, muted_types_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL, event_id INTEGER NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL, max_attempts INTEGER NOT NULL,
      next_attempt_at INTEGER NOT NULL, last_error TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, delivered_at INTEGER,
      UNIQUE(webhook_id, event_id),
      FOREIGN KEY(webhook_id) REFERENCES workspace_webhooks(id) ON DELETE CASCADE,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workspace_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL, name TEXT NOT NULL,
      config_json TEXT NOT NULL, created_by INTEGER NOT NULL,
      updated_by INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(team_id, name),
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL, email TEXT NOT NULL,
      role TEXT NOT NULL, status TEXT NOT NULL, message TEXT,
      invited_by INTEGER NOT NULL, resolved_by INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(team_id, email),
      FOREIGN KEY(team_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

function run() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);

  const now = Date.now();
  const passwordHash = hashPassword(PASSWORD);
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(EMAIL);

  let userId: number;
  if (existingUser) {
    userId = existingUser.id;
    db.prepare("UPDATE users SET name = ?, password_hash = ? WHERE id = ?").run(NAME, passwordHash, userId);
  } else {
    const inserted = db
      .prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(NAME, EMAIL, passwordHash, now);
    userId = Number(inserted.lastInsertRowid);
  }

  let workspace = db.prepare("SELECT id FROM workspaces WHERE name = ? AND owner_id = ? LIMIT 1").get(WORKSPACE_NAME, userId);
  if (!workspace) {
    const created = db.prepare("INSERT INTO workspaces (name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(WORKSPACE_NAME, userId, now, now);
    workspace = { id: Number(created.lastInsertRowid) };
  }

  db.prepare("INSERT OR IGNORE INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
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

  db.close();
}

run();
