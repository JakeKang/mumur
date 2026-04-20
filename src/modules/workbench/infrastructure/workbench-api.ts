import type { apiRequest } from "@/shared/lib/api-client";
import type { IdeaStatus } from "@/shared/types";

export type WorkbenchApiClient = typeof apiRequest;

export type UpdateIdeaPayload = {
  title: string;
  category: string;
  status: IdeaStatus;
  priority: "low" | "medium" | "high";
  blocks: Array<{ id: string; type: string; content: string; checked: boolean }>;
  baseUpdatedAt: number;
};

export async function getAuthMe(api: WorkbenchApiClient) {
  return api("/api/auth/me");
}

export async function logout(api: WorkbenchApiClient) {
  return api("/api/auth/logout", { method: "POST" });
}

export async function patchProfile(
  api: WorkbenchApiClient,
  payload: { name?: string; email?: string; currentPassword?: string; newPassword?: string }
) {
  return api("/api/auth/me", { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getDashboardSummary(api: WorkbenchApiClient) {
  return api("/api/dashboard/summary");
}

export async function getNotifications(api: WorkbenchApiClient, query: string) {
  return api(`/api/notifications?${query}`);
}

export async function getNotificationPreferences(api: WorkbenchApiClient) {
  return api("/api/notifications/preferences");
}

export async function saveNotificationPreferences(api: WorkbenchApiClient, mutedTypes: string[]) {
  return api("/api/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify({ mutedTypes }),
  });
}

export async function markNotificationRead(api: WorkbenchApiClient, notificationId: number) {
  return api(`/api/notifications/${notificationId}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(api: WorkbenchApiClient) {
  return api("/api/notifications/read-all", { method: "POST" });
}

export async function getWebhooks(api: WorkbenchApiClient) {
  return api("/api/integrations/webhooks");
}

export async function saveWebhook(api: WorkbenchApiClient, platform: string, payload: object) {
  return api(`/api/integrations/webhooks/${platform}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getWorkspaceMembers(api: WorkbenchApiClient) {
  return api("/api/workspace/members");
}

export async function updateWorkspaceMemberRole(api: WorkbenchApiClient, userId: number, role: string) {
  return api(`/api/workspace/members/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function removeWorkspaceMember(api: WorkbenchApiClient, userId: number) {
  return api(`/api/workspace/members/${userId}`, { method: "DELETE" });
}

export async function getWorkspaceInvitations(api: WorkbenchApiClient) {
  return api("/api/workspace/invitations");
}

export async function previewWorkspaceInvitation(api: WorkbenchApiClient, email: string) {
  return api(`/api/workspace/invitations/preview?email=${encodeURIComponent(email)}`);
}

export async function createWorkspaceInvitation(
  api: WorkbenchApiClient,
  payload: { email: string; role: string }
) {
  return api("/api/workspace/invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function retryWorkspaceInvitation(api: WorkbenchApiClient, invitationId: number) {
  return api(`/api/workspace/invitations/${invitationId}/retry`, { method: "POST" });
}

export async function cancelWorkspaceInvitation(api: WorkbenchApiClient, invitationId: number) {
  return api(`/api/workspace/invitations/${invitationId}`, { method: "DELETE" });
}

export async function acceptWorkspaceInvitation(api: WorkbenchApiClient, invitationId: number) {
  return api(`/api/workspace/invitations/${invitationId}/accept`, { method: "POST" });
}

export async function declineWorkspaceInvitation(api: WorkbenchApiClient, invitationId: number) {
  return api(`/api/workspace/invitations/${invitationId}/decline`, { method: "POST" });
}

export async function getWorkspaces(api: WorkbenchApiClient) {
  return api("/api/workspaces");
}

export async function switchWorkspace(api: WorkbenchApiClient, teamId: number) {
  return api("/api/workspaces/switch", {
    method: "POST",
    body: JSON.stringify({ teamId }),
  });
}

export async function createWorkspace(
  api: WorkbenchApiClient,
  payload: { teamName: string; icon: string; color: string }
) {
  return api("/api/workspaces", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWorkspace(
  api: WorkbenchApiClient,
  workspaceId: number,
  payload: { name: string; icon: string; color: string }
) {
  return api(`/api/workspaces/${workspaceId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteWorkspace(api: WorkbenchApiClient, workspaceId: number) {
  return api(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
}

export async function leaveWorkspace(api: WorkbenchApiClient, workspaceId: number) {
  return api(`/api/workspaces/${workspaceId}/leave`, { method: "POST" });
}

export async function getIdeas(api: WorkbenchApiClient, query: string) {
  return api(`/api/ideas?${query}`);
}

export async function getIdea(api: WorkbenchApiClient, ideaId: string | number) {
  return api(`/api/ideas/${ideaId}`);
}

export async function getIdeaCollabCheckpoint(api: WorkbenchApiClient, ideaId: string | number) {
  return api(`/api/ideas/${ideaId}/collab/checkpoint`);
}

export async function createIdea(api: WorkbenchApiClient, payload: object) {
  return api("/api/ideas", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateIdea(api: WorkbenchApiClient, ideaId: string | number, payload: UpdateIdeaPayload) {
  return api(`/api/ideas/${ideaId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveIdeaCollabCheckpoint(
  api: WorkbenchApiClient,
  ideaId: string | number,
  payload: { title: string; blocks: Array<{ id: string; type: string; content: string; checked: boolean }>; baseUpdatedAt: number }
) {
  return api(`/api/ideas/${ideaId}/collab/checkpoint`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteIdea(api: WorkbenchApiClient, ideaId: number) {
  return api(`/api/ideas/${ideaId}`, { method: "DELETE" });
}

export async function getIdeaComments(api: WorkbenchApiClient, ideaId: string | number, query = "") {
  return api(`/api/ideas/${ideaId}/comments${query}`);
}

export async function createIdeaComment(
  api: WorkbenchApiClient,
  ideaId: string | number,
  payload: { content: string; blockId: string; parentId?: number | null }
) {
  return api(`/api/ideas/${ideaId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateIdeaComment(
  api: WorkbenchApiClient,
  ideaId: string | number,
  commentId: number,
  content: string
) {
  return api(`/api/ideas/${ideaId}/comments/${commentId}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function deleteIdeaComment(api: WorkbenchApiClient, ideaId: string | number, commentId: number) {
  return api(`/api/ideas/${ideaId}/comments/${commentId}`, { method: "DELETE" });
}

export async function getIdeaReactions(
  api: WorkbenchApiClient,
  ideaId: string | number,
  targetType = "idea",
  targetId = ""
) {
  return api(`/api/ideas/${ideaId}/reactions?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`);
}

export async function createIdeaReaction(
  api: WorkbenchApiClient,
  ideaId: string | number,
  payload: { emoji: string; targetType: string; targetId: string }
) {
  return api(`/api/ideas/${ideaId}/reactions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getIdeaVersions(api: WorkbenchApiClient, ideaId: string | number) {
  return api(`/api/ideas/${ideaId}/versions`);
}

export async function createIdeaVersion(api: WorkbenchApiClient, ideaId: string | number, payload: FormData) {
  return api(`/api/ideas/${ideaId}/versions`, { method: "POST", body: payload });
}

export async function restoreIdeaVersion(api: WorkbenchApiClient, ideaId: string | number, versionId: number) {
  return api(`/api/ideas/${ideaId}/versions/${versionId}/restore`, { method: "POST" });
}

export async function getIdeaTimeline(api: WorkbenchApiClient, ideaId: string | number) {
  return api(`/api/ideas/${ideaId}/timeline`);
}

export async function uploadIdeaBlockFile(
  api: WorkbenchApiClient,
  ideaId: string | number,
  blockId: string,
  file: File,
  baseUpdatedAt: number
) {
  const form = new FormData();
  form.append("file", file);
  form.append("baseUpdatedAt", String(baseUpdatedAt));
  return api(`/api/ideas/${ideaId}/blocks/${blockId}/file`, {
    method: "POST",
    body: form,
  });
}

export async function getIdeaPresence(api: WorkbenchApiClient, ideaId: string | number) {
  return api(`/api/ideas/${ideaId}/presence`);
}

export async function updateIdeaPresence(
  api: WorkbenchApiClient,
  ideaId: string | number,
  payload: { blockId?: string; cursorOffset?: number | null; typing?: boolean }
) {
  return api(`/api/ideas/${ideaId}/presence`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
