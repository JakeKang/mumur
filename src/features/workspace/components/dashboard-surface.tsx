import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { PriorityBadge } from "@/shared/components/ui/priority-badge";
import { activityTypeLabel, categoryLabel } from "@/shared/constants/ui-labels";
import { ideaPriorityMeta } from "@/features/workspace/components/idea-priority-meta";
import { useWorkbenchActionsContext, useWorkbenchSessionContext } from "@/modules/workbench/presentation/contexts/workbench-contexts";
import type { Dashboard, Idea, IdeaStatus } from "@/shared/types";

type StatusMetaMap = Record<IdeaStatus, { icon: string; label: string }>;

type DashboardSurfaceProps = {
  dashboard: Dashboard | null;
  ideas: Idea[];
  STATUS_META: StatusMetaMap;
  loading?: boolean;
};

export function DashboardSurface({ dashboard, ideas, STATUS_META, loading = false }: DashboardSurfaceProps) {
  const { session, canCreateIdea, formatTime } = useWorkbenchSessionContext();
  const { openCreateIdea, selectIdea, handleEnterWorkspace } = useWorkbenchActionsContext();
  const workspaceName = session?.workspace?.name || "워크스페이스";
  const total = Number(dashboard?.metrics?.totalIdeas || ideas.length || 0);
  const totalWorkspaces = Number(dashboard?.metrics?.totalWorkspaces || 0);
  const recentActivity = Number(dashboard?.metrics?.recentActivity || 0);
  const statusKeys: IdeaStatus[] = ["seed", "sprout", "grow", "harvest", "rest"];
  const recentIdeas = Array.isArray(dashboard?.recentIdeas) && dashboard.recentIdeas.length
    ? dashboard.recentIdeas
    : [...ideas].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 12);
  const workspaceCards = Array.isArray(dashboard?.workspaces) ? dashboard.workspaces : [];
  const recentIdeasSeed = dashboard?.recentIdeas || ideas;

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
            <Button onClick={openCreateIdea} disabled={!canCreateIdea}>+ 새 아이디어 만들기</Button>
          </CardContent>
        </Card>
      ) : null}

      {loading && !dashboard ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 h-3 w-16 rounded bg-[var(--surface-strong)]" />
              <div className="h-8 w-12 rounded bg-[var(--surface-strong)]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4">
              <p className="text-xs text-[var(--muted)]">총 아이디어</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">{total}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4">
              <p className="text-xs text-[var(--muted)]">공간 수</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">{totalWorkspaces === 0 ? "—" : totalWorkspaces}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4">
              <p className="text-xs text-[var(--muted)]">활성 아이디어</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">{Number(dashboard?.metrics?.activeIdeas || 0)}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4">
              <p className="text-xs text-[var(--muted)]">최근 7일 활동</p>
              {recentActivity === 0 ? (
                <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">없음</span>
              ) : (
                <p className="text-2xl font-bold text-[var(--foreground)]">{recentActivity}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader>
          <CardTitle className="text-base">워크스페이스 목록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workspaceCards.map((workspace) => (
              <button
                key={`dash-workspace-${workspace.id}`}
                type="button"
                onClick={() => void handleEnterWorkspace(workspace.id)}
                className="group w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">{workspace.name}</p>
                  <span className="text-xs text-[var(--muted)] transition-transform duration-150 group-hover:scale-110">{workspace.icon || "📁"}</span>
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
              </button>
            ))}
          </div>
          {workspaceCards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="text-3xl">📁</span>
              <p className="text-sm font-medium text-[var(--foreground)]">워크스페이스가 없습니다</p>
              <p className="text-xs text-[var(--muted)]">사이드바에서 새 워크스페이스를 만들어보세요.</p>
            </div>
          ) : null}
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
          {recentIdeasSeed.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-2 py-8 text-center">
              <span className="text-3xl">💡</span>
              <p className="text-sm font-medium text-[var(--foreground)]">최근 아이디어가 없습니다</p>
            </div>
          ) : recentIdeas.length ? (
            recentIdeas.map((idea) => {
              const priority = ideaPriorityMeta(idea);
              return (
                <button
                  key={`dash-top-idea-${idea.id}`}
                  type="button"
                  onClick={() => void selectIdea(idea.id, { workspaceId: idea.teamId, openPage: true })}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]"
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
            <p className="col-span-full text-sm text-[var(--muted)]">최근 수정된 아이디어가 아직 없습니다.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">{`총 아이디어 ${total}개`}</p>
    </div>
  );
}
