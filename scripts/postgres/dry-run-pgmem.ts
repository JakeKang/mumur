import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { newDb } from "pg-mem";
import { createPostgresQueryAdapter } from "@/lib/server/query-adapter-pg";

const TABLES = [
  "users",
  "workspaces",
  "workspace_members",
  "sessions",
  "ideas",
  "comments",
  "reactions",
  "idea_versions",
  "events",
  "notification_reads",
  "workspace_webhooks",
  "notification_preferences",
  "webhook_deliveries",
  "workspace_views",
  "workspace_invitations"
] as const;

const JSON_COLUMNS: Record<string, string[]> = {
  ideas: ["blocks_json"],
  events: ["payload_json"],
  notification_preferences: ["muted_types_json"],
  workspace_views: ["config_json"]
};

function sqlitePath() {
  const configured = String(process.env.NEXT_DB_PATH || "").trim();
  if (configured) {
    return configured;
  }
  return path.resolve(process.cwd(), "data", "mumur.db");
}

function toPgValue(table: string, column: string, value: unknown) {
  if (value == null) {
    return null;
  }
  if ((JSON_COLUMNS[table] || []).includes(column)) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }
  return value;
}

async function main() {
  const sqlite = new Database(sqlitePath(), { readonly: true });
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  try {
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), "scripts", "postgres", "schema.sql"), "utf8");
    await pool.query(schemaSql);

    for (const table of TABLES) {
      const columns = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
      if (!columns.length) {
        continue;
      }
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
      if (!rows.length) {
        continue;
      }

      const columnSql = columns.map((c) => `"${c}"`).join(", ");
      const valueSql = columns.map((_, i) => `$${i + 1}`).join(", ");
      const insertSql = `INSERT INTO ${table} (${columnSql}) VALUES (${valueSql}) ON CONFLICT DO NOTHING`;
      for (const row of rows) {
        const values = columns.map((column) => toPgValue(table, column, row[column]));
        await pool.query(insertSql, values);
      }
    }

    for (const table of TABLES) {
      const sqliteCount = Number((sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count || 0);
      const pgCount = Number((await pool.query(`SELECT COUNT(*)::bigint as count FROM ${table}`)).rows[0]?.count || 0);
      if (sqliteCount !== pgCount) {
        throw new Error(`Parity mismatch for ${table}: sqlite=${sqliteCount}, pgmem=${pgCount}`);
      }
    }

    const adapter = createPostgresQueryAdapter(pool as never);
    const now = Date.now();
    const userId = 991001;
    const teamId = 991002;
    const eventId = 991003;
    await pool.query("INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, 'PGMem Test', $2, 'x:y', $3)", [
      userId,
      `pgmem-${now}@mumur.local`,
      now
    ]);
    await pool.query("INSERT INTO workspaces (id, name, owner_id, icon, color, created_at, updated_at) VALUES ($1, 'PGMem Team', $2, '📁', '#6366f1', $3, $3)", [
      teamId,
      userId,
      now
    ]);
    await pool.query("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [teamId, userId, now]);
    await pool.query(
      "INSERT INTO events (id, team_id, idea_id, user_id, event_type, payload_json, created_at) VALUES ($1, $2, NULL, $3, 'mention.created', $4::jsonb, $5)",
      [eventId, teamId, userId, JSON.stringify({ targetUserId: userId }), now]
    );
    await adapter.insertNotificationReadIfMissing({ userId, eventId, readAt: now });
    await adapter.insertNotificationReadIfMissing({ userId, eventId, readAt: now + 1 });

    const readCount = Number((await pool.query("SELECT COUNT(*)::bigint as count FROM notification_reads WHERE user_id = $1 AND event_id = $2", [
      userId,
      eventId
    ])).rows[0]?.count || 0);
    if (readCount !== 1) {
      throw new Error("insertNotificationReadIfMissing parity failed");
    }

    const visible = await adapter.findReadableNotificationEventById({ eventId, teamId, userId });
    if (!visible) {
      throw new Error("findReadableNotificationEventById parity failed");
    }

    console.log("Postgres migration dry-run (pg-mem) passed");
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
