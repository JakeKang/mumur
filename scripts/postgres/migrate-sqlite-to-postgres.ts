import fs from "node:fs";
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
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const schemaPath = path.resolve(process.cwd(), "scripts", "postgres", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema file not found: ${schemaPath}`);
  }

  const sqlite = new Database(sqlitePath(), { readonly: true });
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
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

    const identityTables = TABLES.filter((table) => !["workspace_members", "sessions", "notification_reads"].includes(table));
    for (const table of identityTables) {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`
      );
    }

    console.log("SQLite -> PostgreSQL migration complete");
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
