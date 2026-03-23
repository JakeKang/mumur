import { db } from "@/lib/server/db";
import { createQueryAdapter, type QueryAdapter } from "@/lib/server/query-adapter";
import { createPostgresQueryAdapter, type PostgresQueryAdapter } from "@/lib/server/query-adapter-pg";
import { getPostgresPool, isPostgresConfigured } from "@/lib/server/postgres-client";
export type DatabaseClient = typeof db;
export type DatabaseEngine = "sqlite" | "postgres";

function resolveDatabaseEngine(): DatabaseEngine {
  if (isPostgresConfigured()) {
    return "postgres";
  }
  return "sqlite";
}

const databaseEngine = resolveDatabaseEngine();

const queryAdapter = createQueryAdapter(db);
const postgresPool = getPostgresPool();
const postgresQueryAdapter = postgresPool ? createPostgresQueryAdapter(postgresPool) : null;

export function getDatabaseClient(): DatabaseClient {
  if (databaseEngine === "postgres") {
    throw new Error("DATABASE_URL is set for postgres, but postgres client is not wired yet. Complete P3 pg pool ticket first.");
  }
  return db;
}

export function getDatabaseEngine(): DatabaseEngine {
  return databaseEngine;
}

export function getQueryAdapter(): QueryAdapter {
  if (databaseEngine === "postgres") {
    throw new Error("DATABASE_URL is set for postgres. Route still contains sqlite-style direct DB calls, so use postgres adapter migration path first.");
  }
  return queryAdapter;
}

export function getPostgresQueryAdapter(): PostgresQueryAdapter {
  if (!postgresQueryAdapter) {
    throw new Error("Postgres adapter is unavailable. Set DATABASE_URL to a postgres connection string.");
  }
  return postgresQueryAdapter;
}
