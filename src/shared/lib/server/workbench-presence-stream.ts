import { broadcastWorkbenchSocketEvent } from "@/shared/lib/server/workbench-ws-hub";

export const IDEA_PRESENCE_TTL_MS = 15000;
const IDEA_PRESENCE_MIN_UPDATE_MS = 500;
const encoder = new TextEncoder();

type StreamClient = { controller: ReadableStreamDefaultController; userId: number };
type IdeaPresenceEntry = {
  userId: number;
  userName: string;
  blockId: string;
  cursorOffset: number | null;
  isTyping: boolean;
  updatedAt: number;
  expiresAt: number;
};

type PresenceStreamGlobal = typeof globalThis & {
  __mumurStreamClients?: Map<number, Map<string, StreamClient>>;
  __mumurIdeaPresence?: Map<number, Map<number, Map<number, IdeaPresenceEntry>>>;
  __mumurIdeaPresenceRateLimit?: Map<string, number>;
  __mumurIdeaPresenceCleanupTimers?: Map<string, ReturnType<typeof setTimeout>>;
};

const globalRef = globalThis as PresenceStreamGlobal;

if (!globalRef.__mumurStreamClients) {
  globalRef.__mumurStreamClients = new Map<number, Map<string, StreamClient>>();
}

if (!globalRef.__mumurIdeaPresence) {
  globalRef.__mumurIdeaPresence = new Map<number, Map<number, Map<number, IdeaPresenceEntry>>>();
}

if (!globalRef.__mumurIdeaPresenceRateLimit) {
  globalRef.__mumurIdeaPresenceRateLimit = new Map<string, number>();
}

if (!globalRef.__mumurIdeaPresenceCleanupTimers) {
  globalRef.__mumurIdeaPresenceCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
}

const streamClients = globalRef.__mumurStreamClients;
const ideaPresence = globalRef.__mumurIdeaPresence;
const ideaPresenceRateLimit = globalRef.__mumurIdeaPresenceRateLimit;
const ideaPresenceCleanupTimers = globalRef.__mumurIdeaPresenceCleanupTimers;

function ideaPresenceTimerKey(teamId: number, ideaId: number) {
  return `${teamId}:${ideaId}`;
}

function clearIdeaPresenceCleanupTimer(teamId: number, ideaId: number) {
  const key = ideaPresenceTimerKey(teamId, ideaId);
  const timer = ideaPresenceCleanupTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    ideaPresenceCleanupTimers.delete(key);
  }
}

export function getTeamStreamClients(teamId: number) {
  if (!streamClients.has(teamId)) {
    streamClients.set(teamId, new Map());
  }
  return streamClients.get(teamId)!;
}

export function removeTeamStreamClient(teamId: number, clientId: string) {
  const teamClients = streamClients.get(teamId);
  if (!teamClients) {
    return;
  }
  teamClients.delete(clientId);
  if (!teamClients.size) {
    streamClients.delete(teamId);
  }
}

export function broadcastTeamStreamEvent(teamId: number, eventName: string, payload: unknown) {
  const clients = streamClients.get(teamId);
  if (clients?.size) {
    const line = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    const staleClientIds: string[] = [];
    clients.forEach((client, clientId) => {
      try {
        client.controller.enqueue(encoder.encode(line));
      } catch {
        staleClientIds.push(clientId);
      }
    });
    staleClientIds.forEach((clientId) => {
      removeTeamStreamClient(teamId, clientId);
    });
  }

  broadcastWorkbenchSocketEvent(teamId, eventName, payload);
}

function ideaPresenceTeamMap(teamId: number) {
  if (!ideaPresence.has(teamId)) {
    ideaPresence.set(teamId, new Map());
  }
  return ideaPresence.get(teamId)!;
}

function ideaPresenceIdeaMap(teamId: number, ideaId: number) {
  const teamMap = ideaPresenceTeamMap(teamId);
  if (!teamMap.has(ideaId)) {
    teamMap.set(ideaId, new Map());
  }
  return teamMap.get(ideaId)!;
}

function pruneIdeaPresence(teamId: number, ideaId: number) {
  const teamMap = ideaPresence.get(teamId);
  if (!teamMap) {
    clearIdeaPresenceCleanupTimer(teamId, ideaId);
    return 0;
  }
  const ideaMap = teamMap.get(ideaId);
  if (!ideaMap) {
    clearIdeaPresenceCleanupTimer(teamId, ideaId);
    return 0;
  }
  const now = Date.now();
  let removed = 0;
  ideaMap.forEach((entry, userId) => {
    if (entry.expiresAt <= now) {
      ideaMap.delete(userId);
      removed += 1;
    }
  });
  if (!ideaMap.size) {
    teamMap.delete(ideaId);
  }
  if (!teamMap.size) {
    ideaPresence.delete(teamId);
  }
  if (!ideaPresence.get(teamId)?.get(ideaId)) {
    clearIdeaPresenceCleanupTimer(teamId, ideaId);
  }
  return removed;
}

