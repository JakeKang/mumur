import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { deliveryStatusLabel, notificationTypeLabel, roleLabel } from "@/lib/ui-labels";
import { useMemo, useState } from "react";

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
  teamInvitations,
  teamInvitationMessage,
  onOpenTeamPage
}) {
  const [notificationSort, setNotificationSort] = useState("recent");
  const [deliverySort, setDeliverySort] = useState("recent");
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);

  const unreadCount = notifications.filter((item) => !item.read).length;
  const enabledWebhooks = webhooks.filter((item) => item.enabled).length;

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
              <CardTitle className="text-sm">팀 개요</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-2">
              <StatTile label="멤버" value={teamMembers.length} />
              <StatTile label="초대" value={teamInvitations?.length || 0} />
            </CardContent>
          </Card>

          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">팀 전환 및 권한</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-2">
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={activeTeamId || ""}
                onChange={(event) => onSwitchTeam(Number(event.target.value))}
              >
                {(userTeams || []).map((team) => (
                  <option key={`team-switch-${team.id}`} value={team.id}>{`${team.name} (${roleLabel(team.role)})`}</option>
                ))}
              </select>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2 text-xs text-[var(--muted)]">
                {teamMe?.isOwner ? "현재 권한: 소유자" : "현재 권한: 멤버"}
              </div>
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
                <Button type="button" size="sm" onClick={() => setWebhookDialogOpen(true)}>
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
            description="Slack/Discord 웹훅 URL과 활성 여부를 수정합니다"
            maxWidthClass="max-w-lg"
          >
            <form
              className="grid gap-2"
              onSubmit={async (event) => {
                await handleSaveWebhook(event);
                setWebhookDialogOpen(false);
              }}
            >
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={webhookForm.platform}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, platform: event.target.value }))}
              >
                <option value="slack">slack</option>
                <option value="discord">discord</option>
              </select>
              <Input
                placeholder="https://..."
                value={webhookForm.webhookUrl}
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                required
              />
              <label className="text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={webhookForm.enabled}
                  onChange={(event) => setWebhookForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                활성화
              </label>
              <Button type="submit">저장</Button>
            </form>
          </DialogShell>
        </>
      ) : null}
    </aside>
  );
}
