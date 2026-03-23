import path from "node:path";
import Database from "better-sqlite3";
import { Pool } from "pg";

const TABLES = [
  "users",
  "workspaces",
  "workspace_members",
  "sessions",
  "ideas",
  "comments",
  "reactions",
  "idea_versions",
  "discussion_threads",
  "discussion_comments",
  "votes",
  "events",
  "notification_reads",
  "workspace_webhooks",
  "notification_preferences",
  "webhook_deliveries",
  "workspace_views",
  "workspace_invitations"
] as const;

function sqlitePath() {
  const configured = String(process.env.NEXT_DB_PATH || "").trim();
  if (configured) {
    return configured;
  }
  return path.resolve(process.cwd(), "data", "mumur.db");
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sqlite = new Database(sqlitePath(), { readonly: true });
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    let failed = false;
    for (const table of TABLES) {
      const sqliteCount = Number((sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count || 0);
      const pgResult = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${table}`);
      const pgCount = Number(pgResult.rows[0]?.count || 0);

      if (sqliteCount !== pgCount) {
        failed = true;
        console.error(`[FAIL] ${table}: sqlite=${sqliteCount}, postgres=${pgCount}`);
      } else {
        console.log(`[OK] ${table}: ${sqliteCount}`);
      }
    }

    if (failed) {
      throw new Error("parity validation failed");
    }

    console.log("Parity validation passed");
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
