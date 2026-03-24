import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { PriorityBadge } from "@/shared/components/ui/priority-badge";
import { categoryLabel, notificationTypeLabel } from "@/shared/constants/ui-labels";
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

export function ContextPanel({
  activePage,
  selectedIdea,
  studioTab,
  setStudioTab,
  dashboard,
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
  formatTime
}) {
  const [notificationSort, setNotificationSort] = useState("recent");

  const unreadCount = notifications.filter((item) => !item.read).length;
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

  const notificationPriorityLevel = (item) => {
    if (item.type === "mention.created") {
      return "high";
    }
    if (!item.read) {
      return "medium";
    }
    return "low";
  };

  return (
    <aside className="space-y-3">
      <Card className="border-[var(--border)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">알림 패널</CardTitle>
            <Button size="sm" variant="outline" onClick={onRequestClose}>
              닫기
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">알림 중심으로 빠르게 확인하고 정리합니다.</p>
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
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={studioTab === "editor" ? "default" : "outline"} onClick={() => setStudioTab("editor")}>편집</Button>
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
        </CardContent>
      </Card>

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
    </aside>
  );
}
