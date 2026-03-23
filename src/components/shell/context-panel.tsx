import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { categoryLabel, deliveryStatusLabel, notificationTypeLabel, roleLabel } from "@/lib/ui-labels";
import { useMemo, useState } from "react";

function ideaPriorityLevel(idea) {
  if (!idea) {
    return "low";
  }
  if (idea.priorityLevel) {
    return idea.priorityLevel;
  }
  const engagement = Number(idea.commentCount || 0) + Number(idea.reactionCount || 0) + Number(idea.versionCount || 0);
  if (idea.status === "harvest" || engagement >= 24) {
    return "high";
  }
  if (idea.status === "grow" || engagement >= 10) {
    return "medium";
  }
  return "low";
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function SectionTabs({ section, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={section === "notifications" ? "default" : "outline"} onClick={() => onChange("notifications")}>
        알림
      </Button>
      <Button size="sm" variant={section === "team" ? "default" : "outline"} onClick={() => onChange("team")}>
        팀
      </Button>
      <Button size="sm" variant={section === "integrations" ? "default" : "outline"} onClick={() => onChange("integrations")}>
        연동
      </Button>
    </div>
  );
}

export function ContextPanel({
  activePage,
  selectedIdea,
  studioTab,
  setStudioTab,
  dashboard,
  utilitySection,
  setUtilitySection,
  onRequestClose,
  notificationFilters,
  setNotificationFilters,
  NOTIFICATION_TYPES,
  loadNotifications,
  markAllNotificationsRead,
  mutedTypes,
  toggleMutedType,
  saveMutedTypes,
  notifications,
  markNotificationRead,
  formatTime,
  handleSaveWebhook,
  webhookForm,
  setWebhookForm,
  webhooks,
  deliveries,
  teamMembers,
  userTeams,
  activeTeamId,
  teamMe,
  onSwitchTeam,
  teamInvitationMessage,
  onLeaveWorkspace,
  onOpenTeamPage
}) {
  const [notificationSort, setNotificationSort] = useState("recent");
  const [deliverySort, setDeliverySort] = useState("recent");
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const canManageWebhooks = Boolean(teamMe?.isOwner || teamMe?.role === "admin" || teamMe?.role === "owner");

  const unreadCount = notifications.filter((item) => !item.read).length;
  const enabledWebhooks = webhooks.filter((item) => item.enabled).length;
  const selectedIdeaPriority = ideaPriorityLevel(selectedIdea);

  const sortedNotifications = useMemo(() => {
    const withPriority = notifications.map((item) => {
      let score = 1;
      if (item.type === "mention.created") {
        score = 3;
      } else if (!item.read) {
        score = 2;
      }
      return { ...item, priorityScore: score };
    });

    withPriority.sort((a, b) => {
      if (notificationSort === "priority") {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
      }
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
    return withPriority;
  }, [notifications, notificationSort]);

  const sortedDeliveries = useMemo(() => {
    const next = [...deliveries];
    next.sort((a, b) => {
      if (deliverySort === "failed") {
        const aFailed = /(fail|error)/i.test(String(a.status || "")) ? 1 : 0;
        const bFailed = /(fail|error)/i.test(String(b.status || "")) ? 1 : 0;
        if (aFailed !== bFailed) {
          return bFailed - aFailed;
        }
      }
      return Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0);
    });
    return next;
  }, [deliveries, deliverySort]);

  const notificationPriorityLevel = (item) => {
    if (item.type === "mention.created") {
      return "high";
    }
    if (!item.read) {
      return "medium";
    }
    return "low";
  };

  const deliveryStatusTone = (status) => {
    if (/(fail|error)/i.test(String(status || ""))) {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (/(success|ok)/i.test(String(status || ""))) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    return "bg-[var(--surface-strong)] text-[var(--muted)] border-[var(--border)]";
  };

  return (
    <aside className="space-y-3">
      <Card className="border-[var(--border)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">유틸리티 패널</CardTitle>
            <Button size="sm" variant="outline" onClick={onRequestClose}>
              닫기
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">보조 기능을 목적별로 분리해 빠르게 접근</p>
          <SectionTabs section={utilitySection} onChange={setUtilitySection} />
        </CardHeader>
      </Card>

      <Card className="border-[var(--border)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">현재 컨텍스트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-2 text-sm">
          {activePage === "detail" && selectedIdea ? (
            <>
              <p className="font-medium text-[var(--foreground)]">{selectedIdea.title}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                <span className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-1.5 py-0.5">{categoryLabel(selectedIdea.category)}</span>
                <PriorityBadge level={selectedIdeaPriority} />
                <span>{`댓글 ${selectedIdea.commentCount || 0}`}</span>
                <span>{`스레드 ${selectedIdea.threadCount || 0}`}</span>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={studioTab === "editor" ? "default" : "outline"} onClick={() => setStudioTab("editor")}>편집</Button>
                <Button type="button" size="sm" variant={studioTab === "collab" ? "default" : "outline"} onClick={() => setStudioTab("collab")}>협업</Button>
                <Button type="button" size="sm" variant={studioTab === "docs" ? "default" : "outline"} onClick={() => setStudioTab("docs")}>문서</Button>
              </div>
            </>
          ) : null}
          {activePage === "ideas" ? (
            <p className="text-xs text-[var(--muted)]">전체 아이디어 탐색 화면입니다. 필터를 조정하고 아이디어를 선택하면 상세 화면으로 이동합니다.</p>
          ) : null}
          {activePage === "dashboard" ? (
            <p className="text-xs text-[var(--muted)]">{`총 아이디어 ${dashboard?.metrics?.totalIdeas || 0}개 · 최근 활동 ${dashboard?.metrics?.recentActivity || 0}건`}</p>
          ) : null}
          {activePage === "team" ? (
            <p className="text-xs text-[var(--muted)]">{`팀 멤버 ${teamMembers.length}명 · 내 소속 팀 ${userTeams.length}개`}</p>
          ) : null}
        </CardContent>
      </Card>

      {utilitySection === "notifications" ? (
        <>
          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">알림 개요</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 pt-2">
              <StatTile label="안읽음" value={unreadCount} />
              <StatTile label="뮤트" value={mutedTypes.length} />
              <StatTile label="아이디어" value={dashboard?.metrics?.totalIdeas || 0} />
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">필터 및 액션</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-2">
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={notificationFilters.eventType}
                onChange={(event) => setNotificationFilters((prev) => ({ ...prev, eventType: event.target.value }))}
              >
                <option value="">전체 유형</option>
                {NOTIFICATION_TYPES.map((type) => (
                <option key={type} value={type}>
                    {notificationTypeLabel(type)}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-1 gap-1 text-sm text-[var(--muted)]">
                <label>
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={notificationFilters.unreadOnly}
                    onChange={(event) => setNotificationFilters((prev) => ({ ...prev, unreadOnly: event.target.checked }))}
                  />
                  안읽음만
                </label>
                <label>
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={notificationFilters.excludeMuted}
                    onChange={(event) => setNotificationFilters((prev) => ({ ...prev, excludeMuted: event.target.checked }))}
                  />
                  뮤트 제외
                </label>
                <label>
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={notificationFilters.mentionsOnly}
                    onChange={(event) => setNotificationFilters((prev) => ({ ...prev, mentionsOnly: event.target.checked }))}
                  />
                  내 멘션만
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadNotifications}>
                  필터 적용
                </Button>
                <Button variant="outline" size="sm" onClick={markAllNotificationsRead}>
                  모두 읽음
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">뮤트 규칙</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 pt-2">
              {NOTIFICATION_TYPES.map((type) => (
                <label key={type} className="text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={mutedTypes.includes(type)}
                    onChange={() => toggleMutedType(type)}
                  />
                  {notificationTypeLabel(type)}
                </label>
              ))}
              <Button variant="outline" size="sm" onClick={saveMutedTypes}>
                뮤트 저장
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">알림 인박스</CardTitle>
                <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-1">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${notificationSort === "recent" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                    onClick={() => setNotificationSort("recent")}
                  >
                    최신
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${notificationSort === "priority" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                    onClick={() => setNotificationSort("priority")}
                  >
                    우선순위
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 pt-2">
              {sortedNotifications.length ? (
                sortedNotifications.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`rounded-md border p-2 text-left ${item.read ? "border-[var(--border)] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface-strong)]"} ${item.type === "mention.created" ? "ring-1 ring-amber-200" : ""}`}
                    onClick={() => markNotificationRead(item.id)}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{notificationTypeLabel(item.type)}</span>
                      <PriorityBadge level={notificationPriorityLevel(item)} />
                    </div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{item.message}</p>
                    <p className="text-xs text-[var(--muted)]">{formatTime(item.createdAt)}</p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">알림이 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {utilitySection === "team" ? (
        <>
          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">내 팀 목록</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-2">
              <StatTile label="소속 팀" value={userTeams.length} />
              <StatTile label="내 권한" value={teamMe?.isOwner ? "소유자" : roleLabel(teamMe?.role || "member")} />
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">팀 전환 / 탈퇴</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-2">
              {(userTeams || []).map((team) => {
                const isActive = Number(activeTeamId) === Number(team.id);
                return (
                  <div key={`utility-team-row-${team.id}`} className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">{team.name}</p>
                      <p className="text-xs text-[var(--muted)]">{roleLabel(team.role)}</p>
                    </div>
                    {!isActive ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => onSwitchTeam(Number(team.id))}>
                        전환
                      </Button>
                    ) : (
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--muted)]">현재 팀</span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={userTeams.length <= 1}
                      onClick={() => onLeaveWorkspace(team)}
                      className="text-rose-600 hover:bg-rose-50"
                    >
                      탈퇴
                    </Button>
                  </div>
                );
              })}
              {userTeams.length <= 1 ? (
                <p className="text-xs text-[var(--muted)]">최소 1개 워크스페이스는 유지되어야 하므로 마지막 팀에서는 탈퇴할 수 없습니다.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">빠른 팀 액션</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-2">
              <p className="text-xs text-[var(--muted)]">멤버 초대, 역할 변경, 초대 이력 관리는 팀 관리 페이지에서 진행하세요.</p>
              <Button type="button" size="sm" onClick={onOpenTeamPage}>
                팀 관리 페이지로 이동
              </Button>
              {teamInvitationMessage ? (
                <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2 text-xs text-[var(--muted)]">{teamInvitationMessage}</div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {utilitySection === "integrations" ? (
        <>
          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">연동 개요</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-2">
              <StatTile label="웹훅" value={webhooks.length} />
              <StatTile label="활성" value={enabledWebhooks} />
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">웹훅 설정</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-2">
                <p className="text-xs text-[var(--muted)]">연동 설정은 전용 다이얼로그에서 안전하게 수정합니다.</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setWebhookDialogOpen(true)}
                  disabled={!canManageWebhooks}
                  title={canManageWebhooks ? "웹훅 설정 열기" : "admin 권한에서만 웹훅을 수정할 수 있습니다"}
                >
                  웹훅 설정 열기
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">웹훅 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-sm">
              {webhooks.length ? (
                webhooks.map((item) => (
                  <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
                    <p className="font-medium text-[var(--foreground)]">{item.platform}</p>
                    <p className="text-[var(--muted)]">{item.enabled ? "활성" : "비활성"}</p>
                    <p className="truncate text-[var(--muted)]">{item.webhookUrl}</p>
                  </div>
                ))
              ) : (
                <p className="text-[var(--muted)]">웹훅 없음</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">전송 이력</CardTitle>
                <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-1">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${deliverySort === "recent" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                    onClick={() => setDeliverySort("recent")}
                  >
                    최신
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 text-[11px] ${deliverySort === "failed" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                    onClick={() => setDeliverySort("failed")}
                  >
                    실패 우선
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-sm">
              {sortedDeliveries.length ? (
                sortedDeliveries.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <p className="font-medium text-[var(--foreground)]">{item.platform}</p>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${deliveryStatusTone(item.status)}`}>{deliveryStatusLabel(item.status)}</span>
                    </div>
                    <p className="text-[var(--muted)]">{`시도 ${item.attempts}/${item.maxAttempts}`}</p>
                    <p className="text-[11px] text-[var(--muted)]">{formatTime(item.createdAt || item.updatedAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-[var(--muted)]">전송 이력 없음</p>
              )}
            </CardContent>
          </Card>

          <DialogShell
            open={webhookDialogOpen}
            onClose={() => setWebhookDialogOpen(false)}
            title="웹훅 설정"
            maxWidthClass="max-w-lg"
          >
            <form
              className="grid gap-2"
              onSubmit={async (event) => {
                if (!canManageWebhooks) {
                  event.preventDefault();
                  return;
                }
                await handleSaveWebhook(event);
                setWebhookDialogOpen(false);
              }}
            >
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={webhookForm.platform}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, platform: event.target.value }))}
                disabled={!canManageWebhooks}
              >
                <option value="slack">slack</option>
                <option value="discord">discord</option>
              </select>
              <Input
                placeholder="https://..."
                value={webhookForm.webhookUrl}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                disabled={!canManageWebhooks}
                required
              />
              <label className="text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={webhookForm.enabled}
                  onChange={(event) => setWebhookForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                  disabled={!canManageWebhooks}
                />
                활성화
              </label>
              <Button type="submit" disabled={!canManageWebhooks}>저장</Button>
            </form>
          </DialogShell>
        </>
      ) : null}
    </aside>
  );
}
