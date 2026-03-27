import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/lib/api-client";
import type { Idea, Session } from "@/shared/types";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

type UseAuthSessionParams = {
  api: workbenchApi.WorkbenchApiClient;
  session: Session | null;
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
  authed: boolean;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setActivePage: React.Dispatch<React.SetStateAction<string>>;
  setWorkspaceSwitching: React.Dispatch<React.SetStateAction<boolean>>;
  setCreateIdeaDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedWorkspaceDetail: React.Dispatch<React.SetStateAction<number | null>>;
  setIdeas: React.Dispatch<React.SetStateAction<Idea[]>>;
  setSelectedIdeaId: React.Dispatch<React.SetStateAction<string | null>>;
  setDetailNotFound: React.Dispatch<React.SetStateAction<{ ideaId: string; message: string } | null>>;
  loadDashboard: () => Promise<void>;
  loadIdeas: () => Promise<Idea[]>;
  selectIdea: (
    ideaId: number | string,
    options?: { syncUrl?: boolean; openPage?: boolean; workspaceId?: number | null }
  ) => Promise<void>;
  loadNotifications: () => Promise<void>;
  loadNotificationPreferences: () => Promise<void>;
  loadWebhooks: () => Promise<void>;
  loadUserTeams: () => Promise<void>;
  loadTeamMembers: () => Promise<void>;
  loadTeamInvitations: () => Promise<void>;
  connectStream: () => void;
  disconnectStream: () => void;
  resetTeamState: () => void;
  resetWorkspaceList: () => void;
  resetNotificationState: () => void;
  clearDetailState: () => void;
};

