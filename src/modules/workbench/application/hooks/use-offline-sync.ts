import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dequeueIdeaSync, enqueueIdeaSync, listIdeaSyncQueue, loadIdeaDraft, removeIdeaDraft, saveIdeaDraft, type IdeaSaveContext } from "@/features/ideas/utils/server-draft";
import { isIdeaCollabEnabled } from "@/features/ideas/collab/idea-collab-config";
import { rebaseIdeaDraftConservatively, type IdeaRebaseDraft, type IdeaRebaseSnapshot } from "@/features/ideas/utils/conservative-idea-rebase";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import { ApiError } from "@/shared/lib/api-client";
import type { Idea, IdeaStatus } from "@/shared/types";

type UseOfflineSyncParams = {
  api: workbenchApi.WorkbenchApiClient;
  authed: boolean;
  selectedIdea: Idea | null;
  selectedIdeaId: string | null;
  setSelectedIdea: React.Dispatch<React.SetStateAction<Idea | null>>;
  setIdeas: React.Dispatch<React.SetStateAction<Idea[]>>;
  loadIdeaChildren: (ideaId: number, blockList?: Array<{ id?: string }> | null) => Promise<void>;
  loadDashboard: () => Promise<void>;
  loadIdeas: () => Promise<Idea[]>;
  localSyncState: LocalSyncState;
  setLocalSyncState: React.Dispatch<React.SetStateAction<LocalSyncState>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
};

type IdeaSavePatch = Partial<{
  title: string;
  category: string;
  status: IdeaStatus;
  priority: "low" | "medium" | "high";
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
}>;

type SaveMode = "collab" | "legacy";

type IdeaDocumentBlock = { id: string; type: string; content: string; checked: boolean };

type IdeaCheckpoint = {
  title: string;
  blocks: IdeaDocumentBlock[];
  updatedAt: number;
};

function toNonRetryableSyncError(message: string) {
  const error = new Error(message) as Error & { noRetry?: boolean };
  error.noRetry = true;
  return error;
}

function toIdeaRebaseSnapshot(idea: Idea): IdeaRebaseSnapshot {
  return {
    title: idea.title,
    category: idea.category,
    status: idea.status,
    priority: idea.priority === "high" || idea.priority === "medium" ? idea.priority : "low",
    blocks: Array.isArray(idea.blocks) ? idea.blocks : [],
    updatedAt: Number(idea.baseUpdatedAt || idea.updatedAt || 0),
  };
}

function parseBaseSnapshot(context: IdeaSaveContext | undefined, fallbackIdea: Idea): IdeaRebaseSnapshot {
  const raw = context?.baseSnapshot;
  if (!raw) {
    return toIdeaRebaseSnapshot(fallbackIdea);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<IdeaRebaseSnapshot> & { blocks?: Array<{ id: string; type: string; content: string; checked: boolean }> };
    return {
      title: String(parsed.title || fallbackIdea.title || ""),
      category: String(parsed.category || fallbackIdea.category || ""),
      status: (parsed.status || fallbackIdea.status) as IdeaStatus,
      priority: parsed.priority === "high" || parsed.priority === "medium"
        ? parsed.priority
        : (fallbackIdea.priority === "high" || fallbackIdea.priority === "medium" ? fallbackIdea.priority : "low"),
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : (Array.isArray(fallbackIdea.blocks) ? fallbackIdea.blocks : []),
      updatedAt: Number(fallbackIdea.baseUpdatedAt || fallbackIdea.updatedAt || 0),
    };
  } catch {
    return toIdeaRebaseSnapshot(fallbackIdea);
  }
}

function toIdeaRebaseDraft(payload: IdeaSavePatch & { title: string; category: string; status: IdeaStatus; priority: "low" | "medium" | "high"; blocks: Array<{ id: string; type: string; content: string; checked: boolean }> }): IdeaRebaseDraft {
  return {
    title: payload.title,
    category: payload.category,
    status: payload.status,
    priority: payload.priority,
    blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
  };
}

