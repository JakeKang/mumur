import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadIdeaDraft } from "@/features/ideas/utils/server-draft";
import { ApiError } from "@/shared/lib/api-client";
import type { Comment, Idea, IdeaVersion, Session, TimelineEvent } from "@/shared/types";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { clearIdeaQueryParam, replaceIdeaQueryParam } from "@/modules/workbench/application/workbench-browser";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import {
  buildIdeaChildReactionTargets,
  canRetryUploadConflict,
  type IdeaBlockPresence,
  isStaleBlockReactionTargetError,
  loadIdeaChildrenData,
  loadReactionTargetMap,
  mergeIdeaPresenceEntries,
  type ReactionTargetResponse,
  type ReactionsByTarget,
  subscribeIdeaDetailRealtime,
} from "@/modules/workbench/application/hooks/use-idea-detail-helpers";
import { getWorkbenchRealtimeClient } from "@/modules/workbench/application/workbench-realtime-client";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];
const DEFAULT_IDEA_PRESENCE_TTL_MS = 15000;

export type { IdeaBlockPresence } from "@/modules/workbench/application/hooks/use-idea-detail-helpers";

type UseIdeaDetailParams = {
  api: workbenchApi.WorkbenchApiClient;
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session>>;
  ideas: Idea[];
  setIdeas: React.Dispatch<React.SetStateAction<Idea[]>>;
  loadIdeas: () => Promise<Idea[]>;
  loadDashboard: () => Promise<void>;
  loadTeamMembers: () => Promise<void>;
  loadTeamInvitations: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  setLocalSyncState: React.Dispatch<React.SetStateAction<LocalSyncState>>;
  setActivePage: React.Dispatch<React.SetStateAction<string>>;
  setCreateIdeaDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
};

