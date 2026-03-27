import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { invitationStatusLabel, roleLabel } from "@/shared/constants/ui-labels";
import { useWorkbenchSessionContext } from "@/modules/workbench/presentation/contexts/workbench-contexts";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Webhook, WebhookForm, WorkspaceInvitation, WorkspaceMember, WorkspaceMemberForm, WorkspaceRole } from "@/shared/types";

type TeamSurfaceProps = {
  teamMembers: WorkspaceMember[];
  teamMemberForm: WorkspaceMemberForm;
  setTeamMemberForm: Dispatch<SetStateAction<WorkspaceMemberForm>>;
  addTeamMember: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  updateTeamMemberRole: (userId: number, role: WorkspaceRole) => void | Promise<void>;
  requestRemoveTeamMember: (member: WorkspaceMember) => void;
  teamInvitations: WorkspaceInvitation[];
  retryTeamInvitation: (invitationId: number) => void | Promise<void>;
  requestCancelInvitation: (invite: WorkspaceInvitation) => void;
  teamInvitationMessage: string;
  webhooks: Webhook[];
  webhookForm: WebhookForm;
  setWebhookForm: Dispatch<SetStateAction<WebhookForm>>;
  handleSaveWebhook: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  webhookSaving: boolean;
};

const editableRoles: WorkspaceRole[] = ["viewer", "editor", "deleter", "admin"];

function toWorkspaceRole(value: string): WorkspaceRole {
  return editableRoles.includes(value as WorkspaceRole) ? (value as WorkspaceRole) : "viewer";
}

function toWebhookPlatform(value: string): WebhookForm["platform"] {
  return value === "discord" ? "discord" : "slack";
}

export function TeamSurface({
  teamMembers,
  teamMemberForm,
  setTeamMemberForm,
  addTeamMember,
  updateTeamMemberRole,
  requestRemoveTeamMember,
  teamInvitations,
  retryTeamInvitation,
  requestCancelInvitation,
  teamInvitationMessage,
  webhooks,
  webhookForm,
  setWebhookForm,
  handleSaveWebhook,
  webhookSaving
}: TeamSurfaceProps) {
  const { teamMe, formatTime } = useWorkbenchSessionContext();
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
                onChange={(event) => setTeamMemberForm((prev) => ({ ...prev, role: toWorkspaceRole(event.target.value) }))}
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
                      onChange={(event) => updateTeamMemberRole(member.userId, toWorkspaceRole(event.target.value))}
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
                onChange={(event) => setWebhookForm((prev) => ({ ...prev, platform: toWebhookPlatform(event.target.value) }))}
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
