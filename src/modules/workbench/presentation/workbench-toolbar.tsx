import type { MouseEvent, RefObject } from "react";
import { AlertCircle, Bell, Check, Loader2, Plus, RefreshCw } from "lucide-react";
import { syncStateLabel } from "@/modules/workbench/domain/workbench-utils";
import type { LocalSyncState } from "@/modules/workbench/domain/workbench-types";

type WorkbenchToolbarProps = {
  shouldShowSyncBadge: boolean;
  localSyncState: LocalSyncState;
  syncBadgeFading: boolean;
  workspaceSwitching: boolean;
  canEditIdea: boolean;
  onCreateIdea: () => void;
  onRefresh: () => void;
  notificationPanelOpen: boolean;
  unreadCount: number;
  onOpenNotifications: (event: MouseEvent<HTMLButtonElement>) => void;
  profileDropdownRef: RefObject<HTMLDivElement | null>;
  profileDropdownOpen: boolean;
  onToggleProfileDropdown: () => void;
  userName: string;
  userEmail: string;
  onOpenProfileEdit: () => void;
  onLogout: () => void;
};

export function WorkbenchToolbar({
  shouldShowSyncBadge,
  localSyncState,
  syncBadgeFading,
  workspaceSwitching,
  canEditIdea,
  onCreateIdea,
  onRefresh,
  notificationPanelOpen,
  unreadCount,
  onOpenNotifications,
  profileDropdownRef,
  profileDropdownOpen,
  onToggleProfileDropdown,
  userName,
  userEmail,
  onOpenProfileEdit,
  onLogout,
}: WorkbenchToolbarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {shouldShowSyncBadge ? (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs transition-all duration-500 ${localSyncState === "failed" ? "text-rose-600" : localSyncState === "syncing" ? "text-sky-600" : "text-[var(--muted)]"} ${syncBadgeFading ? "opacity-0" : "opacity-100"}`}
        >
          {localSyncState === "failed" ? <AlertCircle className="h-3.5 w-3.5" /> : localSyncState === "syncing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {syncStateLabel(localSyncState)}
        </span>
      ) : null}
      {workspaceSwitching ? (
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)] transition-all">워크스페이스 전환 중...</span>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCreateIdea}
          disabled={!canEditIdea}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition-all"
          title={canEditIdea ? "새 아이디어" : "viewer 권한에서는 아이디어를 생성할 수 없습니다"}
          aria-label="새 아이디어"
        >
          <Plus className="h-3.5 w-3.5" />
          새 아이디어
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--surface-strong)] hover:border-[var(--foreground)]/20 active:scale-95 transition-all"
          aria-label="새로고침"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden="true" />
        <div className="relative">
          <button
            type="button"
            onClick={onOpenNotifications}
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all active:scale-95 ${notificationPanelOpen ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"}`}
            aria-label={`알림${unreadCount > 0 ? ` (${unreadCount}개 읽지 않음)` : ""}`}
            title={`알림${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {unreadCount > 99 ? "99" : unreadCount}
              </span>
            )}
          </button>
        </div>
        <div className="relative" ref={profileDropdownRef}>
          <button
            type="button"
            onClick={onToggleProfileDropdown}
            className={`inline-flex h-8 items-center gap-2 rounded-lg border px-2 transition-all active:scale-95 ${
              profileDropdownOpen
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-strong)]"
            }`}
            aria-haspopup="menu"
            aria-expanded={profileDropdownOpen}
            aria-label="사용자 메뉴"
            title="사용자 메뉴"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[10px] font-semibold text-[var(--accent)]">
              {String(userName || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[9rem] truncate text-xs font-medium md:inline">{userName || "사용자"}</span>
          </button>
          {profileDropdownOpen ? (
            <div className="absolute right-0 top-10 z-50 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl" role="menu" aria-label="사용자 메뉴">
              <div className="mb-1 rounded-md bg-[var(--surface-strong)] px-2 py-1.5">
                <p className="truncate text-xs font-semibold text-[var(--foreground)]">{userName || "사용자"}</p>
                <p className="truncate text-[11px] text-[var(--muted)]">{userEmail || "이메일 없음"}</p>
              </div>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
                role="menuitem"
                onClick={onOpenProfileEdit}
              >
                회원정보 수정
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-rose-600 transition hover:bg-rose-50"
                role="menuitem"
                onClick={onLogout}
              >
                로그아웃
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-rose-50 hover:text-rose-600"
          aria-label="로그아웃"
          title="로그아웃"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
