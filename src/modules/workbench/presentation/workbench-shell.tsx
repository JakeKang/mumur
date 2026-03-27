"use client";

import type { ReactNode } from "react";
import { MumurNavigationSidebar } from "@/features/workspace/components/mumur-navigation-sidebar";
import type { UserWorkspace } from "@/shared/types";

type WorkbenchShellProps = {
  mobileNavOpen: boolean;
  onOpenMobileNav: () => void;
  onCloseMobileNav: () => void;
  activePage: string;
  onNavigatePage: (page: string) => void;
  navCollapsed: boolean;
  userName: string;
  workspaceName: string;
  userWorkspaces: UserWorkspace[];
  activeWorkspaceId: number | null;
  onSwitchWorkspace: (id: number) => void;
  onEnterWorkspace: (id: number) => void;
  selectedWorkspaceId: number | null;
  onCreateWorkspace: (data: { name: string; icon: string; color: string }) => Promise<void>;
  onUpdateWorkspace: (id: number, data: { name: string; icon: string; color: string }) => Promise<void>;
  onDeleteWorkspace: (id: number) => Promise<void>;
  workspaceSwitching: boolean;
  onToggleNavCollapse: () => void;
  onEditProfile: () => void;
  onLogout: () => void;
  children: ReactNode;
  notificationPanelOpen: boolean;
  onCloseNotificationPanel: () => void;
  notificationPanel: ReactNode;
};

export function WorkbenchShell({
  mobileNavOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  activePage,
  onNavigatePage,
  navCollapsed,
  userName,
  workspaceName,
  userWorkspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onEnterWorkspace,
  selectedWorkspaceId,
  onCreateWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
  workspaceSwitching,
  onToggleNavCollapse,
  onEditProfile,
  onLogout,
  children,
  notificationPanelOpen,
  onCloseNotificationPanel,
  notificationPanel,
}: WorkbenchShellProps) {
  return (
    <>
      <div className="relative flex h-screen overflow-hidden bg-[var(--surface)]">
        <button
          type="button"
          onClick={onOpenMobileNav}
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
            onClick={onCloseMobileNav}
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
              onNavigatePage(page);
              onCloseMobileNav();
            }}
            collapsed={navCollapsed}
            userName={userName}
            workspaceName={workspaceName}
            userWorkspaces={userWorkspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSwitchWorkspace={(id) => {
              onSwitchWorkspace(id);
              onCloseMobileNav();
            }}
            onEnterWorkspace={(id) => {
              onEnterWorkspace(id);
              onCloseMobileNav();
            }}
            selectedWorkspaceId={selectedWorkspaceId}
            onCreateWorkspace={onCreateWorkspace}
            onUpdateWorkspace={onUpdateWorkspace}
            onDeleteWorkspace={onDeleteWorkspace}
            switchingWorkspace={workspaceSwitching}
            onToggleCollapse={onToggleNavCollapse}
            onEditProfile={onEditProfile}
            onLogout={onLogout}
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
            onClick={onCloseNotificationPanel}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
            {notificationPanel}
          </div>
        </div>
      ) : null}
    </>
  );
}
