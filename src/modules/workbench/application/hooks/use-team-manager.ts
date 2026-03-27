import { useCallback, useState } from "react";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import type {
  ConfirmDialogState,
  WorkspaceInvitation,
  WorkspaceMe,
  WorkspaceMember,
  WorkspaceMemberForm,
  WorkspaceRole,
} from "@/shared/types";

type UseTeamManagerParams = {
  api: workbenchApi.WorkbenchApiClient;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
};

export function useTeamManager({ api, setConfirmDialog }: UseTeamManagerParams) {
  const [teamMembers, setTeamMembers] = useState<WorkspaceMember[]>([]);
  const [teamMemberForm, setTeamMemberForm] = useState<WorkspaceMemberForm>({ email: "", role: "editor" });
  const [teamMe, setTeamMe] = useState<WorkspaceMe>({ userId: null, isOwner: false, role: null });
  const [teamInvitations, setTeamInvitations] = useState<WorkspaceInvitation[]>([]);
  const [teamInvitationMessage, setTeamInvitationMessage] = useState("");

  const loadTeamMembers = useCallback(async () => {
    const data = await workbenchApi.getWorkspaceMembers(api);
    setTeamMembers(data.members || []);
    setTeamMe(data.me || { userId: null, isOwner: false, role: null });
  }, [api]);

  const loadTeamInvitations = useCallback(async () => {
    const data = await workbenchApi.getWorkspaceInvitations(api);
    setTeamInvitations(data.invitations || []);
  }, [api]);

  const addTeamMember = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = { email: teamMemberForm.email, role: teamMemberForm.role };
    const data = await workbenchApi.createWorkspaceInvitation(api, payload);
    setTeamInvitationMessage(data.invitation?.message || "초대 처리 완료");
    setTeamMemberForm({ email: "", role: "editor" });
    await Promise.all([loadTeamMembers(), loadTeamInvitations()]);
  }, [api, loadTeamInvitations, loadTeamMembers, teamMemberForm]);

  const updateTeamMemberRole = useCallback(async (userId: number, role: WorkspaceRole) => {
    await workbenchApi.updateWorkspaceMemberRole(api, Number(userId), String(role));
    await loadTeamMembers();
  }, [api, loadTeamMembers]);

  const removeTeamMember = useCallback(async (userId: number) => {
    await workbenchApi.removeWorkspaceMember(api, Number(userId));
    await loadTeamMembers();
  }, [api, loadTeamMembers]);

  const retryTeamInvitation = useCallback(async (invitationId: number) => {
    const data = await workbenchApi.retryWorkspaceInvitation(api, Number(invitationId));
    setTeamInvitationMessage(data.invitation?.message || "재시도 완료");
    await Promise.all([loadTeamMembers(), loadTeamInvitations()]);
  }, [api, loadTeamInvitations, loadTeamMembers]);

  const cancelTeamInvitation = useCallback(async (invitationId: number) => {
    await workbenchApi.cancelWorkspaceInvitation(api, Number(invitationId));
    await loadTeamInvitations();
  }, [api, loadTeamInvitations]);

  const requestRemoveTeamMember = useCallback((member: WorkspaceMember) => {
    setConfirmDialog({
      open: true,
      title: "멤버를 제거할까요?",
      description: `${member.name || "멤버"} (${member.email || "-"})를 팀에서 제거합니다.`,
      confirmText: "제거",
      danger: true,
      action: async () => removeTeamMember(member.userId),
    });
  }, [removeTeamMember, setConfirmDialog]);

  const requestCancelInvitation = useCallback((invite: WorkspaceInvitation) => {
    setConfirmDialog({
      open: true,
      title: "초대를 취소할까요?",
      description: `${invite.email || "해당 사용자"}에게 보낸 초대를 취소합니다.`,
      confirmText: "취소하기",
      danger: true,
      action: async () => cancelTeamInvitation(invite.id),
    });
  }, [cancelTeamInvitation, setConfirmDialog]);

  const resetTeamState = useCallback(() => {
    setTeamMembers([]);
    setTeamMemberForm({ email: "", role: "editor" });
    setTeamMe({ userId: null, isOwner: false, role: null });
    setTeamInvitations([]);
    setTeamInvitationMessage("");
  }, []);

  return {
    teamMembers,
    teamMemberForm,
    setTeamMemberForm,
    teamMe,
    teamInvitations,
    teamInvitationMessage,
    loadTeamMembers,
    loadTeamInvitations,
    addTeamMember,
    updateTeamMemberRole,
    retryTeamInvitation,
    requestRemoveTeamMember,
    requestCancelInvitation,
    resetTeamState,
  };
}
