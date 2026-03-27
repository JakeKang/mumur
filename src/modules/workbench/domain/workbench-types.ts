import type { IdeaStatus } from "@/shared/types";

export type LocalSyncState = "synced" | "pending" | "syncing" | "failed";

export type WorkbenchFilters = {
  scope: string;
  workspaceId: string;
  status: string;
  query: string;
  category: string;
  priority: string;
  authorId: string;
  participantId: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
};

export type NavigatorPreset = "all" | "updatedToday" | "discussion" | "growth";

export type IdeaView = "card" | "list";

export type NewIdeaDraft = {
  title: string;
  category: string;
  status: IdeaStatus;
};
