import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db, ensureDir } from "@/lib/server/db";
import {
  SESSION_COOKIE,
  clearExpiredSessions,
  createSession,
  hashPassword,
  normalizeText,
  parseCookieHeader,
  verifyPassword
} from "@/lib/server/auth";
import { IDEA_STATUS } from "@/lib/idea-status";
import { notificationTypeLabel, threadStatusLabel, voteTypeLabel } from "@/lib/ui-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCK_TYPES = ["heading", "text", "quote", "checklist", "code", "divider"];
const THREAD_STATUS = ["active", "resolved", "on_hold"];
const VOTE_TYPES = { binary: "binary", score: "score" };
const WEBHOOK_PLATFORMS = ["slack", "discord"];
const TEAM_ROLES = ["owner", "member"];
const encoder = new TextEncoder();

const globalRef = globalThis;
if (!globalRef.__mumurStreamClients) {
  globalRef.__mumurStreamClients = new Map();
}
if (!globalRef.__mumurWebhookWorker) {
  globalRef.__mumurWebhookWorker = null;
}

const streamClients = globalRef.__mumurStreamClients;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function toIdeaPayload(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    authorId: row.author_id,
    title: row.title,
    category: row.category,
    status: row.status,
    blocks: JSON.parse(row.blocks_json || "[]"),
    aiSummary: row.ai_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseBlocks(inputBlocks) {
  const blocks = Array.isArray(inputBlocks) ? inputBlocks : [];
  return blocks
    .map((block, index) => {
      const type = BLOCK_TYPES.includes(block?.type) ? block.type : "text";
      const id = normalizeText(block?.id) || `block-${index + 1}-${Date.now()}`;
      const content = type === "divider" ? "" : normalizeText(block?.content);
      const checked = Boolean(block?.checked);
      return { id, type, content, checked };
    })
    .filter((block) => block.type === "divider" || block.content.length > 0);
}

function pickTeamForUser(userId) {
  return db
    .prepare(
      "SELECT tm.team_id AS teamId, t.name AS teamName FROM workspace_members tm JOIN workspaces t ON t.id = tm.team_id WHERE tm.user_id = ? ORDER BY tm.created_at ASC LIMIT 1"
    )
    .get(userId);
}

function getIdeaForTeam(ideaId, teamId) {
  return db.prepare("SELECT * FROM ideas WHERE id = ? AND team_id = ?").get(ideaId, teamId);
}

function getThreadForIdeaTeam(threadId, ideaId, teamId) {
  return db
    .prepare("SELECT * FROM discussion_threads WHERE id = ? AND idea_id = ? AND team_id = ?")
    .get(threadId, ideaId, teamId);
}

function ideaBlockIds(ideaRow) {
  const blocks = JSON.parse(ideaRow.blocks_json || "[]");
  return new Set(blocks.map((block) => String(block.id || "")).filter(Boolean));
}

function extractKeyPhrase(text, maxWords) {
  const words = normalizeText(text).split(" ").filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function generateIdeaSummary({ title, blocks, category, status }) {
  const blockText = Array.isArray(blocks)
    ? blocks
        .map((block) => (block.type === "checklist" ? (block.checked ? `[x] ${block.content}` : `[ ] ${block.content}`) : block.content))
        .join(" ")
    : "";
  const phrase = extractKeyPhrase(blockText, 14);
  const fallback = extractKeyPhrase(title, 10) || "새 아이디어 구상 중";
  const core = phrase || fallback;
  return `${core}. [${normalizeText(category) || "미분류"}/${normalizeText(status) || "seed"}]`;
}

function formatNotificationMessage(eventType, payload) {
  const data = payload || {};
  switch (eventType) {
    case "idea.created":
      return `새 아이디어 등록: ${data.title || "(제목 없음)"}`;
    case "idea.updated":
      return `아이디어 업데이트: ${data.title || "(제목 없음)"}`;
    case "idea.deleted":
      return `아이디어 삭제: ${data.title || "(제목 없음)"}`;
    case "comment.created":
      return data.blockId ? `인라인 코멘트 등록 (${data.blockId})` : "새 댓글 등록";
    case "thread.created":
      return `토론 스레드 생성: ${data.title || "(제목 없음)"}`;
    case "thread.updated":
      return `토론 스레드 업데이트 (${threadStatusLabel(data.status || "active")})`;
    case "thread.comment.created":
      return "토론 스레드에 새 댓글";
    case "vote.created":
    case "vote.updated":
      return `투표 반영 (${voteTypeLabel(data.voteType)})`;
    case "reaction.added":
      return `리액션 추가 ${data.emoji || ""}`;
    case "reaction.removed":
      return `리액션 제거 ${data.emoji || ""}`;
    case "version.created":
      return `기획서 버전 등록: ${data.versionLabel || "새 버전"}`;
    case "mention.created":
      return data.targetName
        ? `${data.actorName || "누군가"}님이 ${data.targetName}님을 멘션했습니다`
        : `${data.actorName || "누군가"}님이 나를 멘션했습니다`;
    case "summary.generated":
      return "AI 요약 생성 완료";
    case "integration.webhook.updated":
      return `웹훅 설정 업데이트 (${data.platform || "플랫폼"})`;
    default:
      return notificationTypeLabel(eventType);
  }
}

function extractMentionTokens(content) {
  const text = normalizeText(content || "");
  const matches = text.match(/@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g) || [];
  return [...new Set(matches.map((item) => item.slice(1).toLowerCase()))];
}

function resolveMentionTargets(teamId, tokens) {
  if (!tokens.length) {
    return [];
  }
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM workspace_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ?`
    )
    .all(teamId);

  return members.filter((member) => {
    const emailToken = String(member.email || "").toLowerCase();
    const nameToken = normalizeText(member.name || "").replace(/\s+/g, "").toLowerCase();
    return tokens.includes(emailToken) || (nameToken && tokens.includes(nameToken));
  });
}

function emitMentionEvents({ teamId, ideaId, actorUserId, content, sourceType, sourceId }) {
  const tokens = extractMentionTokens(content);
  const targets = resolveMentionTargets(teamId, tokens).filter((member) => member.id !== actorUserId);
  if (!targets.length) {
    return;
  }
  const actor = db.prepare("SELECT name FROM users WHERE id = ?").get(actorUserId);
  const actorName = actor?.name || "누군가";

  targets.forEach((target) => {
    recordTeamEvent(teamId, ideaId, actorUserId, "mention.created", {
      targetUserId: target.id,
      targetName: target.name,
      actorName,
      sourceType,
      sourceId
    });
  });
}

function mentionTargetUserId(payload) {
  const targetUserId = Number(payload?.targetUserId);
  if (!Number.isFinite(targetUserId)) {
    return null;
  }
  return targetUserId;
}

function isNotificationVisibleToUser(userId, eventType, payload) {
  if (eventType !== "mention.created") {
    return true;
  }
  return mentionTargetUserId(payload) === Number(userId);
}

function getMutedTypesForUser(userId) {
  const row = db.prepare("SELECT muted_types_json FROM notification_preferences WHERE user_id = ?").get(userId);
  if (!row) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.muted_types_json || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch (error) {
    void error;
    return [];
  }
}

function isMutedForUser(userId, eventType) {
  return getMutedTypesForUser(userId).includes(eventType);
}

function teamStreamSet(teamId) {
  if (!streamClients.has(teamId)) {
    streamClients.set(teamId, new Map());
  }
  return streamClients.get(teamId);
}

function broadcastTeamNotification(teamId, notification) {
  const clients = streamClients.get(teamId);
  if (!clients || !clients.size) {
    return;
  }

  const line = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  clients.forEach((client) => {
    if (!isNotificationVisibleToUser(client.userId, notification.type, notification.payload)) {
      return;
    }
    if (isMutedForUser(client.userId, notification.type)) {
      return;
    }
    try {
      client.controller.enqueue(encoder.encode(line));
    } catch (error) {
      void error;
    }
  });
}

function toNotificationPayload(row) {
  const payload = JSON.parse(row.payload_json || "{}");
  return {
    id: row.id,
    teamId: row.team_id,
    ideaId: row.idea_id,
    userId: row.user_id,
    type: row.event_type,
    payload,
    actor: row.user_name || "시스템",
    createdAt: row.created_at,
    message: formatNotificationMessage(row.event_type, payload),
    read: Boolean(row.read_at)
  };
}

function isValidWebhookUrl(platform, value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") {
      return false;
    }
    if (platform === "slack") {
      return url.hostname.includes("slack.com");
    }
    if (platform === "discord") {
      return url.hostname.includes("discord.com") || url.hostname.includes("discordapp.com");
    }
    return false;
  } catch (error) {
    void error;
    return false;
  }
}

function formatWebhookMessage(notification) {
  const message = notification.message || notification.type;
  const actor = notification.actor || "시스템";
  return `[Mumur] ${message} | actor: ${actor}`;
}

async function postWebhook(webhook, notification) {
  const payload = webhook.platform === "slack" ? { text: formatWebhookMessage(notification) } : { content: formatWebhookMessage(notification) };
  const response = await fetch(webhook.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`웹훅 요청 실패: ${response.status}`);
  }
}

async function processWebhookQueue() {
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
    .all(now);

  for (const delivery of deliveries) {
    const payload = JSON.parse(delivery.payload_json || "{}");
    const actorRow = delivery.user_id ? db.prepare("SELECT name FROM users WHERE id = ?").get(delivery.user_id) : null;
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
      if (attempts >= delivery.max_attempts) {
        db.prepare("UPDATE webhook_deliveries SET status = 'failed', attempts = ?, updated_at = ?, last_error = ? WHERE id = ?").run(
          attempts,
          Date.now(),
          String(error.message || error),
          delivery.id
        );
      } else {
        const backoffMs = Math.min(600000, 1000 * 2 ** (attempts - 1));
        db.prepare(
          "UPDATE webhook_deliveries SET status = 'retry', attempts = ?, updated_at = ?, next_attempt_at = ?, last_error = ? WHERE id = ?"
        ).run(attempts, Date.now(), Date.now() + backoffMs, String(error.message || error), delivery.id);
      }
    }
  }
}

function ensureWebhookWorker() {
  if (globalRef.__mumurWebhookWorker) {
    return;
  }
  globalRef.__mumurWebhookWorker = setInterval(() => {
    processWebhookQueue().catch((error) => {
      void error;
    });
  }, 4000);
  globalRef.__mumurWebhookWorker.unref?.();
}

function enqueueWebhookDeliveries(teamId, eventId) {
  const hooks = db.prepare("SELECT * FROM workspace_webhooks WHERE team_id = ? AND enabled = 1 ORDER BY id ASC").all(teamId);
  if (!hooks.length) {
    return;
  }

  const now = Date.now();
  hooks.forEach((hook) => {
    db.prepare(
      "INSERT OR IGNORE INTO webhook_deliveries (webhook_id, event_id, status, attempts, max_attempts, next_attempt_at, last_error, created_at, updated_at, delivered_at) VALUES (?, ?, 'pending', 0, 5, ?, NULL, ?, ?, NULL)"
    ).run(hook.id, eventId, now, now, now);
  });

  ensureWebhookWorker();
  processWebhookQueue().catch((error) => {
    void error;
  });
}

function recordTeamEvent(teamId, ideaId, userId, eventType, payload) {
  const createdAt = Date.now();
  const result = db
    .prepare("INSERT INTO events (team_id, idea_id, user_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(teamId, ideaId, userId, eventType, JSON.stringify(payload || {}), createdAt);

  const actor = userId ? db.prepare("SELECT name FROM users WHERE id = ?").get(userId)?.name || "시스템" : "시스템";
  const notification = {
    id: Number(result.lastInsertRowid),
    teamId,
    ideaId,
    userId,
    type: eventType,
    payload: payload || {},
    actor,
    createdAt,
    message: formatNotificationMessage(eventType, payload || {}),
    read: false
  };

  broadcastTeamNotification(teamId, notification);
  enqueueWebhookDeliveries(teamId, Number(result.lastInsertRowid));
}

function buildVoteSummary(ideaId, userId) {
  const binaryRows = db
    .prepare("SELECT vote_value, COUNT(*) AS count FROM votes WHERE idea_id = ? AND vote_type = ? GROUP BY vote_value")
    .all(ideaId, VOTE_TYPES.binary);

  let approve = 0;
  let reject = 0;
  binaryRows.forEach((row) => {
    if (row.vote_value > 0) {
      approve = row.count;
    } else if (row.vote_value < 0) {
      reject = row.count;
    }
  });

  const scoreRows = db
    .prepare(
      "SELECT vote_value, COUNT(*) AS count FROM votes WHERE idea_id = ? AND vote_type = ? GROUP BY vote_value ORDER BY vote_value ASC"
    )
    .all(ideaId, VOTE_TYPES.score);

  const scoreDistribution = [1, 2, 3, 4, 5].map((score) => {
    const found = scoreRows.find((row) => row.vote_value === score);
    return { score, count: found ? found.count : 0 };
  });

  const scoreTotal = scoreDistribution.reduce((sum, item) => sum + item.count, 0);
  const weighted = scoreDistribution.reduce((sum, item) => sum + item.score * item.count, 0);
  const scoreAverage = scoreTotal ? Number((weighted / scoreTotal).toFixed(2)) : 0;

  const mineRows = db.prepare("SELECT vote_type, vote_value FROM votes WHERE idea_id = ? AND user_id = ?").all(ideaId, userId);
  const mine = { binary: null, score: null };
  mineRows.forEach((row) => {
    if (row.vote_type === VOTE_TYPES.binary) {
      mine.binary = row.vote_value > 0 ? "approve" : "reject";
    }
    if (row.vote_type === VOTE_TYPES.score) {
      mine.score = row.vote_value;
    }
  });

  return {
    binary: { approve, reject, total: approve + reject },
    score: { average: scoreAverage, total: scoreTotal, distribution: scoreDistribution },
    mine
  };
}

function getSessionToken(request) {
  const tokenFromRequest = request.cookies?.get?.(SESSION_COOKIE)?.value;
  if (tokenFromRequest) {
    return tokenFromRequest;
  }
  const parsed = parseCookieHeader(request.headers.get("cookie") || "");
  return parsed[SESSION_COOKIE] || null;
}

function authContext(request) {
  clearExpiredSessions(db);
  const token = getSessionToken(request);
  if (!token) {
    return null;
  }

  const session = db
    .prepare(
      "SELECT s.id, s.user_id, s.team_id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
    )
    .get(token, Date.now());

  if (!session) {
    return null;
  }

  return {
    session: { id: session.id, userId: session.user_id, teamId: session.team_id },
    user: { id: session.user_id, name: session.name, email: session.email }
  };
}

function getTeamMembership(teamId, userId) {
  return db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(teamId, userId) || null;
}

function isTeamOwner(teamId, userId) {
  const membership = getTeamMembership(teamId, userId);
  return membership?.role === "owner";
}

function ownerCount(teamId) {
  return db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE team_id = ? AND role = 'owner'").get(teamId).count;
}

function toInvitationPayload(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role,
    status: row.status,
    message: row.message,
    invitedBy: row.invited_by,
    invitedByName: row.inviter_name,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolver_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function withSessionCookie(response, token, expiresAt) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    expires: new Date(expiresAt),
    path: "/"
  });
  return response;
}

function clearSessionCookie(response) {
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }
  return request.json().catch(() => ({}));
}

function uploadDestination() {
  const cwd = process.cwd();
  const dest = path.resolve(cwd, "public", "uploads");
  ensureDir(dest);
  return dest;
}

async function handleRequest(request, slug, method) {
  const s = slug || [];

  if (s.length === 1 && s[0] === "health" && method === "GET") {
    return json({ ok: true, now: Date.now() });
  }

  if (s[0] === "auth" && s[1] === "register" && method === "POST") {
    const body = await readJsonBody(request);
    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const password = String(body.password || "");
    const teamName = normalizeText(body.teamName);

    if (!name || !email || password.length < 6 || !teamName) {
      return json({ error: "이름, 이메일, 비밀번호(6자 이상), 팀 이름은 필수입니다" }, 400);
    }
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return json({ error: "이미 가입된 이메일입니다" }, 409);
    }

    const now = Date.now();
    const passwordHash = hashPassword(password);
    const created = db.transaction(() => {
      const userResult = db
        .prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(name, email, passwordHash, now);
      const userId = Number(userResult.lastInsertRowid);
      const teamResult = db.prepare("INSERT INTO workspaces (name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(teamName, userId, now, now);
      const teamId = Number(teamResult.lastInsertRowid);
      db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(teamId, userId, "owner", now);
      recordTeamEvent(teamId, null, userId, "workspace.created", { teamName });
      return { userId, teamId };
    })();

    const session = createSession(db, created.userId, created.teamId);
    const response = json({ user: { id: created.userId, name, email }, workspace: { id: created.teamId, name: teamName } }, 201);
    return withSessionCookie(response, session.token, session.expiresAt);
  }

  if (s[0] === "auth" && s[1] === "login" && method === "POST") {
    const body = await readJsonBody(request);
    const email = normalizeText(body.email).toLowerCase();
    const password = String(body.password || "");

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
    }

    const team = pickTeamForUser(user.id);
    if (!team) {
      return json({ error: "소속된 팀이 없습니다" }, 403);
    }

    const session = createSession(db, user.id, team.teamId);
    const response = json({
      user: { id: user.id, name: user.name, email: user.email },
      workspace: { id: team.teamId, name: team.teamName }
    });
    return withSessionCookie(response, session.token, session.expiresAt);
  }

  if (s[0] === "auth" && s[1] === "logout" && method === "POST") {
    const token = getSessionToken(request);
    if (token) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    }
    return clearSessionCookie(json({ ok: true }));
  }

  const ctx = authContext(request);
  if (!ctx) {
    return json({ error: "인증이 필요합니다" }, 401);
  }

  if (s[0] === "auth" && s[1] === "me" && method === "GET") {
    const workspace = db
      .prepare(
        `SELECT t.id, t.name, t.owner_id, t.icon, t.color,
                tm.role AS my_role
         FROM workspaces t
         LEFT JOIN workspace_members tm ON tm.team_id = t.id AND tm.user_id = ?
         WHERE t.id = ?`
      )
      .get(ctx.user.id, ctx.session.teamId);
    return json({ user: ctx.user, workspace });
  }

  if (s[0] === "workspaces" && s.length === 1 && method === "GET") {
     const workspaces = db
      .prepare(
        `SELECT t.id, t.name, t.owner_id, t.icon, t.color,
                tm.role,
                tm.created_at
         FROM workspace_members tm
         JOIN workspaces t ON t.id = tm.team_id
         WHERE tm.user_id = ?
         ORDER BY tm.created_at ASC`
      )
      .all(ctx.user.id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        color: row.color,
        ownerId: row.owner_id,
        role: row.role,
        joinedAt: row.created_at,
        active: row.id === ctx.session.teamId
      }));
    return json({ workspaces });
  }

  if (s[0] === "workspaces" && s.length === 1 && method === "POST") {
    const body = await readJsonBody(request);
    const teamName = normalizeText(body.teamName);
    if (!teamName) {
      return json({ error: "팀 이름은 필수입니다" }, 400);
    }
    const now = Date.now();
    const teamResult = db.prepare("INSERT INTO workspaces (name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(teamName, ctx.user.id, now, now);
    const teamId = Number(teamResult.lastInsertRowid);
    db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(teamId, ctx.user.id, "owner", now);
    db.prepare("UPDATE sessions SET team_id = ? WHERE id = ?").run(teamId, ctx.session.id);
    recordTeamEvent(teamId, null, ctx.user.id, "workspace.created", { teamName });
    return json({ workspace: { id: teamId, name: teamName } }, 201);
  }

  if (s[0] === "workspaces" && s[1] && s.length === 2 && method === "PUT") {
    const workspaceId = Number(s[1]);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      return json({ error: "유효하지 않은 워크스페이스 ID입니다" }, 400);
    }
    const ws = db.prepare("SELECT id, owner_id FROM workspaces WHERE id = ?").get(workspaceId);
    if (!ws) return json({ error: "워크스페이스를 찾을 수 없습니다" }, 404);
    if (ws.owner_id !== ctx.user.id) return json({ error: "소유자만 수정할 수 있습니다" }, 403);
    const body = await readJsonBody(request);
    const name = normalizeText(body.name);
    const icon = String(body.icon || "📁").slice(0, 8);
    const color = String(body.color || "#6366f1").slice(0, 20);
    if (!name) return json({ error: "이름은 필수입니다" }, 400);
    const now = Date.now();
    db.prepare("UPDATE workspaces SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?").run(name, icon, color, now, workspaceId);
    const updated = db.prepare("SELECT id, name, icon, color, owner_id FROM workspaces WHERE id = ?").get(workspaceId);
    recordTeamEvent(workspaceId, null, ctx.user.id, "workspace.updated", { name });
    return json({ workspace: updated });
  }

  if (s[0] === "workspaces" && s[1] && s.length === 2 && method === "DELETE") {
    const workspaceId = Number(s[1]);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      return json({ error: "유효하지 않은 워크스페이스 ID입니다" }, 400);
    }
    const ws = db.prepare("SELECT id, owner_id FROM workspaces WHERE id = ?").get(workspaceId);
    if (!ws) return json({ error: "워크스페이스를 찾을 수 없습니다" }, 404);
    if (ws.owner_id !== ctx.user.id) return json({ error: "소유자만 삭제할 수 있습니다" }, 403);
    const wsCount = db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE user_id = ?").get(ctx.user.id).count;
    if (wsCount <= 1) return json({ error: "마지막 워크스페이스는 삭제할 수 없습니다" }, 400);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
    const remaining = db.prepare("SELECT wm.team_id FROM workspace_members wm WHERE wm.user_id = ? LIMIT 1").get(ctx.user.id);
    if (remaining) {
      db.prepare("UPDATE sessions SET team_id = ? WHERE id = ?").run(remaining.team_id, ctx.session.id);
    }
    return json({ ok: true });
  }

  if (s[0] === "workspaces" && s[1] === "switch" && method === "POST") {
    const body = await readJsonBody(request);
    const teamId = Number(body.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return json({ error: "유효하지 않은 팀 ID입니다" }, 400);
    }
    const membership = db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(teamId, ctx.user.id);
    if (!membership) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    db.prepare("UPDATE sessions SET team_id = ? WHERE id = ?").run(teamId, ctx.session.id);
    const team = db.prepare("SELECT id, name, owner_id FROM workspaces WHERE id = ?").get(teamId);
    return json({ workspace: { id: team.id, name: team.name, ownerId: team.owner_id, role: membership.role } });
  }

  if (s[0] === "workspace" && s[1] === "members" && s.length === 2 && method === "GET") {
    const members = db
      .prepare(
        `SELECT tm.team_id, tm.user_id, tm.role, tm.created_at,
                u.name, u.email
         FROM workspace_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ?
         ORDER BY CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END, tm.created_at ASC`
      )
      .all(ctx.session.teamId)
      .map((row) => ({
        teamId: row.team_id,
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        joinedAt: row.created_at,
        isMe: row.user_id === ctx.user.id
      }));

    return json({
      members,
      me: {
        userId: ctx.user.id,
        isOwner: isTeamOwner(ctx.session.teamId, ctx.user.id)
      }
    });
  }

  if (s[0] === "workspace" && s[1] === "members" && s.length === 2 && method === "POST") {
    if (!isTeamOwner(ctx.session.teamId, ctx.user.id)) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const body = await readJsonBody(request);
    const email = normalizeText(body.email).toLowerCase();
    const role = normalizeText(body.role) || "member";
    if (!email) {
      return json({ error: "이메일은 필수입니다" }, 400);
    }
    if (!TEAM_ROLES.includes(role)) {
      return json({ error: "유효하지 않은 역할입니다" }, 400);
    }
    const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);
    if (!user) {
      return json({ error: "사용자를 찾을 수 없습니다" }, 404);
    }
    const existing = db.prepare("SELECT user_id FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, user.id);
    if (existing) {
      return json({ error: "이미 팀에 속한 사용자입니다" }, 409);
    }
    db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
      ctx.session.teamId,
      user.id,
      role,
      Date.now()
    );
    recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.member.added", { invitedUserId: user.id, role });
    return json({
      member: {
        teamId: ctx.session.teamId,
        userId: user.id,
        name: user.name,
        email: user.email,
        role,
        isMe: user.id === ctx.user.id
      }
    }, 201);
  }

  if (s[0] === "workspace" && s[1] === "members" && s[2] && method === "PUT") {
    if (!isTeamOwner(ctx.session.teamId, ctx.user.id)) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const targetUserId = Number(s[2]);
    const target = db.prepare("SELECT user_id, role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, targetUserId);
    if (!target) {
      return json({ error: "멤버를 찾을 수 없습니다" }, 404);
    }
    const body = await readJsonBody(request);
    const nextRole = normalizeText(body.role);
    if (!TEAM_ROLES.includes(nextRole)) {
      return json({ error: "유효하지 않은 역할입니다" }, 400);
    }
    if (target.role === "owner" && nextRole !== "owner" && ownerCount(ctx.session.teamId) <= 1) {
      return json({ error: "팀에는 최소 1명의 소유자가 필요합니다" }, 400);
    }
    db.prepare("UPDATE workspace_members SET role = ? WHERE team_id = ? AND user_id = ?").run(nextRole, ctx.session.teamId, targetUserId);
    recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.member.role.updated", { targetUserId, role: nextRole });
    return json({ ok: true });
  }

  if (s[0] === "workspace" && s[1] === "members" && s[2] && method === "DELETE") {
    if (!isTeamOwner(ctx.session.teamId, ctx.user.id)) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const targetUserId = Number(s[2]);
    const target = db.prepare("SELECT user_id, role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, targetUserId);
    if (!target) {
      return json({ error: "멤버를 찾을 수 없습니다" }, 404);
    }
    if (target.user_id === ctx.user.id) {
      return json({ error: "소유자는 자신을 제거할 수 없습니다" }, 400);
    }
    if (target.role === "owner" && ownerCount(ctx.session.teamId) <= 1) {
      return json({ error: "팀에는 최소 1명의 소유자가 필요합니다" }, 400);
    }
    db.prepare("DELETE FROM workspace_members WHERE team_id = ? AND user_id = ?").run(ctx.session.teamId, targetUserId);
    recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.member.removed", { targetUserId });
    return json({ ok: true });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s.length === 2 && method === "GET") {
    const rows = db
      .prepare(
        `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name
         FROM workspace_invitations i
         JOIN users inviter ON inviter.id = i.invited_by
         LEFT JOIN users resolver ON resolver.id = i.resolved_by
         WHERE i.team_id = ?
         ORDER BY i.updated_at DESC`
      )
      .all(ctx.session.teamId);
    return json({ invitations: rows.map(toInvitationPayload) });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s.length === 2 && method === "POST") {
    if (!isTeamOwner(ctx.session.teamId, ctx.user.id)) {
      return json({ error: "권한이 없습니다" }, 403);
    }

    const body = await readJsonBody(request);
    const email = normalizeText(body.email).toLowerCase();
    const role = normalizeText(body.role) || "member";
    if (!email) {
      return json({ error: "이메일은 필수입니다" }, 400);
    }
    if (!TEAM_ROLES.includes(role)) {
      return json({ error: "유효하지 않은 역할입니다" }, 400);
    }

    const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);
    let status = "pending";
    let message = "아직 가입하지 않은 이메일입니다. 가입 후 재시도로 멤버 추가를 완료하세요.";
    let resolvedBy = null;

    if (user) {
      const existingMember = db.prepare("SELECT user_id FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, user.id);
      if (existingMember) {
        status = "accepted";
        message = "이미 팀 멤버입니다.";
        resolvedBy = ctx.user.id;
      } else {
        db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
          ctx.session.teamId,
          user.id,
          role,
          Date.now()
        );
        recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.member.added", { invitedUserId: user.id, role });
        status = "accepted";
        message = "가입된 사용자를 팀에 즉시 추가했습니다.";
        resolvedBy = ctx.user.id;
      }
    }

    const now = Date.now();
    const existingInvite = db.prepare("SELECT id FROM workspace_invitations WHERE team_id = ? AND email = ?").get(ctx.session.teamId, email);
    if (existingInvite) {
      db.prepare(
        "UPDATE workspace_invitations SET role = ?, status = ?, message = ?, invited_by = ?, resolved_by = ?, updated_at = ? WHERE id = ?"
      ).run(role, status, message, ctx.user.id, resolvedBy, now, existingInvite.id);
    } else {
      db.prepare(
        "INSERT INTO workspace_invitations (team_id, email, role, status, message, invited_by, resolved_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(ctx.session.teamId, email, role, status, message, ctx.user.id, resolvedBy, now, now);
    }

    const invitation = db
      .prepare(
        `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name
         FROM workspace_invitations i
         JOIN users inviter ON inviter.id = i.invited_by
         LEFT JOIN users resolver ON resolver.id = i.resolved_by
         WHERE i.team_id = ? AND i.email = ?`
      )
      .get(ctx.session.teamId, email);

    return json({ invitation: toInvitationPayload(invitation) }, 201);
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] && s[3] === "retry" && method === "POST") {
    if (!isTeamOwner(ctx.session.teamId, ctx.user.id)) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const invitationId = Number(s[2]);
    const invitation = db
      .prepare("SELECT * FROM workspace_invitations WHERE id = ? AND team_id = ?")
      .get(invitationId, ctx.session.teamId);
    if (!invitation) {
      return json({ error: "초대 정보를 찾을 수 없습니다" }, 404);
    }
    if (invitation.status === "cancelled") {
      return json({ error: "취소된 초대는 재시도할 수 없습니다" }, 400);
    }

    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(invitation.email);
    let status = "pending";
    let message = "아직 가입하지 않은 이메일입니다. 가입 후 다시 재시도하세요.";
    let resolvedBy = null;

    if (user) {
      const existingMember = db.prepare("SELECT user_id FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, user.id);
      if (!existingMember) {
        db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
          ctx.session.teamId,
          user.id,
          invitation.role,
          Date.now()
        );
        recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.member.added", { invitedUserId: user.id, role: invitation.role });
        message = "재시도 성공: 사용자를 팀 멤버로 추가했습니다.";
      } else {
        message = "이미 팀 멤버입니다.";
      }
      status = "accepted";
      resolvedBy = ctx.user.id;
    }

    db.prepare("UPDATE workspace_invitations SET status = ?, message = ?, resolved_by = ?, updated_at = ? WHERE id = ?").run(
      status,
      message,
      resolvedBy,
      Date.now(),
      invitationId
    );

    const updated = db
      .prepare(
        `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name
         FROM workspace_invitations i
         JOIN users inviter ON inviter.id = i.invited_by
         LEFT JOIN users resolver ON resolver.id = i.resolved_by
         WHERE i.id = ?`
      )
      .get(invitationId);
    return json({ invitation: toInvitationPayload(updated) });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] && method === "DELETE") {
    if (!isTeamOwner(ctx.session.teamId, ctx.user.id)) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const invitationId = Number(s[2]);
    const invitation = db
      .prepare("SELECT id FROM workspace_invitations WHERE id = ? AND team_id = ?")
      .get(invitationId, ctx.session.teamId);
    if (!invitation) {
      return json({ error: "초대 정보를 찾을 수 없습니다" }, 404);
    }
    db.prepare("UPDATE workspace_invitations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), invitationId);
    return json({ ok: true });
  }

  if (s[0] === "dashboard" && s[1] === "summary" && method === "GET") {
    const teamId = ctx.session.teamId;
    const now = Date.now();
    const sevenDaysAgo = now - 1000 * 60 * 60 * 24 * 7;

    const totalIdeas = db.prepare("SELECT COUNT(*) AS count FROM ideas WHERE team_id = ?").get(teamId).count;
    const totalComments = db
      .prepare("SELECT COUNT(*) AS count FROM comments c JOIN ideas i ON i.id = c.idea_id WHERE i.team_id = ?")
      .get(teamId).count;
    const totalThreads = db.prepare("SELECT COUNT(*) AS count FROM discussion_threads WHERE team_id = ?").get(teamId).count;

    const statusRows = db.prepare("SELECT status, COUNT(*) AS count FROM ideas WHERE team_id = ? GROUP BY status").all(teamId);
    const statusCounts = Object.fromEntries(IDEA_STATUS.map((key) => [key, 0]));
    statusRows.forEach((row) => {
      statusCounts[row.status] = row.count;
    });

    const topCategories = db
      .prepare(
        "SELECT category, COUNT(*) AS count FROM ideas WHERE team_id = ? GROUP BY category ORDER BY count DESC, category ASC LIMIT 5"
      )
      .all(teamId)
      .map((row) => ({ category: row.category, count: row.count }));

    const recentActivity = db
      .prepare(
        "SELECT event_type, COUNT(*) AS count FROM events WHERE team_id = ? AND created_at >= ? GROUP BY event_type ORDER BY count DESC LIMIT 8"
      )
      .all(teamId, sevenDaysAgo)
      .map((row) => ({ type: row.event_type, count: row.count }));

    return json({
      metrics: {
        totalIdeas,
        totalComments,
        totalThreads,
        activeIdeas: statusCounts.seed + statusCounts.sprout + statusCounts.grow
      },
      statusCounts,
      topCategories,
      recentActivity
    });
  }

  if (s[0] === "ideas" && s.length === 1 && method === "GET") {
    const url = new URL(request.url);
    const statusFilter = normalizeText(url.searchParams.get("status"));
    const categoryFilter = normalizeText(url.searchParams.get("category"));
    const query = normalizeText(url.searchParams.get("query"));

    const where = ["i.team_id = ?"];
    const params = [ctx.session.teamId];
    if (statusFilter && IDEA_STATUS.includes(statusFilter as typeof IDEA_STATUS[number])) {
      where.push("i.status = ?");
      params.push(statusFilter);
    }
    if (categoryFilter) {
      where.push("i.category = ?");
      params.push(categoryFilter);
    }
    if (query) {
      where.push("(i.title LIKE ? OR i.category LIKE ? OR IFNULL(i.ai_summary, '') LIKE ?)");
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    const rows = db
      .prepare(
        `SELECT i.*, u.name AS author_name,
                (SELECT COUNT(*) FROM comments c WHERE c.idea_id = i.id) AS comment_count,
                (SELECT COUNT(*) FROM reactions r WHERE r.idea_id = i.id) AS reaction_count,
                (SELECT COUNT(*) FROM idea_versions v WHERE v.idea_id = i.id) AS version_count
         FROM ideas i JOIN users u ON u.id = i.author_id
         WHERE ${where.join(" AND ")}
         ORDER BY i.updated_at DESC`
      )
      .all(...params);

    return json({
      ideas: rows.map((row) => ({
        ...toIdeaPayload(row),
        authorName: row.author_name,
        commentCount: row.comment_count,
        reactionCount: row.reaction_count,
        versionCount: row.version_count
      }))
    });
  }

  if (s[0] === "ideas" && s.length === 1 && method === "POST") {
    const body = await readJsonBody(request);
    const title = normalizeText(body.title);
    const category = normalizeText(body.category) || "general";
    const status = normalizeText(body.status) || "seed";
    const blocks = parseBlocks(body.blocks);
    if (!title) {
      return json({ error: "제목은 필수입니다" }, 400);
    }
    if (!(IDEA_STATUS as readonly string[]).includes(status)) {
      return json({ error: "유효하지 않은 상태입니다" }, 400);
    }
    const now = Date.now();
    const result = db
      .prepare(
        "INSERT INTO ideas (team_id, author_id, title, category, status, blocks_json, ai_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(ctx.session.teamId, ctx.user.id, title, category, status, JSON.stringify(blocks), null, now, now);
    const ideaId = Number(result.lastInsertRowid);
    recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.created", { title, status, category });
    return json({ idea: toIdeaPayload(getIdeaForTeam(ideaId, ctx.session.teamId)) }, 201);
  }

  if (s[0] === "ideas" && s[1]) {
    const ideaId = Number(s[1]);
    const idea = getIdeaForTeam(ideaId, ctx.session.teamId);
    if (!idea) {
      return json({ error: "아이디어를 찾을 수 없습니다" }, 404);
    }

    if (s.length === 2 && method === "GET") {
      return json({ idea: toIdeaPayload(idea) });
    }

    if (s.length === 2 && method === "PUT") {
      const body = await readJsonBody(request);
      const title = normalizeText(body.title) || idea.title;
      const category = normalizeText(body.category) || idea.category;
      const status = normalizeText(body.status) || idea.status;
      const blocks = parseBlocks(body.blocks);
    const ideaStatuses: readonly string[] = IDEA_STATUS;
    if (!ideaStatuses.includes(status)) {
      return json({ error: "유효하지 않은 상태입니다" }, 400);
      }
      db.prepare("UPDATE ideas SET title = ?, category = ?, status = ?, blocks_json = ?, updated_at = ? WHERE id = ?").run(
        title,
        category,
        status,
        JSON.stringify(blocks),
        Date.now(),
        ideaId
      );
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.updated", { title, status, category });
      return json({ idea: toIdeaPayload(getIdeaForTeam(ideaId, ctx.session.teamId)) });
    }

    if (s.length === 2 && method === "DELETE") {
      db.prepare("DELETE FROM ideas WHERE id = ?").run(ideaId);
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.deleted", { title: idea.title });
      return json({ ok: true });
    }

    if (s[2] === "comments" && method === "GET") {
      const url = new URL(request.url);
      const blockIdFilter = normalizeText(url.searchParams.get("blockId"));
      const query = blockIdFilter
        ? "SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.idea_id = ? AND c.block_id = ? ORDER BY c.created_at ASC"
        : "SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.idea_id = ? ORDER BY c.created_at ASC";
      const params = blockIdFilter ? [ideaId, blockIdFilter] : [ideaId];
      const comments = db
        .prepare(query)
        .all(...params)
        .map((row) => ({
          id: row.id,
          ideaId: row.idea_id,
          userId: row.user_id,
          userName: row.user_name,
          parentId: row.parent_id,
          blockId: row.block_id,
          content: row.content,
          createdAt: row.created_at,
          isInline: Boolean(row.block_id)
        }));
      return json({ comments });
    }

    if (s[2] === "comments" && method === "POST") {
      const body = await readJsonBody(request);
      const content = normalizeText(body.content);
      const parentId = body.parentId ? Number(body.parentId) : null;
      const blockId = normalizeText(body.blockId) || null;
      if (!content) {
      return json({ error: "내용은 필수입니다" }, 400);
      }
      if (parentId) {
        const parent = db.prepare("SELECT id, idea_id FROM comments WHERE id = ? AND idea_id = ?").get(parentId, ideaId);
        if (!parent) {
      return json({ error: "유효하지 않은 상위 댓글 ID입니다" }, 400);
        }
      }
      if (blockId) {
        const ids = ideaBlockIds(idea);
        if (!ids.has(blockId)) {
      return json({ error: "유효하지 않은 블록 ID입니다" }, 400);
        }
      }
      const result = db
        .prepare("INSERT INTO comments (idea_id, user_id, parent_id, block_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(ideaId, ctx.user.id, parentId, blockId, content, Date.now());
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "comment.created", { blockId, parentId });
      const created = db
        .prepare("SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ? LIMIT 1")
        .get(result.lastInsertRowid);
      emitMentionEvents({
        teamId: ctx.session.teamId,
        ideaId,
        actorUserId: ctx.user.id,
        content,
        sourceType: "idea.comment",
        sourceId: created.id
      });
      return json(
        {
          comment: {
            id: created.id,
            ideaId: created.idea_id,
            userId: created.user_id,
            userName: created.user_name,
            parentId: created.parent_id,
            blockId: created.block_id,
            content: created.content,
            createdAt: created.created_at,
            isInline: Boolean(created.block_id)
          }
        },
        201
      );
    }

    if (s[2] === "reactions" && method === "GET") {
      const reactions = db
        .prepare("SELECT emoji, COUNT(*) AS count FROM reactions WHERE idea_id = ? GROUP BY emoji ORDER BY count DESC, emoji ASC")
        .all(ideaId)
        .map((row) => ({ emoji: row.emoji, count: row.count }));
      const mine = db
        .prepare("SELECT emoji FROM reactions WHERE idea_id = ? AND user_id = ?")
        .all(ideaId, ctx.user.id)
        .map((row) => row.emoji);
      return json({ reactions, mine });
    }

    if (s[2] === "reactions" && method === "POST") {
      const body = await readJsonBody(request);
      const emoji = normalizeText(body.emoji);
      if (!emoji) {
      return json({ error: "이모지는 필수입니다" }, 400);
      }
      const existing = db.prepare("SELECT id FROM reactions WHERE idea_id = ? AND user_id = ? AND emoji = ?").get(ideaId, ctx.user.id, emoji);
      if (existing) {
        db.prepare("DELETE FROM reactions WHERE id = ?").run(existing.id);
        recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "reaction.removed", { emoji });
        return json({ toggled: false });
      }
      db.prepare("INSERT INTO reactions (idea_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)").run(
        ideaId,
        ctx.user.id,
        emoji,
        Date.now()
      );
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "reaction.added", { emoji });
      return json({ toggled: true }, 201);
    }

    if (s[2] === "versions" && method === "GET") {
      const versions = db
        .prepare(
          "SELECT v.*, u.name AS creator_name FROM idea_versions v JOIN users u ON u.id = v.created_by WHERE v.idea_id = ? ORDER BY v.created_at DESC"
        )
        .all(ideaId)
        .map((row) => ({
          id: row.id,
          ideaId: row.idea_id,
          versionLabel: row.version_label,
          notes: row.notes,
          fileName: row.file_name,
          filePath: row.file_path,
          creatorName: row.creator_name,
          createdBy: row.created_by,
          createdAt: row.created_at
        }));
      return json({ versions });
    }

    if (s[2] === "versions" && method === "POST") {
      const form = await request.formData();
      const label = normalizeText(form.get("versionLabel"));
      const notes = normalizeText(form.get("notes"));
      const file = form.get("file");
      const versionCount = db.prepare("SELECT COUNT(*) AS count FROM idea_versions WHERE idea_id = ?").get(ideaId).count;
      const versionLabel = label || `v${versionCount + 1}.0`;

      let fileName = null;
      let filePath = null;
      if (file && typeof file.arrayBuffer === "function" && file.name) {
        const ext = path.extname(file.name);
        const base = path.basename(file.name, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
        const serverName = `${Date.now()}-${base}${ext}`;
        const uploadDir = uploadDestination();
        const absolute = path.join(uploadDir, serverName);
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(absolute, buffer);
        fileName = file.name;
        filePath = `/uploads/${serverName}`;
      }

      const result = db
        .prepare(
          "INSERT INTO idea_versions (idea_id, version_label, notes, file_name, file_path, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(ideaId, versionLabel, notes, fileName, filePath, ctx.user.id, Date.now());
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "version.created", { versionLabel });
      const created = db
        .prepare("SELECT v.*, u.name AS creator_name FROM idea_versions v JOIN users u ON u.id = v.created_by WHERE v.id = ?")
        .get(result.lastInsertRowid);

      return json(
        {
          version: {
            id: created.id,
            ideaId: created.idea_id,
            versionLabel: created.version_label,
            notes: created.notes,
            fileName: created.file_name,
            filePath: created.file_path,
            creatorName: created.creator_name,
            createdBy: created.created_by,
            createdAt: created.created_at
          }
        },
        201
      );
    }

    if (s[2] === "summary" && method === "POST") {
      const payload = toIdeaPayload(idea);
      const aiSummary = generateIdeaSummary(payload);
      db.prepare("UPDATE ideas SET ai_summary = ?, updated_at = ? WHERE id = ?").run(aiSummary, Date.now(), ideaId);
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "summary.generated", { aiSummary });
      return json({ aiSummary, label: "AI 요약" });
    }

    if (s[2] === "timeline" && method === "GET") {
      const timeline = db
        .prepare(
          "SELECT e.*, u.name AS user_name FROM events e LEFT JOIN users u ON u.id = e.user_id WHERE e.idea_id = ? ORDER BY e.created_at DESC"
        )
        .all(ideaId)
        .map((row) => ({
          id: row.id,
          type: row.event_type,
          payload: JSON.parse(row.payload_json || "{}"),
          actor: row.user_name || "시스템",
          createdAt: row.created_at
        }));
      return json({ timeline });
    }

    if (s[2] === "threads" && s.length === 3 && method === "GET") {
      const rows = db
        .prepare(
          `SELECT t.*, u.name AS creator_name,
                  (SELECT COUNT(*) FROM discussion_comments dc WHERE dc.thread_id = t.id) AS comment_count,
                  (SELECT COUNT(DISTINCT dc.user_id) FROM discussion_comments dc WHERE dc.thread_id = t.id) AS participant_count
           FROM discussion_threads t JOIN users u ON u.id = t.created_by
           WHERE t.idea_id = ? AND t.team_id = ? ORDER BY t.updated_at DESC`
        )
        .all(ideaId, ctx.session.teamId);
      const threads = rows.map((row) => ({
        id: row.id,
        ideaId: row.idea_id,
        teamId: row.team_id,
        title: row.title,
        description: row.description,
        status: row.status,
        conclusion: row.conclusion,
        createdBy: row.created_by,
        creatorName: row.creator_name,
        commentCount: row.comment_count,
        participantCount: row.participant_count + 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
      return json({ threads });
    }

    if (s[2] === "threads" && s.length === 3 && method === "POST") {
      const body = await readJsonBody(request);
      const title = normalizeText(body.title);
      const description = normalizeText(body.description);
      const status = normalizeText(body.status) || "active";
      if (!title) {
      return json({ error: "제목은 필수입니다" }, 400);
      }
      if (!THREAD_STATUS.includes(status)) {
      return json({ error: "유효하지 않은 상태입니다" }, 400);
      }
      const now = Date.now();
      const result = db
        .prepare(
          "INSERT INTO discussion_threads (idea_id, team_id, created_by, title, description, status, conclusion, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(ideaId, ctx.session.teamId, ctx.user.id, title, description, status, "", now, now);
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "thread.created", { title, status });
      const created = getThreadForIdeaTeam(Number(result.lastInsertRowid), ideaId, ctx.session.teamId);
      return json(
        {
          thread: {
            id: created.id,
            ideaId: created.idea_id,
            teamId: created.team_id,
            title: created.title,
            description: created.description,
            status: created.status,
            conclusion: created.conclusion,
            createdBy: created.created_by,
            createdAt: created.created_at,
            updatedAt: created.updated_at
          }
        },
        201
      );
    }

    if (s[2] === "threads" && s[3] && s.length === 4 && method === "PUT") {
      const threadId = Number(s[3]);
      const thread = getThreadForIdeaTeam(threadId, ideaId, ctx.session.teamId);
      if (!thread) {
      return json({ error: "스레드를 찾을 수 없습니다" }, 404);
      }
      const body = await readJsonBody(request);
      const title = normalizeText(body.title) || thread.title;
      const description = normalizeText(body.description) || thread.description || "";
      const status = normalizeText(body.status) || thread.status;
      const conclusion = normalizeText(body.conclusion) || thread.conclusion || "";
      if (!THREAD_STATUS.includes(status)) {
      return json({ error: "유효하지 않은 상태입니다" }, 400);
      }
      db.prepare("UPDATE discussion_threads SET title = ?, description = ?, status = ?, conclusion = ?, updated_at = ? WHERE id = ?").run(
        title,
        description,
        status,
        conclusion,
        Date.now(),
        threadId
      );
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "thread.updated", { threadId, status });
      const updated = getThreadForIdeaTeam(threadId, ideaId, ctx.session.teamId);
      return json({
        thread: {
          id: updated.id,
          ideaId: updated.idea_id,
          teamId: updated.team_id,
          title: updated.title,
          description: updated.description,
          status: updated.status,
          conclusion: updated.conclusion,
          createdBy: updated.created_by,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at
        }
      });
    }

    if (s[2] === "threads" && s[3] && s[4] === "comments" && method === "GET") {
      const threadId = Number(s[3]);
      const thread = getThreadForIdeaTeam(threadId, ideaId, ctx.session.teamId);
      if (!thread) {
      return json({ error: "스레드를 찾을 수 없습니다" }, 404);
      }
      const comments = db
        .prepare(
          "SELECT dc.*, u.name AS user_name FROM discussion_comments dc JOIN users u ON u.id = dc.user_id WHERE dc.thread_id = ? ORDER BY dc.created_at ASC"
        )
        .all(threadId)
        .map((row) => ({
          id: row.id,
          threadId: row.thread_id,
          userId: row.user_id,
          userName: row.user_name,
          content: row.content,
          createdAt: row.created_at
        }));
      return json({ comments });
    }

    if (s[2] === "threads" && s[3] && s[4] === "comments" && method === "POST") {
      const threadId = Number(s[3]);
      const thread = getThreadForIdeaTeam(threadId, ideaId, ctx.session.teamId);
      if (!thread) {
      return json({ error: "스레드를 찾을 수 없습니다" }, 404);
      }
      const body = await readJsonBody(request);
      const content = normalizeText(body.content);
      if (!content) {
      return json({ error: "내용은 필수입니다" }, 400);
      }
      const result = db
        .prepare("INSERT INTO discussion_comments (thread_id, user_id, content, created_at) VALUES (?, ?, ?, ?)")
        .run(threadId, ctx.user.id, content, Date.now());
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "thread.comment.created", { threadId });
      const created = db
        .prepare("SELECT dc.*, u.name AS user_name FROM discussion_comments dc JOIN users u ON u.id = dc.user_id WHERE dc.id = ?")
        .get(result.lastInsertRowid);
      emitMentionEvents({
        teamId: ctx.session.teamId,
        ideaId,
        actorUserId: ctx.user.id,
        content,
        sourceType: "thread.comment",
        sourceId: created.id
      });
      return json(
        {
          comment: {
            id: created.id,
            threadId: created.thread_id,
            userId: created.user_id,
            userName: created.user_name,
            content: created.content,
            createdAt: created.created_at
          }
        },
        201
      );
    }

    if (s[2] === "votes" && method === "GET") {
      return json({ votes: buildVoteSummary(ideaId, ctx.user.id) });
    }

    if (s[2] === "votes" && method === "POST") {
      const body = await readJsonBody(request);
      const voteType = normalizeText(body.voteType);
      const rawValue = body.value;
      if (![VOTE_TYPES.binary, VOTE_TYPES.score].includes(voteType)) {
      return json({ error: "유효하지 않은 투표 유형입니다" }, 400);
      }
      let voteValue = 0;
      if (voteType === VOTE_TYPES.binary) {
        if (rawValue === "approve" || rawValue === 1 || rawValue === "1") {
          voteValue = 1;
        } else if (rawValue === "reject" || rawValue === -1 || rawValue === "-1") {
          voteValue = -1;
        } else {
        return json({ error: "찬반 투표 값이 올바르지 않습니다" }, 400);
        }
      } else {
        const score = Number(rawValue);
        if (!Number.isInteger(score) || score < 1 || score > 5) {
        return json({ error: "점수 투표 값은 1-5 정수여야 합니다" }, 400);
        }
        voteValue = score;
      }
      const existing = db
        .prepare("SELECT id FROM votes WHERE idea_id = ? AND user_id = ? AND vote_type = ?")
        .get(ideaId, ctx.user.id, voteType);
      const now = Date.now();
      if (existing) {
        db.prepare("UPDATE votes SET vote_value = ?, updated_at = ? WHERE id = ?").run(voteValue, now, existing.id);
        recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "vote.updated", { voteType, voteValue });
      } else {
        db.prepare("INSERT INTO votes (idea_id, user_id, vote_type, vote_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          ideaId,
          ctx.user.id,
          voteType,
          voteValue,
          now,
          now
        );
        recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "vote.created", { voteType, voteValue });
      }
      return json({ votes: buildVoteSummary(ideaId, ctx.user.id) }, existing ? 200 : 201);
    }
  }

  if (s[0] === "notifications" && s.length === 1 && method === "GET") {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") || 20);
    const limit = Math.max(1, Math.min(100, Number.isFinite(requested) ? requested : 20));
    const since = Number(url.searchParams.get("since") || 0);
    const unreadOnly = String(url.searchParams.get("unreadOnly") || "") === "true";
    const eventType = normalizeText(url.searchParams.get("eventType"));
    const excludeMuted = String(url.searchParams.get("excludeMuted") || "false") === "true";
    const mentionsOnly = String(url.searchParams.get("mentionsOnly") || "false") === "true";

    const mentionVisibilityWhere =
      "(e.event_type != 'mention.created' OR CAST(json_extract(e.payload_json, '$.targetUserId') AS INTEGER) = ?)";
    const where = ["e.team_id = ?", mentionVisibilityWhere];
    const params = [ctx.user.id, ctx.session.teamId, ctx.user.id];
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
      params.push(ctx.user.id);
    }
    if (excludeMuted) {
      const muted = getMutedTypesForUser(ctx.user.id);
      if (muted.length) {
        where.push(`e.event_type NOT IN (${muted.map(() => "?").join(", ")})`);
        params.push(...muted);
      }
    }

    const rows = db
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

    const unreadCount = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM events e
         LEFT JOIN notification_reads nr ON nr.event_id = e.id AND nr.user_id = ?
         WHERE e.team_id = ?
           AND (e.event_type != 'mention.created' OR CAST(json_extract(e.payload_json, '$.targetUserId') AS INTEGER) = ?)
           AND nr.event_id IS NULL`
      )
      .get(ctx.user.id, ctx.session.teamId, ctx.user.id).count;

    return json({ notifications: rows.map(toNotificationPayload), unreadCount });
  }

  if (s[0] === "notifications" && s[1] === "stream" && method === "GET") {
    const teamId = ctx.session.teamId;
    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const clients = teamStreamSet(teamId);

    let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        clients.set(clientId, { controller, userId: ctx.user.id });
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ ok: true, teamId })}\n\n`));
        keepAliveTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch (error) {
            void error;
          }
        }, 25000);

        request.signal.addEventListener("abort", () => {
          clearInterval(keepAliveTimer);
          const teamClients = streamClients.get(teamId);
          if (teamClients) {
            teamClients.delete(clientId);
            if (!teamClients.size) {
              streamClients.delete(teamId);
            }
          }
          try {
            controller.close();
          } catch (error) {
            void error;
          }
        });
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }

  if (s[0] === "notifications" && s[1] && s[2] === "read" && method === "POST") {
    const eventId = Number(s[1]);
    const eventRow = db
      .prepare(
        "SELECT id FROM events WHERE id = ? AND team_id = ? AND (event_type != 'mention.created' OR CAST(json_extract(payload_json, '$.targetUserId') AS INTEGER) = ?)"
      )
      .get(eventId, ctx.session.teamId, ctx.user.id);
    if (!eventRow) {
      return json({ error: "알림을 찾을 수 없습니다" }, 404);
    }
    db.prepare("INSERT OR IGNORE INTO notification_reads (user_id, event_id, read_at) VALUES (?, ?, ?)").run(
      ctx.user.id,
      eventId,
      Date.now()
    );
    return json({ ok: true });
  }

  if (s[0] === "notifications" && s[1] === "read-all" && method === "POST") {
    const now = Date.now();
    db.prepare(
      "INSERT OR IGNORE INTO notification_reads (user_id, event_id, read_at) SELECT ?, e.id, ? FROM events e WHERE e.team_id = ? AND (e.event_type != 'mention.created' OR CAST(json_extract(e.payload_json, '$.targetUserId') AS INTEGER) = ?)"
    ).run(ctx.user.id, now, ctx.session.teamId, ctx.user.id);
    return json({ ok: true });
  }

  if (s[0] === "notifications" && s[1] === "preferences" && method === "GET") {
    return json({ mutedTypes: getMutedTypesForUser(ctx.user.id) });
  }

  if (s[0] === "notifications" && s[1] === "preferences" && method === "PUT") {
    const body = await readJsonBody(request);
    const mutedTypes = Array.isArray(body.mutedTypes)
      ? [...new Set(body.mutedTypes.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];
    db.prepare(
      "INSERT INTO notification_preferences (user_id, muted_types_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET muted_types_json = excluded.muted_types_json, updated_at = excluded.updated_at"
    ).run(ctx.user.id, JSON.stringify(mutedTypes), Date.now());
    return json({ mutedTypes });
  }

  if (s[0] === "integrations" && s[1] === "webhooks" && s.length === 2 && method === "GET") {
    const webhooks = db
      .prepare(
        "SELECT id, team_id, platform, webhook_url, enabled, created_by, created_at, updated_at FROM workspace_webhooks WHERE team_id = ? ORDER BY platform ASC"
      )
      .all(ctx.session.teamId)
      .map((row) => ({
        id: row.id,
        teamId: row.team_id,
        platform: row.platform,
        webhookUrl: row.webhook_url,
        enabled: Boolean(row.enabled),
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    return json({ webhooks });
  }

  if (s[0] === "integrations" && s[1] === "webhooks" && s[2] === "deliveries" && method === "GET") {
    await processWebhookQueue();
    const deliveries = db
      .prepare(
        `SELECT wd.*, tw.platform
         FROM webhook_deliveries wd
         JOIN workspace_webhooks tw ON tw.id = wd.webhook_id
         WHERE tw.team_id = ?
         ORDER BY wd.updated_at DESC
         LIMIT 50`
      )
      .all(ctx.session.teamId)
      .map((row) => ({
        id: row.id,
        webhookId: row.webhook_id,
        eventId: row.event_id,
        platform: row.platform,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deliveredAt: row.delivered_at
      }));
    return json({ deliveries });
  }

  if (s[0] === "integrations" && s[1] === "webhooks" && s[2] && method === "PUT") {
    const platform = normalizeText(s[2]).toLowerCase();
    if (!WEBHOOK_PLATFORMS.includes(platform)) {
      return json({ error: "지원하지 않는 플랫폼입니다" }, 400);
    }

    const body = await readJsonBody(request);
    const webhookUrl = normalizeText(body.webhookUrl);
    const enabled = body.enabled === true || body.enabled === "true" || body.enabled === 1 || body.enabled === "1";
    if (!webhookUrl) {
      return json({ error: "웹훅 URL은 필수입니다" }, 400);
    }
    if (!isValidWebhookUrl(platform, webhookUrl)) {
      return json({ error: "유효하지 않은 웹훅 URL입니다" }, 400);
    }

    const now = Date.now();
    const existing = db.prepare("SELECT id FROM workspace_webhooks WHERE team_id = ? AND platform = ?").get(ctx.session.teamId, platform);
    if (existing) {
      db.prepare("UPDATE workspace_webhooks SET webhook_url = ?, enabled = ?, updated_at = ? WHERE id = ?").run(
        webhookUrl,
        enabled ? 1 : 0,
        now,
        existing.id
      );
    } else {
      db.prepare(
        "INSERT INTO workspace_webhooks (team_id, platform, webhook_url, enabled, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(ctx.session.teamId, platform, webhookUrl, enabled ? 1 : 0, ctx.user.id, now, now);
    }

    recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "integration.webhook.updated", { platform, enabled });
    const webhook = db.prepare("SELECT * FROM workspace_webhooks WHERE team_id = ? AND platform = ?").get(ctx.session.teamId, platform);
    return json({
      webhook: {
        id: webhook.id,
        teamId: webhook.team_id,
        platform: webhook.platform,
        webhookUrl: webhook.webhook_url,
        enabled: Boolean(webhook.enabled),
        createdBy: webhook.created_by,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at
      }
    });
  }

  if (s[0] === "workspace" && s[1] === "views" && s.length === 2 && method === "GET") {
    const rows = db
      .prepare(
        `SELECT v.id, v.team_id, v.name, v.config_json, v.created_by, v.updated_by, v.created_at, v.updated_at,
                u.name AS creator_name,
                uu.name AS updater_name,
                t.owner_id
         FROM workspace_views v
         JOIN users u ON u.id = v.created_by
         LEFT JOIN users uu ON uu.id = COALESCE(v.updated_by, v.created_by)
         JOIN workspaces t ON t.id = v.team_id
         WHERE v.team_id = ?
         ORDER BY v.updated_at DESC`
      )
      .all(ctx.session.teamId);
    return json({
      views: rows.map((row) => {
        let config = {};
        try {
          config = JSON.parse(row.config_json || "{}");
        } catch (error) {
          void error;
          config = {};
        }
        return {
          id: row.id,
          teamId: row.team_id,
          name: row.name,
          config,
          createdBy: row.created_by,
          creatorName: row.creator_name,
          updatedBy: row.updated_by || row.created_by,
          updaterName: row.updater_name || row.creator_name,
          canDelete: row.created_by === ctx.user.id || row.owner_id === ctx.user.id,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      })
    });
  }

  if (s[0] === "workspace" && s[1] === "views" && s.length === 2 && method === "POST") {
    const body = await readJsonBody(request);
    const name = normalizeText(body.name);
    if (!name) {
      return json({ error: "이름은 필수입니다" }, 400);
    }
    const config = typeof body.config === "object" && body.config ? body.config : {};
    const now = Date.now();
    const existing = db.prepare("SELECT id FROM workspace_views WHERE team_id = ? AND name = ?").get(ctx.session.teamId, name);
    if (existing) {
      db.prepare("UPDATE workspace_views SET config_json = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(
        JSON.stringify(config),
        now,
        ctx.user.id,
        existing.id
      );
    } else {
      db.prepare(
        "INSERT INTO workspace_views (team_id, name, config_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(ctx.session.teamId, name, JSON.stringify(config), ctx.user.id, ctx.user.id, now, now);
    }
    const view = db
      .prepare(
        `SELECT v.id, v.team_id, v.name, v.config_json, v.created_by, v.updated_by, v.created_at, v.updated_at,
                u.name AS creator_name,
                uu.name AS updater_name,
                t.owner_id
         FROM workspace_views v
         JOIN users u ON u.id = v.created_by
         LEFT JOIN users uu ON uu.id = COALESCE(v.updated_by, v.created_by)
         JOIN workspaces t ON t.id = v.team_id
         WHERE v.team_id = ? AND v.name = ?`
      )
      .get(ctx.session.teamId, name);
    return json({
      view: {
        id: view.id,
        teamId: view.team_id,
        name: view.name,
        config,
        createdBy: view.created_by,
        creatorName: view.creator_name,
        updatedBy: view.updated_by || view.created_by,
        updaterName: view.updater_name || view.creator_name,
        canDelete: view.created_by === ctx.user.id || view.owner_id === ctx.user.id,
        createdAt: view.created_at,
        updatedAt: view.updated_at
      }
    });
  }

  if (s[0] === "workspace" && s[1] === "views" && s[2] && method === "DELETE") {
    const viewId = Number(s[2]);
    const row = db
      .prepare(
        `SELECT v.id, v.created_by, t.owner_id
         FROM workspace_views v
         JOIN workspaces t ON t.id = v.team_id
         WHERE v.id = ? AND v.team_id = ?`
      )
      .get(viewId, ctx.session.teamId);
    if (!row) {
      return json({ error: "뷰를 찾을 수 없습니다" }, 404);
    }
    if (row.created_by !== ctx.user.id && row.owner_id !== ctx.user.id) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    db.prepare("DELETE FROM workspace_views WHERE id = ?").run(viewId);
    return json({ ok: true });
  }

    return json({ error: "요청한 리소스를 찾을 수 없습니다" }, 404);
}

export async function GET(request, context) {
  const params = await context.params;
  const slug = params?.slug || [];
  return handleRequest(request, slug, "GET");
}

export async function POST(request, context) {
  const params = await context.params;
  const slug = params?.slug || [];
  return handleRequest(request, slug, "POST");
}

export async function PUT(request, context) {
  const params = await context.params;
  const slug = params?.slug || [];
  return handleRequest(request, slug, "PUT");
}

export async function DELETE(request, context) {
  const params = await context.params;
  const slug = params?.slug || [];
  return handleRequest(request, slug, "DELETE");
}
