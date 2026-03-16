import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const EMAIL = process.env.LOCAL_SEED_EMAIL || "localtester@mumur.local";
const PASSWORD = process.env.LOCAL_SEED_PASSWORD || "mumur1234!";
const NAME = process.env.LOCAL_SEED_NAME || "Local Tester";
const TEAM_NAME = process.env.LOCAL_SEED_TEAM || "Local Team";
const DB_PATH = process.env.NEXT_DB_PATH || path.resolve(process.cwd(), "data", "mumur.db");

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function run() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

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

  let team = db.prepare("SELECT id FROM teams WHERE name = ? AND owner_id = ? LIMIT 1").get(TEAM_NAME, userId);
  if (!team) {
    const created = db.prepare("INSERT INTO teams (name, owner_id, created_at) VALUES (?, ?, ?)").run(TEAM_NAME, userId, now);
    team = { id: Number(created.lastInsertRowid) };
  }

  db.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
    team.id,
    userId,
    "owner",
    now
  );

  process.stdout.write("Local seed account ready\n");
  process.stdout.write(`email=${EMAIL}\n`);
  process.stdout.write(`password=${PASSWORD}\n`);
  process.stdout.write(`team=${TEAM_NAME}\n`);
  process.stdout.write(`db=${DB_PATH}\n`);

  db.close();
}

run();
