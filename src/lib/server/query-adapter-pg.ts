import type { Pool, PoolClient } from "pg";
import { withPostgresTransaction } from "@/lib/server/postgres-client";

type NotificationListInput = {
  userId: number;
  teamId: number;
  limit: number;
  since: number;
  unreadOnly: boolean;
  eventType: string;
  mentionsOnly: boolean;
  mutedTypes: string[];
};

export type PostgresQueryAdapter = {
  withTransaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  insertSession: (token: string, userId: number, teamId: number, expiresAt: number, createdAt: number) => Promise<void>;
  deleteExpiredSessions: (beforeTs: number) => Promise<void>;
  insertWebhookDeliveryIfMissing: (input: {
    webhookId: number;
    eventId: number;
    nextAttemptAt: number;
    createdAt: number;
    updatedAt: number;
  }) => Promise<void>;
  insertNotificationReadIfMissing: (input: { userId: number; eventId: number; readAt: number }) => Promise<void>;
  insertNotificationReadsForUserIfMissing: (input: { userId: number; readAt: number; teamId: number }) => Promise<void>;
  findReadableNotificationEventById: (input: { eventId: number; teamId: number; userId: number }) => Promise<unknown>;
  listNotificationsForUser: (input: NotificationListInput) => Promise<unknown[]>;
  countUnreadNotificationsForUser: (input: { userId: number; teamId: number }) => Promise<number>;
  createWorkspace: (input: { name: string; ownerId: number; icon: string; color: string; now: number }) => Promise<{ teamId: number }>;
  createIdea: (input: {
    teamId: number;
    authorId: number;
    title: string;
    category: string;
    status: string;
    blocksJson: string;
    now: number;
  }) => Promise<{ ideaId: number }>;
  createVersion: (input: {
    ideaId: number;
    versionLabel: string;
    notes: string;
    fileName: string | null;
    filePath: string | null;
    createdBy: number;
    createdAt: number;
  }) => Promise<{ versionId: number }>;
  createThread: (input: {
    ideaId: number;
    teamId: number;
    createdBy: number;
    title: string;
    description: string;
    status: string;
    createdAt: number;
    updatedAt: number;
  }) => Promise<{ threadId: number }>;
};

function mentionVisibilityClause() {
  return "(e.event_type != 'mention.created' OR CAST((e.payload_json::jsonb ->> 'targetUserId') AS INTEGER) = $3)";
}

