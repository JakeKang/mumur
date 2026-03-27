"use client";

import { ContextPanel } from "@/features/notifications/components/context-panel";
import { IdeaCreateDialog } from "@/features/ideas/components/idea-create-dialog";
import { ConfirmDialog } from "@/shared/components/ui/confirm-dialog";
import { WorkbenchToolbar } from "@/modules/workbench/presentation/workbench-toolbar";
import { ProfileEditDialog } from "@/modules/workbench/presentation/profile-edit-dialog";
import { useWorkbenchController } from "@/modules/workbench/application/hooks/use-workbench-controller";
import { WorkbenchActionsContext, WorkbenchSessionContext } from "@/modules/workbench/presentation/contexts/workbench-contexts";
import { WorkbenchContent } from "@/modules/workbench/presentation/workbench-content";
import { WorkbenchShell } from "@/modules/workbench/presentation/workbench-shell";

export function WorkbenchPage() {
  const {
    authed,
    error,
    workbenchSessionContextValue,
    workbenchActionsContextValue,
    shellProps,
    notificationPanelProps,
    toolbarProps,
    contentProps,
    ideaCreateDialogProps,
    confirmDialogProps,
    profileEditDialogProps,
  } = useWorkbenchController();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {!authed ? (
        <div className="mx-auto max-w-3xl p-8 text-sm text-[var(--muted)]">로그인 상태를 확인하는 중입니다...</div>
      ) : (
        <WorkbenchSessionContext.Provider value={workbenchSessionContextValue}>
          <WorkbenchActionsContext.Provider value={workbenchActionsContextValue}>
            <WorkbenchShell
              {...shellProps}
              notificationPanel={<ContextPanel {...notificationPanelProps} />}
            >
              <WorkbenchToolbar {...toolbarProps} />
              {error ? (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
              ) : null}
              <WorkbenchContent {...contentProps} />
            </WorkbenchShell>

            <IdeaCreateDialog {...ideaCreateDialogProps} />
            <ConfirmDialog {...confirmDialogProps} />
            <ProfileEditDialog {...profileEditDialogProps} />
          </WorkbenchActionsContext.Provider>
        </WorkbenchSessionContext.Provider>
      )}
    </main>
  );
}
