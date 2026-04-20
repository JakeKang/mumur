import type { DatabaseClient } from "@/shared/lib/server/database-client";
import type { QueryAdapter } from "@/shared/lib/server/query-adapter";
import net from "node:net";
import { reportServerIssue } from "@/shared/lib/observability";

type WebhookWorkerGlobal = typeof globalThis & {
  __mumurWebhookWorker?: NodeJS.Timeout | null;
};

type NotificationFormatter = (eventType: unknown, payload: unknown) => string;

function formatWebhookMessage(notification: { message?: unknown; type?: unknown; actor?: unknown }) {
  const message = String(notification.message || notification.type || "");
  const actor = String(notification.actor || "시스템");
  return `[Mumur] ${message} | actor: ${actor}`;
}

export function isValidWebhookUrl(platform: unknown, value: unknown) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") {
      return false;
    }

    if (url.username || url.password) {
      return false;
    }

    if (url.port && url.port !== "443") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return false;
    }

    // Webhook destinations are allowlisted domains only; IP-literal targets are never valid.
    if (net.isIP(hostname)) {
      return false;
    }

    if (platform === "slack") {
      return hostname === "hooks.slack.com";
    }
    if (platform === "discord") {
      return hostname === "discord.com" || hostname === "discordapp.com";
    }
    return false;
  } catch {
    return false;
  }
}

export function maskWebhookUrl(rawUrl: unknown) {
  try {
    const parsed = new URL(String(rawUrl || ""));
    return `${parsed.protocol}//${parsed.hostname}/••••`;
  } catch {
    return "••••";
  }
}

async function postWebhook(webhook: { platform: string; webhook_url: string }, notification: { message?: unknown; type?: unknown; actor?: unknown }) {
  const payload = webhook.platform === "slack"
    ? { text: formatWebhookMessage(notification) }
    : { content: formatWebhookMessage(notification) };
  const response = await fetch(webhook.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`웹훅 요청 실패: ${response.status}`);
  }
}

export async function processWebhookQueue(
  db: DatabaseClient,
  formatNotificationMessage: NotificationFormatter
) {
  const now = Date.now();
  const deliveries = db
    .prepare(
      `SELECT wd.*, tw.platform, tw.webhook_url, e.event_type, e.payload_json, e.user_id
       FROM webhook_deliveries wd
       JOIN workspace_webhooks tw ON tw.id = wd.webhook_id
       JOIN events e ON e.id = wd.event_id
       WHERE wd.status IN ('pending', 'retry') AND wd.next_attempt_at <= ? AND tw.enabled = 1
       ORDER BY wd.next_attempt_at ASC
       LIMIT 30`
    )
    .all(now) as Array<{
      id: number;
      attempts: number;
      max_attempts: number;
      payload_json: string | null;
      event_type: string;
      platform: string;
      webhook_url: string;
      user_id: number | null;
    }>;

  for (const delivery of deliveries) {
    const payload = JSON.parse(delivery.payload_json || "{}");
    const actorRow = delivery.user_id ? db.prepare("SELECT name FROM users WHERE id = ?").get(delivery.user_id) as { name?: string } | undefined : null;
    const notification = {
      type: delivery.event_type,
      payload,
      actor: actorRow ? actorRow.name : "시스템",
      message: formatNotificationMessage(delivery.event_type, payload)
    };

    try {
      await postWebhook(delivery, notification);
      db.prepare(
        "UPDATE webhook_deliveries SET status = 'sent', attempts = attempts + 1, updated_at = ?, delivered_at = ? WHERE id = ?"
      ).run(Date.now(), Date.now(), delivery.id);
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const errorMessage = String(error instanceof Error ? error.message : error);
      if (attempts >= delivery.max_attempts) {
        reportServerIssue("webhook-queue", "webhook delivery exhausted retries", {
          deliveryId: delivery.id,
          platform: delivery.platform,
          url: maskWebhookUrl(delivery.webhook_url),
          eventType: delivery.event_type,
          attempts,
          maxAttempts: delivery.max_attempts,
          error: errorMessage
        });
      }
      if (attempts >= delivery.max_attempts) {
        db.prepare("UPDATE webhook_deliveries SET status = 'failed', attempts = ?, updated_at = ?, last_error = ? WHERE id = ?").run(
          attempts,
          Date.now(),
          errorMessage,
          delivery.id
        );
      } else {
        const backoffMs = Math.min(600000, 1000 * 2 ** (attempts - 1));
        db.prepare(
          "UPDATE webhook_deliveries SET status = 'retry', attempts = ?, updated_at = ?, next_attempt_at = ?, last_error = ? WHERE id = ?"
        ).run(attempts, Date.now(), Date.now() + backoffMs, errorMessage, delivery.id);
      }
    }
  }
}

function ensureWebhookWorker(
  db: DatabaseClient,
  globalRef: WebhookWorkerGlobal,
  formatNotificationMessage: NotificationFormatter
) {
  if (globalRef.__mumurWebhookWorker) {
    return;
  }
  globalRef.__mumurWebhookWorker = setInterval(() => {
    processWebhookQueue(db, formatNotificationMessage).catch((error) => {
      reportServerIssue("webhook-queue", "webhook queue processing failed", { error });
    });
  }, 4000);
  globalRef.__mumurWebhookWorker.unref?.();
}

export function enqueueWebhookDeliveries(
  db: DatabaseClient,
  queries: Pick<QueryAdapter, "insertWebhookDeliveryIfMissing">,
  globalRef: WebhookWorkerGlobal,
  formatNotificationMessage: NotificationFormatter,
  teamId: number,
  eventId: number
) {
  const hooks = db.prepare("SELECT * FROM workspace_webhooks WHERE team_id = ? AND enabled = 1 ORDER BY id ASC").all(teamId) as Array<{ id: number }>;
  if (!hooks.length) {
    return;
  }

  const now = Date.now();
  hooks.forEach((hook) => {
    queries.insertWebhookDeliveryIfMissing({
      webhookId: hook.id,
      eventId,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now
    });
  });

  ensureWebhookWorker(db, globalRef, formatNotificationMessage);
  processWebhookQueue(db, formatNotificationMessage).catch((error) => {
    reportServerIssue("webhook-queue", "initial webhook queue flush failed", { error });
  });
}
