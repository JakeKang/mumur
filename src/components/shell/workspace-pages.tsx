import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { activityTypeLabel, categoryLabel, invitationStatusLabel, roleLabel } from "@/lib/ui-labels";
import { useState } from "react";

function ideaPriorityMeta(idea) {
  const engagement = Number(idea.commentCount || 0) + Number(idea.reactionCount || 0) + Number(idea.versionCount || 0);
  if (idea.status === "harvest" || engagement >= 24) {
    return { level: "high" };
  }
  if (idea.status === "grow" || engagement >= 10) {
    return { level: "medium" };
  }
  return { level: "low" };
}

export function DashboardSurface({ dashboard, ideas, STATUS_META, onSelectIdea, formatTime, workspaceName = "워크스페이스", onOpenCreateIdea, canCreateIdea = true }) {
  const total = Number(dashboard?.metrics?.totalIdeas || ideas.length || 0);
  const statusKeys = ["seed", "sprout", "grow", "harvest", "rest"];
  const recentIdeas = Array.isArray(dashboard?.recentIdeas) && dashboard.recentIdeas.length
    ? dashboard.recentIdeas
    : [...ideas].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 12);
  const workspaceCards = Array.isArray(dashboard?.workspaces) ? dashboard.workspaces : [];

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--foreground)]">통합 대시보드</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">전체 워크스페이스 흐름을 한 화면에서 확인합니다.</p>
      </div>

      {total === 0 ? (
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="text-4xl">🧭</span>
            <p className="text-base font-semibold text-[var(--foreground)]">아직 아이디어가 없습니다</p>
            <p className="text-sm text-[var(--muted)]">{`${workspaceName}에서 첫 아이디어를 생성해 흐름을 시작하세요.`}</p>
            <Button onClick={onOpenCreateIdea} disabled={!canCreateIdea}>+ 새 아이디어 만들기</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <p className="text-xs text-[var(--muted)]">공간 수</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">{Number(dashboard?.metrics?.totalWorkspaces || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <p className="text-xs text-[var(--muted)]">전체 아이디어</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">{total}</p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <p className="text-xs text-[var(--muted)]">진행 아이디어</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">{Number(dashboard?.metrics?.activeIdeas || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <p className="text-xs text-[var(--muted)]">최근 7일 활동</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">{Number(dashboard?.metrics?.recentActivity || 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader>
          <CardTitle className="text-base">워크스페이스 목록</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaceCards.length ? (
            workspaceCards.map((workspace) => (
              <div key={`dash-workspace-${workspace.id}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">{workspace.name}</p>
                  <span className="text-xs text-[var(--muted)]">{workspace.icon || "📁"}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">{`아이디어 ${workspace.ideaCount} · 최근활동 ${workspace.recentActivity}`}</p>
                <p className="mb-2 text-xs text-[var(--muted)]">{`최근 수정 ${workspace.lastUpdatedAt ? formatTime(workspace.lastUpdatedAt) : "-"}`}</p>
                <div className="flex flex-wrap gap-1">
                  {statusKeys.map((status) => (
                    <span key={`dash-workspace-status-${workspace.id}-${status}`} className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                      {`${STATUS_META[status]?.icon || "💡"} ${workspace.statusCounts?.[status] || 0}`}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">표시할 워크스페이스 요약이 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-5">
        {statusKeys.map((status) => (
          <Card key={`dash-status-${status}`} className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4">
              <p className="text-xl">{STATUS_META[status]?.icon || "💡"}</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">{Number(dashboard?.statusCounts?.[status] || 0)}</p>
              <p className="text-xs text-[var(--muted)]">{STATUS_META[status]?.label || status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader>
          <CardTitle className="text-base">최근 활동</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(dashboard?.recentActivity || []).length ? (
            (dashboard?.recentActivity || []).map((item) => (
              <div key={`dash-activity-${item.type}`} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                <p className="text-[var(--foreground)]">{activityTypeLabel(item.type)}</p>
                <p className="font-semibold text-[var(--muted)]">{item.count}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">아직 집계된 활동이 없습니다. 첫 댓글이나 토론을 시작해보세요.</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-[var(--foreground)]">최근 수정된 아이디어</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {recentIdeas.length ? (
            recentIdeas.map((idea) => {
              const priority = ideaPriorityMeta(idea);
              return (
              <button
                key={`dash-top-idea-${idea.id}`}
                type="button"
                onClick={() => onSelectIdea(idea.id, idea.teamId)}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge>{`${STATUS_META[idea.status]?.icon || "💡"} ${STATUS_META[idea.status]?.label || idea.status}`}</Badge>
                    <PriorityBadge level={priority.level} />
                  </div>
                  <span className="text-xs text-[var(--muted)]">{formatTime(idea.updatedAt)}</span>
                </div>
                <p className="mb-1 text-sm font-semibold text-[var(--foreground)]">{idea.title}</p>
                <p className="mb-2 text-xs text-[var(--muted)]">{`${categoryLabel(idea.category)} · ${idea.workspaceName || workspaceName}`}</p>
                <p className="text-xs text-[var(--muted)]">{`💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0} · 📄 ${idea.versionCount || 0}`}</p>
              </button>
              );
            })
          ) : (
            <p className="text-sm text-[var(--muted)]">최근 수정된 아이디어가 아직 없습니다.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">{`총 아이디어 ${total}개`}</p>
    </div>
  );
}

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
}) {
  const statusFilters = [
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
                <option key={`ideas-workspace-filter-${workspace.id}`} value={workspace.id}>
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
                <option key={`ideas-author-filter-${author.id}`} value={author.id}>
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
                <option key={`ideas-participant-filter-${author.id}`} value={author.id}>
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

export function TeamSurface({
  teamMembers,
  teamMe,
  teamMemberForm,
  setTeamMemberForm,
  addTeamMember,
  updateTeamMemberRole,
  requestRemoveTeamMember,
  teamInvitations,
  retryTeamInvitation,
  requestCancelInvitation,
  teamInvitationMessage,
  formatTime,
  webhooks,
  webhookForm,
  setWebhookForm,
  handleSaveWebhook,
  webhookSaving
}) {
  const canManageMembers = teamMe?.isOwner || teamMe?.role === "admin" || teamMe?.role === "owner";
  const canManageWebhooks = canManageMembers;
  const [showWebhookEditor, setShowWebhookEditor] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--foreground)]">팀 관리</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{`멤버 ${teamMembers.length}명`}</p>
        </div>
      </div>

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader>
          <CardTitle className="text-base">멤버 목록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canManageMembers ? (
            <form className="grid gap-2 md:grid-cols-[1fr_140px_auto]" onSubmit={addTeamMember}>
              <Input
                type="email"
                value={teamMemberForm.email}
                onChange={(event) => setTeamMemberForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="초대할 이메일"
                required
              />
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                value={teamMemberForm.role}
                onChange={(event) => setTeamMemberForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="viewer">보기 전용</option>
                <option value="editor">편집자</option>
                <option value="deleter">편집+삭제</option>
                <option value="admin">관리자</option>
              </select>
              <Button type="submit">+ 멤버 초대</Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">현재 권한에서는 멤버 초대/역할 변경을 할 수 없습니다. 관리자 또는 소유자 권한이 필요합니다.</p>
          )}

          {teamInvitationMessage ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--muted)]">{teamInvitationMessage}</div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">초대 히스토리</p>
            {teamInvitations?.length ? (
              teamInvitations.slice(0, 8).map((invite) => (
                <div key={`team-invite-${invite.id}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--foreground)]">{invite.email}</p>
                  <p className="text-xs text-[var(--muted)]">{`역할 ${roleLabel(invite.role)} · ${invitationStatusLabel(invite.status)}`}</p>
                  <p className="text-xs text-[var(--muted)]">{invite.message || "-"}</p>
                  <p className="text-[11px] text-[var(--muted)]">{`초대자 ${invite.invitedByName || "소유자"} · ${formatTime(invite.updatedAt)}`}</p>
                  {canManageMembers && invite.status === "pending" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => retryTeamInvitation(invite.id)}>
                        재시도
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => requestCancelInvitation(invite)}>
                        취소
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--muted)]">초대 기록이 없습니다.</p>
            )}
          </div>

          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div key={`team-member-${member.userId}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{member.name}</p>
                  <p className="text-xs text-[var(--muted)]">{member.email}</p>
                </div>
                <Badge className="text-[10px]">{roleLabel(member.role)}</Badge>
                {canManageMembers ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                      value={member.role}
                      onChange={(event) => updateTeamMemberRole(member.userId, event.target.value)}
                    >
                      <option value="viewer">보기 전용</option>
                      <option value="editor">편집자</option>
                      <option value="deleter">편집+삭제</option>
                      <option value="admin">관리자</option>
                    </select>
                    <Button size="sm" variant="outline" onClick={() => requestRemoveTeamMember(member)}>
                      제거
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">연동</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowWebhookEditor((prev) => !prev)}>
              웹훅 설정 열기
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">Slack/Discord 웹훅을 팀 단위로 연결합니다.</p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {showWebhookEditor ? (
            <form className="grid gap-2 md:grid-cols-[120px_1fr_auto]" onSubmit={handleSaveWebhook}>
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                value={webhookForm.platform}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, platform: event.target.value }))}
                disabled={!canManageWebhooks || webhookSaving}
              >
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
              </select>
              <Input
                placeholder="https://..."
                value={webhookForm.webhookUrl}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                disabled={!canManageWebhooks || webhookSaving}
              />
              <Button type="submit" disabled={!canManageWebhooks || webhookSaving || !webhookForm.webhookUrl.trim()}>
                {webhookSaving ? "저장 중..." : "저장"}
              </Button>
            </form>
          ) : null}

          <div className="space-y-1.5">
            {webhooks?.length ? (
              webhooks.map((hook) => (
                <div key={`team-webhook-${hook.platform}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs">
                  <p className="font-semibold text-[var(--foreground)]">{hook.platform === "discord" ? "Discord" : "Slack"}</p>
                  <p className="truncate text-[var(--muted)]">{hook.webhookUrl}</p>
                  <p className="text-[var(--muted)]">{hook.enabled ? "활성" : "비활성"}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--muted)]">저장된 웹훅이 없습니다.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
