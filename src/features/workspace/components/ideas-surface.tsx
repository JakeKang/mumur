import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { PriorityBadge } from "@/shared/components/ui/priority-badge";
import { categoryLabel } from "@/shared/constants/ui-labels";
import { ideaPriorityMeta } from "@/features/workspace/components/idea-priority-meta";
import type { Dispatch, SetStateAction } from "react";
import type { Idea, IdeaStatus } from "@/shared/types";

type StatusMetaMap = Record<IdeaStatus, { icon: string; label: string }>;

type IdeaFilterState = {
  scope: string;
  workspaceId: string;
  status: string;
  query: string;
  category: string;
  priority: string;
  authorId: string;
  participantId: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
};

type WorkspaceOption = { id: number; name: string };
type AuthorOption = { id: number; name: string };

type IdeasSurfaceProps = {
  ideas: Idea[];
  filters: IdeaFilterState;
  setFilters: Dispatch<SetStateAction<IdeaFilterState>>;
  ideaView: "card" | "list";
  setIdeaView: (view: "card" | "list") => void;
  navigatorSort: string;
  setNavigatorSort: (sort: string) => void;
  navigatorPreset: "all" | "updatedToday" | "discussion" | "growth";
  setNavigatorPreset: (preset: "all" | "updatedToday" | "discussion" | "growth") => void;
  presetCounts: { all: number; updatedToday: number; discussion: number; growth: number };
  STATUS_META: StatusMetaMap;
  onQuickStatusFilter: (status: "" | IdeaStatus) => void;
  onSelectIdea: (ideaId: number, workspaceId: number) => void;
  onOpenCreateIdea: () => void;
  canCreateIdea?: boolean;
  categoryOptions: string[];
  workspaceOptions: WorkspaceOption[];
  authorOptions: AuthorOption[];
  formatTime: (value: unknown) => string;
  loading?: boolean;
};

function IdeaCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex gap-2">
        <div className="h-5 w-16 rounded bg-[var(--surface-strong)]" />
        <div className="h-5 w-10 rounded bg-[var(--surface-strong)]" />
      </div>
      <div className="mb-2 h-4 w-3/4 rounded bg-[var(--surface-strong)]" />
      <div className="h-3 w-1/2 rounded bg-[var(--surface-strong)]" />
    </div>
  );
}

