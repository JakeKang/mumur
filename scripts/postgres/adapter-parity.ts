import { Pool } from "pg";
import { createPostgresQueryAdapter } from "@/lib/server/query-adapter-pg";

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = createPostgresQueryAdapter(pool);

  const now = Date.now();
  const userId = 9990001;
  const teamId = 9990002;
  const eventId = 9990003;

  try {
    await pool.query("DELETE FROM notification_reads WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM events WHERE id = $1", [eventId]);
    await pool.query("DELETE FROM workspace_members WHERE team_id = $1", [teamId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [teamId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    await pool.query("INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, 'PG Test', $2, 'x:y', $3)", [userId, `pg-test-${now}@mumur.local`, now]);
    await pool.query("INSERT INTO workspaces (id, name, owner_id, icon, color, created_at, updated_at) VALUES ($1, 'PG Team', $2, '📁', '#6366f1', $3, $3)", [teamId, userId, now]);
    await pool.query("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [teamId, userId, now]);
    await pool.query("INSERT INTO events (id, team_id, idea_id, user_id, event_type, payload_json, created_at) VALUES ($1, $2, NULL, $3, 'mention.created', $4::jsonb, $5)", [eventId, teamId, userId, JSON.stringify({ targetUserId: userId }), now]);

    await adapter.insertNotificationReadIfMissing({ userId, eventId, readAt: now });
    await adapter.insertNotificationReadIfMissing({ userId, eventId, readAt: now + 1 });
    const readCount = Number((await pool.query("SELECT COUNT(*)::bigint AS count FROM notification_reads WHERE user_id = $1 AND event_id = $2", [userId, eventId])).rows[0]?.count || 0);
    if (readCount !== 1) {
      throw new Error(`insertNotificationReadIfMissing failed, count=${readCount}`);
    }

    const readable = await adapter.findReadableNotificationEventById({ eventId, teamId, userId });
    if (!readable) {
      throw new Error("findReadableNotificationEventById failed");
    }

    const rows = await adapter.listNotificationsForUser({
      userId,
      teamId,
      limit: 20,
      since: 0,
      unreadOnly: false,
      eventType: "",
      mentionsOnly: true,
      mutedTypes: []
    });
    if (!rows.length) {
      throw new Error("listNotificationsForUser failed");
    }

    await adapter.withTransaction(async (client) => {
      await client.query("INSERT INTO sessions (id, user_id, team_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)", [
        `pg-tx-${now}`,
        userId,
        teamId,
        now + 1000,
        now
      ]);
    });

    console.log("Postgres adapter parity checks passed");
  } finally {
    await pool.query("DELETE FROM sessions WHERE id = $1", [`pg-tx-${now}`]);
    await pool.query("DELETE FROM notification_reads WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM events WHERE id = $1", [eventId]);
    await pool.query("DELETE FROM workspace_members WHERE team_id = $1", [teamId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [teamId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