function shouldUseCollabCheckpoint(patch: IdeaSavePatch, context: IdeaSaveContext | undefined) {
  if (context?.mode) {
    return context.mode === "collab";
  }
  if (!isIdeaCollabEnabled()) {
    return false;
  }
  const touchesDocument = patch.title !== undefined || patch.blocks !== undefined;
  const touchesNonDocument = patch.category !== undefined || patch.status !== undefined || patch.priority !== undefined;
  return touchesDocument && !touchesNonDocument;
}

function mergeIdeaCheckpoint(existingIdea: Idea, checkpoint: {
  title: string;
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
  updatedAt: number;
}) {
  return {
    ...existingIdea,
    title: checkpoint.title,
    blocks: checkpoint.blocks,
    updatedAt: Number(checkpoint.updatedAt || existingIdea.updatedAt || 0),
    baseUpdatedAt: Number(checkpoint.updatedAt || existingIdea.updatedAt || 0),
  };
}

function normalizeIdeaBlocks(blocks: Array<Partial<IdeaDocumentBlock>> | null | undefined): IdeaDocumentBlock[] {
  return Array.isArray(blocks)
    ? blocks.map((block) => ({
        id: String(block?.id || ""),
        type: String(block?.type || "paragraph"),
        content: String(block?.content || ""),
        checked: Boolean(block?.checked),
      }))
    : [];
}