function scheduleIdeaPresenceCleanup(teamId: number, ideaId: number) {
  clearIdeaPresenceCleanupTimer(teamId, ideaId);
  const ideaMap = ideaPresence.get(teamId)?.get(ideaId);
  if (!ideaMap || !ideaMap.size) {
    return;
  }
  let earliestExpiry = Number.POSITIVE_INFINITY;
  ideaMap.forEach((entry) => {
    earliestExpiry = Math.min(earliestExpiry, entry.expiresAt);
  });
  if (!Number.isFinite(earliestExpiry)) {
    return;
  }
  const delay = Math.max(0, earliestExpiry - Date.now());
  const timerKey = ideaPresenceTimerKey(teamId, ideaId);
  const timer = setTimeout(() => {
    ideaPresenceCleanupTimers.delete(timerKey);
    const removed = pruneIdeaPresence(teamId, ideaId);
    if (removed > 0) {
      broadcastIdeaPresence(teamId, ideaId);
      return;
    }
    scheduleIdeaPresenceCleanup(teamId, ideaId);
  }, delay);
  ideaPresenceCleanupTimers.set(timerKey, timer);
}

export function listIdeaPresence(teamId: number, ideaId: number) {
  pruneIdeaPresence(teamId, ideaId);
  scheduleIdeaPresenceCleanup(teamId, ideaId);
  const teamMap = ideaPresence.get(teamId);
  const ideaMap = teamMap?.get(ideaId);
  if (!ideaMap) {
    return [];
  }
  return [...ideaMap.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({
      userId: entry.userId,
      userName: entry.userName,
      blockId: entry.blockId,
      cursorOffset: entry.cursorOffset,
      isTyping: entry.isTyping,
      updatedAt: entry.updatedAt
    }));
}

function broadcastIdeaPresence(teamId: number, ideaId: number) {
  broadcastTeamStreamEvent(teamId, "idea.presence", {
    teamId,
    ideaId,
    presence: listIdeaPresence(teamId, ideaId),
    sentAt: Date.now()
  });
}

export function upsertIdeaPresence(
  teamId: number,
  ideaId: number,
  user: { id: number; name?: string | null },
  blockId: string,
  cursorOffset: number | null,
  isTyping = false
) {
  const now = Date.now();
  const ideaMap = ideaPresenceIdeaMap(teamId, ideaId);
  ideaMap.set(user.id, {
    userId: user.id,
    userName: user.name || "사용자",
    blockId,
    cursorOffset,
    isTyping,
    updatedAt: now,
    expiresAt: now + IDEA_PRESENCE_TTL_MS
  });
  scheduleIdeaPresenceCleanup(teamId, ideaId);
  broadcastIdeaPresence(teamId, ideaId);
}

export function shouldThrottleIdeaPresence(teamId: number, ideaId: number, userId: number) {
  const now = Date.now();
  const key = `${teamId}:${ideaId}:${userId}`;
  const last = Number(ideaPresenceRateLimit.get(key) || 0);
  if (now - last < IDEA_PRESENCE_MIN_UPDATE_MS) {
    return true;
  }
  ideaPresenceRateLimit.set(key, now);
  return false;
}

export function clearIdeaPresence(teamId: number, ideaId: number, userId: number) {
  const teamMap = ideaPresence.get(teamId);
  const ideaMap = teamMap?.get(ideaId);
  if (!ideaMap) {
    return;
  }
  if (ideaMap.delete(userId)) {
    broadcastIdeaPresence(teamId, ideaId);
  }
  if (!ideaMap.size) {
    teamMap?.delete(ideaId);
    clearIdeaPresenceCleanupTimer(teamId, ideaId);
  } else {
    scheduleIdeaPresenceCleanup(teamId, ideaId);
  }
  if (teamMap && !teamMap.size) {
    ideaPresence.delete(teamId);
  }
}

export function clearIdeaPresenceForIdea(teamId: number, ideaId: number) {
  const teamMap = ideaPresence.get(teamId);
  if (!teamMap) {
    return;
  }
  clearIdeaPresenceCleanupTimer(teamId, ideaId);
  if (teamMap.delete(ideaId)) {
    broadcastIdeaPresence(teamId, ideaId);
  }
  if (!teamMap.size) {
    ideaPresence.delete(teamId);
  }
}
