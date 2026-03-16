import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { activityTypeLabel, categoryLabel, invitationStatusLabel, roleLabel } from "@/lib/ui-labels";

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

export function DashboardSurface({ dashboard, ideas, STATUS_META, onSelectIdea, formatTime }) {
  const total = Number(dashboard?.metrics?.totalIdeas || ideas.length || 0);
  const statusKeys = ["seed", "sprout", "grow", "harvest", "rest"];
  const topIdeas = [...ideas]
    .sort((a, b) => Number(b.reactionCount || 0) - Number(a.reactionCount || 0))
    .slice(0, 4);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--foreground)]">대시보드</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">팀의 아이디어 현황을 한눈에 확인하세요</p>
      </div>

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
            <p className="text-sm text-[var(--muted)]">활동 데이터 없음</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-[var(--foreground)]">주목받는 아이디어</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {topIdeas.length ? (
            topIdeas.map((idea) => {
              const priority = ideaPriorityMeta(idea);
              return (
              <button
                key={`dash-top-idea-${idea.id}`}
                type="button"
                onClick={() => onSelectIdea(idea.id)}
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
                <p className="mb-2 line-clamp-2 text-xs text-[var(--muted)]">{idea.aiSummary || idea.summary || "요약 없음"}</p>
                <p className="text-xs text-[var(--muted)]">{`💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0} · 📄 ${idea.versionCount || 0}`}</p>
              </button>
              );
            })
          ) : (
            <p className="text-sm text-[var(--muted)]">아이디어 데이터 없음</p>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">{`총 아이디어 ${total}개`}</p>
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
  categoryOptions,
  formatTime
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--foreground)]">아이디어 목록</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{`총 ${ideas.length}개의 아이디어`}</p>
        </div>
        <Button onClick={onOpenCreateIdea}>+ 새 아이디어</Button>
      </div>

      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-[var(--surface-strong)] p-1">
              {statusFilters.map((item) => (
                <button
                  key={`ideas-status-filter-${item.key || "all"}`}
                  type="button"
                  onClick={() => onQuickStatusFilter(item.key)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    (filters.status || "") === item.key ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow" : "text-[var(--muted)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="">전체 카테고리</option>
              {categoryOptions.map((category) => (
                <option key={`ideas-cat-filter-${category}`} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>

            <Input
              value={filters.query}
              onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
              placeholder="아이디어 검색"
              className="h-9 max-w-52 text-xs"
            />

            <select
              value={navigatorSort}
              onChange={(event) => setNavigatorSort(event.target.value)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
            >
              <option value="recent">최신순</option>
              <option value="comments">댓글 많은순</option>
              <option value="reactions">리액션 많은순</option>
              <option value="versions">버전 많은순</option>
              <option value="title">이름순</option>
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

            <div className="ml-auto flex gap-1 rounded-lg bg-[var(--surface-strong)] p-1">
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
          </div>
        </CardContent>
      </Card>

      {ideaView === "card" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {ideas.map((idea) => {
            const priority = ideaPriorityMeta(idea);
            return (
            <button
              key={`ideas-card-${idea.id}`}
              type="button"
              onClick={() => onSelectIdea(idea.id)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge>{`${STATUS_META[idea.status]?.icon || "💡"} ${STATUS_META[idea.status]?.label || idea.status}`}</Badge>
                  <PriorityBadge level={priority.level} />
                </div>
                <span className="text-[11px] text-[var(--muted)]">{categoryLabel(idea.category)}</span>
              </div>
              <p className="mb-1 text-sm font-semibold text-[var(--foreground)]">{idea.title}</p>
              <p className="mb-2 line-clamp-2 text-xs text-[var(--muted)]">{idea.aiSummary || idea.summary || "요약 없음"}</p>
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
                  onClick={() => onSelectIdea(idea.id)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{idea.title}</p>
                    <PriorityBadge level={priority.level} />
                  </div>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <Badge className="text-[10px]">{STATUS_META[idea.status]?.icon || "💡"}</Badge>
                    <span>{categoryLabel(idea.category)}</span>
                    <span>{idea.authorName || "멤버"}</span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">{`💬 ${idea.commentCount || 0} · 👍 ${idea.reactionCount || 0}`}</p>
                </button>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden border-[var(--border)] bg-[var(--surface)] md:block">
            <div className="grid grid-cols-[1fr_90px_120px_85px_70px_70px] bg-[var(--surface-strong)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span>제목</span>
              <span>상태</span>
              <span>카테고리</span>
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
                  onClick={() => onSelectIdea(idea.id)}
                  className={`grid w-full grid-cols-[1fr_90px_120px_85px_70px_70px] items-center px-4 py-3 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-strong)] ${
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
  formatTime
}) {
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
          {teamMe?.isOwner ? (
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
                <option value="member">멤버</option>
                <option value="owner">소유자</option>
              </select>
              <Button type="submit">+ 멤버 초대</Button>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">현재 권한은 멤버입니다. 멤버 초대/역할 변경은 소유자만 가능합니다.</p>
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
                  {teamMe?.isOwner && invite.status === "pending" ? (
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
                {teamMe?.isOwner ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                      value={member.role}
                      onChange={(event) => updateTeamMemberRole(member.userId, event.target.value)}
                    >
                      <option value="member">{roleLabel("member")}</option>
                      <option value="owner">{roleLabel("owner")}</option>
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
    </div>
  );
}