function ideaBlocksEqual(left: Array<Partial<IdeaDocumentBlock>> | null | undefined, right: Array<Partial<IdeaDocumentBlock>> | null | undefined) {
  const normalizedLeft = normalizeIdeaBlocks(left);
  const normalizedRight = normalizeIdeaBlocks(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((block, index) => {
    const other = normalizedRight[index];
    return block.id === other.id
      && block.type === other.type
      && block.content === other.content
      && block.checked === other.checked;
  });
}

export function doesIdeaMatchSavePayload(
  idea: Pick<Idea, "title" | "category" | "status" | "priority" | "blocks"> | null | undefined,
  payload: { title: string; category: string; status: IdeaStatus; priority: "low" | "medium" | "high"; blocks: IdeaDocumentBlock[] }
) {
  if (!idea) {
    return false;
  }

  return String(idea.title || "") === payload.title
    && String(idea.category || "") === payload.category
    && idea.status === payload.status
    && String(idea.priority || "low") === payload.priority
    && ideaBlocksEqual(idea.blocks, payload.blocks);
}

export function isCollabCheckpointAcknowledged(
  payload: { title: string; blocks: IdeaDocumentBlock[] },
  checkpoint: IdeaCheckpoint | null | undefined
) {
  if (!checkpoint) {
    return false;
  }

  return String(checkpoint.title || "") === payload.title
    && ideaBlocksEqual(checkpoint.blocks, payload.blocks);
}

function preserveLocalDraftAgainstCheckpoint(existingIdea: Idea, checkpoint: IdeaCheckpoint, payload: { title: string; blocks: IdeaDocumentBlock[]; baseUpdatedAt: number }) {
  const latestIdea = mergeIdeaCheckpoint(existingIdea, checkpoint);
  return {
    ...latestIdea,
    title: payload.title,
    blocks: payload.blocks,
    baseUpdatedAt: Number(checkpoint.updatedAt || latestIdea.updatedAt || payload.baseUpdatedAt || existingIdea.baseUpdatedAt || existingIdea.updatedAt || 0),
  };
}

export function useOfflineSync({
  api,
  authed,
  selectedIdea,
  selectedIdeaId,
  setSelectedIdea,
  setIdeas,
  loadIdeaChildren,
  loadDashboard: _loadDashboard,
  loadIdeas: _loadIdeas,
  localSyncState: _localSyncState,
  setLocalSyncState,
  setBusy,
  setError,
}: UseOfflineSyncParams) {
  const queryClient = useQueryClient();

  const persistIdea = useCallback(async (
    ideaId: number,
    payload: { title: string; category: string; status: IdeaStatus; priority: "low" | "medium" | "high"; blocks: Array<{ id: string; type: string; content: string; checked: boolean }>; baseUpdatedAt: number },
    mode: SaveMode,
    existingIdea: Idea,
  ) => {
    if (mode === "collab") {
      const result = await workbenchApi.saveIdeaCollabCheckpoint(api, ideaId, {
        title: payload.title,
        blocks: payload.blocks,
        baseUpdatedAt: payload.baseUpdatedAt,
      });
      const checkpointIdea = mergeIdeaCheckpoint(existingIdea, result.checkpoint);
      return { mode, idea: checkpointIdea } as const;
    }

    const updated = await workbenchApi.updateIdea(api, ideaId, payload);
    return { mode, idea: updated.idea } as const;
  }, [api]);

  const syncIdeaIntoCaches = useCallback((idea: Idea) => {
    queryClient.setQueryData(workbenchQueryKeys.ideaDetail(idea.id), idea);
    queryClient.setQueryData(workbenchQueryKeys.dashboard, (current: any) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        recentIdeas: Array.isArray(current.recentIdeas)
          ? current.recentIdeas.map((item: Idea) => (item.id === idea.id ? { ...item, ...idea } : item))
          : current.recentIdeas,
      };
    });
    queryClient.invalidateQueries({ queryKey: ["workbench", "ideas"] });
  }, [queryClient]);

  const applyIdeaResult = useCallback(async (updatedIdea: Idea) => {
    setSelectedIdea((prev) => (prev && Number(prev.id) === Number(updatedIdea.id) ? updatedIdea : prev));
    setIdeas((prev) => prev.map((idea) => (idea.id === updatedIdea.id ? { ...idea, ...updatedIdea } : idea)));
    syncIdeaIntoCaches(updatedIdea);
    await loadIdeaChildren(updatedIdea.id, updatedIdea?.blocks || []);
  }, [loadIdeaChildren, setIdeas, setSelectedIdea, syncIdeaIntoCaches]);

  const syncIdeaIntoState = useCallback((updatedIdea: Idea) => {
    setIdeas((prev) => prev.map((idea) => (idea.id === updatedIdea.id ? { ...idea, ...updatedIdea } : idea)));
    syncIdeaIntoCaches(updatedIdea);
  }, [setIdeas, syncIdeaIntoCaches]);

  const clearLocalSyncArtifacts = useCallback(async (ideaId: number) => {
    await dequeueIdeaSync(ideaId);
    await removeIdeaDraft(ideaId);
  }, []);

  const applyQueuedIdeaResult = useCallback(async (ideaId: number, updatedIdea: Idea) => {
    syncIdeaIntoState(updatedIdea);
    if (Number(selectedIdeaId) !== Number(ideaId)) {
      return;
    }
    setSelectedIdea(updatedIdea);
    await loadIdeaChildren(updatedIdea.id, updatedIdea?.blocks || []);
  }, [loadIdeaChildren, selectedIdeaId, setSelectedIdea, syncIdeaIntoState]);

  const applyLegacyConflictShadow = useCallback((latestIdea: Idea, baseUpdatedAt: number) => {
    syncIdeaIntoState(latestIdea);
    setSelectedIdea((prev) => {
      if (!prev || Number(prev.id) !== Number(latestIdea.id)) {
        return prev;
      }
      return {
        ...latestIdea,
        title: prev.title,
        category: prev.category,
        status: prev.status,
        priority: prev.priority,
        blocks: prev.blocks,
        baseUpdatedAt: Number(latestIdea.updatedAt || baseUpdatedAt),
      };
    });
  }, [setSelectedIdea, syncIdeaIntoState]);

  const applyCollabConflictShadow = useCallback((existingIdea: Idea, checkpoint: IdeaCheckpoint, payload: { title: string; blocks: IdeaDocumentBlock[]; baseUpdatedAt: number }) => {
    const latestIdea = mergeIdeaCheckpoint(existingIdea, checkpoint);
    syncIdeaIntoState(latestIdea);
    setSelectedIdea((prev) => {
      if (!prev || Number(prev.id) !== Number(existingIdea.id)) {
        return prev;
      }
      return preserveLocalDraftAgainstCheckpoint(prev, checkpoint, payload);
    });
  }, [setSelectedIdea, syncIdeaIntoState]);

  const drainIdeaSyncQueue = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.onLine) {
      return;
    }

    let queue = [];
    try {
      queue = await listIdeaSyncQueue();
    } catch {
      setLocalSyncState("failed");
      return;
    }
    if (!queue.length) {
      setLocalSyncState("synced");
      return;
    }

    setLocalSyncState("syncing");
    for (const row of queue) {
      try {
        const cachedIdea = queryClient.getQueryData<Idea>(workbenchQueryKeys.ideaDetail(row.ideaId))
          || (selectedIdea && Number(selectedIdea.id) === Number(row.ideaId) ? selectedIdea : null)
          || await workbenchApi.getIdea(api, row.ideaId).then((data) => data.idea as Idea);
        const draft = await loadIdeaDraft(row.ideaId).catch(() => null);
        const payload = draft?.payload ?? row.payload;
        const context = draft?.context ?? row.context;
        const mode: SaveMode = row.mode === "collab" || context?.mode === "collab" ? "collab" : "legacy";
        const checkpoint = mode === "collab"
          ? await workbenchApi.getIdeaCollabCheckpoint(api, row.ideaId)
            .then((data) => (data?.checkpoint || null) as IdeaCheckpoint | null)
            .catch(() => null)
          : null;

        if (mode === "collab" && isCollabCheckpointAcknowledged(payload, checkpoint)) {
          await clearLocalSyncArtifacts(row.ideaId);
          await applyQueuedIdeaResult(row.ideaId, mergeIdeaCheckpoint(cachedIdea as Idea, checkpoint as IdeaCheckpoint));
          continue;
        }

        if (mode === "legacy" && doesIdeaMatchSavePayload(cachedIdea as Idea, payload)) {
          await clearLocalSyncArtifacts(row.ideaId);
          await applyQueuedIdeaResult(row.ideaId, cachedIdea as Idea);
          continue;
        }

        const updated = await persistIdea(row.ideaId, payload, mode, cachedIdea as Idea);
        try {
          await clearLocalSyncArtifacts(row.ideaId);
        } catch (cleanupError) {
          console.warn("[use-offline-sync] failed to clear synced local queue entry", cleanupError);
        }
        await applyQueuedIdeaResult(row.ideaId, updated.idea);
      } catch (syncError) {
        if (syncError instanceof ApiError && syncError.status === 409) {
          const cachedIdea = queryClient.getQueryData<Idea>(workbenchQueryKeys.ideaDetail(row.ideaId))
            || (selectedIdea && Number(selectedIdea.id) === Number(row.ideaId) ? selectedIdea : null)
            || await workbenchApi.getIdea(api, row.ideaId).then((data) => data.idea as Idea);
          const draft = await loadIdeaDraft(row.ideaId).catch(() => null);
          const payload = draft?.payload ?? row.payload;
          const context = draft?.context ?? row.context;
          const mode: SaveMode = row.mode === "collab" || context?.mode === "collab" ? "collab" : "legacy";

          if (mode === "collab") {
            const latestCheckpoint = ((syncError.data as { checkpoint?: IdeaCheckpoint | null } | null)?.checkpoint || null) as IdeaCheckpoint | null;
            if (isCollabCheckpointAcknowledged(payload, latestCheckpoint)) {
              await clearLocalSyncArtifacts(row.ideaId);
              await applyQueuedIdeaResult(row.ideaId, mergeIdeaCheckpoint(cachedIdea as Idea, latestCheckpoint as IdeaCheckpoint));
              continue;
            }
            if (latestCheckpoint) {
              applyCollabConflictShadow(cachedIdea as Idea, latestCheckpoint, payload);
            }
          } else {
            const latestIdea = (syncError.data as { idea?: Idea | null } | null)?.idea || null;
            if (doesIdeaMatchSavePayload(latestIdea, payload)) {
              await clearLocalSyncArtifacts(row.ideaId);
              await applyQueuedIdeaResult(row.ideaId, latestIdea as Idea);
              continue;
            }
            const baseSnapshot = parseBaseSnapshot(context, cachedIdea as Idea);
            const mergedPayload = latestIdea
              ? rebaseIdeaDraftConservatively(baseSnapshot, toIdeaRebaseDraft(payload), latestIdea)
              : null;

            if (latestIdea && mergedPayload) {
              try {
                const retried = await workbenchApi.updateIdea(api, row.ideaId, mergedPayload);
                try {
                  await clearLocalSyncArtifacts(row.ideaId);
                } catch (cleanupError) {
                  console.warn("[use-offline-sync] failed to clear local draft after retry save", cleanupError);
                }
                await applyQueuedIdeaResult(row.ideaId, retried.idea);
                continue;
              } catch (retryError) {
                console.warn("[use-offline-sync] retry after conservative rebase failed", retryError);
              }
            }

            if (latestIdea) {
              applyLegacyConflictShadow(latestIdea, payload.baseUpdatedAt);
            }
          }

          console.warn("[use-offline-sync] failed to drain queued idea sync", syncError);
          setError("오프라인 변경사항 동기화에 실패했습니다");
          setLocalSyncState("failed");
          return;
        }
        console.warn("[use-offline-sync] failed to drain queued idea sync", syncError);
        setError("오프라인 변경사항 동기화에 실패했습니다");
        setLocalSyncState("failed");
        return;
      }
    }

    setLocalSyncState("synced");
  }, [api, applyCollabConflictShadow, applyLegacyConflictShadow, applyQueuedIdeaResult, clearLocalSyncArtifacts, persistIdea, queryClient, selectedIdea, setError, setLocalSyncState]);

  const handleSaveIdea = useCallback(
    async (event: { preventDefault?: () => void } | null = null, patch: IdeaSavePatch = {}, context?: IdeaSaveContext) => {
      event?.preventDefault?.();
      if (!selectedIdea) {
        return;
      }
      const baseUpdatedAt = Number(selectedIdea.baseUpdatedAt || selectedIdea.updatedAt || 0);
      const payload = {
        title: patch.title ?? selectedIdea.title,
        category: patch.category ?? selectedIdea.category,
        status: patch.status ?? selectedIdea.status,
        priority: patch.priority ?? selectedIdea.priority ?? "low",
        blocks: patch.blocks ?? selectedIdea.blocks ?? [],
        baseUpdatedAt,
      };
      const saveMode: SaveMode = shouldUseCollabCheckpoint(patch, context) ? "collab" : "legacy";
      const baseSnapshot = parseBaseSnapshot(context, selectedIdea);
      setSelectedIdea((prev) => (prev ? { ...prev, ...payload } : prev));
      try {
        await saveIdeaDraft(Number(selectedIdea.id), payload, { ...context, mode: saveMode });
        setLocalSyncState("pending");
      } catch (draftError) {
        console.warn("[use-offline-sync] failed to save local draft", draftError);
        setError("로컬 드래프트 저장에 실패했습니다");
        setLocalSyncState("failed");
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
            await enqueueIdeaSync(Number(selectedIdea.id), payload, { ...context, mode: saveMode });
        } catch (queueError) {
          console.warn("[use-offline-sync] failed to enqueue offline save", queueError);
          setError("오프라인 저장 큐를 만들지 못했습니다. 연결 후 다시 시도해주세요.");
        }
        return;
      }

      setBusy(true);
      try {
        setLocalSyncState("syncing");
        const updated = await persistIdea(selectedIdea.id, payload, saveMode, selectedIdea);
        if (!updated?.idea) {
          throw new Error("아이디어 저장 결과가 올바르지 않습니다");
        }
        try {
          await clearLocalSyncArtifacts(Number(selectedIdea.id));
        } catch (cleanupError) {
          console.warn("[use-offline-sync] failed to clear local draft after save", cleanupError);
        }
        await applyIdeaResult(updated.idea);
        setLocalSyncState("synced");
      } catch (err) {
        if (saveMode === "collab" && err instanceof ApiError && err.status === 409) {
          const latestCheckpoint = ((err.data as { checkpoint?: IdeaCheckpoint | null } | null)?.checkpoint || null) as IdeaCheckpoint | null;
          if (isCollabCheckpointAcknowledged(payload, latestCheckpoint)) {
            try {
              await clearLocalSyncArtifacts(Number(selectedIdea.id));
            } catch (cleanupError) {
              console.warn("[use-offline-sync] failed to clear local draft after acknowledged collab save", cleanupError);
            }
            await applyIdeaResult(mergeIdeaCheckpoint(selectedIdea, latestCheckpoint as IdeaCheckpoint));
            setLocalSyncState("synced");
            return;
          }

          try {
            await enqueueIdeaSync(Number(selectedIdea.id), payload, { ...context, mode: saveMode });
          } catch (queueError) {
            console.warn("[use-offline-sync] failed to queue collab checkpoint conflict for later retry", queueError);
          }

          if (latestCheckpoint) {
            applyCollabConflictShadow(selectedIdea, latestCheckpoint, payload);
          }

          setLocalSyncState("failed");
          setError(err.message || "협업 체크포인트 저장이 지연되었습니다. 연결 후 다시 동기화됩니다.");
          throw toNonRetryableSyncError(err.message || "협업 체크포인트 저장이 지연되었습니다");
        }

        if (err instanceof ApiError && err.status === 409) {
          const latestIdea = (err.data as { idea?: Idea | null } | null)?.idea || null;
          const mergedPayload = latestIdea
            ? rebaseIdeaDraftConservatively(baseSnapshot, toIdeaRebaseDraft(payload), latestIdea)
            : null;
          if (doesIdeaMatchSavePayload(latestIdea, payload)) {
            try {
              await clearLocalSyncArtifacts(Number(selectedIdea.id));
            } catch (cleanupError) {
              console.warn("[use-offline-sync] failed to clear local draft after acknowledged legacy save", cleanupError);
            }
            await applyIdeaResult(latestIdea as Idea);
            setLocalSyncState("synced");
            return;
          }
          if (latestIdea && mergedPayload) {
            try {
              const retried = await workbenchApi.updateIdea(api, selectedIdea.id, mergedPayload);
              try {
                await clearLocalSyncArtifacts(Number(selectedIdea.id));
              } catch (cleanupError) {
                console.warn("[use-offline-sync] failed to clear local draft after retry save", cleanupError);
              }
              setSelectedIdea(retried.idea);
              setIdeas((prev) => prev.map((idea) => (idea.id === retried.idea.id ? { ...idea, ...retried.idea } : idea)));
              syncIdeaIntoCaches(retried.idea);
              await loadIdeaChildren(retried.idea.id, retried.idea?.blocks || []);
              setLocalSyncState("synced");
              return;
            } catch (retryError) {
              console.warn("[use-offline-sync] retry after conservative rebase failed", retryError);
            }
          }
          if (latestIdea) {
            applyLegacyConflictShadow(latestIdea, baseUpdatedAt);
          }
          setLocalSyncState("failed");
          setError(err.message || "최신 변경사항과 충돌했습니다. 로컬 드래프트를 유지했습니다.");
          throw toNonRetryableSyncError(err.message || "최신 변경사항과 충돌했습니다");
        }
        try {
          await enqueueIdeaSync(Number(selectedIdea.id), payload, { ...context, mode: saveMode });
        } catch (queueError) {
          console.warn("[use-offline-sync] failed to enqueue failed save for later retry", queueError);
        }
        setLocalSyncState("failed");
        setError(err instanceof Error ? err.message : "아이디어 저장에 실패했습니다");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [api, applyCollabConflictShadow, applyIdeaResult, applyLegacyConflictShadow, clearLocalSyncArtifacts, loadIdeaChildren, persistIdea, selectedIdea, setBusy, setError, setIdeas, setLocalSyncState, setSelectedIdea, syncIdeaIntoCaches]
  );

  useEffect(() => {
    if (!authed) {
      return;
    }
    const onOnline = () => {
      void drainIdeaSyncQueue();
    };
    window.addEventListener("online", onOnline);
    void drainIdeaSyncQueue();
    return () => window.removeEventListener("online", onOnline);
  }, [authed, drainIdeaSyncQueue]);

  return {
    drainIdeaSyncQueue,
    handleSaveIdea,
  };
}