export function createPostgresQueryAdapter(pool: Pool): PostgresQueryAdapter {
  return {
    withTransaction: (fn) => withPostgresTransaction(fn),
    insertSession: async (token, userId, teamId, expiresAt, createdAt) => {
      await pool.query(
        "INSERT INTO sessions (id, user_id, team_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
        [token, userId, teamId, expiresAt, createdAt]
      );
    },
    deleteExpiredSessions: async (beforeTs) => {
      await pool.query("DELETE FROM sessions WHERE expires_at < $1", [beforeTs]);
    },
    insertWebhookDeliveryIfMissing: async ({ webhookId, eventId, nextAttemptAt, createdAt, updatedAt }) => {
      await pool.query(
        "INSERT INTO webhook_deliveries (webhook_id, event_id, status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, delivered_at) VALUES ($1, $2, 'pending', 0, 5, $3, NULL, $4, $5, NULL) ON CONFLICT (webhook_id, event_id) DO NOTHING",
        [webhookId, eventId, nextAttemptAt, createdAt, updatedAt]
      );
    },
    insertNotificationReadIfMissing: async ({ userId, eventId, readAt }) => {
      await pool.query(
        "INSERT INTO notification_reads (user_id, event_id, read_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, event_id) DO NOTHING",
        [userId, eventId, readAt]
      );
    },
    insertNotificationReadsForUserIfMissing: async ({ userId, readAt, teamId }) => {
      await pool.query(
        "INSERT INTO notification_reads (user_id, event_id, read_at) SELECT $1, e.id, $2 FROM events e WHERE e.team_id = $3 AND (e.event_type != 'mention.created' OR CAST((e.payload_json::jsonb ->> 'targetUserId') AS INTEGER) = $1) ON CONFLICT (user_id, event_id) DO NOTHING",
        [userId, readAt, teamId]
      );
    },
    findReadableNotificationEventById: async ({ eventId, teamId, userId }) => {
      const result = await pool.query(
        `SELECT e.id FROM events e WHERE e.id = $1 AND e.team_id = $2 AND ${mentionVisibilityClause()}`,
        [eventId, teamId, userId]
      );
      return result.rows[0] || null;
    },
    listNotificationsForUser: async ({ userId, teamId, limit, since, unreadOnly, eventType, mentionsOnly, mutedTypes }) => {
      const where = ["e.team_id = $2", mentionVisibilityClause()];
      const params: Array<number | string> = [userId, teamId, userId];
      let paramIndex = 4;

      if (unreadOnly) {
        where.push("nr.event_id IS NULL");
      }
      if (Number.isFinite(since) && since > 0) {
        where.push(`e.created_at > $${paramIndex++}`);
        params.push(since);
      }
      if (eventType) {
        where.push(`e.event_type = $${paramIndex++}`);
        params.push(eventType);
      }
      if (mentionsOnly) {
        where.push(`(e.event_type = 'mention.created' AND CAST((e.payload_json::jsonb ->> 'targetUserId') AS INTEGER) = $${paramIndex++})`);
        params.push(userId);
      }
      if (mutedTypes.length) {
        const placeholders = mutedTypes.map(() => `$${paramIndex++}`).join(", ");
        where.push(`e.event_type NOT IN (${placeholders})`);
        params.push(...mutedTypes);
      }

      params.push(limit);
      const result = await pool.query(
        `SELECT e.*, u.name AS user_name, nr.read_at
         FROM events e
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN notification_reads nr ON nr.event_id = e.id AND nr.user_id = $1
         WHERE ${where.join(" AND ")}
         ORDER BY e.created_at DESC
         LIMIT $${paramIndex}`,
        params
      );

      return result.rows;
    },
    countUnreadNotificationsForUser: async ({ userId, teamId }) => {
      const result = await pool.query(
        `SELECT COUNT(*) AS count
         FROM events e
         LEFT JOIN notification_reads nr ON nr.event_id = e.id AND nr.user_id = $1
         WHERE e.team_id = $2
           AND ${mentionVisibilityClause()}
           AND nr.event_id IS NULL`,
        [userId, teamId, userId]
      );
      return Number(result.rows[0]?.count || 0);
    },
    createWorkspace: async ({ name, ownerId, icon, color, now }) => {
      const result = await pool.query(
        "INSERT INTO workspaces (name, owner_id, icon, color, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5) RETURNING id",
        [name, ownerId, icon, color, now]
      );
      return { teamId: Number(result.rows[0]?.id || 0) };
    },
    createIdea: async ({ teamId, authorId, title, category, status, blocksJson, now }) => {
      const result = await pool.query(
        "INSERT INTO ideas (team_id, author_id, title, category, status, blocks_json, ai_summary, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $7) RETURNING id",
        [teamId, authorId, title, category, status, blocksJson, now]
      );
      return { ideaId: Number(result.rows[0]?.id || 0) };
    },
    createVersion: async ({ ideaId, versionLabel, notes, fileName, filePath, createdBy, createdAt }) => {
      const result = await pool.query(
        "INSERT INTO idea_versions (idea_id, version_label, notes, file_name, file_path, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [ideaId, versionLabel, notes, fileName, filePath, createdBy, createdAt]
      );
      return { versionId: Number(result.rows[0]?.id || 0) };
    },
    createThread: async ({ ideaId, teamId, createdBy, title, description, status, createdAt, updatedAt }) => {
      const result = await pool.query(
        "INSERT INTO discussion_threads (idea_id, team_id, created_by, title, description, status, conclusion, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8) RETURNING id",
        [ideaId, teamId, createdBy, title, description, status, createdAt, updatedAt]
      );
      return { threadId: Number(result.rows[0]?.id || 0) };
    }
  };
}