export function useAuthSession({
  api,
  session,
  setSession,
  authed,
  setError,
  setBusy,
  setActivePage,
  setWorkspaceSwitching,
  setCreateIdeaDialogOpen,
  setSelectedWorkspaceDetail,
  setIdeas,
  setSelectedIdeaId,
  setDetailNotFound,
  loadDashboard,
  loadIdeas,
  selectIdea,
  loadNotifications,
  loadNotificationPreferences,
  loadWebhooks,
  loadUserTeams,
  loadTeamMembers,
  loadTeamInvitations,
  connectStream,
  disconnectStream,
  resetTeamState,
  resetWorkspaceList,
  resetNotificationState,
  clearDetailState,
}: UseAuthSessionParams) {
  const [authChecked, setAuthChecked] = useState(false);
  const bootstrapRef = useRef<(() => Promise<void>) | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      const me = await workbenchApi.getAuthMe(api);
      setSession(me);

      await Promise.all([
        loadDashboard(),
        loadNotifications(),
        loadNotificationPreferences(),
        loadWebhooks(),
        loadUserTeams(),
        loadTeamMembers(),
        loadTeamInvitations(),
      ]);
      const loadedIdeas = await loadIdeas();
      if (loadedIdeas.length) {
        const requestedIdea = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("idea") : null;
        if (requestedIdea) {
          const requestedExists = loadedIdeas.some((item: Idea) => String(item.id) === String(requestedIdea));
          if (requestedExists) {
            await selectIdea(requestedIdea, { syncUrl: false, openPage: true });
          } else {
            setSelectedIdeaId(String(requestedIdea));
            clearDetailState();
            setDetailNotFound({ ideaId: String(requestedIdea), message: "아이디어를 찾을 수 없습니다" });
            setActivePage("detail");
          }
        } else {
          await selectIdea(loadedIdeas[0].id, { syncUrl: false, openPage: false });
          setDetailNotFound(null);
        }
      } else {
        const requestedIdea = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("idea") : null;
        setSelectedIdeaId(null);
        clearDetailState();
        if (requestedIdea) {
          setSelectedIdeaId(String(requestedIdea));
          setDetailNotFound({ ideaId: String(requestedIdea), message: "아이디어를 찾을 수 없습니다" });
          setActivePage("detail");
        } else {
          setDetailNotFound(null);
        }
      }
      setError("");
      setAuthChecked(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null);
        setIdeas([]);
        setSelectedIdeaId(null);
        clearDetailState();
        setError(err.message || "로그인이 필요합니다");
        disconnectStream();
      } else {
        setError(err instanceof Error ? err.message : "요청 처리에 실패했습니다");
      }
      setAuthChecked(true);
    }
  }, [
    api,
    clearDetailState,
    disconnectStream,
    loadDashboard,
    loadIdeas,
    loadNotificationPreferences,
    loadNotifications,
    loadTeamInvitations,
    loadTeamMembers,
    loadUserTeams,
    loadWebhooks,
    selectIdea,
    setActivePage,
    setDetailNotFound,
    setError,
    setIdeas,
    setSelectedIdeaId,
    setSession,
  ]);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    if (bootstrapRef.current) {
      void bootstrapRef.current();
    }
    return () => {
      disconnectStream();
    };
  }, [disconnectStream]);

  useEffect(() => {
    if (authed) {
      connectStream();
    } else {
      disconnectStream();
    }
  }, [authed, connectStream, disconnectStream]);

  useEffect(() => {
    if (!authChecked || authed || typeof window === "undefined") {
      return;
    }
    window.location.replace("/login");
  }, [authChecked, authed]);

  const handleLogout = useCallback(async () => {
    setBusy(true);
    try {
      await workbenchApi.logout(api);
      setSession(null);
      setIdeas([]);
      setSelectedIdeaId(null);
      clearDetailState();
      setCreateIdeaDialogOpen(false);
      resetTeamState();
      resetWorkspaceList();
      resetNotificationState();
      setActivePage("dashboard");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/");
      }
      disconnectStream();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그아웃에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [
    api,
    clearDetailState,
    disconnectStream,
    resetNotificationState,
    resetTeamState,
    resetWorkspaceList,
    setActivePage,
    setBusy,
    setCreateIdeaDialogOpen,
    setError,
    setIdeas,
    setSelectedIdeaId,
    setSession,
  ]);

  const handleEnterWorkspace = useCallback(
    async (workspaceId: number) => {
      if (!workspaceId) {
        return;
      }
      if (Number(workspaceId) !== Number(session?.workspace?.id)) {
        setWorkspaceSwitching(true);
        setBusy(true);
        try {
          await workbenchApi.switchWorkspace(api, workspaceId);
          await bootstrap();
        } catch (err) {
          setError(err instanceof Error ? err.message : "워크스페이스 전환에 실패했습니다");
        } finally {
          setBusy(false);
          setWorkspaceSwitching(false);
        }
      }
      setSelectedWorkspaceDetail(workspaceId);
      setActivePage("workspace");
    },
    [api, bootstrap, session?.workspace?.id, setActivePage, setBusy, setError, setSelectedWorkspaceDetail, setWorkspaceSwitching]
  );

  const handleSwitchTeam = useCallback(
    async (teamId: number) => {
      if (!teamId || Number(teamId) === Number(session?.workspace?.id)) {
        setSelectedWorkspaceDetail(Number(teamId) || null);
        setActivePage("workspace");
        return;
      }
      setWorkspaceSwitching(true);
      setBusy(true);
      try {
        setSelectedWorkspaceDetail(Number(teamId));
        setActivePage("workspace");
        setSelectedIdeaId(null);
        clearDetailState();
        await workbenchApi.switchWorkspace(api, Number(teamId));
        await bootstrap();
      } catch (err) {
        setError(err instanceof Error ? err.message : "팀 전환에 실패했습니다");
      } finally {
        setBusy(false);
        setWorkspaceSwitching(false);
      }
    },
    [
      api,
      bootstrap,
      clearDetailState,
      session?.workspace?.id,
      setActivePage,
      setBusy,
      setError,
      setSelectedIdeaId,
      setSelectedWorkspaceDetail,
      setWorkspaceSwitching,
    ]
  );

  return {
    authChecked,
    bootstrap,
    handleLogout,
    handleEnterWorkspace,
    handleSwitchTeam,
  };
}
