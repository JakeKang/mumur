import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDatabaseClient, getQueryAdapter } from "@/shared/lib/server/database-client";
import { RequestValidationError, enforceMutationRateLimit, ensureMutationOrigin, readJsonBody } from "@/shared/lib/server/api-request-security";
import { reportServerIssue } from "@/shared/lib/observability";
import {
  inferUploadedBlockType,
  normalizeWorkspaceViewConfig,
  parseStoredDraftPayload,
  parseStoredIdeaBlocks,
  parseStoredJsonObject,
  parseStoredMutedTypes,
  resolveUploadedMimeType,
  restoreIdeaVersionSnapshot,
  uploadDestination,
  validateUploadedBlockFile,
} from "@/shared/lib/server/api-route-seams";
import {
  createSession,
  hashPassword,
  isPasswordPolicyValid,
  MIN_PASSWORD_LENGTH,
  normalizeText,
  passwordPolicyMessage,
  verifyPassword
} from "@/shared/lib/server/auth";
import {
  authContext,
  clearAuthRateLimit,
  clearSessionCookie,
  getAuthRateLimitStatus,
  getSessionToken,
  registerAuthRateLimitFailure,
  withSessionCookie
} from "@/shared/lib/server/api-session";
import { IDEA_STATUS, STATUS_META } from "@/features/ideas/constants/idea-status";
import { shouldCreateAutoCheckpoint, toIdeaCollabCheckpoint } from "@/features/ideas/collab/idea-collab-checkpoint";
import { categoryLabel, notificationTypeLabel, priorityLabel } from "@/shared/constants/ui-labels";
import { broadcastWorkbenchSocketEvent } from "@/shared/lib/server/workbench-ws-hub";
import {
  IDEA_PRESENCE_TTL_MS,
  broadcastTeamStreamEvent,
  clearIdeaPresence,
  clearIdeaPresenceForIdea,
  getTeamStreamClients,
  listIdeaPresence,
  removeTeamStreamClient,
  shouldThrottleIdeaPresence,
  upsertIdeaPresence
} from "@/shared/lib/server/workbench-presence-stream";
import { enqueueWebhookDeliveries, isValidWebhookUrl, maskWebhookUrl, processWebhookQueue } from "@/shared/lib/server/webhook-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const db = getDatabaseClient();
const queries = getQueryAdapter();

const BLOCK_TYPES = ["paragraph", "heading1", "heading2", "heading3", "bulletList", "numberedList", "checklist", "quote", "code", "divider", "file", "callout", "image", "video"];
const WEBHOOK_PLATFORMS = ["slack", "discord"];
const TEAM_ROLES = ["viewer", "editor", "deleter", "admin", "owner", "member"];
const globalRef = globalThis;
if (!globalRef.__mumurWebhookWorker) {
  globalRef.__mumurWebhookWorker = null;
}

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function isUniqueConstraintError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("unique") || message.includes("duplicate key");
}

function toIdeaPayload(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    authorId: row.author_id,
    title: row.title,
    category: row.category,
    status: row.status,
    priority: row.priority || "low",
    blocks: parseStoredIdeaBlocks(row.blocks_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseBlocks(inputBlocks) {
  const blocks = Array.isArray(inputBlocks) ? inputBlocks : [];

  const normalizeBlockType = (value) => {
    const raw = normalizeText(value);
    if (!raw) {
      return "paragraph";
    }
    if (BLOCK_TYPES.includes(raw)) {
      return raw;
    }
    if (raw === "text") {
      return "paragraph";
    }
    if (raw === "heading") {
      return "heading2";
    }
    if (raw === "image") {
      return "image";
    }
    if (raw === "callout") {
      return "callout";
    }
    if (raw === "table" || raw === "embed") {
      return "paragraph";
    }
    return "paragraph";
  };

  return blocks
    .map((block, index) => {
      const type = normalizeBlockType(block?.type);
      const id = normalizeText(block?.id) || `block-${index + 1}-${Date.now()}`;
      const content = type === "divider" ? "" : normalizeText(block?.content);
      const checked = Boolean(block?.checked);
      return { id, type, content, checked };
    })
    .filter((block) => block.type === "divider" || block.type === "file" || block.content.length > 0);
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

function ideaBlockIds(ideaRow) {
  const blocks = parseStoredIdeaBlocks(ideaRow.blocks_json);
  return new Set(blocks.map((block) => String(block.id || "")).filter(Boolean));
}

function formatIdeaTitle(title) {
  return normalizeText(title) || "(제목 없음)";
}

function ideaStatusLabel(status) {
  return STATUS_META[String(status || "")]?.label || "상태";
}

function summarizeIdeaUpdate(payload) {
  const data = payload || {};
  const title = formatIdeaTitle(data.title);
  const changedFields = Array.isArray(data.changedFields) ? data.changedFields.map((field) => String(field)) : [];

    if (changedFields.length === 1) {
      const [field] = changedFields;
      if (field === "status") {
        const previous = data.previousStatus ? ideaStatusLabel(data.previousStatus) : null;
        const next = ideaStatusLabel(data.status);
        return previous ? `아이디어 상태가 ${previous}에서 ${next} 단계로 변경됐어요 · ${title}` : `아이디어 상태가 ${next} 단계로 변경됐어요 · ${title}`;
      }
      if (field === "title") {
        return `아이디어 제목이 변경됐어요 · ${title}`;
      }
      if (field === "category") {
        const next = categoryLabel(String(data.category || ""));
        return `아이디어 분류가 ${next} 카테고리로 변경됐어요 · ${title}`;
      }
      if (field === "priority") {
        const next = priorityLabel(String(data.priority || ""));
        return `아이디어 우선순위가 ${next} 수준으로 변경됐어요 · ${title}`;
      }
    }

  if (changedFields.length > 1) {
    return `아이디어 정보가 업데이트됐어요 · ${title}`;
  }

  return `아이디어가 수정됐어요 · ${title}`;
}

function getIdeaUpdateEventPayload(previousIdea, nextIdea) {
  const changedFields = [];
  if (previousIdea.title !== nextIdea.title) {
    changedFields.push("title");
  }
  if (previousIdea.category !== nextIdea.category) {
    changedFields.push("category");
  }
  if (previousIdea.status !== nextIdea.status) {
    changedFields.push("status");
  }
  if (String(previousIdea.priority || "low") !== String(nextIdea.priority || "low")) {
    changedFields.push("priority");
  }

  if (!changedFields.length) {
    return null;
  }

  return {
    title: nextIdea.title,
    status: nextIdea.status,
    category: nextIdea.category,
    priority: nextIdea.priority,
    previousTitle: previousIdea.title,
    previousStatus: previousIdea.status,
    previousCategory: previousIdea.category,
    previousPriority: String(previousIdea.priority || "low"),
    changedFields
  };
}

function formatNotificationMessage(eventType, payload) {
  const data = payload || {};
  switch (eventType) {
    case "idea.created":
      return `새 아이디어가 등록됐어요 · ${formatIdeaTitle(data.title)}`;
    case "idea.updated":
      return summarizeIdeaUpdate(data);
    case "idea.deleted":
      return `아이디어가 삭제됐어요 · ${formatIdeaTitle(data.title)}`;
    case "comment.created":
      return data.blockId ? `문서 블록에 새 댓글이 달렸어요` : "새 댓글이 달렸어요";
    case "reaction.added":
      return `리액션이 추가됐어요 ${data.emoji || ""}`.trim();
    case "reaction.removed":
      return `리액션이 제거됐어요 ${data.emoji || ""}`.trim();
    case "version.created":
      return `새 버전이 등록됐어요 · ${data.versionLabel || "새 버전"}`;
    case "version.restored":
      return `버전으로 복원했어요 · ${data.sourceVersionLabel || data.versionLabel || data.from || "스냅샷"}`;
    case "mention.created":
      return `${data.actorName || "누군가"}님이 회원님을 멘션했어요`;
    case "integration.webhook.updated":
      return `웹훅 설정이 업데이트됐어요 · ${data.platform || "플랫폼"}`;
    case "team.invitation.pending":
      return `${data.email || "사용자"}님에게 팀 초대를 보냈어요`;
    case "team.invitation.accepted":
      return `${data.email || "사용자"}님이 팀 초대를 수락했어요`;
    case "team.invitation.cancelled":
      return `${data.email || "사용자"}님 초대를 취소했어요`;
    default:
      return notificationTypeLabel(eventType);
  }
}

function normalizeMentionNameToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "");
}

function mentionTokenForMember(name, email) {
  const displayNameToken = normalizeMentionNameToken(name);
  if (displayNameToken) {
    return displayNameToken;
  }
  return normalizeMentionNameToken(String(email || "").split("@")[0]);
}

function extractMentionTokens(content) {
  const text = normalizeText(content || "");
  const matches = text.matchAll(/(^|[\s([{])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[\p{L}\p{N}][\p{L}\p{N}._-]{0,62})(?=$|[\s),.!?:;\]}])/gu);
  return [...new Set(Array.from(matches, (match) => String(match[2] || "").toLowerCase()))];
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
    const nameToken = mentionTokenForMember(member.name, member.email);
    const legacyNameToken = normalizeText(member.name || "").replace(/\s+/g, "").toLowerCase();
    return tokens.includes(emailToken) || (nameToken && tokens.includes(nameToken)) || (legacyNameToken && tokens.includes(legacyNameToken));
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

  return parseStoredMutedTypes(row.muted_types_json);
}

