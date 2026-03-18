

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

export type SessionTeam = {
  id: number;
  name: string;
};

export type Session = {
  user: SessionUser;
  team: SessionTeam;
} | null;


export type IdeaStatus = "seed" | "sprout" | "grow" | "harvest" | "rest";

export type Block = {
  id: string;
  type: string;
  content: string;
  checked: boolean;
};

export type Idea = {
  id: number;
  teamId: number;
  authorId: number;
  title: string;
  category: string;
  status: IdeaStatus;
  blocks: Block[];
  aiSummary: string | null;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
  reactionCount?: number;
  versionCount?: number;
  threadCount?: number;
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


export type ThreadStatus = "active" | "resolved" | "on_hold";

export type Thread = {
  id: number;
  ideaId: number;
  teamId: number;
  createdBy: number;
  title: string;
  description: string | null;
  status: ThreadStatus;
  conclusion: string | null;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
  creatorName?: string;
};

export type ThreadComment = {
  id: number;
  threadId: number;
  userId: number;
  content: string;
  createdAt: number;
  userName?: string;
};

export type ThreadForm = {
  title: string;
  description: string;
  status: ThreadStatus;
};

export type ThreadEdit = {
  title: string;
  description: string;
  status: ThreadStatus;
  conclusion: string;
};


export type VoteType = "binary" | "score";

export type BinaryVotes = {
  approve: number;
  reject: number;
  total: number;
};

export type ScoreDistribution = { score: number; count: number };

export type ScoreVotes = {
  average: number;
  total: number;
  distribution: ScoreDistribution[];
};

export type Votes = {
  binary: BinaryVotes;
  score: ScoreVotes;
  mine: { binary: number | null; score: number | null };
};

export type Reaction = {
  id: number;
  ideaId: number;
  userId: number;
  emoji: string;
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
  teamId: number;
  ideaId: number | null;
  userId: number | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
  actorName?: string;
};


export type TeamRole = "owner" | "member";

export type TeamMember = {
  userId: number;
  teamId: number;
  name: string;
  email: string;
  role: TeamRole;
  createdAt: number;
};

export type TeamInvitation = {
  id: number;
  teamId: number;
  email: string;
  role: TeamRole;
  status: "pending" | "accepted" | "canceled";
  message: string | null;
  invitedBy: number;
  invitedByName?: string;
  createdAt: number;
  updatedAt: number;
};

export type TeamMe = {
  userId: number | null;
  isOwner: boolean;
};

export type UserTeam = {
  id: number;
  name: string;
  active?: boolean;
};

export type TeamMemberForm = {
  email: string;
  role: TeamRole;
};


export type Notification = {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  createdAt: number;
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
  byStatus: Record<string, number>;
  activeMembers: number;
  recentActivity: number;
};

export type Dashboard = {
  metrics: DashboardMetrics;
  recentIdeas: Idea[];
} | null;


export type StreamStatus = "online" | "offline" | "connecting";

export type ConfirmDialogState = {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  danger: boolean;
  action: (() => void) | null;
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

export type IdeaFilters = {
  status: string;
  query: string;
  category: string;
};
