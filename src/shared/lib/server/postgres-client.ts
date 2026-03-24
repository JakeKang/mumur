import { Pool, type PoolClient } from "pg";

const globalRef = globalThis as typeof globalThis & {
  __mumurPgPool?: Pool;
};

export function isPostgresConfigured() {
  const url = String(process.env.DATABASE_URL || "").trim();
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

export function getPostgresPool() {
  if (!isPostgresConfigured()) {
    return null;
  }
  if (!globalRef.__mumurPgPool) {
    globalRef.__mumurPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable" ? false : process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000)
    });
  }
  return globalRef.__mumurPgPool;
}

export async function withPostgresTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const pool = getPostgresPool();
  if (!pool) {
    throw new Error("Postgres pool is not configured");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
