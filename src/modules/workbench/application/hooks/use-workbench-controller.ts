import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { IDEA_STATUS, STATUS_META } from "@/features/ideas/constants/idea-status";
import { apiRequest } from "@/shared/lib/api-client";
import type { ConfirmDialogState, Idea, Session } from "@/shared/types";
import { useAuthSession } from "@/modules/workbench/application/hooks/use-auth-session";
import { useClickOutside } from "@/modules/workbench/application/hooks/use-click-outside";
import { useIdeaDetail } from "@/modules/workbench/application/hooks/use-idea-detail";
import { useIdeaList } from "@/modules/workbench/application/hooks/use-idea-list";
import { useNotificationManager } from "@/modules/workbench/application/hooks/use-notification-manager";
import { useOfflineSync } from "@/modules/workbench/application/hooks/use-offline-sync";
import { useProfileEditor } from "@/modules/workbench/application/hooks/use-profile-editor";
import { useWorkbenchPageNavigation } from "@/modules/workbench/application/hooks/use-workbench-page-navigation";
import { useSyncBadgeState } from "@/modules/workbench/application/hooks/use-sync-badge-state";
import { useTeamManager } from "@/modules/workbench/application/hooks/use-team-manager";
import { useWebhookManager } from "@/modules/workbench/application/hooks/use-webhook-manager";
import { useWorkspaceList } from "@/modules/workbench/application/hooks/use-workspace-list";
import { NOTIFICATION_TYPES } from "@/modules/workbench/domain/workbench-constants";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";
import { blockSeed, formatTime } from "@/modules/workbench/domain/workbench-utils";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

const api = apiRequest;
type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