export function IdeasSurface({
  ideas,
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
  onQuickStatusFilter,
  onSelectIdea,
  onOpenCreateIdea,
  canCreateIdea = true,
  categoryOptions,
  workspaceOptions,
  authorOptions,
  formatTime,
  loading = false
}: IdeasSurfaceProps) {
  const statusFilters: Array<{ key: "" | IdeaStatus; label: string }> = [
    { key: "", label: "전체" },
    { key: "seed", label: STATUS_META.seed.icon },
    { key: "sprout", label: STATUS_META.sprout.icon },
    { key: "grow", label: STATUS_META.grow.icon },
    { key: "harvest", label: STATUS_META.harvest.icon },
    { key: "rest", label: STATUS_META.rest.icon }
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--foreground)]">전체 아이디어</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{`총 ${ideas.length}개의 아이디어`}</p>
      </div>

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">🔍</span>
              <Input
                value={filters.query}
                onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                placeholder="아이디어를 검색하세요..."
                className="h-9 pl-8 text-sm"
              />
            </div>

            <div className="flex gap-1 rounded-lg bg-[var(--surface-strong)] p-1">
              {statusFilters.map((item) => (
                <button
                  key={`ideas-status-filter-${item.key || "all"}`}
                  type="button"
                  onClick={() => onQuickStatusFilter(item.key)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    (filters.status || "") === item.key
                      ? "bg-[var(--accent)] font-semibold text-white shadow"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              value={navigatorSort}
              onChange={(event) => setNavigatorSort(event.target.value)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
            >
              <option value="recent">최근 수정</option>
              <option value="created">최근 생성</option>
              <option value="title">제목순</option>
              <option value="status">상태순</option>
            </select>

            <div className="flex gap-1 rounded-lg bg-[var(--surface-strong)] p-1">
              <button
                type="button"
                onClick={() => setIdeaView("card")}
                className={`rounded-md px-2 py-1 text-sm ${ideaView === "card" ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
                aria-label="카드 보기"
              >
                ⊞
              </button>
              <button
                type="button"
                onClick={() => setIdeaView("list")}
                className={`rounded-md px-2 py-1 text-sm ${ideaView === "list" ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
                aria-label="리스트 보기"
              >
                ☰
              </button>
            </div>

            <Button onClick={onOpenCreateIdea} disabled={!canCreateIdea}>+ 새 아이디어</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.workspaceId}
              onChange={(event) => setFilters((prev) => ({ ...prev, workspaceId: event.target.value }))}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">전체 워크스페이스</option>
               {(workspaceOptions || []).map((workspace) => (
                <option key={`ideas-workspace-filter-${workspace.id}`} value={String(workspace.id)}>
                  {workspace.name}
                </option>
              ))}
            </select>

            <select
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">전체 카테고리</option>
              {categoryOptions.map((category) => (
                <option key={`ideas-cat-filter-${category}`} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>

            <div className="flex gap-1 rounded-lg bg-[var(--surface-strong)] p-1">
              <button
                type="button"
                onClick={() => setNavigatorPreset("all")}
                className={`rounded-md px-2 py-1 text-[11px] ${navigatorPreset === "all" ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
              >
                {`전체 ${presetCounts.all}`}
              </button>
              <button
                type="button"
                onClick={() => setNavigatorPreset("updatedToday")}
                className={`rounded-md px-2 py-1 text-[11px] ${navigatorPreset === "updatedToday" ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
              >
                {`오늘 ${presetCounts.updatedToday}`}
              </button>
              <button
                type="button"
                onClick={() => setNavigatorPreset("discussion")}
                className={`rounded-md px-2 py-1 text-[11px] ${navigatorPreset === "discussion" ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
              >
                {`토론 ${presetCounts.discussion}`}
              </button>
              <button
                type="button"
                onClick={() => setNavigatorPreset("growth")}
                className={`rounded-md px-2 py-1 text-[11px] ${navigatorPreset === "growth" ? "bg-[var(--surface)] shadow" : "text-[var(--muted)]"}`}
              >
                {`성장 ${presetCounts.growth}`}
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={filters.priority}
              onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">전체 중요도</option>
              <option value="high">높음</option>
              <option value="medium">중간</option>
              <option value="low">낮음</option>
            </select>

            <select
              value={filters.authorId}
              onChange={(event) => setFilters((prev) => ({ ...prev, authorId: event.target.value }))}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">전체 작성자</option>
              {(authorOptions || []).map((author) => (
                <option key={`ideas-author-filter-${author.id}`} value={String(author.id)}>
                  {author.name}
                </option>
              ))}
            </select>

            <select
              value={filters.participantId}
              onChange={(event) => setFilters((prev) => ({ ...prev, participantId: event.target.value }))}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">전체 참여자</option>
              {(authorOptions || []).map((author) => (
                <option key={`ideas-participant-filter-${author.id}`} value={String(author.id)}>
                  {author.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filters.createdFrom}
                onChange={(event) => setFilters((prev) => ({ ...prev, createdFrom: event.target.value }))}
                className="h-8 text-xs"
              />
              <span className="text-xs text-[var(--muted)]">~</span>
              <Input
                type="date"
                value={filters.createdTo}
                onChange={(event) => setFilters((prev) => ({ ...prev, createdTo: event.target.value }))}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filters.updatedFrom}
                onChange={(event) => setFilters((prev) => ({ ...prev, updatedFrom: event.target.value }))}
                className="h-8 text-xs"
              />
              <span className="text-xs text-[var(--muted)]">~</span>
              <Input
                type="date"
                value={filters.updatedTo}
                onChange={(event) => setFilters((prev) => ({ ...prev, updatedTo: event.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"].map((key) => (
            <IdeaCardSkeleton key={key} />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="mb-3 text-5xl">💡</span>
          <p className="mb-1 text-base font-semibold text-[var(--foreground)]">아이디어가 없습니다</p>
          <p className="mb-5 text-sm text-[var(--muted)]">
            {filters.query || filters.status ? "검색 조건을 변경해보세요" : "첫 번째 아이디어를 만들어보세요"}
          </p>
          {!filters.query && !filters.status && (
            <Button onClick={onOpenCreateIdea} disabled={!canCreateIdea}>+ 새 아이디어</Button>
          )}
        </div>
      ) : ideaView === "card" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => {
            const priority = ideaPriorityMeta(idea);
            return (
              <button
                key={`ideas-card-${idea.id}`}
                type="button"
                onClick={() => onSelectIdea(idea.id, idea.teamId)}
                className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge>{`${STATUS_META[idea.status]?.icon || "💡"} ${STATUS_META[idea.status]?.label || idea.status}`}</Badge>
                    <PriorityBadge level={priority.level} />
                  </div>
                  <span className="text-[11px] text-[var(--muted)]">{categoryLabel(idea.category)}</span>
                </div>
                <p className="mb-1 text-sm font-semibold text-[var(--foreground)]">{idea.title}</p>
                <p className="mb-2 text-xs text-[var(--muted)]">{`${idea.workspaceName || "워크스페이스"} · ${categoryLabel(idea.category)}`}</p>
                <p className="text-xs text-[var(--muted)]">{`${formatTime(idea.updatedAt)} · 💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0}`}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:hidden">
            {ideas.map((idea) => {
              const priority = ideaPriorityMeta(idea);
              return (
                <button
                  key={`ideas-mobile-${idea.id}`}
                  type="button"
                  onClick={() => onSelectIdea(idea.id, idea.teamId)}
                  className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{idea.title}</p>
                    <PriorityBadge level={priority.level} />
                  </div>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <Badge className="text-[10px]">{STATUS_META[idea.status]?.icon || "💡"}</Badge>
                    <span>{categoryLabel(idea.category)}</span>
                    <span>{idea.authorName || "멤버"}</span>
                    <span>{idea.workspaceName || "워크스페이스"}</span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">{`💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0}`}</p>
                </button>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden border-[var(--border)] bg-[var(--surface)] md:block">
            <div className="grid grid-cols-[1fr_90px_120px_120px_85px_70px_70px] bg-[var(--surface-strong)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span>제목</span>
              <span>상태</span>
              <span>카테고리</span>
              <span>워크스페이스</span>
              <span>작성자</span>
              <span className="text-center">댓글</span>
              <span className="text-center">반응</span>
            </div>
            {ideas.map((idea, index) => {
              const priority = ideaPriorityMeta(idea);
              return (
                <button
                  key={`ideas-row-${idea.id}`}
                  type="button"
                  onClick={() => onSelectIdea(idea.id, idea.teamId)}
                  className={`grid w-full cursor-pointer grid-cols-[1fr_90px_120px_120px_85px_70px_70px] items-center px-4 py-3 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-strong)] ${
                    index < ideas.length - 1 ? "border-t border-[var(--border)]" : ""
                  }`}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <span className="truncate font-medium">{idea.title}</span>
                    <PriorityBadge level={priority.level} />
                  </span>
                  <span>
                    <Badge className="text-[10px]">{STATUS_META[idea.status]?.icon || "💡"}</Badge>
                  </span>
                  <span className="text-xs text-[var(--muted)]">{categoryLabel(idea.category)}</span>
                  <span className="text-xs text-[var(--muted)]">{idea.workspaceName || "워크스페이스"}</span>
                  <span className="text-xs text-[var(--muted)]">{idea.authorName || "멤버"}</span>
                  <span className="text-center text-xs text-[var(--muted)]">{idea.commentCount || 0}</span>
                  <span className="text-center text-xs text-[var(--muted)]">{idea.reactionCount || 0}</span>
                </button>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
