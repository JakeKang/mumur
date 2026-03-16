import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, LogOut, PanelLeft, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";

export function AppHeader({
  streamStatus,
  unreadCount,
  teamName,
  authed,
  busy,
  workspaceVisible,
  onToggleWorkspace,
  onOpenCreateIdea,
  onToggleNotifications,
  onRefresh,
  onLogout
}) {
  return (
    <Card className="sticky-app-header border-[var(--border)]/90 bg-[var(--surface)]/90 shadow-md">
      <CardHeader className="py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Mumur 워크스페이스</CardTitle>
            <p className="text-sm text-[var(--muted)]">아이디어 생애주기 중심 협업 스튜디오</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{streamStatus}</Badge>
              <Badge>{`안읽음 ${unreadCount}`}</Badge>
              {teamName ? <Badge>{teamName}</Badge> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {authed ? (
              <>
                <Button onClick={onOpenCreateIdea} title="새 아이디어" aria-label="새 아이디어">
                  <Plus className="mr-1 h-4 w-4" />
                  새 아이디어
                </Button>
                <Button
                  variant="outline"
                  onClick={onToggleWorkspace}
                  title={workspaceVisible ? "사이드바 숨기기" : "사이드바 열기"}
                  aria-label={workspaceVisible ? "사이드바 숨기기" : "사이드바 열기"}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onToggleNotifications} title="유틸리티" aria-label="유틸리티">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onRefresh} disabled={busy} title="새로고침" aria-label="새로고침">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onToggleNotifications} title="알림" aria-label="알림">
                  <Bell className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onLogout} disabled={busy} title="로그아웃" aria-label="로그아웃">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
