"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { DialogShell } from "@/shared/components/ui/dialog-shell";
import { Input } from "@/shared/components/ui/input";
import { ConfirmDialog } from "@/shared/components/ui/confirm-dialog";
import { categoryLabel } from "@/shared/constants/ui-labels";
import { useWorkbenchActionsContext, useWorkbenchSessionContext } from "@/modules/workbench/presentation/contexts/workbench-contexts";
import type { DashboardWorkspace, Idea, IdeaStatus, UserWorkspace } from "@/shared/types";

const ICON_PRESETS = ["📁", "🗂️", "💡", "🚀", "🎯", "⚡", "🔥", "🌱", "🏠", "✨"];
const COLOR_PRESETS = [
  { hex: "#6366f1", label: "인디고" },
  { hex: "#0ea5e9", label: "스카이" },
  { hex: "#10b981", label: "에메랄드" },
  { hex: "#f59e0b", label: "앰버" },
  { hex: "#ef4444", label: "레드" },
  { hex: "#8b5cf6", label: "바이올렛" },
];

type WorkspaceSurfaceProps = {
  workspace: UserWorkspace | DashboardWorkspace | null;
  ideas: Idea[];
  STATUS_META: Record<IdeaStatus, { icon: string; label: string }>;
  onUpdateWorkspace?: (id: number, data: { name: string; icon: string; color: string }) => Promise<void>;
  onDeleteWorkspace?: () => void;
  onDeleteIdeas?: (ideaIds: number[]) => Promise<void>;
};

