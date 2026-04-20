export const NOTIFICATION_TYPES = [
  "mention.created",
  "comment.created",
  "version.created",
  "version.restored",
  "team.invitation.pending",
  "team.invitation.accepted",
  "team.invitation.cancelled",
  "integration.webhook.updated",
];

export const DEFAULT_FILTERS = {
  scope: "all",
  workspaceId: "",
  status: "",
  query: "",
  category: "",
  priority: "",
  authorId: "",
  participantId: "",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
};
