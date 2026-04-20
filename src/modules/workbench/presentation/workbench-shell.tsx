"use client";

import type { ReactNode } from "react";
import { MumurNavigationSidebar } from "@/features/workspace/components/mumur-navigation-sidebar";
import type { UserWorkspace, WorkspaceInvitation } from "@/shared/types";

type WorkbenchShellProps = {
  mobileNavOpen: boolean;
  onOpenMobileNavAction: () => void;
  onCloseMobileNavAction: () => void;
  activePage: string;
  onNavigatePageAction: (page: string) => void;
  navCollapsed: boolean;
  userName: string;
  workspaceName: string;
  userWorkspaces: UserWorkspace[];
  pendingInvitations: WorkspaceInvitation[];
  activeWorkspaceId: number | null;
  onSwitchWorkspaceAction: (id: number) => void;
  onEnterWorkspaceAction: (id: number) => void;
  selectedWorkspaceId: number | null;
  onCreateWorkspaceAction: (data: { name: string; icon: string; color: string }) => Promise<void>;
  onUpdateWorkspaceAction: (id: number, data: { name: string; icon: string; color: string }) => Promise<void>;
  onDeleteWorkspaceAction: (id: number) => Promise<void>;
  workspaceSwitching: boolean;
  onToggleNavCollapseAction: () => void;
  onEditProfileAction: () => void;
  onLogoutAction: () => void;
  children: ReactNode;
  notificationPanelOpen: boolean;
  onCloseNotificationPanelAction: () => void;
  notificationPanel: ReactNode;
};

export function WorkbenchShell({
  mobileNavOpen,
  onOpenMobileNavAction,
  onCloseMobileNavAction,
  activePage,
  onNavigatePageAction,
  navCollapsed,
  userName,
  workspaceName,
  userWorkspaces,
  pendingInvitations,
  activeWorkspaceId,
  onSwitchWorkspaceAction,
  onEnterWorkspaceAction,
  selectedWorkspaceId,
  onCreateWorkspaceAction,
  onUpdateWorkspaceAction,
  onDeleteWorkspaceAction,
  workspaceSwitching,
  onToggleNavCollapseAction,
  onEditProfileAction,
  onLogoutAction,
  children,
  notificationPanelOpen,
  onCloseNotificationPanelAction,
  notificationPanel,
}: WorkbenchShellProps) {
  return (
    <>
      <div className="relative flex h-screen overflow-hidden bg-[var(--surface)]">
        <button
          type="button"
          onClick={onOpenMobileNavAction}
          className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)] shadow md:hidden"
          aria-label="메뉴 열기"
        >
          ☰
        </button>

        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="메뉴 닫기"
            onClick={onCloseMobileNavAction}
          />
        ) : null}

        <div
          className={`
            md:relative md:block md:shrink-0
            fixed inset-y-0 left-0 z-50 transition-transform duration-200
            ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
            md:translate-x-0
          `}
        >
          <MumurNavigationSidebar
            activePage={activePage}
            onNavigate={(page) => {
              onNavigatePageAction(page);
              onCloseMobileNavAction();
            }}
            collapsed={navCollapsed}
            userName={userName}
            workspaceName={workspaceName}
            userWorkspaces={userWorkspaces}
            pendingInvitations={pendingInvitations}
            activeWorkspaceId={activeWorkspaceId}
            onSwitchWorkspace={(id) => {
              onSwitchWorkspaceAction(id);
              onCloseMobileNavAction();
            }}
            onEnterWorkspace={(id) => {
              onEnterWorkspaceAction(id);
              onCloseMobileNavAction();
            }}
            selectedWorkspaceId={selectedWorkspaceId}
            onCreateWorkspace={onCreateWorkspaceAction}
            onUpdateWorkspace={onUpdateWorkspaceAction}
            onDeleteWorkspace={onDeleteWorkspaceAction}
            switchingWorkspace={workspaceSwitching}
            onToggleCollapse={onToggleNavCollapseAction}
            onEditProfile={onEditProfileAction}
            onLogout={onLogoutAction}
          />
        </div>

        <section className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-14 md:px-8 md:pt-8">{children}</div>
        </section>
      </div>

      {notificationPanelOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-slate-950/40"
            aria-label="알림 패널 닫기"
            onClick={onCloseNotificationPanelAction}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
            {notificationPanel}
          </div>
        </div>
      ) : null}
    </>
  );
}
