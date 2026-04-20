import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import { roleLabel } from "@/shared/constants/ui-labels";
import type {
  ConfirmDialogState,
  WorkspaceInvitation,
  WorkspaceInvitationPreview,
  WorkspaceMe,
  WorkspaceMember,
  WorkspaceMemberForm,
  WorkspaceRole,
} from "@/shared/types";

type UseTeamManagerParams = {
  api: workbenchApi.WorkbenchApiClient;
  activeWorkspaceId: number | null;
  enabled?: boolean;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
};

type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

export function useTeamManager({ api, activeWorkspaceId, enabled = true, setConfirmDialog }: UseTeamManagerParams) {
  const [teamMemberForm, setTeamMemberForm] = useState<WorkspaceMemberForm>({ email: "", role: "editor" });
  const [teamInvitationFeedback, setTeamInvitationFeedback] = useState("");
  const invitationFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const fetchTeamMembers = useCallback(() => workbenchApi.getWorkspaceMembers(api), [api]);
  const fetchTeamInvitations = useCallback(() => workbenchApi.getWorkspaceInvitations(api), [api]);

  const teamMembersQuery = useQuery({
    queryKey: workbenchQueryKeys.teamMembers(activeWorkspaceId),
    queryFn: fetchTeamMembers,
    enabled: enabled && Boolean(activeWorkspaceId),
  });

  const teamInvitationsQuery = useQuery({
    queryKey: workbenchQueryKeys.teamInvitations(activeWorkspaceId),
    queryFn: fetchTeamInvitations,
    enabled: enabled && Boolean(activeWorkspaceId),
  });

  const teamMembers = teamMembersQuery.data?.members || [];
  const teamMe: WorkspaceMe = teamMembersQuery.data?.me || { userId: null, isOwner: false, role: null };
  const teamInvitations = teamInvitationsQuery.data?.invitations || [];

  const showTeamInvitationFeedback = useCallback((message: string) => {
    if (invitationFeedbackTimerRef.current) {
      clearTimeout(invitationFeedbackTimerRef.current);
      invitationFeedbackTimerRef.current = null;
    }
    setTeamInvitationFeedback(message);
    if (!message) {
      return;
    }
    invitationFeedbackTimerRef.current = setTimeout(() => {
      setTeamInvitationFeedback("");
      invitationFeedbackTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (invitationFeedbackTimerRef.current) {
        clearTimeout(invitationFeedbackTimerRef.current);
      }
    };
  }, []);

  const loadTeamMembers = useCallback(async () => {
    await fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.teamMembers(activeWorkspaceId),
      queryFn: fetchTeamMembers,
    });
  }, [activeWorkspaceId, fetchTeamMembers, queryClient]);

  const loadTeamInvitations = useCallback(async () => {
    await fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.teamInvitations(activeWorkspaceId),
      queryFn: fetchTeamInvitations,
    });
  }, [activeWorkspaceId, fetchTeamInvitations, queryClient]);

  const describeInvitationPreview = useCallback((preview: WorkspaceInvitationPreview, role: WorkspaceRole) => {
    const userLabel = preview.registered
      ? `${preview.name || "가입된 사용자"} · ${preview.email}`
      : `${preview.email} · 아직 가입 전`;
    const statusLine = preview.invitation
      ? `기존 초대 상태: ${preview.invitation.status === "accepted" ? "수락됨" : preview.invitation.status === "cancelled" ? "취소됨" : "대기 중"}`
      : "기존 초대 기록 없음";
    const joinLine = preview.registered
      ? "초대를 보내면 알림/초대가 전달되고, 상대가 수락해야 팀에 합류합니다."
      : "가입 후 초대를 수락해야 팀에 합류합니다.";
    return `${userLabel}\n역할 ${roleLabel(role)}\n${statusLine}\n${joinLine}`;
  }, []);

  const addTeamMember = useCallback(async (event: FormSubmitEvent) => {
    event.preventDefault();
    const payload = { email: teamMemberForm.email.trim().toLowerCase(), role: teamMemberForm.role };
    if (!payload.email) {
      return;
    }
    const data = await workbenchApi.previewWorkspaceInvitation(api, payload.email);
    const preview = data.preview as WorkspaceInvitationPreview;

    if (preview.memberRole) {
      showTeamInvitationFeedback(`${preview.name || preview.email}님은 이미 팀 멤버입니다.`);
      return;
    }

    setConfirmDialog({
      open: true,
      title: preview.invitation?.status === "pending" ? "초대를 다시 보낼까요?" : "초대를 보낼까요?",
      description: describeInvitationPreview(preview, payload.role),
      confirmText: preview.invitation?.status === "pending" ? "다시 초대" : "초대 보내기",
      danger: false,
      action: async () => {
        const created = await workbenchApi.createWorkspaceInvitation(api, payload);
        showTeamInvitationFeedback(created.invitation?.message || "초대를 보냈습니다.");
        setTeamMemberForm({ email: "", role: "editor" });
        await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.teamInvitations(activeWorkspaceId) });
        await loadTeamInvitations();
      },
    });
  }, [activeWorkspaceId, api, describeInvitationPreview, loadTeamInvitations, queryClient, setConfirmDialog, showTeamInvitationFeedback, teamMemberForm]);

  const updateTeamMemberRole = useCallback(async (userId: number, role: WorkspaceRole) => {
    await workbenchApi.updateWorkspaceMemberRole(api, Number(userId), String(role));
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.teamMembers(activeWorkspaceId) });
    await loadTeamMembers();
  }, [activeWorkspaceId, api, loadTeamMembers, queryClient]);

  const removeTeamMember = useCallback(async (userId: number) => {
    await workbenchApi.removeWorkspaceMember(api, Number(userId));
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.teamMembers(activeWorkspaceId) });
    await loadTeamMembers();
  }, [activeWorkspaceId, api, loadTeamMembers, queryClient]);

  const retryTeamInvitation = useCallback(async (invitationId: number) => {
    const data = await workbenchApi.retryWorkspaceInvitation(api, Number(invitationId));
    showTeamInvitationFeedback(data.invitation?.message || "초대를 다시 보냈습니다.");
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.teamInvitations(activeWorkspaceId) });
    await loadTeamInvitations();
  }, [activeWorkspaceId, api, loadTeamInvitations, queryClient, showTeamInvitationFeedback]);

  const cancelTeamInvitation = useCallback(async (invitationId: number) => {
    await workbenchApi.cancelWorkspaceInvitation(api, Number(invitationId));
    showTeamInvitationFeedback("초대를 취소했습니다.");
    await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.teamInvitations(activeWorkspaceId) });
    await loadTeamInvitations();
  }, [activeWorkspaceId, api, loadTeamInvitations, queryClient, showTeamInvitationFeedback]);

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
    setTeamMemberForm({ email: "", role: "editor" });
    queryClient.removeQueries({ queryKey: workbenchQueryKeys.teamMembers(activeWorkspaceId) });
    queryClient.removeQueries({ queryKey: workbenchQueryKeys.teamInvitations(activeWorkspaceId) });
    showTeamInvitationFeedback("");
  }, [activeWorkspaceId, queryClient, showTeamInvitationFeedback]);

  return {
    teamMembers,
    teamMemberForm,
    setTeamMemberForm,
    teamMe,
    teamInvitations,
    teamInvitationFeedback,
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