export function useWorkbenchController() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [createIdeaDialogOpen, setCreateIdeaDialogOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [newIdeaForm, setNewIdeaForm] = useState<{ title: string; category: string; status: import("@/shared/types").IdeaStatus }>({
    title: "",
    category: "",
    status: "seed",
  });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    description: "",
    confirmText: "확인",
    danger: false,
    action: null,
  });
  const [localSyncState, setLocalSyncState] = useState<LocalSyncState>("synced");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const { visible: syncBadgeVisible, fading: syncBadgeFading } = useSyncBadgeState(localSyncState);
  const authed = useMemo(() => Boolean(session?.user), [session]);
  const activeWorkspaceId = Number(session?.workspace?.id) || null;

  const {
    dashboard,
    filters,
    setFilters,
    ideaView,
    setIdeaView,
    navigatorSort,
    setNavigatorSort,
    navigatorPreset,
    setNavigatorPreset,
    ideas,
    setIdeas,
    presetCounts,
    categoryOptions,
    explorerAuthorOptions,
    sideIdeas,
    loadIdeas,
    loadDashboard,
    applyQuickStatusFilter,
  } = useIdeaList({ api, enabled: authed });

  const {
    userTeams,
    pendingWorkspaceInvitations,
    selectedWorkspaceDetail,
    setSelectedWorkspaceDetail,
    handleCreateWorkspace,
    handleUpdateWorkspace,
    handleDeleteWorkspace,
    acceptPendingWorkspaceInvitation,
    declinePendingWorkspaceInvitation,
    resetWorkspaceList,
  } = useWorkspaceList({
    api,
    activeWorkspaceId,
    enabled: authed,
    onDeleteActiveWorkspace: async () => {
      await bootstrap();
    },
  });

  const {
    notifications,
    unreadCount,
    notificationPanelOpen,
    notificationFilters,
    setNotificationFilters,
    mutedTypes,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    saveMutedTypes,
    toggleMutedType,
    openUtilityPanel,
    closeUtilityPanel,
    connectStream,
    disconnectStream,
    deleteNotification,
    resetNotificationState,
  } = useNotificationManager({ api, authed, activeWorkspaceId });

  const {
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
  } = useTeamManager({ api, activeWorkspaceId, enabled: authed, setConfirmDialog });

  const {
    webhooks,
    webhookForm,
    setWebhookForm,
    handleSaveWebhook,
  } = useWebhookManager({ api, enabled: authed && Boolean(activeWorkspaceId), teamMe, setBusy, setError, loadNotifications });

  const {
    selectedIdeaId,
    setSelectedIdeaId,
    selectedIdea,
    setSelectedIdea,
    detailNotFound,
    setDetailNotFound,
    comments,
    commentFilterBlockId,
    setCommentFilterBlockId,
    reactionsByTarget,
    versions,
    versionForm,
    setVersionForm,
    timeline,
    ideaPresence,
    studioTab,
    setStudioTab,
    clearDetailState,
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
  } = useIdeaDetail({
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
  });

  const {
    profileEditOpen,
    profileEditName,
    setProfileEditName,
    profileEditEmail,
    setProfileEditEmail,
    profileEditCurrentPwd,
    setProfileEditCurrentPwd,
    profileEditNewPwd,
    setProfileEditNewPwd,
    profileEditBusy,
    profileEditError,
    openProfileEdit,
    closeProfileEdit,
    saveProfile,
  } = useProfileEditor({ api, session, setSession });

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false, action: null }));
  }, []);

  const confirmDialogAction = useCallback(async () => {
    const action = confirmDialog.action;
    closeConfirmDialog();
    if (!action) {
      return;
    }
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 처리에 실패했습니다");
    }
  }, [closeConfirmDialog, confirmDialog.action]);

  const { handleSaveIdea } = useOfflineSync({
    api,
    authed,
    selectedIdea,
    selectedIdeaId,
    setSelectedIdea,
    setIdeas,
    loadIdeaChildren,
    loadDashboard,
    loadIdeas,
    localSyncState,
    setLocalSyncState,
    setBusy,
    setError,
  });

  const { bootstrap, handleLogout, handleEnterWorkspace, handleSwitchTeam } = useAuthSession({
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
    loadIdeas,
    selectIdea,
    connectStream,
    disconnectStream,
    resetTeamState,
    resetWorkspaceList,
    resetNotificationState,
    clearDetailState,
  });

  useEffect(() => {
    if (!authed) {
      return;
    }
    void loadIdeas(filters);
  }, [authed, filters, loadIdeas]);

  const handleCreateIdea = useCallback(
    async (event: FormSubmitEvent) => {
      event.preventDefault();
      if (!newIdeaForm.title.trim()) {
        return;
      }
      setBusy(true);
      try {
        const created = await workbenchApi.createIdea(api, {
          ...newIdeaForm,
          blocks: [blockSeed()],
        });
        setNewIdeaForm({ title: "", category: "", status: "seed" });
        await loadIdeas();
        await selectIdea(created.idea.id);
        await loadDashboard();
      } catch (err) {
        setError(err instanceof Error ? err.message : "아이디어 생성에 실패했습니다");
      } finally {
        setBusy(false);
      }
    },
    [loadDashboard, loadIdeas, newIdeaForm, selectIdea]
  );

  const refreshAll = useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  const openCreateIdea = useCallback(() => {
    setCreateIdeaDialogOpen(true);
  }, []);

  const { handleNavigatePage } = useWorkbenchPageNavigation({
    activePage,
    setActivePage,
    selectedIdeaId,
    sideIdeas,
    selectIdea,
    selectedWorkspaceDetail,
    activeWorkspaceId,
    setSelectedWorkspaceDetail,
    clearSelectedIdeaId: () => setSelectedIdeaId(null),
    clearSelectedIdea: () => setSelectedIdea(null),
    clearDetailNotFound: () => setDetailNotFound(null),
    clearPresenceHeartbeat,
    setStudioTab,
    studioTab,
  });

  useClickOutside(profileDropdownRef, profileDropdownOpen, () => setProfileDropdownOpen(false));

  const blocks = selectedIdea?.blocks || [];
  const canEditIdea = Boolean(teamMe.role) && teamMe.role !== "viewer";
  const canCreateIdea = canEditIdea;
  const shouldShowSyncBadge = syncBadgeVisible;

  const workbenchSessionContextValue = useMemo(
    () => ({
      session,
      teamMe,
      canEditIdea,
      canCreateIdea,
      activeWorkspaceId,
      userTeams,
      formatTime,
    }),
    [activeWorkspaceId, canCreateIdea, canEditIdea, session, teamMe, userTeams]
  );

  const workbenchActionsContextValue = useMemo(
    () => ({
      openCreateIdea,
      selectIdea,
      handleEnterWorkspace,
      handleSwitchTeam,
    }),
    [handleEnterWorkspace, handleSwitchTeam, openCreateIdea, selectIdea]
  );

  const onOpenProfileEdit = useCallback(() => {
    setProfileDropdownOpen(false);
    openProfileEdit();
  }, [openProfileEdit]);

  const onToolbarLogout = useCallback(() => {
    setProfileDropdownOpen(false);
    void handleLogout();
  }, [handleLogout]);

  const workspace =
    userTeams.find((ws) => Number(ws.id) === Number(selectedWorkspaceDetail))
    || userTeams.find((ws) => Number(ws.id) === Number(activeWorkspaceId))
    || null;

  const onDeleteSelectedWorkspace = selectedWorkspaceDetail
    ? async () => {
      await handleDeleteWorkspace(selectedWorkspaceDetail);
      setActivePage("dashboard");
    }
    : undefined;

  const onUpdateSelectedWorkspace = selectedWorkspaceDetail
    ? async (id: number, data: { name: string; icon: string; color: string }) => {
      await handleUpdateWorkspace(id, data);
    }
    : undefined;

  const onDeleteIdeas = useCallback(
    async (ideaIds: number[]) => {
      await Promise.all(ideaIds.map((id) => workbenchApi.deleteIdea(api, id)));
      await Promise.all([loadIdeas(), loadDashboard()]);
    },
    [loadDashboard, loadIdeas]
  );

  const visibleIdeas = sideIdeas as Idea[];

  const acceptWorkspaceInvitationAction = useCallback(
    async (invitationId: number) => {
      const result = await acceptPendingWorkspaceInvitation(invitationId);
      const workspaceId = Number(result?.workspace?.id || 0);
      if (workspaceId > 0) {
        await handleSwitchTeam(workspaceId);
      } else {
        await bootstrap();
      }
    },
    [acceptPendingWorkspaceInvitation, bootstrap, handleSwitchTeam]
  );

  const declineWorkspaceInvitationAction = useCallback(
    async (invitationId: number) => {
      await declinePendingWorkspaceInvitation(invitationId);
      await bootstrap();
    },
    [bootstrap, declinePendingWorkspaceInvitation]
  );

  return {
    authed,
    error,
    workbenchSessionContextValue,
    workbenchActionsContextValue,
    shellProps: {
      mobileNavOpen,
      onOpenMobileNavAction: () => setMobileNavOpen(true),
      onCloseMobileNavAction: () => setMobileNavOpen(false),
      activePage,
      onNavigatePageAction: handleNavigatePage,
      navCollapsed,
      userName: session?.user?.name || "Mumur 사용자",
      workspaceName: session?.workspace?.name || "워크스페이스",
      userWorkspaces: userTeams,
      pendingInvitations: pendingWorkspaceInvitations,
      activeWorkspaceId: session?.workspace?.id ?? null,
      onSwitchWorkspaceAction: handleSwitchTeam,
      onEnterWorkspaceAction: handleEnterWorkspace,
      selectedWorkspaceId: selectedWorkspaceDetail,
      onCreateWorkspaceAction: handleCreateWorkspace,
      onUpdateWorkspaceAction: handleUpdateWorkspace,
      onDeleteWorkspaceAction: handleDeleteWorkspace,
      onAcceptInvitationAction: acceptWorkspaceInvitationAction,
      onDeclineInvitationAction: declineWorkspaceInvitationAction,
      workspaceSwitching,
      onToggleNavCollapseAction: () => setNavCollapsed((prev) => !prev),
      onEditProfileAction: openProfileEdit,
      onLogoutAction: handleLogout,
      notificationPanelOpen,
      onCloseNotificationPanelAction: closeUtilityPanel,
    },
    notificationPanelProps: {
      activePage,
      selectedIdea,
      studioTab,
      setStudioTab,
      dashboard,
      onRequestClose: closeUtilityPanel,
      notificationFilters,
      setNotificationFilters,
      NOTIFICATION_TYPES,
      loadNotifications,
      markAllNotificationsRead,
      mutedTypes,
      toggleMutedType,
      saveMutedTypes,
      notifications,
      markNotificationRead,
      deleteNotification,
      formatTime,
      onAcceptInvitation: acceptWorkspaceInvitationAction,
      onDeclineInvitation: declineWorkspaceInvitationAction,
    },
    toolbarProps: {
      shouldShowSyncBadge,
      localSyncState,
      syncBadgeFading,
      workspaceSwitching,
      canEditIdea,
      onCreateIdea: openCreateIdea,
      onRefresh: refreshAll,
      notificationPanelOpen,
      unreadCount,
      onOpenNotifications: openUtilityPanel,
      profileDropdownRef,
      profileDropdownOpen,
      onToggleProfileDropdown: () => setProfileDropdownOpen((prev) => !prev),
      userName: session?.user?.name || "사용자",
      userEmail: (session?.user as { email?: string } | null)?.email || "이메일 없음",
      onOpenProfileEdit,
      onLogout: onToolbarLogout,
    },
    contentProps: {
      activePage,
      dashboardProps: {
        dashboard,
        loading: busy || !dashboard,
        ideas: visibleIdeas,
        STATUS_META,
      },
      ideasProps: {
        ideas: visibleIdeas,
        filters,
        setFilters,
        ideaView,
        setIdeaView,
        navigatorSort,
        setNavigatorSort,
        navigatorPreset,
        setNavigatorPreset,
        presetCounts,
        STATUS_META,
        onQuickStatusFilter: applyQuickStatusFilter,
        categoryOptions,
        authorOptions: explorerAuthorOptions,
      },
      detailProps: {
        detailNotFound,
        backToIdeas,
        studioPanelProps: {
          selectedIdea,
          onBackToList: backToIdeas,
          studioTab,
          setStudioTab,
          STATUS_META,
          handleSaveIdea,
          blocks,
          handleCreateComment,
          handleUpdateComment,
          handleDeleteComment,
          comments,
          commentFilterBlockId,
          setCommentFilterBlockId,
          applyCommentFilter,
          reactionsByTarget,
          handleReaction,
          handleCreateVersion,
          handleRestoreVersion,
          versionForm,
          setVersionForm,
          versions,
            timeline,
            teamMembers,
            handleUploadBlockFile,
            ideaPresence,
            reportActiveBlock,
          },
        },
      teamProps: {
        teamMembers,
        teamMemberForm,
        setTeamMemberForm,
        addTeamMember,
        updateTeamMemberRole,
        requestRemoveTeamMember,
        teamInvitations,
        retryTeamInvitation,
        requestCancelInvitation,
        teamInvitationFeedback,
        webhooks,
        webhookForm,
        setWebhookForm,
        handleSaveWebhook,
        webhookSaving: busy,
      },
      workspaceProps: {
        workspace,
        ideas: visibleIdeas,
        STATUS_META,
        onUpdateWorkspace: onUpdateSelectedWorkspace,
        onDeleteWorkspace: onDeleteSelectedWorkspace,
        onDeleteIdeas,
      },
    },
    ideaCreateDialogProps: {
      open: createIdeaDialogOpen,
      onClose: () => setCreateIdeaDialogOpen(false),
      busy,
      IDEA_STATUS,
      STATUS_META,
      newIdeaForm,
      setNewIdeaForm,
      handleCreateIdea,
    },
    confirmDialogProps: {
      open: confirmDialog.open,
      title: confirmDialog.title,
      description: confirmDialog.description,
      confirmText: confirmDialog.confirmText,
      danger: confirmDialog.danger,
      onCancel: closeConfirmDialog,
      onConfirm: confirmDialogAction,
    },
    profileEditDialogProps: {
      open: profileEditOpen,
      onClose: closeProfileEdit,
      busy: profileEditBusy,
      error: profileEditError,
      name: profileEditName,
      onChangeName: setProfileEditName,
      email: profileEditEmail,
      onChangeEmail: setProfileEditEmail,
      currentPassword: profileEditCurrentPwd,
      onChangeCurrentPassword: setProfileEditCurrentPwd,
      newPassword: profileEditNewPwd,
      onChangeNewPassword: setProfileEditNewPwd,
      onSave: saveProfile,
    },
  };
}