function isMutedForUser(userId, eventType) {
  return getMutedTypesForUser(userId).includes(eventType);
}

function broadcastIdeaRefresh(teamId, ideaId, userId, reason = "idea.updated") {
  broadcastTeamStreamEvent(teamId, "idea.refresh", {
    teamId,
    ideaId,
    actorUserId: userId,
    reason,
    updatedAt: Date.now()
  });
}

function broadcastTeamNotification(teamId, notification) {
  const clients = getTeamStreamClients(teamId);
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
      client.controller.enqueue(new TextEncoder().encode(line));
    } catch {
      // client disconnected — expected during SSE teardown
    }
  });

  broadcastWorkbenchSocketEvent(
    teamId,
    "notification",
    notification,
    (client) => isNotificationVisibleToUser(client.userId, notification.type, notification.payload) && !isMutedForUser(client.userId, notification.type)
  );
}

function toNotificationPayload(row) {
  const payload = parseStoredJsonObject(row.payload_json);
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

function recordTeamEvent(teamId, ideaId, userId, eventType, payload) {
  const createdAt = Date.now();
  const result = db
    .prepare("INSERT INTO events (team_id, idea_id, user_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(teamId, ideaId, userId, eventType, JSON.stringify(payload || {}), createdAt);

  const actor = userId ? db.prepare("SELECT name FROM users WHERE id = ?").get(userId)?.name || "시스템" : "시스템";
  const eventId = queries.extractInsertId(result);
  const notification = {
    id: eventId,
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

  broadcastTeamStreamEvent(teamId, eventType, {
    teamId,
    ideaId,
    actorUserId: userId,
    eventId,
    createdAt,
    ...(payload || {})
  });
  broadcastTeamNotification(teamId, notification);
  enqueueWebhookDeliveries(db, queries, globalRef, formatNotificationMessage, teamId, eventId);
}

const ROLE_LEVEL: Record<string, number> = {
  viewer: 0,
  editor: 1,
  deleter: 2,
  admin: 3,
  owner: 3,
  member: 1,
};

function getTeamMembership(teamId, userId) {
  return db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(teamId, userId) || null;
}

function hasMinRole(teamId: number, userId: number, minRole: string): boolean {
  const membership = getTeamMembership(teamId, userId);
  if (!membership) return false;
  return (ROLE_LEVEL[membership.role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 99);
}

function isTeamOwner(teamId, userId) {
  const membership = getTeamMembership(teamId, userId);
  return membership?.role === "owner";
}

function ownerCount(teamId) {
  return db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE team_id = ? AND role = 'owner'").get(teamId).count;
}

function ideaPriorityLevel(row) {
  const engagement = Number(row.comment_count || 0) + Number(row.reaction_count || 0) + Number(row.version_count || 0);
  if (row.status === "harvest" || engagement >= 24) {
    return "high";
  }
  if (row.status === "grow" || engagement >= 10) {
    return "medium";
  }
  return "low";
}

function toInvitationPayload(row) {
  return {
    id: row.id,
    workspaceId: row.team_id,
    teamId: row.team_id,
    email: row.email,
    role: row.role,
    status: row.status,
    message: row.message,
    invitedBy: row.invited_by,
    invitedByName: row.inviter_name,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolver_name,
    teamName: row.team_name,
    teamIcon: row.team_icon,
    teamColor: row.team_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function invitationMessageForPending(email, userName, registered, retried = false) {
  if (registered) {
    const label = normalizeText(userName) || email;
    return retried
      ? `${label}님에게 초대를 다시 보냈습니다. 수락 전까지 대기 상태입니다.`
      : `${label}님에게 초대를 보냈습니다. 수락 전까지 팀에 참여하지 않습니다.`;
  }
  return retried
    ? "가입 후 초대를 수락하면 팀에 참여할 수 있도록 초대를 다시 보냈습니다."
    : "가입 후 초대를 수락하면 팀에 참여할 수 있습니다.";
}

function invitationMessageForAccepted(alreadyMember = false) {
  return alreadyMember ? "이미 팀 멤버입니다." : "초대를 수락해 팀에 참여했습니다.";
}

function invitationMessageForCancelled() {
  return "초대를 취소했습니다.";
}

function getInvitationRowById(invitationId) {
  return db
    .prepare(
      `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name,
              w.name AS team_name, w.icon AS team_icon, w.color AS team_color
       FROM workspace_invitations i
       JOIN workspaces w ON w.id = i.team_id
       JOIN users inviter ON inviter.id = i.invited_by
       LEFT JOIN users resolver ON resolver.id = i.resolved_by
       WHERE i.id = ?`
    )
    .get(invitationId);
}

function getInvitationRowByTeamAndEmail(teamId, email) {
  return db
    .prepare(
      `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name,
              w.name AS team_name, w.icon AS team_icon, w.color AS team_color
       FROM workspace_invitations i
       JOIN workspaces w ON w.id = i.team_id
       JOIN users inviter ON inviter.id = i.invited_by
       LEFT JOIN users resolver ON resolver.id = i.resolved_by
       WHERE i.team_id = ? AND i.email = ?`
    )
    .get(teamId, email);
}


async function handleRequest(request, slug, method) {
  const s = slug || [];

  try {
    ensureMutationOrigin(request, method);

  if (s.length === 1 && s[0] === "health" && method === "GET") {
    return json({ ok: true, now: Date.now() });
  }

  if (s[0] === "auth" && s[1] === "register" && method === "POST") {
    const body = await readJsonBody(request);
    const name = normalizeText(body.name);
    const email = normalizeText(body.email).toLowerCase();
    const password = String(body.password || "");
    const teamName = normalizeText(body.teamName);
    const registerRateLimit = getAuthRateLimitStatus(request, "register", email);

    if (!registerRateLimit.allowed) {
      return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, {
        status: 429,
        headers: { "Retry-After": String(registerRateLimit.retryAfterSeconds) }
      });
    }

    if (!name || !email || !teamName || !isPasswordPolicyValid(password)) {
      registerAuthRateLimitFailure(request, "register", email);
      return json({ error: `이름, 이메일, 팀 이름은 필수이며 ${passwordPolicyMessage()}` }, 400);
    }
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      registerAuthRateLimitFailure(request, "register", email);
      return json({ error: "이미 가입된 이메일입니다" }, 409);
    }

    const now = Date.now();
    const passwordHash = hashPassword(password);
    const created = queries.withTransaction(() => {
      const userResult = db
        .prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .run(name, email, passwordHash, now);
      const userId = queries.extractInsertId(userResult);
      const teamResult = db.prepare("INSERT INTO workspaces (name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(teamName, userId, now, now);
      const teamId = queries.extractInsertId(teamResult);
      db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(teamId, userId, "owner", now);
      recordTeamEvent(teamId, null, userId, "workspace.created", { teamName });
      return { userId, teamId };
    });

    clearAuthRateLimit(request, "register", email);
      const session = createSession(queries, created.userId, created.teamId);
    const response = json({ user: { id: created.userId, name, email }, workspace: { id: created.teamId, name: teamName } }, 201);
    return withSessionCookie(request, response, session.token, session.expiresAt);
  }

  if (s[0] === "auth" && s[1] === "login" && method === "POST") {
    const body = await readJsonBody(request);
    const email = normalizeText(body.email).toLowerCase();
    const password = String(body.password || "");
    const loginRateLimit = getAuthRateLimitStatus(request, "login", email);

    if (!loginRateLimit.allowed) {
      return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, {
        status: 429,
        headers: { "Retry-After": String(loginRateLimit.retryAfterSeconds) }
      });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      registerAuthRateLimitFailure(request, "login", email);
      return json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
    }

    const team = pickTeamForUser(user.id);
    if (!team) {
      return json({ error: "소속된 팀이 없습니다" }, 403);
    }

    clearAuthRateLimit(request, "login", email);
      const session = createSession(queries, user.id, team.teamId);
    const response = json({
      user: { id: user.id, name: user.name, email: user.email },
      workspace: { id: team.teamId, name: team.teamName }
    });
    return withSessionCookie(request, response, session.token, session.expiresAt);
  }

  if (s[0] === "auth" && s[1] === "logout" && method === "POST") {
    const token = getSessionToken(request);
    if (token) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
    }
    return clearSessionCookie(request, json({ ok: true }));
  }

  const ctx = authContext(db, queries, request);
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

  if (s[0] === "auth" && s[1] === "me" && method === "PATCH") {
    const rateLimitResponse = enforceMutationRateLimit(request, "auth-profile-update", ctx.user.id);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const body = await readJsonBody(request);
    const user = db
      .prepare("SELECT id, name, email, password_hash FROM users WHERE id = ?")
      .get(ctx.session.userId) as { id: number; name: string; email: string; password_hash: string } | undefined;
    if (!user) {
      return json({ error: "사용자를 찾을 수 없습니다" }, 404);
    }

    const cleanName = normalizeText(body.name || "");
    const cleanEmail = normalizeText(body.email || "").toLowerCase();
    const cleanNewPwd = String(body.newPassword || "");
    const changingEmail = cleanEmail && cleanEmail !== String(user.email || "").toLowerCase();
    const changingPassword = cleanNewPwd.length > 0;

    if (changingEmail || changingPassword) {
      if (!body.currentPassword || !verifyPassword(String(body.currentPassword), user.password_hash)) {
        return json({ error: "현재 비밀번호가 올바르지 않습니다" }, 403);
      }
    }

    if (changingPassword && !isPasswordPolicyValid(cleanNewPwd)) {
      return json({ error: passwordPolicyMessage("새 비밀번호") }, 400);
    }

    if (changingEmail) {
      const existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(cleanEmail, ctx.session.userId);
      if (existing) {
        return json({ error: "이미 사용 중인 이메일입니다" }, 409);
      }
    }

    const setParts: string[] = [];
    const params: unknown[] = [];

    if (cleanName) {
      setParts.push("name = ?");
      params.push(cleanName);
    }
    if (changingEmail) {
      setParts.push("email = ?");
      params.push(cleanEmail);
    }
    if (changingPassword) {
      setParts.push("password_hash = ?");
      params.push(hashPassword(cleanNewPwd));
    }

    if (setParts.length === 0) {
      return json({ error: "변경할 항목이 없습니다" }, 400);
    }

    params.push(ctx.session.userId);
    db.prepare(`UPDATE users SET ${setParts.join(", ")} WHERE id = ?`).run(...params);

    const updated = db
      .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
      .get(ctx.session.userId) as { id: number; name: string; email: string; created_at: number };
    return json({ user: updated });
  }

  if (s[0] === "drafts" && s.length === 2 && method === "GET") {
    const ideaId = Number(s[1]);
    if (!Number.isInteger(ideaId) || ideaId <= 0) {
      return json({ error: "유효하지 않은 아이디어 ID입니다" }, 400);
    }
    const draft = db
      .prepare("SELECT payload_json, updated_at FROM idea_drafts WHERE idea_id = ? AND user_id = ?")
      .get(ideaId, ctx.session.userId) as { payload_json: string; updated_at: number } | undefined;
    if (!draft) {
      return json({ draft: null });
    }
    return json({ draft: { ideaId, payload: parseStoredDraftPayload(draft.payload_json), updatedAt: draft.updated_at } });
  }

  if (s[0] === "drafts" && s.length === 2 && method === "PUT") {
    const ideaId = Number(s[1]);
    if (!Number.isInteger(ideaId) || ideaId <= 0) {
      return json({ error: "유효하지 않은 아이디어 ID입니다" }, 400);
    }
    const body = await readJsonBody(request);
    const payloadStr = JSON.stringify(body.payload || {});
    if (payloadStr.length > 512 * 1024) {
      return json({ error: "드래프트가 너무 큽니다 (최대 512KB)" }, 413);
    }
    db.prepare("INSERT OR REPLACE INTO idea_drafts (idea_id, user_id, payload_json, updated_at) VALUES (?, ?, ?, ?)").run(
      ideaId,
      ctx.session.userId,
      payloadStr,
      Date.now()
    );
    return json({ ok: true });
  }

  if (s[0] === "drafts" && s.length === 2 && method === "DELETE") {
    const ideaId = Number(s[1]);
    if (!Number.isInteger(ideaId) || ideaId <= 0) {
      return json({ error: "유효하지 않은 아이디어 ID입니다" }, 400);
    }
    db.prepare("DELETE FROM idea_drafts WHERE idea_id = ? AND user_id = ?").run(ideaId, ctx.session.userId);
    return json({ ok: true });
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

    const pendingInvitations = db
      .prepare(
        `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name,
                w.name AS team_name, w.icon AS team_icon, w.color AS team_color
         FROM workspace_invitations i
         JOIN workspaces w ON w.id = i.team_id
         JOIN users inviter ON inviter.id = i.invited_by
         LEFT JOIN users resolver ON resolver.id = i.resolved_by
         LEFT JOIN workspace_members wm ON wm.team_id = i.team_id AND wm.user_id = ?
         WHERE LOWER(i.email) = ?
           AND i.status = 'pending'
           AND wm.user_id IS NULL
         ORDER BY i.updated_at DESC`
      )
      .all(ctx.user.id, String(ctx.user.email || "").toLowerCase())
      .map(toInvitationPayload);

    return json({ workspaces, pendingInvitations });
  }

  if (s[0] === "workspaces" && s.length === 1 && method === "POST") {
    const body = await readJsonBody(request);
    const teamName = normalizeText(body.teamName);
    if (!teamName) {
      return json({ error: "팀 이름은 필수입니다" }, 400);
    }
    const now = Date.now();
    const created = queries.withTransaction(() => {
      const teamResult = db.prepare("INSERT INTO workspaces (name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(teamName, ctx.user.id, now, now);
      const teamId = queries.extractInsertId(teamResult);
      db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(teamId, ctx.user.id, "owner", now);
      db.prepare("UPDATE sessions SET team_id = ? WHERE id = ?").run(teamId, ctx.session.id);
      return { teamId };
    });
    const teamId = created.teamId;
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

  if (s[0] === "workspaces" && s[1] && s[2] === "leave" && method === "POST") {
    const workspaceId = Number(s[1]);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      return json({ error: "유효하지 않은 워크스페이스 ID입니다" }, 400);
    }

    const membership = db
      .prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?")
      .get(workspaceId, ctx.user.id);
    if (!membership) {
      return json({ error: "소속된 워크스페이스가 아닙니다" }, 404);
    }

    const memberCount = db
      .prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE user_id = ?")
      .get(ctx.user.id).count;
    if (memberCount <= 1) {
      return json({ error: "마지막 워크스페이스에서는 탈퇴할 수 없습니다" }, 400);
    }

    if (membership.role === "owner" && ownerCount(workspaceId) <= 1) {
      return json({ error: "마지막 소유자는 탈퇴할 수 없습니다" }, 400);
    }

    const workspace = db.prepare("SELECT id, owner_id FROM workspaces WHERE id = ?").get(workspaceId);
    if (!workspace) {
      return json({ error: "워크스페이스를 찾을 수 없습니다" }, 404);
    }

    let nextWorkspaceId = ctx.session.teamId;
    const leaveResult = queries.withTransaction(() => {
      if (Number(workspace.owner_id) === Number(ctx.user.id)) {
        const fallbackOwner = db
          .prepare(
            "SELECT user_id FROM workspace_members WHERE team_id = ? AND user_id != ? AND role = 'owner' ORDER BY created_at ASC LIMIT 1"
          )
          .get(workspaceId, ctx.user.id);
        if (!fallbackOwner?.user_id) {
          throw new RequestValidationError("워크스페이스 소유권을 이전할 수 없어 탈퇴할 수 없습니다", 400);
        }
        db.prepare("UPDATE workspaces SET owner_id = ?, updated_at = ? WHERE id = ?").run(fallbackOwner.user_id, Date.now(), workspaceId);
      }

      db.prepare("DELETE FROM workspace_members WHERE team_id = ? AND user_id = ?").run(workspaceId, ctx.user.id);
      if (Number(ctx.session.teamId) === workspaceId) {
        const nextMembership = db
          .prepare("SELECT team_id FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
          .get(ctx.user.id);
        if (!nextMembership?.team_id) {
          throw new RequestValidationError("전환할 워크스페이스를 찾을 수 없습니다", 500);
        }
        nextWorkspaceId = Number(nextMembership.team_id);
        db.prepare("UPDATE sessions SET team_id = ? WHERE id = ?").run(nextWorkspaceId, ctx.session.id);
      }
      return { nextWorkspaceId };
    });
    recordTeamEvent(workspaceId, null, ctx.user.id, "team.member.left", { userId: ctx.user.id });

    return json({ ok: true, nextWorkspaceId: leaveResult.nextWorkspaceId });
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
        isOwner: isTeamOwner(ctx.session.teamId, ctx.user.id),
        role: members.find((member) => member.userId === ctx.user.id)?.role || "member"
      }
    });
  }

  if (s[0] === "workspace" && s[1] === "members" && s.length === 2 && method === "POST") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const body = await readJsonBody(request);
    const email = normalizeText(body.email).toLowerCase();
    const role = normalizeText(body.role) || "editor";
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
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
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
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
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
        `SELECT i.*, inviter.name AS inviter_name, resolver.name AS resolver_name,
                w.name AS team_name, w.icon AS team_icon, w.color AS team_color
         FROM workspace_invitations i
         JOIN workspaces w ON w.id = i.team_id
         JOIN users inviter ON inviter.id = i.invited_by
         LEFT JOIN users resolver ON resolver.id = i.resolved_by
         WHERE i.team_id = ?
         ORDER BY i.updated_at DESC`
      )
      .all(ctx.session.teamId);
    return json({ invitations: rows.map(toInvitationPayload) });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] === "preview" && method === "GET") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
      return json({ error: "권한이 없습니다" }, 403);
    }

    const url = new URL(request.url);
    const email = normalizeText(url.searchParams.get("email")).toLowerCase();
    if (!email) {
      return json({ error: "이메일은 필수입니다" }, 400);
    }

    const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);
    const existingMember = user
      ? db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, user.id)
      : null;
    const invitation = getInvitationRowByTeamAndEmail(ctx.session.teamId, email);

    return json({
      preview: {
        email,
        registered: Boolean(user),
        userId: user?.id ?? null,
        name: user?.name ?? null,
        memberRole: existingMember?.role ?? null,
        invitation: invitation ? toInvitationPayload(invitation) : null,
      },
    });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s.length === 2 && method === "POST") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
      return json({ error: "권한이 없습니다" }, 403);
    }

    const body = await readJsonBody(request);
    const email = normalizeText(body.email).toLowerCase();
    const role = normalizeText(body.role) || "editor";
    if (!email) {
      return json({ error: "이메일은 필수입니다" }, 400);
    }
    if (!TEAM_ROLES.includes(role)) {
      return json({ error: "유효하지 않은 역할입니다" }, 400);
    }

    const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);
    if (user) {
      const existingMember = db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, user.id);
      if (existingMember) {
        return json({ error: "이미 팀 멤버입니다" }, 409);
      }
    }

    const now = Date.now();
    const existingInvite = db.prepare("SELECT id FROM workspace_invitations WHERE team_id = ? AND email = ?").get(ctx.session.teamId, email);
    const status = "pending";
    const message = invitationMessageForPending(email, user?.name, Boolean(user));
    if (existingInvite) {
      db.prepare(
        "UPDATE workspace_invitations SET role = ?, status = ?, message = ?, invited_by = ?, resolved_by = ?, updated_at = ? WHERE id = ?"
      ).run(role, status, message, ctx.user.id, null, now, existingInvite.id);
    } else {
      db.prepare(
        "INSERT INTO workspace_invitations (team_id, email, role, status, message, invited_by, resolved_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(ctx.session.teamId, email, role, status, message, ctx.user.id, null, now, now);
    }

    const invitation = getInvitationRowByTeamAndEmail(ctx.session.teamId, email);

    recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.invitation.pending", {
      email,
      invitationId: invitation?.id ?? existingInvite?.id ?? null,
      role,
      targetUserId: user?.id ?? null,
    });

    return json({ invitation: toInvitationPayload(invitation) }, 201);
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] && s[3] === "retry" && method === "POST") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
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

    const user = db.prepare("SELECT id, name FROM users WHERE email = ?").get(invitation.email);
    const existingMember = user
      ? db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(ctx.session.teamId, user.id)
      : null;
    const status = existingMember ? "accepted" : "pending";
    const message = existingMember
      ? invitationMessageForAccepted(true)
      : invitationMessageForPending(invitation.email, user?.name, Boolean(user), true);

    db.prepare("UPDATE workspace_invitations SET role = ?, status = ?, message = ?, invited_by = ?, resolved_by = ?, updated_at = ? WHERE id = ?").run(
      invitation.role,
      status,
      message,
      ctx.user.id,
      existingMember ? user?.id ?? null : null,
      Date.now(),
      invitationId
    );

    recordTeamEvent(
      ctx.session.teamId,
      null,
      ctx.user.id,
      existingMember ? "team.invitation.accepted" : "team.invitation.pending",
      {
        email: invitation.email,
        invitationId,
        role: invitation.role,
        retry: true,
        targetUserId: user?.id ?? null,
      }
    );

    const updated = getInvitationRowById(invitationId);
    return json({ invitation: toInvitationPayload(updated) });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] && s[3] === "accept" && method === "POST") {
    const invitationId = Number(s[2]);
    const invitation = db.prepare("SELECT * FROM workspace_invitations WHERE id = ?").get(invitationId);
    if (!invitation) {
      return json({ error: "초대 정보를 찾을 수 없습니다" }, 404);
    }
    if (String(invitation.email || "").toLowerCase() !== String(ctx.user.email || "").toLowerCase()) {
      return json({ error: "해당 초대를 수락할 수 없습니다" }, 403);
    }
    if (invitation.status === "cancelled") {
      return json({ error: "취소된 초대입니다" }, 400);
    }

    const existingMember = db.prepare("SELECT role FROM workspace_members WHERE team_id = ? AND user_id = ?").get(invitation.team_id, ctx.user.id);
    if (!existingMember) {
      db.prepare("INSERT INTO workspace_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").run(
        invitation.team_id,
        ctx.user.id,
        invitation.role,
        Date.now()
      );
      recordTeamEvent(invitation.team_id, null, ctx.user.id, "team.member.added", { invitedUserId: ctx.user.id, role: invitation.role });
    }

    db.prepare("UPDATE workspace_invitations SET status = 'accepted', message = ?, resolved_by = ?, updated_at = ? WHERE id = ?").run(
      invitationMessageForAccepted(Boolean(existingMember)),
      ctx.user.id,
      Date.now(),
      invitationId
    );

    recordTeamEvent(invitation.team_id, null, ctx.user.id, "team.invitation.accepted", {
      email: invitation.email,
      invitationId,
      role: invitation.role,
      targetUserId: ctx.user.id,
    });

    const updatedInvitation = getInvitationRowById(invitationId);
    const workspace = db.prepare("SELECT id, name, icon, color, owner_id FROM workspaces WHERE id = ?").get(invitation.team_id);
    return json({
      ok: true,
      invitation: toInvitationPayload(updatedInvitation),
      workspace: workspace
        ? { id: workspace.id, name: workspace.name, icon: workspace.icon, color: workspace.color, ownerId: workspace.owner_id }
        : null,
    });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] && s[3] === "decline" && method === "POST") {
    const invitationId = Number(s[2]);
    const invitation = db.prepare("SELECT * FROM workspace_invitations WHERE id = ?").get(invitationId);
    if (!invitation) {
      return json({ error: "초대 정보를 찾을 수 없습니다" }, 404);
    }
    if (String(invitation.email || "").toLowerCase() !== String(ctx.user.email || "").toLowerCase()) {
      return json({ error: "해당 초대를 거절할 수 없습니다" }, 403);
    }
    if (invitation.status === "accepted") {
      return json({ error: "이미 수락된 초대입니다" }, 400);
    }
    if (invitation.status === "cancelled") {
      return json({ error: "이미 종료된 초대입니다" }, 400);
    }

    db.prepare("UPDATE workspace_invitations SET status = 'cancelled', message = ?, resolved_by = ?, updated_at = ? WHERE id = ?").run(
      invitationMessageForCancelled(),
      ctx.user.id,
      Date.now(),
      invitationId
    );

    recordTeamEvent(invitation.team_id, null, ctx.user.id, "team.invitation.cancelled", {
      email: invitation.email,
      invitationId,
      role: invitation.role,
      targetUserId: ctx.user.id,
      declinedByInvitee: true,
    });

    const updatedInvitation = getInvitationRowById(invitationId);
    return json({ ok: true, invitation: toInvitationPayload(updatedInvitation) });
  }

  if (s[0] === "workspace" && s[1] === "invitations" && s[2] && method === "DELETE") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const invitationId = Number(s[2]);
    const invitation = db
      .prepare("SELECT id, email, role FROM workspace_invitations WHERE id = ? AND team_id = ?")
      .get(invitationId, ctx.session.teamId);
    if (!invitation) {
      return json({ error: "초대 정보를 찾을 수 없습니다" }, 404);
    }
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(invitation.email);
    db.prepare("UPDATE workspace_invitations SET status = 'cancelled', message = ?, resolved_by = ?, updated_at = ? WHERE id = ?").run(
      invitationMessageForCancelled(),
      ctx.user.id,
      Date.now(),
      invitationId
    );
    recordTeamEvent(ctx.session.teamId, null, ctx.user.id, "team.invitation.cancelled", {
      email: invitation.email,
      invitationId,
      role: invitation.role,
      targetUserId: user?.id ?? null,
    });
    return json({ ok: true });
  }

  if (s[0] === "dashboard" && s[1] === "summary" && method === "GET") {
    const now = Date.now();
    const sevenDaysAgo = now - 1000 * 60 * 60 * 24 * 7;
    const teamIds = db
      .prepare("SELECT team_id FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC")
      .all(ctx.user.id)
      .map((row) => Number(row.team_id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (!teamIds.length) {
      return json({
        metrics: {
          totalIdeas: 0,
          totalComments: 0,
          activeIdeas: 0,
          totalWorkspaces: 0,
          recentActivity: 0
        },
        statusCounts: Object.fromEntries(IDEA_STATUS.map((key) => [key, 0])),
        recentActivity: [],
        workspaces: [],
        recentIdeas: []
      });
    }

    const placeholders = teamIds.map(() => "?").join(",");
    const inClause = `(${placeholders})`;

    const workspaceRows = db
      .prepare(
        `SELECT w.id, w.name, w.icon, w.color,
                (SELECT COUNT(*) FROM ideas i WHERE i.team_id = w.id) AS idea_count,
                (SELECT MAX(i.updated_at) FROM ideas i WHERE i.team_id = w.id) AS last_updated_at,
                (SELECT COUNT(*) FROM events e WHERE e.team_id = w.id AND e.created_at >= ?) AS recent_activity
         FROM workspaces w
         JOIN workspace_members wm ON wm.team_id = w.id
         WHERE wm.user_id = ?
         ORDER BY COALESCE(last_updated_at, 0) DESC, w.name ASC`
      )
      .all(sevenDaysAgo, ctx.user.id);

    const workspaceStatusRows = db
      .prepare(`SELECT team_id, status, COUNT(*) AS count FROM ideas WHERE team_id IN ${inClause} GROUP BY team_id, status`)
      .all(...teamIds);

    const statusByWorkspace = new Map<number, Record<string, number>>();
    workspaceStatusRows.forEach((row) => {
      const teamId = Number(row.team_id);
      if (!statusByWorkspace.has(teamId)) {
        statusByWorkspace.set(teamId, Object.fromEntries(IDEA_STATUS.map((key) => [key, 0])));
      }
      const target = statusByWorkspace.get(teamId);
      if (target && Object.prototype.hasOwnProperty.call(target, row.status)) {
        target[row.status] = Number(row.count || 0);
      }
    });

    const workspaces = workspaceRows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon || "📁",
      color: row.color || "#6366f1",
      ideaCount: Number(row.idea_count || 0),
      recentActivity: Number(row.recent_activity || 0),
      lastUpdatedAt: Number(row.last_updated_at || 0),
      statusCounts: statusByWorkspace.get(Number(row.id)) || Object.fromEntries(IDEA_STATUS.map((key) => [key, 0]))
    }));

    const totalIdeas = db.prepare(`SELECT COUNT(*) AS count FROM ideas WHERE team_id IN ${inClause}`).get(...teamIds).count;
    const totalComments = db
      .prepare(`SELECT COUNT(*) AS count FROM comments c JOIN ideas i ON i.id = c.idea_id WHERE i.team_id IN ${inClause}`)
      .get(...teamIds).count;

    const statusRows = db.prepare(`SELECT status, COUNT(*) AS count FROM ideas WHERE team_id IN ${inClause} GROUP BY status`).all(...teamIds);
    const statusCounts = Object.fromEntries(IDEA_STATUS.map((key) => [key, 0]));
    statusRows.forEach((row) => {
      statusCounts[row.status] = row.count;
    });

    const recentIdeas = db
      .prepare(
        `SELECT i.*, u.name AS author_name, w.name AS workspace_name,
                (SELECT COUNT(*) FROM comments c WHERE c.idea_id = i.id) AS comment_count,
                (SELECT COUNT(*) FROM reactions r WHERE r.idea_id = i.id) AS reaction_count,
                (SELECT COUNT(*) FROM idea_versions v WHERE v.idea_id = i.id) AS version_count
         FROM ideas i
         JOIN users u ON u.id = i.author_id
         JOIN workspaces w ON w.id = i.team_id
         WHERE i.team_id IN ${inClause}
         ORDER BY i.updated_at DESC
         LIMIT 12`
      )
      .all(...teamIds)
      .map((row) => ({
        ...toIdeaPayload(row),
        authorName: row.author_name,
        workspaceName: row.workspace_name,
        commentCount: row.comment_count,
        reactionCount: row.reaction_count,
        versionCount: row.version_count,
        priorityLevel: ideaPriorityLevel(row)
      }));

    const recentActivity = db
      .prepare(
        `SELECT event_type, COUNT(*) AS count
         FROM events
         WHERE team_id IN ${inClause} AND created_at >= ?
         GROUP BY event_type
         ORDER BY count DESC
         LIMIT 8`
      )
      .all(...teamIds, sevenDaysAgo)
      .map((row) => ({ type: row.event_type, count: row.count }));

    const recentActivityTotal = Number(
      db
        .prepare(`SELECT COUNT(*) AS count FROM events WHERE team_id IN ${inClause} AND created_at >= ?`)
        .get(...teamIds, sevenDaysAgo)?.count || 0
    );

    return json({
      metrics: {
        totalIdeas,
        totalComments,
        activeIdeas: statusCounts.seed + statusCounts.sprout + statusCounts.grow,
        totalWorkspaces: workspaces.length,
        recentActivity: recentActivityTotal
      },
      statusCounts,
      recentActivity,
      workspaces,
      recentIdeas
    });
  }

  if (s[0] === "ideas" && s.length === 1 && method === "GET") {
    const url = new URL(request.url);
    const scope = normalizeText(url.searchParams.get("scope")) || "workspace";
    const workspaceIdFilter = Number(url.searchParams.get("workspaceId"));
    const statusFilter = normalizeText(url.searchParams.get("status"));
    const categoryFilter = normalizeText(url.searchParams.get("category"));
    const query = normalizeText(url.searchParams.get("query"));
    const authorIdFilter = Number(url.searchParams.get("authorId"));
    const participantIdFilter = Number(url.searchParams.get("participantId"));
    const priorityFilter = normalizeText(url.searchParams.get("priority"));
    const createdFrom = Number(url.searchParams.get("createdFrom"));
    const createdTo = Number(url.searchParams.get("createdTo"));
    const updatedFrom = Number(url.searchParams.get("updatedFrom"));
    const updatedTo = Number(url.searchParams.get("updatedTo"));

    const where = [];
    const params = [];

    if (scope === "all") {
      where.push("EXISTS (SELECT 1 FROM workspace_members tm WHERE tm.team_id = i.team_id AND tm.user_id = ?)");
      params.push(ctx.user.id);
    } else {
      where.push("i.team_id = ?");
      params.push(ctx.session.teamId);
    }

    if (Number.isInteger(workspaceIdFilter) && workspaceIdFilter > 0) {
      where.push("i.team_id = ?");
      params.push(workspaceIdFilter);
    }
    if (statusFilter && IDEA_STATUS.includes(statusFilter as typeof IDEA_STATUS[number])) {
      where.push("i.status = ?");
      params.push(statusFilter);
    }
    if (categoryFilter) {
      where.push("i.category = ?");
      params.push(categoryFilter);
    }
    if (Number.isInteger(authorIdFilter) && authorIdFilter > 0) {
      where.push("i.author_id = ?");
      params.push(authorIdFilter);
    }
    if (Number.isInteger(participantIdFilter) && participantIdFilter > 0) {
      where.push(`(
        i.author_id = ?
        OR EXISTS (SELECT 1 FROM comments c WHERE c.idea_id = i.id AND c.user_id = ?)
      )`);
      params.push(participantIdFilter, participantIdFilter);
    }
    if (Number.isFinite(createdFrom) && createdFrom > 0) {
      where.push("i.created_at >= ?");
      params.push(createdFrom);
    }
    if (Number.isFinite(createdTo) && createdTo > 0) {
      where.push("i.created_at <= ?");
      params.push(createdTo);
    }
    if (Number.isFinite(updatedFrom) && updatedFrom > 0) {
      where.push("i.updated_at >= ?");
      params.push(updatedFrom);
    }
    if (Number.isFinite(updatedTo) && updatedTo > 0) {
      where.push("i.updated_at <= ?");
      params.push(updatedTo);
    }
    if (query) {
      where.push("(i.title LIKE ? OR i.category LIKE ? OR u.name LIKE ? OR w.name LIKE ?)");
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    const rows = db
      .prepare(
        `SELECT i.*, u.name AS author_name, w.name AS workspace_name,
                (SELECT COUNT(*) FROM comments c WHERE c.idea_id = i.id) AS comment_count,
                (SELECT COUNT(*) FROM reactions r WHERE r.idea_id = i.id) AS reaction_count,
                (SELECT COUNT(*) FROM idea_versions v WHERE v.idea_id = i.id) AS version_count
         FROM ideas i
         JOIN users u ON u.id = i.author_id
         JOIN workspaces w ON w.id = i.team_id
         WHERE ${where.join(" AND ")}
         ORDER BY i.updated_at DESC`
      )
      .all(...params);

    const filtered = priorityFilter
      ? rows.filter((row) => ideaPriorityLevel(row) === priorityFilter)
      : rows;

    return json({
      ideas: filtered.map((row) => ({
        ...toIdeaPayload(row),
        authorName: row.author_name,
        workspaceName: row.workspace_name,
        commentCount: row.comment_count,
        reactionCount: row.reaction_count,
        versionCount: row.version_count,
        priorityLevel: ideaPriorityLevel(row)
      }))
    });
  }

  if (s[0] === "ideas" && s.length === 1 && method === "POST") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
      return json({ error: "아이디어 생성 권한이 없습니다" }, 403);
    }
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
        "INSERT INTO ideas (team_id, author_id, title, category, status, blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(ctx.session.teamId, ctx.user.id, title, category, status, JSON.stringify(blocks), now, now);
    const ideaId = queries.extractInsertId(result);
    recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.created", { title, status, category });
    return json({ idea: toIdeaPayload(getIdeaForTeam(ideaId, ctx.session.teamId)) }, 201);
  }

  if (s[0] === "ideas" && s[1]) {
    const ideaId = Number(s[1]);
    const idea = getIdeaForTeam(ideaId, ctx.session.teamId);
    if (!idea) {
      return json({ error: "아이디어를 찾을 수 없습니다" }, 404);
    }

    if (s[2] === "collab" && s[3] === "checkpoint" && method === "GET") {
      return json({ checkpoint: toIdeaCollabCheckpoint(toIdeaPayload(idea)) });
    }

    if (s[2] === "collab" && s[3] === "checkpoint" && method === "PUT") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "편집 권한이 없습니다" }, 403);
      }
      const body = await readJsonBody(request);
      const baseUpdatedAt = Number(body.baseUpdatedAt);
      if (!Number.isFinite(baseUpdatedAt) || baseUpdatedAt <= 0) {
        return json({ error: "baseUpdatedAt는 필수입니다" }, 400);
      }

      const title = normalizeText(body.title) || idea.title;
      const blocks = parseBlocks(body.blocks);
      const now = Date.now();
      const updateResult = db.prepare(
        "UPDATE ideas SET title = ?, blocks_json = ?, updated_at = ? WHERE id = ? AND updated_at = ?"
      ).run(title, JSON.stringify(blocks), now, ideaId, baseUpdatedAt);

      if (!updateResult.changes) {
        const latestIdea = getIdeaForTeam(ideaId, ctx.session.teamId);
        return json({ error: "최신 변경사항과 충돌했습니다", checkpoint: latestIdea ? toIdeaCollabCheckpoint(toIdeaPayload(latestIdea)) : null }, 409);
      }

      const ideaUpdatePayload = getIdeaUpdateEventPayload(idea, {
        title,
        category: idea.category,
        status: idea.status,
        priority: String(idea.priority || "low"),
      });
      if (ideaUpdatePayload) {
        recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.updated", ideaUpdatePayload);
      }
      broadcastIdeaRefresh(ctx.session.teamId, ideaId, ctx.user.id, "idea.updated");

      const lastSnapshot = db.prepare(
        "SELECT created_at FROM idea_versions WHERE idea_id = ? AND version_label LIKE 'auto-%' ORDER BY created_at DESC LIMIT 1"
      ).get(ideaId) as { created_at: number } | undefined;
      if (shouldCreateAutoCheckpoint(lastSnapshot?.created_at, now)) {
        db.prepare(
          "INSERT INTO idea_versions (idea_id, version_label, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(ideaId, `auto-${new Date(now).toISOString().slice(0, 16).replace("T", " ")}`, JSON.stringify(blocks), ctx.user.id, now);
      }

      const latestIdea = getIdeaForTeam(ideaId, ctx.session.teamId);
      return json({ checkpoint: latestIdea ? toIdeaCollabCheckpoint(toIdeaPayload(latestIdea)) : null });
    }

    if (s.length === 2 && method === "GET") {
      return json({ idea: toIdeaPayload(idea) });
    }

    if (s.length === 2 && method === "PUT") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "편집 권한이 없습니다" }, 403);
      }
      const body = await readJsonBody(request);
      const baseUpdatedAt = Number(body.baseUpdatedAt);
      if (!Number.isFinite(baseUpdatedAt) || baseUpdatedAt <= 0) {
        return json({ error: "baseUpdatedAt는 필수입니다" }, 400);
      }
      const title = normalizeText(body.title) || idea.title;
      const category = normalizeText(body.category) || idea.category;
      const status = normalizeText(body.status) || idea.status;
      const priority = body.priority && ["low", "medium", "high"].includes(String(body.priority))
        ? String(body.priority)
        : String(idea.priority || "low");
      const blocks = parseBlocks(body.blocks);
      const ideaUpdatePayload = getIdeaUpdateEventPayload(idea, { title, category, status, priority });
    const ideaStatuses: readonly string[] = IDEA_STATUS;
      if (!ideaStatuses.includes(status)) {
      return json({ error: "유효하지 않은 상태입니다" }, 400);
      }
      const now = Date.now();
      const updateResult = db.prepare("UPDATE ideas SET title = ?, category = ?, status = ?, priority = ?, blocks_json = ?, updated_at = ? WHERE id = ? AND updated_at = ?").run(
        title,
        category,
        status,
        priority,
        JSON.stringify(blocks),
        now,
        ideaId,
        baseUpdatedAt
      );
      if (!updateResult.changes) {
        const latestIdea = getIdeaForTeam(ideaId, ctx.session.teamId);
        return json({ error: "최신 변경사항과 충돌했습니다", idea: latestIdea ? toIdeaPayload(latestIdea) : null }, 409);
      }
      if (ideaUpdatePayload) {
        recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.updated", ideaUpdatePayload);
      }
      broadcastIdeaRefresh(ctx.session.teamId, ideaId, ctx.user.id, "idea.updated");

      const lastSnapshot = db.prepare(
        "SELECT created_at FROM idea_versions WHERE idea_id = ? AND version_label LIKE 'auto-%' ORDER BY created_at DESC LIMIT 1"
      ).get(ideaId) as { created_at: number } | undefined;
      if (shouldCreateAutoCheckpoint(lastSnapshot?.created_at, now)) {
        db.prepare(
          "INSERT INTO idea_versions (idea_id, version_label, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(ideaId, `auto-${new Date(now).toISOString().slice(0, 16).replace("T", " ")}`, JSON.stringify(blocks), ctx.user.id, now);
      }

      return json({ idea: toIdeaPayload(getIdeaForTeam(ideaId, ctx.session.teamId)) });
    }

    if (s.length === 2 && method === "DELETE") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "deleter")) {
        return json({ error: "삭제 권한이 없습니다" }, 403);
      }
      clearIdeaPresenceForIdea(ctx.session.teamId, ideaId);
      db.prepare("DELETE FROM ideas WHERE id = ? AND team_id = ?").run(ideaId, ctx.session.teamId);
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "idea.deleted", { title: idea.title });
      return json({ ok: true });
    }

    if (s[2] === "presence" && method === "GET") {
      return json({
        ideaId,
        presence: listIdeaPresence(ctx.session.teamId, ideaId),
        ttlMs: IDEA_PRESENCE_TTL_MS
      });
    }

    if (s[2] === "presence" && method === "POST") {
      const body = await readJsonBody(request);
      const blockId = normalizeText(body.blockId);
      const rawCursor = Number(body.cursorOffset);
      const cursorOffset = Number.isFinite(rawCursor) ? Math.max(0, Math.trunc(rawCursor)) : null;
      const isTyping = Boolean(body.typing);

      if (!blockId) {
        clearIdeaPresence(ctx.session.teamId, ideaId, ctx.user.id);
        return json({
          ok: true,
          ideaId,
          presence: listIdeaPresence(ctx.session.teamId, ideaId)
        });
      }

      const ids = ideaBlockIds(idea);
      if (!ids.has(blockId)) {
        clearIdeaPresence(ctx.session.teamId, ideaId, ctx.user.id);
        return json({
          ok: true,
          ignored: true,
          reason: "unsynced-block",
          ideaId,
          presence: listIdeaPresence(ctx.session.teamId, ideaId),
          ttlMs: IDEA_PRESENCE_TTL_MS
        });
      }

      if (shouldThrottleIdeaPresence(ctx.session.teamId, ideaId, ctx.user.id)) {
        return json({
          ok: true,
          throttled: true,
          ideaId,
          presence: listIdeaPresence(ctx.session.teamId, ideaId),
          ttlMs: IDEA_PRESENCE_TTL_MS
        });
      }

      upsertIdeaPresence(ctx.session.teamId, ideaId, ctx.user, blockId, cursorOffset, isTyping);
      return json({
        ok: true,
        ideaId,
        presence: listIdeaPresence(ctx.session.teamId, ideaId),
        ttlMs: IDEA_PRESENCE_TTL_MS
      });
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
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "댓글 작성 권한이 없습니다" }, 403);
      }
      const rateLimitResponse = enforceMutationRateLimit(request, "comment-create", `${ctx.user.id}:${ideaId}`);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
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
        .get(queries.extractInsertId(result));
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

    if (s[2] === "comments" && s[3] && method === "PUT") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "댓글 수정 권한이 없습니다" }, 403);
      }
      const commentId = Number(s[3]);
      const existing = db.prepare("SELECT * FROM comments WHERE id = ? AND idea_id = ?").get(commentId, ideaId);
      if (!existing) {
        return json({ error: "댓글을 찾을 수 없습니다" }, 404);
      }
      const canModerate = hasMinRole(ctx.session.teamId, ctx.user.id, "admin");
      if (existing.user_id !== ctx.user.id && !canModerate) {
        return json({ error: "댓글 수정 권한이 없습니다" }, 403);
      }
      const rateLimitResponse = enforceMutationRateLimit(request, "comment-update", `${ctx.user.id}:${ideaId}`);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      const body = await readJsonBody(request);
      const content = normalizeText(body.content);
      if (!content) {
        return json({ error: "내용은 필수입니다" }, 400);
      }
      const updateResult = db.prepare("UPDATE comments SET content = ? WHERE id = ? AND idea_id = ?").run(content, commentId, ideaId);
      if (!updateResult.changes) {
        return json({ error: "댓글을 찾을 수 없습니다" }, 404);
      }
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "comment.updated", { commentId, blockId: existing.block_id || null });
      const updated = db
        .prepare("SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ? LIMIT 1")
        .get(commentId);
      if (!updated) {
        return json({ error: "댓글을 찾을 수 없습니다" }, 404);
      }
      return json({
        comment: {
          id: updated.id,
          ideaId: updated.idea_id,
          userId: updated.user_id,
          userName: updated.user_name,
          parentId: updated.parent_id,
          blockId: updated.block_id,
          content: updated.content,
          createdAt: updated.created_at,
          isInline: Boolean(updated.block_id)
        }
      });
    }

    if (s[2] === "comments" && s[3] && method === "DELETE") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "댓글 삭제 권한이 없습니다" }, 403);
      }
      const rateLimitResponse = enforceMutationRateLimit(request, "comment-delete", `${ctx.user.id}:${ideaId}`);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      const commentId = Number(s[3]);
      const existing = db.prepare("SELECT * FROM comments WHERE id = ? AND idea_id = ?").get(commentId, ideaId);
      if (!existing) {
        return json({ error: "댓글을 찾을 수 없습니다" }, 404);
      }
      const canModerate = hasMinRole(ctx.session.teamId, ctx.user.id, "admin");
      if (existing.user_id !== ctx.user.id && !canModerate) {
        return json({ error: "댓글 삭제 권한이 없습니다" }, 403);
      }
      const deleteResult = db.prepare("DELETE FROM comments WHERE id = ? AND idea_id = ?").run(commentId, ideaId);
      if (!deleteResult.changes) {
        return json({ error: "댓글을 찾을 수 없습니다" }, 404);
      }
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "comment.deleted", { commentId, blockId: existing.block_id || null });
      return json({ ok: true });
    }

    if (s[2] === "blocks" && s[3] && s[4] === "file" && method === "POST") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "파일 업로드 권한이 없습니다" }, 403);
      }
      const rateLimitResponse = enforceMutationRateLimit(request, "block-upload", `${ctx.user.id}:${ideaId}`);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      const blockId = normalizeText(s[3]);
      const currentIdea = getIdeaForTeam(ideaId, ctx.session.teamId);
      if (!currentIdea) {
        return json({ error: "아이디어를 찾을 수 없습니다" }, 404);
      }
      const form = await request.formData();
      const baseUpdatedAt = Number(form.get("baseUpdatedAt"));
      if (!Number.isFinite(baseUpdatedAt) || baseUpdatedAt <= 0) {
        return json({ error: "baseUpdatedAt는 필수입니다" }, 400);
      }
      if (Number(currentIdea.updated_at) !== baseUpdatedAt) {
        return json({ error: "최신 변경사항과 충돌했습니다", idea: toIdeaPayload(currentIdea) }, 409);
      }
      const blocks = parseStoredIdeaBlocks(currentIdea.blocks_json);
      const index = blocks.findIndex((block) => String(block?.id || "") === blockId);
      if (index < 0) {
        return json({ error: "블록을 찾을 수 없습니다" }, 404);
      }

      const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function" || !file.name) {
        return json({ error: "업로드할 파일이 필요합니다" }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const nextBlockType = inferUploadedBlockType(String(blocks[index]?.type || "file"), file.name, file.type);
      const validationError = validateUploadedBlockFile(nextBlockType, file, buffer);
      if (validationError) {
        return json({ error: validationError.message }, validationError.status);
      }

      const ext = path.extname(file.name);
      const base = path.basename(file.name, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
      const serverName = `${Date.now()}-${base}${ext}`;
      const uploadDir = uploadDestination();
      const absolute = path.join(uploadDir, serverName);
      fs.writeFileSync(absolute, buffer);

      const fileBlock = {
        name: file.name,
        size: Number(buffer.length || 0),
        type: resolveUploadedMimeType(file, buffer),
        filePath: `/uploads/${serverName}`,
        status: "uploaded",
        uploadedAt: Date.now(),
        uploadedBy: ctx.user.id
      };

      blocks[index] = {
        ...blocks[index],
        type: nextBlockType,
        content: JSON.stringify(fileBlock)
      };

      const now = Date.now();
      const updateResult = db.prepare("UPDATE ideas SET blocks_json = ?, updated_at = ? WHERE id = ? AND updated_at = ?").run(JSON.stringify(blocks), now, ideaId, baseUpdatedAt);
      if (!updateResult.changes) {
        fs.rmSync(absolute, { force: true });
        const latestIdea = getIdeaForTeam(ideaId, ctx.session.teamId);
        return json({ error: "최신 변경사항과 충돌했습니다", idea: latestIdea ? toIdeaPayload(latestIdea) : null }, 409);
      }
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "block.file.uploaded", { blockId, fileName: file.name });
      broadcastIdeaRefresh(ctx.session.teamId, ideaId, ctx.user.id, "block.file.uploaded");
      return json({ fileBlock, idea: toIdeaPayload(getIdeaForTeam(ideaId, ctx.session.teamId)) });
    }

    if (s[2] === "reactions" && method === "GET") {
      const reactionUrl = new URL(request.url);
      const targetType = normalizeText(reactionUrl.searchParams.get("targetType")) || "idea";
      const targetId = normalizeText(reactionUrl.searchParams.get("targetId")) || "";
      if (targetType === "idea" && targetId) {
        return json({ error: "아이디어 리액션 targetId는 비어 있어야 합니다" }, 400);
      }
      if (targetType === "block") {
        const ids = ideaBlockIds(idea);
        if (!ids.has(targetId)) {
          return json({
            reactions: [],
            mine: [],
            ignored: true,
            reason: "unsynced-block",
          });
        }
      }
      if (targetType === "comment") {
        const parts = targetId.split(":");
        if (parts.length !== 2) {
          return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
        }
        const [scope, rawId] = parts;
        const commentId = Number(rawId);
        if (!Number.isInteger(commentId) || commentId <= 0) {
          return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
        }
        if (scope === "idea") {
          const row = db.prepare("SELECT id FROM comments WHERE id = ? AND idea_id = ?").get(commentId, ideaId);
          if (!row) {
            return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
          }
        } else {
          return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
        }
      }
      if (!["idea", "block", "comment"].includes(targetType)) {
        return json({ error: "지원하지 않는 리액션 대상 유형입니다" }, 400);
      }
      const reactions = db
        .prepare("SELECT emoji, COUNT(*) AS count FROM reactions WHERE idea_id = ? AND target_type = ? AND target_id = ? GROUP BY emoji ORDER BY count DESC, emoji ASC")
        .all(ideaId, targetType, targetId)
        .map((row) => ({ emoji: row.emoji, count: row.count }));
      const mine = db
        .prepare("SELECT emoji FROM reactions WHERE idea_id = ? AND user_id = ? AND target_type = ? AND target_id = ?")
        .all(ideaId, ctx.user.id, targetType, targetId)
        .map((row) => row.emoji);
      return json({ reactions, mine });
    }

    if (s[2] === "reactions" && method === "POST") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "리액션 권한이 없습니다" }, 403);
      }
      const rateLimitResponse = enforceMutationRateLimit(request, "reaction", `${ctx.user.id}:${ideaId}`);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      const body = await readJsonBody(request);
      const emoji = normalizeText(body.emoji);
      const targetType = normalizeText(body.targetType) || "idea";
      const targetId = normalizeText(body.targetId) || "";
      if (!emoji) return json({ error: "이모지는 필수입니다" }, 400);
      if (targetType === "idea" && targetId) {
        return json({ error: "아이디어 리액션 targetId는 비어 있어야 합니다" }, 400);
      }
      if (targetType === "block") {
        const ids = ideaBlockIds(idea);
        if (!ids.has(targetId)) {
          return json({ error: "유효하지 않은 블록 리액션 대상입니다" }, 400);
        }
      }
      if (targetType === "comment") {
        const parts = targetId.split(":");
        if (parts.length !== 2) {
          return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
        }
        const [scope, rawId] = parts;
        const commentId = Number(rawId);
        if (!Number.isInteger(commentId) || commentId <= 0) {
          return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
        }
        if (scope === "idea") {
          const row = db.prepare("SELECT id FROM comments WHERE id = ? AND idea_id = ?").get(commentId, ideaId);
          if (!row) {
            return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
          }
        } else {
          return json({ error: "유효하지 않은 댓글 리액션 대상입니다" }, 400);
        }
      }
      if (!["idea", "block", "comment"].includes(targetType)) {
        return json({ error: "지원하지 않는 리액션 대상 유형입니다" }, 400);
      }
      const existing = db
        .prepare("SELECT id FROM reactions WHERE idea_id = ? AND user_id = ? AND emoji = ? AND target_type = ? AND target_id = ?")
        .get(ideaId, ctx.user.id, emoji, targetType, targetId);
      if (existing) {
        db.prepare("DELETE FROM reactions WHERE id = ?").run(existing.id);
        recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "reaction.removed", { emoji, targetType, targetId });
        return json({ toggled: false });
      }
      try {
        db.prepare("INSERT INTO reactions (idea_id, user_id, emoji, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          ideaId, ctx.user.id, emoji, targetType, targetId, Date.now()
        );
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
        return json({ toggled: true, conflictSafe: true });
      }
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "reaction.added", { emoji, targetType, targetId });
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
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "버전 생성 권한이 없습니다" }, 403);
      }
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
      const createdVersionId = queries.extractInsertId(result);
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "version.created", { versionLabel, versionId: createdVersionId });
      const created = db
        .prepare("SELECT v.*, u.name AS creator_name FROM idea_versions v JOIN users u ON u.id = v.created_by WHERE v.id = ?")
        .get(createdVersionId);

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

    if (s[2] === "versions" && s[3] && s[4] === "restore" && method === "POST") {
      if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
        return json({ error: "버전 복원 권한이 없습니다" }, 403);
      }
      const versionId = Number(s[3]);
      const versionRow = db.prepare("SELECT * FROM idea_versions WHERE id = ? AND idea_id = ?").get(versionId, ideaId) as {
        id: number; notes: string | null; version_label: string
      } | undefined;
      if (!versionRow) return json({ error: "버전을 찾을 수 없습니다" }, 404);
      const restoredBlocks = parseStoredIdeaBlocks(versionRow.notes);
      const now = Date.now();
      const restoredBlocksJson = JSON.stringify(restoredBlocks);
      const restoredLabel = `복원-${versionRow.version_label}`;
      const restoredVersion = restoreIdeaVersionSnapshot(db, queries, {
        ideaId,
        restoredBlocksJson,
        restoredLabel,
        createdBy: ctx.user.id,
        now,
      });
      recordTeamEvent(ctx.session.teamId, ideaId, ctx.user.id, "version.restored", {
        from: versionRow.version_label,
        versionLabel: versionRow.version_label,
        versionId: versionRow.id,
        sourceVersionId: versionRow.id,
        sourceVersionLabel: versionRow.version_label,
        restoredVersionId: restoredVersion.restoredVersionId,
        restoredVersionLabel: restoredLabel
      });
      broadcastIdeaRefresh(ctx.session.teamId, ideaId, ctx.user.id, "version.restored");
      return json({ idea: toIdeaPayload(getIdeaForTeam(ideaId, ctx.session.teamId)) });
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
          payload: parseStoredJsonObject(row.payload_json),
          actor: row.user_name || "시스템",
          createdAt: row.created_at
        }));
      return json({ timeline });
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

    const mutedTypes = excludeMuted ? getMutedTypesForUser(ctx.user.id) : [];
    const rows = queries.listNotificationsForUser({
      userId: ctx.user.id,
      teamId: ctx.session.teamId,
      limit,
      since,
      unreadOnly,
      eventType,
      mentionsOnly,
      mutedTypes
    });

    const unreadCount = queries.countUnreadNotificationsForUser({
      userId: ctx.user.id,
      teamId: ctx.session.teamId
    });

    return json({ notifications: rows.map(toNotificationPayload), unreadCount });
  }

  if (s[0] === "notifications" && s[1] === "stream" && method === "GET") {
    const teamId = ctx.session.teamId;
    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const clients = getTeamStreamClients(teamId);

    let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const userInfo = { userId: ctx.user.id, name: ctx.user.name };
        clients.set(clientId, { controller, userId: ctx.user.id });
        controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${JSON.stringify({ ok: true, teamId, user: userInfo })}\n\n`));

        keepAliveTimer = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(": ping\n\n"));
          } catch {
            // client disconnected — expected during SSE teardown
          }
        }, 25000);

        request.signal.addEventListener("abort", () => {
          clearInterval(keepAliveTimer);
          removeTeamStreamClient(teamId, clientId);
          try {
            controller.close();
          } catch {
            // already closed — expected during SSE teardown
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
    const eventRow = queries.findReadableNotificationEventById({
      eventId,
      teamId: ctx.session.teamId,
      userId: ctx.user.id
    });
    if (!eventRow) {
      return json({ error: "알림을 찾을 수 없습니다" }, 404);
    }
    queries.insertNotificationReadIfMissing({ userId: ctx.user.id, eventId, readAt: Date.now() });
    return json({ ok: true });
  }

  if (s[0] === "notifications" && s[1] === "read-all" && method === "POST") {
    const now = Date.now();
    queries.insertNotificationReadsForUserIfMissing({ userId: ctx.user.id, readAt: now, teamId: ctx.session.teamId });
    return json({ ok: true });
  }

  if (s[0] === "notifications" && s[1] === "preferences" && method === "GET") {
    return json({ mutedTypes: getMutedTypesForUser(ctx.user.id) });
  }

    if (s[0] === "notifications" && s[1] === "preferences" && method === "PUT") {
      const rateLimitResponse = enforceMutationRateLimit(request, "notification-preferences", ctx.user.id);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
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
        webhookUrl: maskWebhookUrl(row.webhook_url),
        enabled: Boolean(row.enabled),
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    return json({ webhooks });
  }

  if (s[0] === "integrations" && s[1] === "webhooks" && s[2] === "deliveries" && method === "GET") {
      await processWebhookQueue(db, formatNotificationMessage);
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
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "admin")) {
      return json({ error: "웹훅 수정 권한이 없습니다" }, 403);
    }
    const rateLimitResponse = enforceMutationRateLimit(request, "webhook-update", `${ctx.user.id}:${ctx.session.teamId}`);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
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
        webhookUrl: maskWebhookUrl(webhook.webhook_url),
        enabled: Boolean(webhook.enabled),
        createdBy: webhook.created_by,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at
      }
    });
  }

  if (s[0] === "workspace" && s[1] === "views" && s.length === 2 && method === "GET") {
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "viewer")) {
      return json({ error: "권한이 없습니다" }, 403);
    }
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
        const config = parseStoredJsonObject(row.config_json);
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
    if (!hasMinRole(ctx.session.teamId, ctx.user.id, "editor")) {
      return json({ error: "권한이 없습니다" }, 403);
    }
    const rateLimitResponse = enforceMutationRateLimit(request, "workspace-view-create", `${ctx.user.id}:${ctx.session.teamId}`);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const body = await readJsonBody(request);
    const name = normalizeText(body.name);
    if (!name) {
      return json({ error: "이름은 필수입니다" }, 400);
    }
    const config = normalizeWorkspaceViewConfig(body.config);
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
  } catch (error) {
    if (error instanceof RequestValidationError) {
      if (error.status === 403 || error.status === 415 || error.status === 429) {
        let requestPath = "";
        try {
          requestPath = new URL(request.url).pathname;
        } catch {
          // ignore
        }
        reportServerIssue("api", "request rejected", {
          status: error.status,
          message: error.message,
          method,
          path: requestPath,
          slug
        });
      }
      return json({ error: error.message }, error.status);
    }
    throw error;
  }
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

export async function PATCH(request, context) {
  const params = await context.params;
  const slug = params?.slug || [];
  return handleRequest(request, slug, "PATCH");
}
