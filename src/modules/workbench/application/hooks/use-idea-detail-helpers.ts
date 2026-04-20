import type { QueryClient } from "@tanstack/react-query";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import { ApiError } from "@/shared/lib/api-client";
import type { Comment, Idea, IdeaVersion, TimelineEvent } from "@/shared/types";

export type IdeaBlockPresence = {
  userId: number;
  userName: string;
  blockId: string;
  cursorOffset: number | null;
  isTyping?: boolean;
  updatedAt: number;
};

export type ReactionsByTarget = Record<string, { reactions: Array<{ emoji: string; count: number }>; mine: string[] }>;

export type ReactionTargetResponse = {
  reactions?: Array<{ emoji: string; count: number }>;
  mine?: string[];
};

const INVALID_BLOCK_REACTION_TARGET_ERROR = "유효하지 않은 블록 리액션 대상입니다";

function normalizeBlockShape(block: Partial<Idea["blocks"][number]> | null | undefined) {
  return {
    id: String(block?.id || ""),
    type: String(block?.type || "text"),
    content: String(block?.content || ""),
    checked: Boolean(block?.checked),
  };
}

function blockShapeEqual(left: Partial<Idea["blocks"][number]> | null | undefined, right: Partial<Idea["blocks"][number]> | null | undefined) {
  const normalizedLeft = normalizeBlockShape(left);
  const normalizedRight = normalizeBlockShape(right);
  return normalizedLeft.id === normalizedRight.id
    && normalizedLeft.type === normalizedRight.type
    && normalizedLeft.content === normalizedRight.content
    && normalizedLeft.checked === normalizedRight.checked;
}

function normalizeIdeaPresenceEntry(entry: Partial<IdeaBlockPresence> | null | undefined): IdeaBlockPresence | null {
  const userId = Number(entry?.userId);
  const blockId = String(entry?.blockId || "").trim();
  const updatedAt = Number(entry?.updatedAt || 0);
  if (!Number.isFinite(userId) || !blockId) {
    return null;
  }
  return {
    userId,
    userName: String(entry?.userName || "사용자"),
    blockId,
    cursorOffset: typeof entry?.cursorOffset === "number" ? entry.cursorOffset : null,
    isTyping: Boolean(entry?.isTyping),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

function pruneIdeaPresenceEntries(entries: IdeaBlockPresence[], ttlMs: number) {
  const now = Date.now();
  return entries.filter((entry) => entry.updatedAt + ttlMs > now);
}

export function mergeIdeaPresenceEntries(entries: Array<Partial<IdeaBlockPresence> | null | undefined>, ttlMs: number) {
  const latestByUser = new Map<number, IdeaBlockPresence>();
  entries.forEach((entry) => {
    const normalized = normalizeIdeaPresenceEntry(entry);
    if (!normalized) {
      return;
    }
    const current = latestByUser.get(normalized.userId);
    if (!current || normalized.updatedAt >= current.updatedAt) {
      latestByUser.set(normalized.userId, normalized);
    }
  });
  return pruneIdeaPresenceEntries([...latestByUser.values()], ttlMs).sort((left, right) => right.updatedAt - left.updatedAt);
}

function hasBlockStructureChange(baseBlocks: Idea["blocks"] | null | undefined, latestBlocks: Idea["blocks"] | null | undefined) {
  const base = Array.isArray(baseBlocks) ? baseBlocks : [];
  const latest = Array.isArray(latestBlocks) ? latestBlocks : [];
  if (base.length !== latest.length) {
    return true;
  }
  for (let index = 0; index < base.length; index += 1) {
    if (String(base[index]?.id || "") !== String(latest[index]?.id || "")) {
      return true;
    }
  }
  return false;
}

export function canRetryUploadConflict(baseIdea: Idea, latestIdea: Idea, blockId: string) {
  if (hasBlockStructureChange(baseIdea.blocks, latestIdea.blocks)) {
    return false;
  }
  const baseBlock = (baseIdea.blocks || []).find((block) => String(block.id || "") === blockId);
  const latestBlock = (latestIdea.blocks || []).find((block) => String(block.id || "") === blockId);
  if (!baseBlock || !latestBlock) {
    return false;
  }
  return blockShapeEqual(baseBlock, latestBlock);
}

export function isStaleBlockReactionTargetError(error: unknown, targetType: string) {
  return (
    targetType === "block"
    && error instanceof ApiError
    && error.status === 400
    && error.message === INVALID_BLOCK_REACTION_TARGET_ERROR
  );
}

type LoadIdeaChildrenDataParams = {
  queryClient: QueryClient;
  ideaId: number;
  commentFilterBlockId: string;
  fetchIdeaComments: (ideaId: number, blockId: string) => Promise<{ comments?: Comment[] }>;
  fetchIdeaVersions: (ideaId: number) => Promise<{ versions?: IdeaVersion[] }>;
  fetchIdeaTimeline: (ideaId: number) => Promise<{ timeline?: TimelineEvent[] }>;
};

export async function loadIdeaChildrenData({
  queryClient,
  ideaId,
  commentFilterBlockId,
  fetchIdeaComments,
  fetchIdeaVersions,
  fetchIdeaTimeline,
}: LoadIdeaChildrenDataParams) {
  const [commentRes, versionRes, timelineRes] = await Promise.all([
    fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.ideaComments(ideaId, commentFilterBlockId),
      queryFn: () => fetchIdeaComments(ideaId, commentFilterBlockId),
    }),
    fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.ideaVersions(ideaId),
      queryFn: () => fetchIdeaVersions(ideaId),
    }),
    fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.ideaTimeline(ideaId),
      queryFn: () => fetchIdeaTimeline(ideaId),
    }),
  ]);

  return {
    comments: commentRes.comments || [],
    versions: versionRes.versions || [],
    timeline: timelineRes.timeline || [],
  };
}