export function useIdeaDetail({
  api,
  session,
  setSession,
  ideas,
  setIdeas,
  loadIdeas,
  loadDashboard,
  loadTeamMembers,
  loadTeamInvitations,
  loadNotifications,
  setLocalSyncState,
  setActivePage,
  setCreateIdeaDialogOpen,
  setBusy,
  setError,
}: UseIdeaDetailParams) {
  const queryClient = useQueryClient();
  const [studioTab, setStudioTab] = useState("editor");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedIdeaState, setSelectedIdeaState] = useState<Idea | null>(null);
  const [detailNotFound, setDetailNotFound] = useState<{ ideaId: string; message: string } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentFilterBlockId, setCommentFilterBlockId] = useState("");
  const [reactionsByTarget, setReactionsByTarget] = useState<ReactionsByTarget>({});
  const [versions, setVersions] = useState<IdeaVersion[]>([]);
  const [versionForm, setVersionForm] = useState({ versionLabel: "", notes: "" });
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [ideaPresence, setIdeaPresence] = useState<IdeaBlockPresence[]>([]);
  const [activePresence, setActivePresence] = useState<{ blockId: string; cursorOffset: number | null; typing: boolean } | null>(null);

  const realtimeClientRef = useRef(getWorkbenchRealtimeClient());
  const lastHeartbeatSentRef = useRef(0);
  const presenceHeartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presencePruneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTtlMsRef = useRef(DEFAULT_IDEA_PRESENCE_TTL_MS);
  const previousIdeaIdRef = useRef<string | null>(null);

  const authed = Boolean(session?.user);
  const selectedIdea = selectedIdeaState;

  const setSelectedIdea = useCallback((value: React.SetStateAction<Idea | null>) => {
    setSelectedIdeaState((previous) => {
      const next = typeof value === "function"
        ? (value as (prev: Idea | null) => Idea | null)(previous)
        : value;

      if (next) {
        queryClient.setQueryData(workbenchQueryKeys.ideaDetail(next.id), next);
      }

      return next;
    });
  }, [queryClient]);

  const disconnectCollabStream = useCallback(() => {
    realtimeClientRef.current.release();
  }, []);

  const schedulePresencePrune = useCallback((entries: IdeaBlockPresence[]) => {
    if (presencePruneTimerRef.current) {
      clearTimeout(presencePruneTimerRef.current);
      presencePruneTimerRef.current = null;
    }
    if (!entries.length) {
      return;
    }
    let nextExpiryAt = Number.POSITIVE_INFINITY;
    entries.forEach((entry) => {
      nextExpiryAt = Math.min(nextExpiryAt, entry.updatedAt + presenceTtlMsRef.current);
    });
    if (!Number.isFinite(nextExpiryAt)) {
      return;
    }
    const delay = Math.max(0, nextExpiryAt - Date.now());
    presencePruneTimerRef.current = setTimeout(() => {
      setIdeaPresence((current) => mergeIdeaPresenceEntries(current, presenceTtlMsRef.current));
    }, delay);
  }, []);

  const applyIdeaPresence = useCallback((entries: Array<Partial<IdeaBlockPresence> | null | undefined>, ttlMs?: number | null) => {
    if (Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0) {
      presenceTtlMsRef.current = Number(ttlMs);
    }
    const next = mergeIdeaPresenceEntries(entries, presenceTtlMsRef.current);
    setIdeaPresence(next);
    schedulePresencePrune(next);
    return next;
  }, [schedulePresencePrune]);

  const updateIdeaPresenceState = useCallback((updater: (current: IdeaBlockPresence[]) => IdeaBlockPresence[]) => {
    setIdeaPresence((current) => {
      const next = mergeIdeaPresenceEntries(updater(current), presenceTtlMsRef.current);
      schedulePresencePrune(next);
      return next;
    });
  }, [schedulePresencePrune]);

  const syncKeepalivePresenceClear = useCallback((ideaId: string | number | null | undefined) => {
    const numericIdeaId = Number(ideaId);
    if (!Number.isInteger(numericIdeaId) || typeof window === "undefined") {
      return;
    }
    void fetch(`/api/ideas/${numericIdeaId}/presence`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId: "", typing: false }),
    }).catch(() => void 0);
  }, []);

  const eventRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushPresenceHeartbeat = useCallback(async (options?: { force?: boolean; override?: { blockId: string; cursorOffset: number | null; typing: boolean } | null }) => {
    const presence = options?.override ?? activePresence;
    if (!selectedIdeaId || !presence) {
      return;
    }
    const now = Date.now();
    if (!options?.force && now - lastHeartbeatSentRef.current < 1800) {
      return;
    }
    lastHeartbeatSentRef.current = now;
    try {
      const data = await workbenchApi.updateIdeaPresence(api, Number(selectedIdeaId), {
        blockId: presence.blockId,
        cursorOffset: presence.cursorOffset ?? undefined,
        typing: presence.typing,
      });
      applyIdeaPresence(Array.isArray(data?.presence) ? data.presence : [], data?.ttlMs);
    } catch {
      void 0;
    }
  }, [activePresence, api, applyIdeaPresence, selectedIdeaId]);

  const clearPresenceHeartbeat = useCallback(async () => {
    setActivePresence(null);
    lastHeartbeatSentRef.current = 0;
    const sessionUserId = Number(session?.user?.id);
    if (Number.isFinite(sessionUserId)) {
      updateIdeaPresenceState((current) => current.filter((entry) => entry.userId !== sessionUserId));
    } else {
      applyIdeaPresence([]);
    }
    if (!selectedIdeaId) {
      return;
    }
    try {
      const data = await workbenchApi.updateIdeaPresence(api, Number(selectedIdeaId), { blockId: "", typing: false });
      applyIdeaPresence(Array.isArray(data?.presence) ? data.presence : [], data?.ttlMs);
    } catch {
      void 0;
    }
  }, [api, applyIdeaPresence, selectedIdeaId, session?.user?.id, updateIdeaPresenceState]);

  const reportActiveBlock = useCallback((blockId: string, cursorOffset: number | null = null, typing = false) => {
    if (!selectedIdeaId || !blockId) {
      return;
    }
    const persistedBlockIds = new Set((selectedIdea?.blocks || []).map((block) => String(block.id || "")).filter(Boolean));
    if (!persistedBlockIds.has(blockId)) {
      setActivePresence(null);
      const sessionUserId = Number(session?.user?.id);
      if (Number.isFinite(sessionUserId)) {
        updateIdeaPresenceState((current) => current.filter((entry) => entry.userId !== sessionUserId));
      }
      return;
    }
    const sessionUserId = Number(session?.user?.id);
    const nextPresence = { blockId, cursorOffset, typing };
    setActivePresence(nextPresence);
    if (Number.isFinite(sessionUserId)) {
      updateIdeaPresenceState((current) => [
        ...current.filter((entry) => entry.userId !== sessionUserId),
        {
          userId: sessionUserId,
          userName: String(session?.user?.name || "사용자"),
          blockId,
          cursorOffset,
          isTyping: typing,
          updatedAt: Date.now(),
        },
      ]);
    }
    if (typingResetTimerRef.current) {
      clearTimeout(typingResetTimerRef.current);
      typingResetTimerRef.current = null;
    }
    if (typing) {
      typingResetTimerRef.current = setTimeout(() => {
        const idlePresence = { blockId, cursorOffset, typing: false };
        setActivePresence(idlePresence);
        if (Number.isFinite(sessionUserId)) {
          updateIdeaPresenceState((current) => [
            ...current.filter((entry) => entry.userId !== sessionUserId),
            {
              userId: sessionUserId,
              userName: String(session?.user?.name || "사용자"),
              blockId,
              cursorOffset,
              isTyping: false,
              updatedAt: Date.now(),
            },
          ]);
        }
        void pushPresenceHeartbeat({ force: true, override: idlePresence });
      }, 1200);
    }
    void pushPresenceHeartbeat({ force: true, override: nextPresence });
  }, [pushPresenceHeartbeat, selectedIdea, selectedIdeaId, session?.user?.id, session?.user?.name, updateIdeaPresenceState]);

  useEffect(() => {
    const previousIdeaId = previousIdeaIdRef.current;
    if (previousIdeaId && previousIdeaId !== selectedIdeaId) {
      void workbenchApi.updateIdeaPresence(api, Number(previousIdeaId), { blockId: "" }).catch(() => void 0);
      setActivePresence(null);
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
        typingResetTimerRef.current = null;
      }
      lastHeartbeatSentRef.current = 0;
      applyIdeaPresence([]);
    }
    previousIdeaIdRef.current = selectedIdeaId;
  }, [api, applyIdeaPresence, selectedIdeaId]);

  const clearDetailState = useCallback(() => {
    setSelectedIdea(null);
    setComments([]);
    setVersions([]);
    setTimeline([]);
    setDetailNotFound(null);
    setReactionsByTarget({});
    applyIdeaPresence([]);
    setActivePresence(null);
  }, [applyIdeaPresence, setSelectedIdea]);

  const fetchIdeaDetail = useCallback(async (ideaId: number) => {
    const data = await workbenchApi.getIdea(api, ideaId);
    let nextIdea = data.idea;
    const authoritativeUpdatedAt = Number(nextIdea.updatedAt || 0);
    try {
      const draft = await loadIdeaDraft(ideaId);
      const draftPayload = draft?.payload as (Partial<Idea> & { baseUpdatedAt?: number }) | undefined;
      if (draftPayload) {
        const draftBaseUpdatedAt = Number(draftPayload.baseUpdatedAt || 0);
        const resolvedBaseUpdatedAt = Number.isFinite(draftBaseUpdatedAt) && draftBaseUpdatedAt > 0
          ? draftBaseUpdatedAt
          : authoritativeUpdatedAt;
        nextIdea = {
          ...nextIdea,
          ...draftPayload,
          updatedAt: authoritativeUpdatedAt,
          baseUpdatedAt: resolvedBaseUpdatedAt,
        };
        setLocalSyncState(resolvedBaseUpdatedAt < authoritativeUpdatedAt ? "failed" : "pending");
      }
    } catch {
      void 0;
    }
    return nextIdea;
  }, [api, setLocalSyncState]);

  const pruneReactionTarget = useCallback((targetType: string, targetId: string) => {
    if (targetType === "idea" && !targetId) {
      return;
    }
    const key = `${targetType}:${targetId}`;
    setReactionsByTarget((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const loadReactionTargets = useCallback(async (ideaId: number, targets: Array<{ targetType: string; targetId: string }>) => {
    if (!targets.length) {
      setReactionsByTarget({});
      return;
    }
    const next = await loadReactionTargetMap({
      queryClient,
      ideaId,
      targets,
      fetchReactionTarget: (targetIdeaId, targetType, targetId) => workbenchApi.getIdeaReactions(api, targetIdeaId, targetType, targetId),
    });
    setReactionsByTarget(next);
  }, [api, queryClient]);

  const fetchIdeaComments = useCallback(async (ideaId: number, blockId: string) => {
    const commentsQuery = blockId ? `?blockId=${encodeURIComponent(blockId)}` : "";
    return workbenchApi.getIdeaComments(api, ideaId, commentsQuery);
  }, [api]);

  const fetchIdeaVersions = useCallback(async (ideaId: number) => {
    return workbenchApi.getIdeaVersions(api, ideaId);
  }, [api]);

  const fetchIdeaTimeline = useCallback(async (ideaId: number) => {
    return workbenchApi.getIdeaTimeline(api, ideaId);
  }, [api]);

  const loadIdeaChildren = useCallback(
    async (ideaId: number, blockList: Array<{ id?: string }> | null = null) => {
      const nextChildren = await loadIdeaChildrenData({
        queryClient,
        ideaId,
        commentFilterBlockId,
        fetchIdeaComments,
        fetchIdeaVersions,
        fetchIdeaTimeline,
      });

      setComments(nextChildren.comments);
      setVersions(nextChildren.versions);
      setTimeline(nextChildren.timeline);

      await loadReactionTargets(
        ideaId,
        buildIdeaChildReactionTargets(blockList || selectedIdea?.blocks || [], nextChildren.comments)
      );
    },
    [commentFilterBlockId, fetchIdeaComments, fetchIdeaTimeline, fetchIdeaVersions, loadReactionTargets, queryClient, selectedIdea]
  );

  const selectIdea = useCallback(
    async (
      ideaId: number | string,
      options: { syncUrl?: boolean; openPage?: boolean; workspaceId?: number | null } = { syncUrl: true, openPage: true }
    ) => {
      const numericIdeaId = Number(ideaId);
      const stringIdeaId = String(ideaId);
      const targetWsId = options.workspaceId ? Number(options.workspaceId) : null;
      const currentWsId = session?.workspace?.id ? Number(session.workspace.id) : null;
      if (targetWsId && currentWsId && targetWsId !== currentWsId) {
        const switched = await workbenchApi.switchWorkspace(api, Number(options.workspaceId));
        setSession((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            workspace: {
              id: switched?.workspace?.id,
              name: switched?.workspace?.name
            }
          };
        });
        await Promise.all([
          loadTeamMembers(),
          loadTeamInvitations(),
          loadNotifications(),
          loadDashboard(),
        ]);
        void loadIdeas();
      }
      let loadedIdea: Idea;
      try {
        loadedIdea = await queryClient.fetchQuery({
          queryKey: workbenchQueryKeys.ideaDetail(numericIdeaId),
          queryFn: () => fetchIdeaDetail(numericIdeaId),
          staleTime: 5_000,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          const targetId = stringIdeaId;
          setSelectedIdeaId(targetId);
          clearDetailState();
          setDetailNotFound({ ideaId: targetId, message: err.message || "아이디어를 찾을 수 없습니다" });
          if (options.openPage !== false) {
            setActivePage("detail");
          }
          if (options.syncUrl !== false && typeof window !== "undefined") {
            replaceIdeaQueryParam(targetId);
          }
          return;
        }
      setError(err instanceof Error ? err.message : "아이디어를 불러오는 데 실패했습니다");
        return;
      }
      setDetailNotFound(null);
      setSelectedIdeaId(stringIdeaId);
      setSelectedIdea(loadedIdea);
      setStudioTab("editor");
      setCreateIdeaDialogOpen(false);
      if (options.openPage !== false) {
        setActivePage("detail");
      }
      if (options.syncUrl !== false && typeof window !== "undefined") {
        replaceIdeaQueryParam(stringIdeaId);
      }
      await loadIdeaChildren(numericIdeaId, loadedIdea?.blocks || []);
    },
    [
      api,
      clearDetailState,
      fetchIdeaDetail,
      loadDashboard,
      loadIdeaChildren,
      loadIdeas,
      loadNotifications,
      loadTeamInvitations,
      loadTeamMembers,
      session?.workspace?.id,
      setActivePage,
      setCreateIdeaDialogOpen,
      setError,
      setSelectedIdea,
      setSession,
      queryClient,
    ]
  );

  const handleCreateComment = useCallback(async (event: FormSubmitEvent, blockIdOverride?: string, contentOverride?: string, parentId?: number | null) => {
    event.preventDefault();
    const content = String(contentOverride ?? "").trim();
    if (!selectedIdeaId || !content) {
      return;
    }
    setBusy(true);
    const effectiveBlockId = blockIdOverride !== undefined ? blockIdOverride : "";
    try {
      await workbenchApi.createIdeaComment(api, Number(selectedIdeaId), {
        content,
        blockId: effectiveBlockId || "",
        ...(parentId != null ? { parentId } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "idea-comments", Number(selectedIdeaId)] });
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaTimeline(Number(selectedIdeaId)) });
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, queryClient, selectedIdeaId, setBusy, setError]);

  const handleUpdateComment = useCallback(async (commentId: number, content: string) => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      await workbenchApi.updateIdeaComment(api, Number(selectedIdeaId), Number(commentId), content);
      await queryClient.invalidateQueries({ queryKey: ["workbench", "idea-comments", Number(selectedIdeaId)] });
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaTimeline(Number(selectedIdeaId)) });
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 수정에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, queryClient, selectedIdeaId, setBusy, setError]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      await workbenchApi.deleteIdeaComment(api, Number(selectedIdeaId), Number(commentId));
      await queryClient.invalidateQueries({ queryKey: ["workbench", "idea-comments", Number(selectedIdeaId)] });
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaTimeline(Number(selectedIdeaId)) });
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 삭제에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, queryClient, selectedIdeaId, setBusy, setError]);

  const applyCommentFilter = useCallback(async () => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
        const res = await fetchFreshQuery(queryClient, {
          queryKey: workbenchQueryKeys.ideaComments(selectedIdeaId, commentFilterBlockId),
          queryFn: () => fetchIdeaComments(Number(selectedIdeaId), commentFilterBlockId),
        });
      setComments(res.comments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 불러오기에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [commentFilterBlockId, fetchIdeaComments, queryClient, selectedIdeaId, setBusy, setError]);

  const handleReaction = useCallback(async (emoji: string, targetType = "idea", targetId = "") => {
    if (!selectedIdeaId) {
      return;
    }
    try {
      await workbenchApi.createIdeaReaction(api, selectedIdeaId, { emoji, targetType, targetId });
      let data: ReactionTargetResponse;
      try {
        data = await fetchFreshQuery(queryClient, {
          queryKey: workbenchQueryKeys.ideaReactions(selectedIdeaId, targetType, targetId),
          queryFn: () => workbenchApi.getIdeaReactions(api, selectedIdeaId, targetType, targetId),
        });
      } catch (err) {
        if (isStaleBlockReactionTargetError(err, targetType)) {
          pruneReactionTarget(targetType, targetId);
          await loadIdeas();
          return;
        }
        throw err;
      }
      if (!(targetType === "idea" && !targetId)) {
        setReactionsByTarget((prev) => ({
          ...prev,
          [`${targetType}:${targetId}`]: {
            reactions: data.reactions || [],
            mine: data.mine || []
          }
        }));
      }
      await loadIdeas();
    } catch (err) {
      if (isStaleBlockReactionTargetError(err, targetType)) {
        pruneReactionTarget(targetType, targetId);
        return;
      }
      setError(err instanceof Error ? err.message : "리액션 처리에 실패했습니다");
    }
  }, [api, loadIdeas, pruneReactionTarget, queryClient, selectedIdeaId, setError]);

  const handleUploadBlockFile = useCallback(async (blockId: string, file: File) => {
    if (!selectedIdeaId || !selectedIdea) {
      throw new Error("아이디어를 찾을 수 없습니다");
    }
    const localIdeaBeforeUpload = selectedIdea;
    const baseUpdatedAt = Number(localIdeaBeforeUpload.baseUpdatedAt || localIdeaBeforeUpload.updatedAt || 0);
    let data: Awaited<ReturnType<typeof workbenchApi.uploadIdeaBlockFile>>;
    try {
      data = await workbenchApi.uploadIdeaBlockFile(api, selectedIdeaId, blockId, file, baseUpdatedAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const latestIdea = (err.data as { idea?: Idea | null } | null)?.idea || null;
        const retryBaseUpdatedAt = Number(latestIdea?.updatedAt || 0);
        const safeRetry = latestIdea
          && Number.isFinite(retryBaseUpdatedAt)
          && retryBaseUpdatedAt > 0
          && canRetryUploadConflict(localIdeaBeforeUpload, latestIdea, blockId);
        if (!safeRetry) {
          setLocalSyncState("failed");
          setError(err.message || "최신 변경사항과 충돌했습니다. 로컬 드래프트를 유지했습니다.");
          throw err;
        }
        try {
          data = await workbenchApi.uploadIdeaBlockFile(api, selectedIdeaId, blockId, file, retryBaseUpdatedAt);
        } catch (retryError) {
          if (retryError instanceof ApiError && retryError.status === 409) {
            setLocalSyncState("failed");
            setError(retryError.message || "최신 변경사항과 충돌했습니다. 로컬 드래프트를 유지했습니다.");
          }
          throw retryError;
        }
      } else {
        throw err;
      }
    }
    if (data.idea) {
      setIdeas((prev) => prev.map((idea) => (idea.id === data.idea.id ? { ...idea, ...data.idea } : idea)));
      setSelectedIdea((prev) => {
        if (!prev || Number(prev.id) !== Number(data.idea.id)) {
          return data.idea;
        }
        const serverBlocks = (Array.isArray(data.idea.blocks) ? data.idea.blocks : []) as Idea["blocks"];
        const uploadedBlock = serverBlocks.find((block: Idea["blocks"][number]) => String(block.id || "") === blockId);
        if (!uploadedBlock) {
          return {
            ...prev,
            updatedAt: Number(data.idea.updatedAt || prev.updatedAt || 0),
          };
        }
        const nextBlocks = (prev.blocks || []).map((block) => {
          if (String(block.id || "") !== blockId) {
            return block;
          }
          return uploadedBlock;
        });
        return {
          ...prev,
          updatedAt: Number(data.idea.updatedAt || prev.updatedAt || 0),
          blocks: nextBlocks,
        };
      });
      await queryClient.invalidateQueries({ queryKey: ["workbench", "idea-comments", data.idea.id] });
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaTimeline(data.idea.id) });
      await loadIdeaChildren(data.idea.id, data.idea.blocks || []);
    }
    return data.fileBlock;
  }, [api, loadIdeaChildren, queryClient, selectedIdea, selectedIdeaId, setError, setIdeas, setLocalSyncState, setSelectedIdea]);

  const handleCreateVersion = useCallback(async (event: FormSubmitEvent) => {
    event.preventDefault();
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("versionLabel", versionForm.versionLabel);
      form.append("notes", JSON.stringify(selectedIdea?.blocks || []));
      if (versionFile) {
        form.append("file", versionFile);
      }
      await workbenchApi.createIdeaVersion(api, Number(selectedIdeaId), form);
      setVersionForm({ versionLabel: "", notes: "" });
      setVersionFile(null);
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaVersions(Number(selectedIdeaId)) });
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaTimeline(Number(selectedIdeaId)) });
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "버전 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, queryClient, selectedIdea, selectedIdeaId, setBusy, setError, versionFile, versionForm.versionLabel]);

  const handleRestoreVersion = useCallback(async (versionId: number) => {
    if (!selectedIdeaId) {
      return false;
    }
    setBusy(true);
    try {
      const data = await workbenchApi.restoreIdeaVersion(api, Number(selectedIdeaId), versionId);
      if (data?.idea) {
        setSelectedIdea(data.idea);
        setIdeas((prev) => prev.map((idea) => (idea.id === data.idea.id ? { ...idea, ...data.idea } : idea)));
        await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaVersions(data.idea.id) });
        await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.ideaTimeline(data.idea.id) });
        await loadIdeaChildren(data.idea.id, data.idea.blocks || []);
      } else {
        await loadIdeaChildren(Number(selectedIdeaId));
      }
      try {
        await loadDashboard();
      } catch (dashboardError) {
        console.warn("[use-idea-detail] dashboard refresh failed after version restore", dashboardError);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "타임라인 복원에 실패했습니다");
      return false;
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, queryClient, selectedIdeaId, setBusy, setError, setIdeas, setSelectedIdea]);

  const backToIdeas = useCallback(() => {
    void clearPresenceHeartbeat();
    setSelectedIdeaId(null);
    setSelectedIdea(null);
    setDetailNotFound(null);
    setStudioTab("editor");
    setReactionsByTarget({});
    setActivePage("ideas");
    clearIdeaQueryParam();
  }, [clearPresenceHeartbeat, setActivePage, setSelectedIdea]);

  useEffect(() => {
    if (!authed || !selectedIdeaId) {
      disconnectCollabStream();
      applyIdeaPresence([]);
      return;
    }

    let cancelled = false;

    const hydratePresence = async () => {
      try {
        const data = await workbenchApi.getIdeaPresence(api, Number(selectedIdeaId));
        if (cancelled) {
          return;
        }
        applyIdeaPresence(Array.isArray(data.presence) ? data.presence : [], data?.ttlMs);
      } catch {
        if (!cancelled) {
          applyIdeaPresence([]);
        }
      }
    };

    const refreshIdeaFromServer = async (ideaId: number) => {
      try {
        const loadedIdea = await queryClient.fetchQuery({
          queryKey: workbenchQueryKeys.ideaDetail(ideaId),
          queryFn: () => fetchIdeaDetail(ideaId),
          staleTime: 0,
        });
        if (cancelled || !loadedIdea) {
          return;
        }
        setSelectedIdea(loadedIdea);
        setIdeas((prev) => prev.map((item) => (item.id === loadedIdea.id ? { ...item, ...loadedIdea } : item)));
        await loadIdeaChildren(loadedIdea.id, loadedIdea.blocks || []);
      } catch {
        void 0;
      }
    };

    const queueEventRefresh = (ideaId: number) => {
      if (eventRefreshTimerRef.current) {
        clearTimeout(eventRefreshTimerRef.current);
      }
      eventRefreshTimerRef.current = setTimeout(() => {
        eventRefreshTimerRef.current = null;
        void refreshIdeaFromServer(ideaId);
        void loadDashboard();
        void loadIdeas();
      }, 120);
    };

    void hydratePresence();
    const unsubscribeRealtime = subscribeIdeaDetailRealtime({
      authed,
      selectedIdeaId,
      sessionUserId: session?.user?.id,
      realtimeClient: realtimeClientRef.current,
      hydratePresence: () => {
        if (!cancelled) {
          void hydratePresence();
        }
      },
      refreshIdea: (ideaId) => {
        if (!cancelled) {
          void refreshIdeaFromServer(ideaId);
        }
      },
      queueIdeaEventRefresh: (ideaId) => {
        if (!cancelled) {
          queueEventRefresh(ideaId);
        }
      },
      handlePresencePayload: (payload) => {
        if (!cancelled) {
          applyIdeaPresence(Array.isArray(payload?.presence) ? payload.presence : [], payload?.ttlMs);
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribeRealtime();
      if (eventRefreshTimerRef.current) {
        clearTimeout(eventRefreshTimerRef.current);
        eventRefreshTimerRef.current = null;
      }
    };
  }, [
    api,
    applyIdeaPresence,
    authed,
    disconnectCollabStream,
    fetchIdeaDetail,
    loadDashboard,
    loadIdeaChildren,
    loadIdeas,
    queryClient,
    selectedIdeaId,
    session?.user?.id,
    setIdeas,
    setSelectedIdea,
  ]);

  useEffect(() => {
    if (!authed || !selectedIdeaId || !activePresence) {
      if (presenceHeartbeatTimerRef.current) {
        clearInterval(presenceHeartbeatTimerRef.current);
        presenceHeartbeatTimerRef.current = null;
      }
      return;
    }

    if (presenceHeartbeatTimerRef.current) {
      clearInterval(presenceHeartbeatTimerRef.current);
    }
    presenceHeartbeatTimerRef.current = setInterval(() => {
      void pushPresenceHeartbeat();
    }, 5000);

    return () => {
      if (presenceHeartbeatTimerRef.current) {
        clearInterval(presenceHeartbeatTimerRef.current);
        presenceHeartbeatTimerRef.current = null;
      }
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
        typingResetTimerRef.current = null;
      }
    };
  }, [activePresence, authed, pushPresenceHeartbeat, selectedIdeaId]);

  useEffect(() => {
    schedulePresencePrune(ideaPresence);
  }, [ideaPresence, schedulePresencePrune]);

  useEffect(() => {
    if (!selectedIdeaId) {
      return;
    }

    const clear = () => {
      syncKeepalivePresenceClear(selectedIdeaId);
    };

    window.addEventListener("pagehide", clear);
    window.addEventListener("beforeunload", clear);

    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("beforeunload", clear);
    };
  }, [selectedIdeaId, syncKeepalivePresenceClear]);

  useEffect(() => {
    return () => {
      if (presenceHeartbeatTimerRef.current) {
        clearInterval(presenceHeartbeatTimerRef.current);
        presenceHeartbeatTimerRef.current = null;
      }
      if (typingResetTimerRef.current) {
        clearTimeout(typingResetTimerRef.current);
        typingResetTimerRef.current = null;
      }
      if (presencePruneTimerRef.current) {
        clearTimeout(presencePruneTimerRef.current);
        presencePruneTimerRef.current = null;
      }
      void clearPresenceHeartbeat();
      disconnectCollabStream();
    };
  }, [clearPresenceHeartbeat, disconnectCollabStream]);

  useEffect(() => {
    const syncFromUrl = () => {
      if (!authed || !ideas.length || typeof window === "undefined") {
        return;
      }
      const requestedIdea = new URLSearchParams(window.location.search).get("idea");
      if (!requestedIdea) {
        if (selectedIdeaId !== null) {
          setSelectedIdeaId(null);
          setSelectedIdea(null);
        }
        return;
      }
      if (String(selectedIdeaId) === String(requestedIdea)) {
        return;
      }
      const exists = ideas.some((item) => String(item.id) === String(requestedIdea));
      if (!exists) {
        setSelectedIdeaId(String(requestedIdea));
        setSelectedIdea(null);
        setDetailNotFound({ ideaId: String(requestedIdea), message: "아이디어를 찾을 수 없습니다" });
        setActivePage("detail");
        return;
      }
      setDetailNotFound(null);
      void selectIdea(requestedIdea, { syncUrl: false });
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [authed, ideas, selectIdea, selectedIdeaId, setActivePage, setSelectedIdea]);

  return {
    selectedIdeaId,
    setSelectedIdeaId,
    selectedIdea,
    setSelectedIdea,
    detailNotFound,
    setDetailNotFound,
    comments,
    setComments,
    commentFilterBlockId,
    setCommentFilterBlockId,
    reactionsByTarget,
    versions,
    setVersions,
    versionForm,
    setVersionForm,
    versionFile,
    setVersionFile,
    timeline,
    setTimeline,
    ideaPresence,
    studioTab,
    setStudioTab,
    clearDetailState,
    loadReactionTargets,
    loadIdeaChildren,
    selectIdea,
    handleCreateComment,
    handleUpdateComment,
    handleDeleteComment,
    applyCommentFilter,
    handleReaction,
    handleUploadBlockFile,
    handleCreateVersion,
    handleRestoreVersion,
    reportActiveBlock,
    clearPresenceHeartbeat,
    backToIdeas,
  };
}
