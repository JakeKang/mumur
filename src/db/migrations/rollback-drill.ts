import { spawnSync } from "node:child_process";

function runEngineCheck(databaseUrl?: string) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl || ""
  };
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "-e",
      "import { getDatabaseEngine, getDatabaseClient } from './src/shared/lib/server/database-client.ts'; console.log(getDatabaseEngine()); try { getDatabaseClient(); console.log('client-ok'); } catch { console.log('client-guarded'); }"
    ],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "engine check failed");
  }

  return (result.stdout || "").trim().split(/\s+/);
}

async function main() {
  const sqliteOut = runEngineCheck();
  if (sqliteOut[0] !== "sqlite" || sqliteOut[1] !== "client-ok") {
    throw new Error(`unexpected sqlite mode output: ${sqliteOut.join(" ")}`);
  }

  const pgOut = runEngineCheck("postgresql://user:pass@localhost:5432/mumur");
  if (pgOut[0] !== "postgres" || pgOut[1] !== "client-guarded") {
    throw new Error(`unexpected postgres mode output: ${pgOut.join(" ")}`);
  }

  console.log("Rollback drill passed: sqlite fallback and postgres guard verified");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
