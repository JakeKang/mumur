export type NotificationQueryFilters = {
  eventType: string;
  unreadOnly: boolean;
  excludeMuted: boolean;
  mentionsOnly: boolean;
};

export type IdeasQueryFilters = {
  scope: string;
  workspaceId: string;
  status: string;
  category: string;
  query: string;
  priority: string;
  authorId: string;
  participantId: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
};

export const workbenchQueryKeys = {
  dashboard: ["workbench", "dashboard"] as const,
  ideaDetail: (ideaId: number | string | null) => ["workbench", "idea-detail", ideaId ?? "none"] as const,
  ideaComments: (ideaId: number | string | null, blockId: string) => ["workbench", "idea-comments", ideaId ?? "none", blockId || "all"] as const,
  ideaVersions: (ideaId: number | string | null) => ["workbench", "idea-versions", ideaId ?? "none"] as const,
  ideaTimeline: (ideaId: number | string | null) => ["workbench", "idea-timeline", ideaId ?? "none"] as const,
  ideaReactions: (ideaId: number | string | null, targetType: string, targetId: string) => ["workbench", "idea-reactions", ideaId ?? "none", targetType || "idea", targetId || "root"] as const,
  ideas: (filters: IdeasQueryFilters) => [
    "workbench",
    "ideas",
    filters.scope,
    filters.workspaceId,
    filters.status,
    filters.category,
    filters.query,
    filters.priority,
    filters.authorId,
    filters.participantId,
    filters.createdFrom,
    filters.createdTo,
    filters.updatedFrom,
    filters.updatedTo,
  ] as const,
  workspaces: ["workbench", "workspaces"] as const,
  webhooks: ["workbench", "webhooks"] as const,
  teamMembers: (workspaceId: number | null) => ["workbench", "team-members", workspaceId ?? "none"] as const,
  teamInvitations: (workspaceId: number | null) => ["workbench", "team-invitations", workspaceId ?? "none"] as const,
  notificationPreferences: ["workbench", "notification-preferences"] as const,
  notifications: (filters: NotificationQueryFilters) => [
    "workbench",
    "notifications",
    filters.eventType || "all",
    filters.unreadOnly,
    filters.excludeMuted,
    filters.mentionsOnly,
  ] as const,
};
