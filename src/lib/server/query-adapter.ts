import type { DatabaseClient } from "@/lib/server/database-client";

export type SessionQueries = {
  extractInsertId: (result: unknown) => number;
  insertSession: (token: string, userId: number, teamId: number, expiresAt: number, createdAt: number) => void;
  deleteExpiredSessions: (beforeTs: number) => void;
  insertWebhookDeliveryIfMissing: (input: {
    webhookId: number;
    eventId: number;
    nextAttemptAt: number;
    createdAt: number;
    updatedAt: number;
  }) => void;
  insertNotificationReadIfMissing: (input: { userId: number; eventId: number; readAt: number }) => void;
  insertNotificationReadsForUserIfMissing: (input: { userId: number; readAt: number; teamId: number }) => void;
  withTransaction: <T>(fn: () => T) => T;
  findReadableNotificationEventById: (input: { eventId: number; teamId: number; userId: number }) => unknown;
  listNotificationsForUser: (input: {
    userId: number;
    teamId: number;
    limit: number;
    since: number;
    unreadOnly: boolean;
    eventType: string;
    mentionsOnly: boolean;
    mutedTypes: string[];
  }) => unknown[];
  countUnreadNotificationsForUser: (input: { userId: number; teamId: number }) => number;
};

export type WorkspaceQueries = {
  createWorkspace: (input: { name: string; ownerId: number; icon: string; color: string; now: number }) => { teamId: number };
  addWorkspaceMember: (input: { teamId: number; userId: number; role: string; createdAt: number }) => void;
  listWorkspaceMembers: (teamId: number) => unknown[];
};

export type IdeaQueries = {
  createIdea: (input: {
    teamId: number;
    authorId: number;
    title: string;
    category: string;
    status: string;
    blocksJson: string;
    now: number;
  }) => { ideaId: number };
  updateIdea: (input: { ideaId: number; title: string; category: string; status: string; blocksJson: string; updatedAt: number }) => void;
  findIdeaByTeam: (ideaId: number, teamId: number) => unknown;
};

export type CommentQueries = {
  createComment: (input: {
    ideaId: number;
    userId: number;
    parentId: number | null;
    blockId: string | null;
    content: string;
    createdAt: number;
  }) => { commentId: number };
  updateComment: (input: { commentId: number; content: string }) => void;
  deleteComment: (commentId: number) => void;
};

export type VersionQueries = {
  createVersion: (input: {
    ideaId: number;
    versionLabel: string;
    notes: string;
    fileName: string | null;
    filePath: string | null;
    createdBy: number;
    createdAt: number;
  }) => { versionId: number };
  restoreVersionBlocks: (input: { ideaId: number; versionId: number; restoredBlocksJson: string; now: number; createdBy: number }) => {
    restoredVersionId: number;
  };
};

export type EventQueries = {
  createEvent: (input: { teamId: number; ideaId: number | null; userId: number | null; eventType: string; payloadJson: string; createdAt: number }) => {
    eventId: number;
  };
  insertNotificationReadIfMissing: (input: { userId: number; eventId: number; readAt: number }) => void;
  listTeamEventsForInbox: (input: { teamId: number; userId: number; limit: number; offset: number }) => unknown[];
};

export type QueryAdapter = SessionQueries;

export type FullQueryAdapterContract = SessionQueries &
  WorkspaceQueries &
  IdeaQueries &
  CommentQueries &
  VersionQueries &
  EventQueries;

export function createQueryAdapter(db: DatabaseClient): QueryAdapter {
  const mentionVisibilityWhere =
    "(e.event_type != 'mention.created' OR CAST(json_extract(e.payload_json, '$.targetUserId') AS INTEGER) = ?)";

  return {
    extractInsertId: (result) => {
      if (!result || typeof result !== "object" || !("lastInsertRowid" in result)) {
        return 0;
      }
      const value = (result as { lastInsertRowid?: number | bigint | string }).lastInsertRowid;
      const id = Number(value ?? 0);
      return Number.isFinite(id) ? id : 0;
    },
    insertSession: (token, userId, teamId, expiresAt, createdAt) => {
      db.prepare("INSERT INTO sessions (id, user_id, team_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
        token,
        userId,
        teamId,
        expiresAt,
        createdAt
      );
    },
    deleteExpiredSessions: (beforeTs) => {
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(beforeTs);
    },
    insertWebhookDeliveryIfMissing: ({ webhookId, eventId, nextAttemptAt, createdAt, updatedAt }) => {
      db.prepare(
        "INSERT OR IGNORE INTO webhook_deliveries (webhook_id, event_id, status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, delivered_at) VALUES (?, ?, 'pending', 0, 5, ?, NULL, ?, ?, NULL)"
      ).run(webhookId, eventId, nextAttemptAt, createdAt, updatedAt);
    },
    insertNotificationReadIfMissing: ({ userId, eventId, readAt }) => {
      db.prepare("INSERT OR IGNORE INTO notification_reads (user_id, event_id, read_at) VALUES (?, ?, ?)").run(userId, eventId, readAt);
    },
    insertNotificationReadsForUserIfMissing: ({ userId, readAt, teamId }) => {
      db.prepare(
        "INSERT OR IGNORE INTO notification_reads (user_id, event_id, read_at) SELECT ?, e.id, ? FROM events e WHERE e.team_id = ? AND (e.event_type != 'mention.created' OR CAST(json_extract(e.payload_json, '$.targetUserId') AS INTEGER) = ?)"
      ).run(userId, readAt, teamId, userId);
    },
    withTransaction: (fn) => db.transaction(fn)(),
    findReadableNotificationEventById: ({ eventId, teamId, userId }) => {
      return db
        .prepare(`SELECT id FROM events e WHERE e.id = ? AND e.team_id = ? AND ${mentionVisibilityWhere}`)
        .get(eventId, teamId, userId);
    },
    listNotificationsForUser: ({ userId, teamId, limit, since, unreadOnly, eventType, mentionsOnly, mutedTypes }) => {
      const where = ["e.team_id = ?", mentionVisibilityWhere];
      const params: unknown[] = [userId, teamId, userId];
      if (unreadOnly) {
        where.push("nr.event_id IS NULL");
      }
      if (Number.isFinite(since) && since > 0) {
        where.push("e.created_at > ?");
        params.push(since);
      }
      if (eventType) {
        where.push("e.event_type = ?");
        params.push(eventType);
      }
      if (mentionsOnly) {
        where.push("(e.event_type = 'mention.created' AND CAST(json_extract(e.payload_json, '$.targetUserId') AS INTEGER) = ?)");
        params.push(userId);
      }
      if (mutedTypes.length) {
        where.push(`e.event_type NOT IN (${mutedTypes.map(() => "?").join(", ")})`);
        params.push(...mutedTypes);
      }

      return db
        .prepare(
          `SELECT e.*, u.name AS user_name, nr.read_at
           FROM events e
           LEFT JOIN users u ON u.id = e.user_id
           LEFT JOIN notification_reads nr ON nr.event_id = e.id AND nr.user_id = ?
           WHERE ${where.join(" AND ")}
           ORDER BY e.created_at DESC
           LIMIT ?`
        )
        .all(...params, limit);
    },
    countUnreadNotificationsForUser: ({ userId, teamId }) => {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM events e
           LEFT JOIN notification_reads nr ON nr.event_id = e.id AND nr.user_id = ?
           WHERE e.team_id = ?
             AND ${mentionVisibilityWhere}
             AND nr.event_id IS NULL`
        )
        .get(userId, teamId, userId) as { count?: number } | undefined;
      return Number(row?.count || 0);
    }
  };
}