export function buildIdeaChildReactionTargets(blockList: Array<{ id?: string }> | null | undefined, comments: Comment[]) {
  const blockTargets = (blockList || [])
    .map((block) => String(block?.id || ""))
    .filter(Boolean)
    .map((targetId) => ({ targetType: "block", targetId }));

  return [
    ...blockTargets,
    ...comments.map((comment) => ({ targetType: "comment", targetId: `idea:${comment.id}` })),
  ];
}

type LoadReactionTargetMapParams = {
  queryClient: QueryClient;
  ideaId: number;
  targets: Array<{ targetType: string; targetId: string }>;
  fetchReactionTarget: (ideaId: number, targetType: string, targetId: string) => Promise<ReactionTargetResponse>;
};

export async function loadReactionTargetMap({ queryClient, ideaId, targets, fetchReactionTarget }: LoadReactionTargetMapParams) {
  const uniq = Array.from(
    new Map(
      targets
        .filter((item) => item.targetType && item.targetId)
        .map((item) => [`${item.targetType}:${item.targetId}`, item])
    ).values()
  );

  if (!uniq.length) {
    return {} as ReactionsByTarget;
  }

  const rows = await Promise.all(
    uniq.map(async ({ targetType, targetId }) => {
      try {
        const data = await fetchFreshQuery(queryClient, {
          queryKey: workbenchQueryKeys.ideaReactions(ideaId, targetType, targetId),
          queryFn: () => fetchReactionTarget(ideaId, targetType, targetId),
        });
        return { key: `${targetType}:${targetId}`, data };
      } catch (error) {
        if (isStaleBlockReactionTargetError(error, targetType)) {
          return null;
        }
        throw error;
      }
    })
  );

  const next: ReactionsByTarget = {};
  rows.forEach((row) => {
    if (!row) {
      return;
    }
    next[row.key] = {
      reactions: row.data.reactions || [],
      mine: row.data.mine || [],
    };
  });
  return next;
}

type RealtimeSubscriptionClient = {
  retain: () => void;
  release: () => void;
  subscribe: (eventName: string, listener: (payload: unknown) => void) => () => void;
};

type SubscribeIdeaDetailRealtimeParams = {
  authed: boolean;
  selectedIdeaId: string | null;
  sessionUserId: number | string | null | undefined;
  realtimeClient: RealtimeSubscriptionClient;
  hydratePresence: () => void;
  refreshIdea: (ideaId: number) => void;
  queueIdeaEventRefresh: (ideaId: number) => void;
  handlePresencePayload: (payload: { presence?: IdeaBlockPresence[]; ttlMs?: number } | null) => void;
};

export function subscribeIdeaDetailRealtime({
  authed,
  selectedIdeaId,
  sessionUserId,
  realtimeClient,
  hydratePresence,
  refreshIdea,
  queueIdeaEventRefresh,
  handlePresencePayload,
}: SubscribeIdeaDetailRealtimeParams) {
  if (!authed || !selectedIdeaId) {
    return () => {};
  }

  const matchesIdea = (payload: { ideaId?: number } | null) => {
    const payloadIdeaId = Number(payload?.ideaId);
    return Number.isInteger(payloadIdeaId) && payloadIdeaId === Number(selectedIdeaId);
  };

  const isOwnEvent = (payload: { actorUserId?: number } | null) => Number(payload?.actorUserId) === Number(sessionUserId);

  realtimeClient.retain();
  const unsubscribeConnected = realtimeClient.subscribe("connected", () => {
    hydratePresence();
  });
  const unsubscribeRefresh = realtimeClient.subscribe("idea.refresh", (payload) => {
    const data = payload as { ideaId?: number; actorUserId?: number } | null;
    if (!matchesIdea(data) || isOwnEvent(data)) {
      return;
    }
    refreshIdea(Number(data?.ideaId));
  });
  const unsubscribePresence = realtimeClient.subscribe("idea.presence", (payload) => {
    const data = payload as { ideaId?: number; presence?: IdeaBlockPresence[]; ttlMs?: number } | null;
    if (!matchesIdea(data)) {
      return;
    }
    handlePresencePayload(data);
  });

  const bindIdeaEventRefresh = (eventName: string) => realtimeClient.subscribe(eventName, (payload) => {
    const data = payload as { ideaId?: number; actorUserId?: number } | null;
    if (!matchesIdea(data) || isOwnEvent(data)) {
      return;
    }
    queueIdeaEventRefresh(Number(data?.ideaId));
  });

  const unsubscribeCommentCreated = bindIdeaEventRefresh("comment.created");
  const unsubscribeCommentUpdated = bindIdeaEventRefresh("comment.updated");
  const unsubscribeCommentDeleted = bindIdeaEventRefresh("comment.deleted");
  const unsubscribeReactionAdded = bindIdeaEventRefresh("reaction.added");
  const unsubscribeReactionRemoved = bindIdeaEventRefresh("reaction.removed");
  const unsubscribeVersionCreated = bindIdeaEventRefresh("version.created");
  const unsubscribeVersionRestored = bindIdeaEventRefresh("version.restored");
  const unsubscribeMentionCreated = bindIdeaEventRefresh("mention.created");

  return () => {
    unsubscribeConnected();
    unsubscribeRefresh();
    unsubscribePresence();
    unsubscribeCommentCreated();
    unsubscribeCommentUpdated();
    unsubscribeCommentDeleted();
    unsubscribeReactionAdded();
    unsubscribeReactionRemoved();
    unsubscribeVersionCreated();
    unsubscribeVersionRestored();
    unsubscribeMentionCreated();
    realtimeClient.release();
  };
}
