import { useCallback, useEffect, useState } from "react";
import { loadIdeaDraft } from "@/features/ideas/utils/server-draft";
import { ApiError } from "@/shared/lib/api-client";
import type { Comment, Idea, IdeaVersion, Session, TimelineEvent } from "@/shared/types";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

type ReactionsByTarget = Record<string, { reactions: Array<{ emoji: string; count: number }>; mine: string[] }>;

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
  const [studioTab, setStudioTab] = useState("editor");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [detailNotFound, setDetailNotFound] = useState<{ ideaId: string; message: string } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentFilterBlockId, setCommentFilterBlockId] = useState("");
  const [reactionsByTarget, setReactionsByTarget] = useState<ReactionsByTarget>({});
  const [versions, setVersions] = useState<IdeaVersion[]>([]);
  const [versionForm, setVersionForm] = useState({ versionLabel: "", notes: "" });
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const authed = Boolean(session?.user);

  const clearDetailState = useCallback(() => {
    setSelectedIdea(null);
    setComments([]);
    setVersions([]);
    setTimeline([]);
    setDetailNotFound(null);
  }, []);

  const loadReactionTargets = useCallback(async (ideaId: number, targets: Array<{ targetType: string; targetId: string }>) => {
    const uniq = Array.from(
      new Map(
        targets
          .filter((item) => item.targetType && item.targetId)
          .map((item) => [`${item.targetType}:${item.targetId}`, item])
      ).values()
    );
    if (!uniq.length) {
      return;
    }
    const rows = await Promise.all(
      uniq.map(async ({ targetType, targetId }) => {
        const data = await workbenchApi.getIdeaReactions(api, ideaId, targetType, targetId);
        return { key: `${targetType}:${targetId}`, data };
      })
    );
    setReactionsByTarget((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[row.key] = {
          reactions: row.data.reactions || [],
          mine: row.data.mine || []
        };
      });
      return next;
    });
  }, [api]);

  const loadIdeaChildren = useCallback(
    async (ideaId: number, blockList: Array<{ id?: string }> | null = null) => {
      const commentsQuery = commentFilterBlockId ? `?blockId=${encodeURIComponent(commentFilterBlockId)}` : "";

      const [commentRes, , versionRes, timelineRes] = await Promise.all([
        workbenchApi.getIdeaComments(api, ideaId, commentsQuery),
        workbenchApi.getIdeaReactions(api, ideaId),
        workbenchApi.getIdeaVersions(api, ideaId),
        workbenchApi.getIdeaTimeline(api, ideaId),
      ]);

      setComments(commentRes.comments || []);
      setVersions(versionRes.versions || []);
      setTimeline(timelineRes.timeline || []);

      const blockTargets = (blockList || selectedIdea?.blocks || [])
        .map((block: { id?: string }) => String(block?.id || ""))
        .filter(Boolean)
        .map((targetId: string) => ({ targetType: "block", targetId }));
      await loadReactionTargets(
        ideaId,
        [
          ...blockTargets,
          ...(commentRes.comments || []).map((comment: Comment) => ({ targetType: "comment", targetId: `idea:${comment.id}` }))
        ]
      );
    },
    [api, commentFilterBlockId, loadReactionTargets, selectedIdea?.blocks]
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
      let data: { idea: Idea };
      try {
        data = await workbenchApi.getIdea(api, numericIdeaId);
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
            const params = new URLSearchParams(window.location.search);
            params.set("idea", targetId);
            window.history.replaceState(null, "", `?${params.toString()}`);
          }
          return;
        }
        setError(err instanceof Error ? err.message : "아이디어를 불러오는 데 실패했습니다");
        return;
      }
      setDetailNotFound(null);
      try {
        const draft = await loadIdeaDraft(numericIdeaId);
        if (draft && Number(draft.updatedAt || 0) > Number(data.idea.updatedAt || 0)) {
          data.idea = { ...data.idea, ...(draft.payload as Partial<Idea>), updatedAt: draft.updatedAt };
          setLocalSyncState("pending");
        }
      } catch {}
      setSelectedIdeaId(stringIdeaId);
      setSelectedIdea(data.idea);
      setStudioTab("editor");
      setCreateIdeaDialogOpen(false);
      if (options.openPage !== false) {
        setActivePage("detail");
      }
      if (options.syncUrl !== false && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.set("idea", stringIdeaId);
        window.history.replaceState(null, "", `?${params.toString()}`);
      }
      await loadIdeaChildren(numericIdeaId, data.idea?.blocks || []);
    },
    [
      api,
      clearDetailState,
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
      setLocalSyncState,
      setSession,
    ]
  );

  const handleCreateComment = useCallback(async (event: React.FormEvent, blockIdOverride?: string, contentOverride?: string) => {
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
      });
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, selectedIdeaId, setBusy, setError]);

  const handleUpdateComment = useCallback(async (commentId: number, content: string) => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      await workbenchApi.updateIdeaComment(api, Number(selectedIdeaId), Number(commentId), content);
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 수정에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, selectedIdeaId, setBusy, setError]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      await workbenchApi.deleteIdeaComment(api, Number(selectedIdeaId), Number(commentId));
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 삭제에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, selectedIdeaId, setBusy, setError]);

  const applyCommentFilter = useCallback(async () => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      const query = commentFilterBlockId ? `?blockId=${encodeURIComponent(commentFilterBlockId)}` : "";
      const res = await workbenchApi.getIdeaComments(api, selectedIdeaId, query);
      setComments(res.comments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글 불러오기에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, commentFilterBlockId, selectedIdeaId, setBusy, setError]);

  const handleReaction = useCallback(async (emoji: string, targetType = "idea", targetId = "") => {
    if (!selectedIdeaId) {
      return;
    }
    try {
      await workbenchApi.createIdeaReaction(api, selectedIdeaId, { emoji, targetType, targetId });
      const data = await workbenchApi.getIdeaReactions(api, selectedIdeaId, targetType, targetId);
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
      setError(err instanceof Error ? err.message : "리액션 처리에 실패했습니다");
    }
  }, [api, loadIdeas, selectedIdeaId, setError]);

  const handleUploadBlockFile = useCallback(async (blockId: string, file: File) => {
    if (!selectedIdeaId) {
      throw new Error("아이디어를 찾을 수 없습니다");
    }
    const data = await workbenchApi.uploadIdeaBlockFile(api, selectedIdeaId, blockId, file);
    if (data.idea) {
      setSelectedIdea(data.idea);
      setIdeas((prev) => prev.map((idea) => (idea.id === data.idea.id ? { ...idea, ...data.idea } : idea)));
      await loadIdeaChildren(data.idea.id);
    }
    return data.fileBlock;
  }, [api, loadIdeaChildren, selectedIdeaId, setIdeas]);

  const handleCreateVersion = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
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
      await loadIdeaChildren(Number(selectedIdeaId));
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "버전 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, selectedIdea?.blocks, selectedIdeaId, setBusy, setError, versionFile, versionForm.versionLabel]);

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
        await loadIdeaChildren(data.idea.id, data.idea.blocks || []);
      } else {
        await loadIdeaChildren(Number(selectedIdeaId));
      }
      try {
        await loadDashboard();
      } catch {}
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "타임라인 복원에 실패했습니다");
      return false;
    } finally {
      setBusy(false);
    }
  }, [api, loadDashboard, loadIdeaChildren, selectedIdeaId, setBusy, setError, setIdeas]);

  const backToIdeas = useCallback(() => {
    setSelectedIdeaId(null);
    setSelectedIdea(null);
    setDetailNotFound(null);
    setStudioTab("editor");
    setActivePage("ideas");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("idea");
      const query = params.toString();
      window.history.pushState(null, "", query ? `?${query}` : "/");
    }
  }, [setActivePage]);

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
  }, [authed, ideas, selectIdea, selectedIdeaId, setActivePage]);

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
    backToIdeas,
  };
}
