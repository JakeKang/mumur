import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

type WorkspaceInput = { name: string; icon: string; color: string };

type UseWorkspaceListParams = {
  api: workbenchApi.WorkbenchApiClient;
  activeWorkspaceId: number | null;
  enabled?: boolean;
  onDeleteActiveWorkspace?: () => Promise<void> | void;
};

export function useWorkspaceList({ api, activeWorkspaceId, enabled = true, onDeleteActiveWorkspace }: UseWorkspaceListParams) {
  const [selectedWorkspaceDetail, setSelectedWorkspaceDetail] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const fetchWorkspaces = useCallback(() => workbenchApi.getWorkspaces(api), [api]);

  const workspacesQuery = useQuery({
    queryKey: workbenchQueryKeys.workspaces,
    queryFn: fetchWorkspaces,
    enabled,
  });

  const userTeams = workspacesQuery.data?.workspaces || [];
  const pendingWorkspaceInvitations = workspacesQuery.data?.pendingInvitations || [];

  const syncWorkspaceIndex = useCallback(async () => {
    const data = await fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.workspaces,
      queryFn: fetchWorkspaces,
    });
    return data;
  }, [fetchWorkspaces, queryClient]);

  const loadUserTeams = useCallback(async () => {
    await syncWorkspaceIndex();
  }, [syncWorkspaceIndex]);

  const handleCreateWorkspace = useCallback(async (data: WorkspaceInput) => {
    await workbenchApi.createWorkspace(api, { teamName: data.name, icon: data.icon, color: data.color });
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.workspaces });
    await syncWorkspaceIndex();
  }, [api, queryClient, syncWorkspaceIndex]);

  const handleUpdateWorkspace = useCallback(async (id: number, data: WorkspaceInput) => {
    await workbenchApi.updateWorkspace(api, id, data);
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.workspaces });
    await syncWorkspaceIndex();
  }, [api, queryClient, syncWorkspaceIndex]);

  const handleDeleteWorkspace = useCallback(async (id: number) => {
    await workbenchApi.deleteWorkspace(api, id);
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.workspaces });
    await syncWorkspaceIndex();
    setSelectedWorkspaceDetail((prev) => (Number(prev) === Number(id) ? null : prev));
    if (Number(activeWorkspaceId) === Number(id)) {
      await onDeleteActiveWorkspace?.();
    }
  }, [activeWorkspaceId, api, onDeleteActiveWorkspace, queryClient, syncWorkspaceIndex]);

  const acceptPendingWorkspaceInvitation = useCallback(async (invitationId: number) => {
    const accepted = await workbenchApi.acceptWorkspaceInvitation(api, invitationId);
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.workspaces });
    await syncWorkspaceIndex();
    return accepted;
  }, [api, queryClient, syncWorkspaceIndex]);

  const declinePendingWorkspaceInvitation = useCallback(async (invitationId: number) => {
    const declined = await workbenchApi.declineWorkspaceInvitation(api, invitationId);
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.workspaces });
    await syncWorkspaceIndex();
    return declined;
  }, [api, queryClient, syncWorkspaceIndex]);

  const resetWorkspaceList = useCallback(() => {
    queryClient.removeQueries({ queryKey: workbenchQueryKeys.workspaces });
    setSelectedWorkspaceDetail(null);
  }, [queryClient]);

  return {
    userTeams,
    pendingWorkspaceInvitations,
    selectedWorkspaceDetail,
    setSelectedWorkspaceDetail,
    loadUserTeams,
    handleCreateWorkspace,
    handleUpdateWorkspace,
    handleDeleteWorkspace,
    acceptPendingWorkspaceInvitation,
    declinePendingWorkspaceInvitation,
    resetWorkspaceList,
  };
}
