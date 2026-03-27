import { useCallback, useState } from "react";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import type { UserWorkspace } from "@/shared/types";

type WorkspaceInput = { name: string; icon: string; color: string };

type UseWorkspaceListParams = {
  api: workbenchApi.WorkbenchApiClient;
  activeWorkspaceId: number | null;
  onDeleteActiveWorkspace?: () => Promise<void> | void;
};

export function useWorkspaceList({ api, activeWorkspaceId, onDeleteActiveWorkspace }: UseWorkspaceListParams) {
  const [userTeams, setUserTeams] = useState<UserWorkspace[]>([]);
  const [selectedWorkspaceDetail, setSelectedWorkspaceDetail] = useState<number | null>(null);

  const loadUserTeams = useCallback(async () => {
    const data = await workbenchApi.getWorkspaces(api);
    setUserTeams(data.workspaces || []);
  }, [api]);

  const handleCreateWorkspace = useCallback(async (data: WorkspaceInput) => {
    await workbenchApi.createWorkspace(api, { teamName: data.name, icon: data.icon, color: data.color });
    const loaded = await workbenchApi.getWorkspaces(api);
    setUserTeams(loaded.workspaces || []);
  }, [api]);

  const handleUpdateWorkspace = useCallback(async (id: number, data: WorkspaceInput) => {
    await workbenchApi.updateWorkspace(api, id, data);
    const loaded = await workbenchApi.getWorkspaces(api);
    setUserTeams(loaded.workspaces || []);
  }, [api]);

  const handleDeleteWorkspace = useCallback(async (id: number) => {
    await workbenchApi.deleteWorkspace(api, id);
    const loaded = await workbenchApi.getWorkspaces(api);
    setUserTeams(loaded.workspaces || []);
    setSelectedWorkspaceDetail((prev) => (Number(prev) === Number(id) ? null : prev));
    if (Number(activeWorkspaceId) === Number(id)) {
      await onDeleteActiveWorkspace?.();
    }
  }, [activeWorkspaceId, api, onDeleteActiveWorkspace]);

  const resetWorkspaceList = useCallback(() => {
    setUserTeams([]);
    setSelectedWorkspaceDetail(null);
  }, []);

  return {
    userTeams,
    selectedWorkspaceDetail,
    setSelectedWorkspaceDetail,
    loadUserTeams,
    handleCreateWorkspace,
    handleUpdateWorkspace,
    handleDeleteWorkspace,
    resetWorkspaceList,
  };
}
