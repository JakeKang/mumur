"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { UserWorkspace } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogShell } from "@/components/ui/dialog-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const ICON_PRESETS = ["📁", "🗂️", "💡", "🚀", "🎯", "⚡", "🔥", "🌱", "🏠", "✨"];
const COLOR_PRESETS = [
  { hex: "#6366f1", label: "인디고" },
  { hex: "#0ea5e9", label: "스카이" },
  { hex: "#10b981", label: "에메랄드" },
  { hex: "#f59e0b", label: "앰버" },
  { hex: "#ef4444", label: "레드" },
  { hex: "#8b5cf6", label: "바이올렛" },
];

function profileInitial(name: string) {
  const value = String(name || "M").trim();
  return value ? value[0].toUpperCase() : "M";
}

type TooltipButtonProps = {
  label: string;
  showTooltip: boolean;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
};

function TooltipButton({ label, showTooltip, children, onClick, active, className = "" }: TooltipButtonProps) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
          active ? "bg-[var(--surface)] font-semibold text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--surface)]"
        } ${className}`}
      >
        {children}
      </button>
      {showTooltip && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[var(--foreground)] px-2 py-1 text-xs text-[var(--surface)] opacity-0 transition-opacity group-hover:opacity-100">
          {label}
        </span>
      )}
    </div>
  );
}

type WorkspaceDialogState = {
  mode: "create" | "edit";
  workspace?: UserWorkspace;
  name: string;
  icon: string;
  color: string;
};

type MumurNavigationSidebarProps = {
  activePage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  userName: string;
  workspaceName: string;
  userWorkspaces: UserWorkspace[];
  activeWorkspaceId: number | null;
  onSwitchWorkspace: (id: number) => void;
  onCreateWorkspace: (data: { name: string; icon: string; color: string }) => Promise<void>;
  onUpdateWorkspace: (id: number, data: { name: string; icon: string; color: string }) => Promise<void>;
  onDeleteWorkspace: (id: number) => Promise<void>;
};

export function MumurNavigationSidebar({
  activePage,
  onNavigate,
  collapsed,
  userName,
  workspaceName,
  userWorkspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onCreateWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
}: MumurNavigationSidebarProps) {
  const [wsDialog, setWsDialog] = useState<WorkspaceDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserWorkspace | null>(null);
  const [busy, setBusy] = useState(false);

  const navItems = [
    { id: "dashboard", icon: "🏠", label: "대시보드" },
    { id: "ideas",     icon: "💡", label: "아이디어 목록" },
    { id: "team",      icon: "👥", label: "팀 관리" },
  ];

  const sidebarWidth = collapsed ? "w-14" : "w-60";

  function openCreate() {
    setWsDialog({ mode: "create", name: "", icon: "📁", color: "#6366f1" });
  }

  function openEdit(ws: UserWorkspace) {
    setWsDialog({ mode: "edit", workspace: ws, name: ws.name, icon: ws.icon ?? "📁", color: ws.color ?? "#6366f1" });
  }

  async function handleSaveWorkspace() {
    if (!wsDialog || !wsDialog.name.trim()) return;
    setBusy(true);
    try {
      if (wsDialog.mode === "create") {
        await onCreateWorkspace({ name: wsDialog.name.trim(), icon: wsDialog.icon, color: wsDialog.color });
      } else if (wsDialog.workspace) {
        await onUpdateWorkspace(wsDialog.workspace.id, { name: wsDialog.name.trim(), icon: wsDialog.icon, color: wsDialog.color });
      }
      setWsDialog(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDeleteWorkspace(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <aside className={`${sidebarWidth} flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-strong)] transition-all duration-200`}>
        <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
          <span className="text-xl">🤫</span>
          {!collapsed && (
            <span className="font-serif text-lg font-bold tracking-tight text-[var(--foreground)]">Mumur</span>
          )}
        </div>

        <div className="flex-1 overflow-auto px-2 pb-4">
          {!collapsed && (
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              메뉴
            </p>
          )}
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <TooltipButton
                key={item.id}
                label={item.label}
                showTooltip={collapsed}
                active={activePage === item.id}
                onClick={() => onNavigate(item.id)}
                className={collapsed ? "justify-center" : "justify-start"}
              >
                <span className="w-5 shrink-0 text-center text-base">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </TooltipButton>
            ))}
          </nav>

          <div className="mt-4">
            <div className={`flex items-center gap-1 px-2 pb-1 pt-3 ${collapsed ? "justify-center" : "justify-between"}`}>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">워크스페이스</p>
              )}
              <div className="relative group">
                <button
                  type="button"
                  onClick={openCreate}
                  aria-label="새 워크스페이스"
                  title="새 워크스페이스"
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] transition text-xs"
                >
                  +
                </button>
                {collapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[var(--foreground)] px-2 py-1 text-xs text-[var(--surface)] opacity-0 transition-opacity group-hover:opacity-100">
                    새 워크스페이스
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-0.5">
              {userWorkspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <div key={ws.id} className="group/ws relative flex items-center">
                    <button
                      type="button"
                      onClick={() => onSwitchWorkspace(ws.id)}
                      title={ws.name}
                      aria-label={ws.name}
                      className={`flex flex-1 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                        isActive
                          ? "bg-[var(--surface)] font-semibold text-[var(--foreground)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface)]"
                      } ${collapsed ? "justify-center" : "justify-start"}`}
                    >
                      <span
                        className="w-5 shrink-0 text-center text-sm leading-none"
                        style={{ color: ws.color ?? "#6366f1" }}
                      >
                        {ws.icon ?? "📁"}
                      </span>
                      {!collapsed && (
                        <span className="truncate">{ws.name}</span>
                      )}
                    </button>

                    {!collapsed && (
                      <div className="invisible flex shrink-0 gap-0.5 pr-1 group-hover/ws:visible">
                        <button
                          type="button"
                          onClick={() => openEdit(ws)}
                          aria-label={`${ws.name} 수정`}
                          className="rounded p-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(ws)}
                          aria-label={`${ws.name} 삭제`}
                          className="rounded p-0.5 text-[10px] text-[var(--muted)] hover:bg-rose-50 hover:text-rose-600"
                        >
                          🗑️
                        </button>
                      </div>
                    )}

                    {collapsed && (
                      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[var(--foreground)] px-2 py-1 text-xs text-[var(--surface)] opacity-0 transition-opacity group-hover/ws:opacity-100">
                        {ws.name}
                      </span>
                    )}
                  </div>
                );
              })}

              {userWorkspaces.length === 0 && !collapsed && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--muted)] hover:bg-[var(--surface)] transition"
                >
                  + 새 워크스페이스 만들기
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-2 border-t border-[var(--border)] px-4 py-3 ${collapsed ? "justify-center px-2" : ""}`}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-xs font-semibold text-[var(--surface)]">
            {profileInitial(userName)}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--foreground)]">{userName || "Mumur 사용자"}</p>
              <p className="truncate text-[11px] text-[var(--muted)]">{workspaceName || "워크스페이스"}</p>
            </div>
          )}
        </div>
      </aside>

      {wsDialog && (
        <DialogShell
          open
          title={wsDialog.mode === "create" ? "새 워크스페이스" : "워크스페이스 수정"}
          onClose={() => setWsDialog(null)}
          maxWidthClass="max-w-sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setWsDialog(null)}>취소</Button>
              <Button type="button" size="sm" disabled={busy || !wsDialog.name.trim()} onClick={handleSaveWorkspace}>
                {busy ? "저장 중..." : "저장"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">이름</p>
              <Input
                placeholder="워크스페이스 이름"
                value={wsDialog.name}
                onChange={(e) => setWsDialog((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                autoFocus
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">아이콘</p>
              <div className="flex flex-wrap gap-2">
                {ICON_PRESETS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setWsDialog((prev) => prev ? { ...prev, icon } : prev)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-base transition ${
                      wsDialog.icon === icon
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">색상</p>
              <div className="flex gap-2">
                {COLOR_PRESETS.map(({ hex, label }) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setWsDialog((prev) => prev ? { ...prev, color: hex } : prev)}
                    aria-label={label}
                    title={label}
                    className={`h-6 w-6 rounded-full transition ring-offset-2 ${
                      wsDialog.color === hex ? "ring-2 ring-[var(--foreground)]" : ""
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogShell>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="워크스페이스 삭제"
        description={`"${deleteTarget?.name}" 워크스페이스를 삭제하면 모든 아이디어와 데이터가 함께 삭제됩니다. 계속할까요?`}
        confirmText="삭제"
        danger
        onConfirm={handleDeleteWorkspace}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
