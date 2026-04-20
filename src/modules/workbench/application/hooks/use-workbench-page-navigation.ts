import { useCallback, useEffect } from "react";
import { clearIdeaQueryParam, focusWorkbenchTitleInput } from "@/modules/workbench/application/workbench-browser";

type NavigateTarget = { id: number; teamId: number };

type UseWorkbenchPageNavigationParams = {
  activePage: string;
  setActivePage: (page: string) => void;
  selectedIdeaId: number | string | null;
  sideIdeas: NavigateTarget[];
  selectIdea: (ideaId: number, options?: { syncUrl?: boolean; openPage?: boolean; workspaceId?: number | null }) => Promise<void>;
  selectedWorkspaceDetail: number | null;
  activeWorkspaceId: number | null;
  setSelectedWorkspaceDetail: (workspaceId: number | null) => void;
  clearSelectedIdeaId: () => void;
  clearSelectedIdea: () => void;
  clearDetailNotFound: () => void;
  clearPresenceHeartbeat: () => Promise<void> | void;
  setStudioTab: (tab: string) => void;
  studioTab: string;
};

export function useWorkbenchPageNavigation({
  activePage,
  setActivePage,
  selectedIdeaId,
  sideIdeas,
  selectIdea,
  selectedWorkspaceDetail,
  activeWorkspaceId,
  setSelectedWorkspaceDetail,
  clearSelectedIdeaId,
  clearSelectedIdea,
  clearDetailNotFound,
  clearPresenceHeartbeat,
  setStudioTab,
  studioTab,
}: UseWorkbenchPageNavigationParams) {
  const resetDetailSelection = useCallback(() => {
    clearSelectedIdeaId();
    clearSelectedIdea();
    clearDetailNotFound();
    void clearPresenceHeartbeat();
    setStudioTab("editor");
    clearIdeaQueryParam();
  }, [clearDetailNotFound, clearPresenceHeartbeat, clearSelectedIdea, clearSelectedIdeaId, setStudioTab]);

  const handleNavigatePage = useCallback(
    async (page: string) => {
      if (page === "detail") {
        if (selectedIdeaId) {
          setActivePage("detail");
          return;
        }
        if (sideIdeas.length) {
          await selectIdea(sideIdeas[0].id, { syncUrl: true, openPage: true, workspaceId: sideIdeas[0].teamId });
          return;
        }
        setActivePage("ideas");
        return;
      }

      if (page === "workspace") {
        if (!selectedWorkspaceDetail && activeWorkspaceId) {
          setSelectedWorkspaceDetail(activeWorkspaceId);
        }
        setActivePage("workspace");
        return;
      }

      resetDetailSelection();
      setActivePage(page);
    },
    [activeWorkspaceId, resetDetailSelection, selectIdea, selectedIdeaId, selectedWorkspaceDetail, setActivePage, setSelectedWorkspaceDetail, sideIdeas]
  );

  useEffect(() => {
    if (activePage === "detail" && !selectedIdeaId) {
      setActivePage("ideas");
    }
  }, [activePage, selectedIdeaId, setActivePage]);

  useEffect(() => {
    if (activePage !== "detail" || studioTab !== "editor" || !selectedIdeaId) {
      return;
    }
    return focusWorkbenchTitleInput();
  }, [activePage, selectedIdeaId, studioTab]);

  return {
    handleNavigatePage,
  };
}