export function WorkspaceSurface({
  workspace,
  ideas,
  STATUS_META,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onDeleteIdeas,
}: WorkspaceSurfaceProps) {
  const { canCreateIdea, formatTime } = useWorkbenchSessionContext();
  const { openCreateIdea, selectIdea } = useWorkbenchActionsContext();
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("📁");
  const [editColor, setEditColor] = useState("#6366f1");
  const [editBusy, setEditBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const kebabMenuRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    if (!kebabOpen) return;
    const handler = (e: MouseEvent) => {
      if (kebabMenuRef.current && !kebabMenuRef.current.contains(e.target as Node)) {
        setKebabOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [kebabOpen]);

  const workspaceIdeas = workspace
    ? ideas.filter((idea) => Number(idea.teamId || idea.workspaceId || 0) === Number(workspace.id))
    : [];

  const filteredIdeas = workspaceIdeas.filter((idea) => {
    const matchQuery = !searchQuery || idea.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !statusFilter || idea.status === statusFilter;
    return matchQuery && matchStatus;
  });

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openEdit() {
    if (!workspace) return;
    setEditName(workspace.name);
    setEditIcon(workspace.icon ?? "📁");
    setEditColor(workspace.color ?? "#6366f1");
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!workspace || !editName.trim() || !onUpdateWorkspace) return;
    setEditBusy(true);
    try {
      await onUpdateWorkspace(workspace.id, {
        name: editName.trim(),
        icon: editIcon,
        color: editColor,
      });
      setEditOpen(false);
    } finally {
      setEditBusy(false);
    }
  }

  if (!workspace) {
    return (
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="text-4xl">📁</span>
          <p className="text-base font-semibold text-[var(--foreground)]">아직 워크스페이스가 없습니다</p>
          <p className="text-sm text-[var(--muted)]">사이드바에서 새 워크스페이스를 만들고 아이디어를 모아보세요.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: `${workspace.color ?? "#6366f1"}20`, color: workspace.color ?? "#6366f1" }}
              >
                {workspace.icon || "📁"}
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-serif text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  {workspace.name}
                </h1>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {`아이디어 ${workspaceIdeas.length}개`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <Button type="button" size="sm" onClick={openCreateIdea} disabled={!canCreateIdea}>
                + 새 아이디어
              </Button>

              {(onUpdateWorkspace || onDeleteWorkspace) && (
                <div className="relative" ref={kebabMenuRef}>
                  <button
                    type="button"
                    onClick={() => setKebabOpen(v => !v)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
                    aria-label="워크스페이스 관리"
                    title="워크스페이스 관리"
                  >
                    ⋮
                  </button>
                  {kebabOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {onUpdateWorkspace && (
                        <button
                          type="button"
                          onClick={() => { openEdit(); setKebabOpen(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
                        >
                          ✏️ 이름·아이콘 수정
                        </button>
                      )}
                      {onDeleteWorkspace && (
                        <button
                          type="button"
                          onClick={() => { setDeleteConfirmOpen(true); setKebabOpen(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-500 transition hover:bg-rose-50"
                        >
                          🗑️ 워크스페이스 삭제
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {workspaceIdeas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">🔍</span>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="아이디어 검색..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"
            >
              <option value="">전체 상태</option>
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.icon} {meta.label}</option>
              ))}
            </select>

            {selectedIds.size > 0 && onDeleteIdeas && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted)]">{selectedIds.size}개 선택됨</span>
                <button
                  type="button"
                  onClick={() => setBulkDeleteConfirmOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-100"
                >
                  🗑️ 선택 삭제
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
                >
                  선택 해제
                </button>
              </div>
            )}

            {searchQuery || statusFilter ? (
              <span className="text-xs text-[var(--muted)]">
                {filteredIdeas.length}/{workspaceIdeas.length}개
              </span>
            ) : null}
          </div>
        )}

        {filteredIdeas.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredIdeas.map((idea) => (
              <div key={`workspace-idea-${workspace.id}-${idea.id}`} className="relative group/card">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(idea.id); }}
                  className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border text-xs transition
  ${selectedIds.has(idea.id)
    ? "border-[var(--accent)] bg-[var(--accent)] text-white opacity-100"
    : selectedIds.size > 0
    ? "border-[var(--border)] bg-[var(--surface)] text-transparent opacity-60 group-hover/card:opacity-100"
    : "border-[var(--border)] bg-[var(--surface)] text-transparent opacity-0 group-hover/card:opacity-40"
  }`}
                  aria-label={selectedIds.has(idea.id) ? "선택 해제" : "선택"}
                >
                  {selectedIds.has(idea.id) ? "✓" : ""}
                </button>

                <button
                  type="button"
                  onClick={() => void selectIdea(idea.id, { workspaceId: Number(idea.teamId || idea.workspaceId || workspace.id), openPage: true })}
                  className={`w-full rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]
                    ${selectedIds.has(idea.id)
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40"
                    }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge>{`${STATUS_META[idea.status]?.icon || "💡"} ${STATUS_META[idea.status]?.label || idea.status}`}</Badge>
                    <span className="text-xs text-[var(--muted)]">{formatTime(idea.updatedAt)}</span>
                  </div>
                  <p className="mb-1 truncate text-sm font-semibold text-[var(--foreground)]">{idea.title}</p>
                  <p className="mb-2 text-xs text-[var(--muted)]">{categoryLabel(idea.category)}</p>
                  <p className="text-xs text-[var(--muted)]">{`💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0}`}</p>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="text-4xl">💡</span>
              <p className="text-base font-semibold text-[var(--foreground)]">
                이 워크스페이스에 아이디어가 없습니다
              </p>
              <p className="text-sm text-[var(--muted)]">
                첫 아이디어를 추가해 협업을 시작해보세요.
              </p>
              <Button onClick={openCreateIdea} disabled={!canCreateIdea}>
                + 새 아이디어 만들기
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {editOpen && (
        <DialogShell
          open
          title="워크스페이스 수정"
          onClose={() => setEditOpen(false)}
          maxWidthClass="max-w-sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(false)}>
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={editBusy || !editName.trim()}
                onClick={handleSaveEdit}
              >
                {editBusy ? "저장 중..." : "저장"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">이름</p>
              <Input
                placeholder="워크스페이스 이름"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
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
                    onClick={() => setEditIcon(icon)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-base transition ${
                      editIcon === icon
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
                    onClick={() => setEditColor(hex)}
                    aria-label={label}
                    title={label}
                    className={`h-6 w-6 rounded-full transition ring-offset-2 ${
                      editColor === hex ? "ring-2 ring-[var(--foreground)]" : ""
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
        open={deleteConfirmOpen}
        title="워크스페이스 삭제"
        description={`"${workspace.name}" 워크스페이스를 삭제하면 모든 아이디어와 데이터가 함께 삭제됩니다. 계속할까요?`}
        confirmText="삭제"
        danger
        onConfirm={() => { setDeleteConfirmOpen(false); onDeleteWorkspace?.(); }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="선택한 아이디어 삭제"
        description={`선택한 ${selectedIds.size}개 아이디어를 삭제할까요? 삭제 후 되돌릴 수 없습니다.`}
        confirmText="삭제"
        danger
        onConfirm={async () => {
          setBulkDeleteConfirmOpen(false);
          if (onDeleteIdeas) {
            await onDeleteIdeas(Array.from(selectedIds));
          }
          setSelectedIds(new Set());
        }}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />
    </>
  );
}
