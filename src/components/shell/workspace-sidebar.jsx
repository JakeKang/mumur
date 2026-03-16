import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { categoryLabel } from "@/lib/ui-labels";
import { Grid3X3, List, RefreshCw, Save, Search, Star, StarOff } from "lucide-react";

export function WorkspaceSidebar({
  IDEA_STATUS,
  STATUS_META,
  dashboard,
  onOpenCreateIdea,
  onQuickStatusFilter,
  filters,
  setFilters,
  loadIdeas,
  ideas,
  selectedIdeaId,
  selectIdea,
  formatTime,
  ideaView,
  setIdeaView,
  navigatorSort,
  setNavigatorSort,
  navigatorPreset,
  setNavigatorPreset,
  presetCounts,
  categoryOptions,
  savedViews,
  viewNameDraft,
  setViewNameDraft,
  saveCurrentView,
  saveCurrentTeamView,
  removeSavedView,
  teamSavedViews,
  applyTeamView,
  toggleTeamViewPin,
  onDeleteTeamView
}) {
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: "", description: "", action: null });

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false, action: null }));
  }, []);

  const confirmAction = useCallback(async () => {
    const action = confirmDialog.action;
    closeConfirmDialog();
    if (action) {
      await action();
    }
  }, [closeConfirmDialog, confirmDialog.action]);

  const requestRemovePersonalView = useCallback(
    (view) => {
      setConfirmDialog({
        open: true,
        title: "저장된 뷰를 삭제할까요?",
        description: `${view.name} 뷰를 개인 목록에서 삭제합니다.`,
        action: async () => removeSavedView(view.id)
      });
    },
    [removeSavedView]
  );

  const requestRemoveTeamView = useCallback(
    (view) => {
      setConfirmDialog({
        open: true,
        title: "팀 공유 뷰를 삭제할까요?",
        description: `${view.name} 뷰를 팀 목록에서 삭제합니다.`,
        action: async () => onDeleteTeamView(view.id)
      });
    },
    [onDeleteTeamView]
  );

  return (
    <>
    <Card className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-auto">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">워크스페이스</CardTitle>
        <p className="text-xs text-[var(--muted)]">검색, 뷰 전환, 필터, 저장된 뷰를 한 곳에서 관리</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
            <p className="text-[11px] text-[var(--muted)]">아이디어</p>
            <p className="text-lg font-semibold">{dashboard?.metrics?.totalIdeas || 0}</p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
            <p className="text-[11px] text-[var(--muted)]">진행중</p>
            <p className="text-lg font-semibold">{dashboard?.metrics?.activeIdeas || 0}</p>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">생애주기</p>
          <div className="space-y-1.5">
            {IDEA_STATUS.map((status) => (
              <button
                key={`side-status-${status}`}
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                  filters.status === status ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface)]"
                }`}
                onClick={() => onQuickStatusFilter(status)}
                title={`${STATUS_META[status]?.label || status} 필터`}
              >
                <span>{`${STATUS_META[status]?.icon || "💡"} ${STATUS_META[status]?.label || status}`}</span>
                <span className="text-[var(--muted)]">{dashboard?.statusCounts?.[status] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="mb-2 flex items-center gap-1">
            <Button
              size="sm"
              variant={ideaView === "card" ? "default" : "outline"}
              onClick={() => setIdeaView("card")}
              aria-label="카드 보기"
              title="카드 보기"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={ideaView === "list" ? "default" : "outline"}
              onClick={() => setIdeaView("list")}
              aria-label="리스트 보기"
              title="리스트 보기"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={loadIdeas} aria-label="새로고침" title="새로고침">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onOpenCreateIdea}>+ 새 아이디어</Button>
          </div>

          <select
            className="mb-2 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
            value={navigatorSort}
            onChange={(event) => setNavigatorSort(event.target.value)}
          >
            <option value="recent">최신순</option>
            <option value="comments">댓글 많은순</option>
            <option value="reactions">리액션 많은순</option>
            <option value="versions">버전 많은순</option>
            <option value="title">이름순</option>
          </select>

          <div className="mb-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant={navigatorPreset === "all" ? "default" : "outline"} onClick={() => setNavigatorPreset("all")}>{`전체 ${presetCounts.all}`}</Button>
            <Button size="sm" variant={navigatorPreset === "updatedToday" ? "default" : "outline"} onClick={() => setNavigatorPreset("updatedToday")}>{`오늘 ${presetCounts.updatedToday}`}</Button>
            <Button size="sm" variant={navigatorPreset === "discussion" ? "default" : "outline"} onClick={() => setNavigatorPreset("discussion")}>{`토론 ${presetCounts.discussion}`}</Button>
            <Button size="sm" variant={navigatorPreset === "growth" ? "default" : "outline"} onClick={() => setNavigatorPreset("growth")}>{`성장 ${presetCounts.growth}`}</Button>
          </div>

          <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
            <Input
              placeholder="검색"
              value={filters.query}
              onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
            />
            <Button size="sm" variant="outline" onClick={loadIdeas} aria-label="검색 적용" title="검색 적용">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <select
            className="mb-2 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
            value={filters.category}
            onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
          >
            <option value="">전체 카테고리</option>
            {categoryOptions.map((category) => (
              <option key={`side-cat-${category}`} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">저장된 뷰</p>
          <p className="mb-2 text-xs text-[var(--muted)]">개인/팀 저장 뷰는 전용 다이얼로그에서 관리합니다.</p>
          <Button type="button" size="sm" onClick={() => setViewDialogOpen(true)}>
            저장 뷰 관리
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">프로젝트</p>
          {ideas.length ? (
            ideas.slice(0, 12).map((idea) => (
              <button
                key={idea.id}
                type="button"
                className={`w-full rounded-md border px-2 py-2 text-left transition ${
                  idea.id === selectedIdeaId ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-strong)]"
                }`}
                onClick={() => selectIdea(idea.id)}
              >
                <div className="mb-0.5 flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">{idea.title}</p>
                  <Badge className="text-[10px]">{STATUS_META[idea.status]?.icon || "💡"}</Badge>
                </div>
                <p className="text-[11px] text-[var(--muted)]">{`${categoryLabel(idea.category)} · ${formatTime(idea.updatedAt)}`}</p>
              </button>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">아이디어 없음</p>
          )}
        </div>
      </CardContent>
    </Card>
    <DialogShell
      open={viewDialogOpen}
      onClose={() => setViewDialogOpen(false)}
      title="저장된 뷰 관리"
      description="개인 뷰와 팀 공유 뷰를 생성/적용/정리합니다"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
          <Input placeholder="뷰 이름" value={viewNameDraft} onChange={(event) => setViewNameDraft(event.target.value)} />
          <Button size="sm" onClick={saveCurrentView} title="개인 뷰 저장" aria-label="개인 뷰 저장">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={saveCurrentTeamView} title="팀 뷰 저장" aria-label="팀 뷰 저장">
            팀
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">개인 저장 뷰</p>
          <div className="flex flex-wrap gap-1.5">
            {savedViews.length ? (
              savedViews.map((view) => (
                <div key={view.id} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1">
                  <button type="button" className="text-xs" onClick={() => applyTeamView(view)}>
                    {view.name}
                  </button>
                  <button type="button" className="text-xs text-[var(--muted)]" onClick={() => requestRemovePersonalView(view)} aria-label={`${view.name} 삭제`}>
                    ×
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--muted)]">저장된 뷰 없음</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">팀 공유 뷰</p>
          {(teamSavedViews || []).length ? (
            teamSavedViews.map((view) => (
              <div key={`team-view-${view.id}`} className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => toggleTeamViewPin(view)} aria-label={`${view.name} 고정 토글`}>
                    {view.config?.pinned ? <Star className="h-3.5 w-3.5 text-amber-600" /> : <StarOff className="h-3.5 w-3.5 text-[var(--muted)]" />}
                  </button>
                  <button type="button" className="text-left text-xs font-medium" onClick={() => applyTeamView(view.config || {})}>
                    {view.name}
                  </button>
                  {view.canDelete ? (
                    <button type="button" className="ml-auto text-xs text-[var(--muted)]" onClick={() => requestRemoveTeamView(view)} aria-label={`${view.name} 삭제`}>
                      ×
                    </button>
                  ) : null}
                </div>
                <p className="text-[10px] text-[var(--muted)]">{`작성자 ${view.creatorName || "멤버"} · ${formatTime(view.updatedAt)}`}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--muted)]">팀 공유 뷰 없음</p>
          )}
        </div>
      </div>
    </DialogShell>
    <ConfirmDialog
      open={confirmDialog.open}
      title={confirmDialog.title}
      description={confirmDialog.description}
      confirmText="삭제"
      danger
      onCancel={closeConfirmDialog}
      onConfirm={confirmAction}
    />
    </>
  );
}
