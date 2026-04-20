

export type AuthMode = "login" | "register";

export type LoginForm = {
  email: string;
  password: string;
};

export type RegisterForm = {
  name: string;
  email: string;
  password: string;
  teamName: string;
};

export type SessionUser = {
  id: number;
  name: string;
  email: string;
};

export type SessionWorkspace = {
  id: number;
  name: string;
};

export type Session = {
  user: SessionUser;
  workspace: SessionWorkspace;
} | null;

export type SessionTeam = SessionWorkspace;


export type IdeaStatus = "seed" | "sprout" | "grow" | "harvest" | "rest";

export type Block = {
  id: string;
  type: string;
  content: string;
  checked: boolean;
};

export type Idea = {
  id: number;
  workspaceId: number;
  teamId: number;
  authorId: number;
  title: string;
  category: string;
  status: IdeaStatus;
  priority?: "low" | "medium" | "high";
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
  baseUpdatedAt?: number;
  commentCount?: number;
  reactionCount?: number;
  versionCount?: number;
  authorName?: string;
  workspaceName?: string;
  priorityLevel?: "low" | "medium" | "high";
};


export type Comment = {
  id: number;
  ideaId: number;
  userId: number;
  parentId: number | null;
  blockId: string | null;
  content: string;
  createdAt: number;
  userName?: string;
  userEmail?: string;
};


export type ScoreDistribution = { score: number; count: number };

export type Reaction = {
  id: number;
  ideaId: number;
  userId: number;
  emoji: string;
  targetType: string;
  targetId: string | null;
  createdAt: number;
  userName?: string;
};


export type IdeaVersion = {
  id: number;
  ideaId: number;
  versionLabel: string;
  notes: string | null;
  fileName: string | null;
  filePath: string | null;
  createdBy: number;
  createdAt: number;
  creatorName?: string;
};

export type TimelineEvent = {
  id: number;
  workspaceId: number;
  teamId: number;
  ideaId: number | null;
  userId: number | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
  actorName?: string;
};


export type WorkspaceRole = "viewer" | "editor" | "deleter" | "admin" | "owner" | "member";

export type WorkspaceMember = {
  userId: number;
  workspaceId: number;
  name: string;
  email: string;
  role: WorkspaceRole;
  createdAt: number;
};

export type WorkspaceInvitation = {
  id: number;
  workspaceId: number;
  teamId?: number;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "accepted" | "cancelled" | "canceled";
  message: string | null;
  invitedBy: number;
  invitedByName?: string;
  resolvedBy?: number | null;
  resolvedByName?: string;
  teamName?: string;
  teamIcon?: string;
  teamColor?: string;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceInvitationPreview = {
  email: string;
  registered: boolean;
  userId: number | null;
  name: string | null;
  memberRole: WorkspaceRole | null;
  invitation: WorkspaceInvitation | null;
};

export type WorkspaceMe = {
  userId: number | null;
  isOwner: boolean;
  role: WorkspaceRole | null;
};

export type UserWorkspace = {
  id: number;
  name: string;
  icon: string;
  color: string;
  active?: boolean;
};

export type WorkspaceMemberForm = {
  email: string;
  role: WorkspaceRole;
};

export type Workspace = {
  id: number;
  name: string;
  icon: string;
  color: string;
  ownerId: number;
  createdAt: number;
  updatedAt: number;
};

export type TeamRole = WorkspaceRole;
export type TeamMember = WorkspaceMember;
export type TeamInvitation = WorkspaceInvitation;
export type TeamMe = WorkspaceMe;
export type UserTeam = UserWorkspace;
export type TeamMemberForm = WorkspaceMemberForm;


export type Notification = {
  id: number;
  teamId?: number;
  ideaId?: number | null;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  createdAt: number;
  actor?: string;
  message?: string;
};

export type NotificationFilters = {
  eventType: string;
  unreadOnly: boolean;
  excludeMuted: boolean;
  mentionsOnly: boolean;
};


export type WebhookPlatform = "slack" | "discord";

export type Webhook = {
  id: number;
  workspaceId: number;
  teamId: number;
  platform: WebhookPlatform;
  webhookUrl: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type WebhookDelivery = {
  id: number;
  webhookId: number;
  eventId: number;
  platform: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number | null;
};

export type WebhookForm = {
  platform: WebhookPlatform;
  webhookUrl: string;
  enabled: boolean;
};


export type DashboardMetrics = {
  totalIdeas: number;
  totalComments: number;
  activeIdeas: number;
  totalWorkspaces: number;
  recentActivity: number;
};

export type DashboardWorkspace = {
  id: number;
  name: string;
  icon: string;
  color: string;
  ideaCount: number;
  recentActivity: number;
  lastUpdatedAt: number;
  statusCounts: Record<string, number>;
};

export type DashboardActivity = {
  type: string;
  count: number;
};

export type Dashboard = {
  metrics: DashboardMetrics;
  statusCounts: Record<string, number>;
  recentActivity: DashboardActivity[];
  workspaces: DashboardWorkspace[];
  recentIdeas: Idea[];
} | null;


export type StreamStatus = "online" | "offline" | "connecting";

export type ConfirmDialogState = {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  danger: boolean;
  action: (() => void | Promise<void>) | null;
};

export type VersionForm = {
  versionLabel: string;
  notes: string;
};

export type NewIdeaForm = {
  title: string;
  category: string;
  status: IdeaStatus;
};

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<number, "UserId">;
export type IdeaId = Brand<number, "IdeaId">;
export type WorkspaceId = Brand<number, "WorkspaceId">;

export type ApiErrorPayload = {
  message: string;
  code?: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: ApiErrorPayload;
  meta?: Record<string, unknown>;
};

export type IdeaFilters = {
  status: string;
  query: string;
  category: string;
};
