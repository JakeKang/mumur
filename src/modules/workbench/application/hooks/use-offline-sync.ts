import { useCallback, useEffect } from "react";
import { dequeueIdeaSync, enqueueIdeaSync, listIdeaSyncQueue, removeIdeaDraft, saveIdeaDraft } from "@/features/ideas/utils/server-draft";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
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
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
}>;

export function useOfflineSync({
  api,
  authed,
  selectedIdea,
  selectedIdeaId,
  setSelectedIdea,
  setIdeas,
  loadIdeaChildren,
  loadDashboard,
  loadIdeas,
  localSyncState: _localSyncState,
  setLocalSyncState,
  setBusy,
  setError,
}: UseOfflineSyncParams) {
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
        const updated = await workbenchApi.updateIdea(api, row.ideaId, row.payload);
        try {
          await dequeueIdeaSync(row.ideaId);
          await removeIdeaDraft(row.ideaId);
        } catch {}
        setIdeas((prev) => prev.map((idea) => (idea.id === updated.idea.id ? { ...idea, ...updated.idea } : idea)));
        if (Number(selectedIdeaId) === Number(row.ideaId)) {
          setSelectedIdea(updated.idea);
        }
      } catch {
        setLocalSyncState("failed");
        return;
      }
    }

    setLocalSyncState("synced");
    await Promise.all([loadDashboard(), loadIdeas()]);
    if (selectedIdeaId) {
      await loadIdeaChildren(Number(selectedIdeaId));
    }
  }, [api, loadDashboard, loadIdeaChildren, loadIdeas, selectedIdeaId, setIdeas, setLocalSyncState, setSelectedIdea]);

  const handleSaveIdea = useCallback(
    async (event: { preventDefault?: () => void } | null = null, patch: IdeaSavePatch = {}) => {
      event?.preventDefault?.();
      if (!selectedIdea) {
        return;
      }
      const payload = {
        title: patch.title ?? selectedIdea.title,
        category: patch.category ?? selectedIdea.category,
        status: patch.status ?? selectedIdea.status,
        blocks: patch.blocks ?? selectedIdea.blocks ?? [],
      };
      const now = Date.now();
      setSelectedIdea((prev) => (prev ? { ...prev, ...payload, updatedAt: now } : prev));
      try {
        await saveIdeaDraft(Number(selectedIdea.id), payload, now);
        setLocalSyncState("pending");
      } catch {
        setLocalSyncState("failed");
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await enqueueIdeaSync(Number(selectedIdea.id), payload, now);
        } catch {
          setError("오프라인 저장 큐를 만들지 못했습니다. 연결 후 다시 시도해주세요.");
        }
        return;
      }

      setBusy(true);
      try {
        setLocalSyncState("syncing");
        const updated = await workbenchApi.updateIdea(api, selectedIdea.id, payload);
        try {
          await dequeueIdeaSync(Number(selectedIdea.id));
          await removeIdeaDraft(Number(selectedIdea.id));
        } catch {}
        setSelectedIdea(updated.idea);
        setIdeas((prev) => prev.map((idea) => (idea.id === updated.idea.id ? { ...idea, ...updated.idea } : idea)));
        await loadIdeaChildren(updated.idea.id, updated.idea?.blocks || []);
        await loadDashboard();
        setLocalSyncState("synced");
      } catch (err) {
        try {
          await enqueueIdeaSync(Number(selectedIdea.id), payload, now);
        } catch {}
        setLocalSyncState("failed");
        setError(err instanceof Error ? err.message : "아이디어 저장에 실패했습니다");
      } finally {
        setBusy(false);
      }
    },
    [api, loadDashboard, loadIdeaChildren, selectedIdea, setBusy, setError, setIdeas, setLocalSyncState, setSelectedIdea]
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
