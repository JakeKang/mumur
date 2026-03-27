import { GROWTH_PRESET_STATUSES } from "@/features/ideas/constants/idea-status";
import type { WorkbenchFilters, NavigatorPreset } from "@/modules/workbench/domain/workbench-types";

type IdeaLike = {
  id: number;
  status?: string;
  title?: string;
  category?: string;
  authorName?: string;
  workspaceName?: string;
  workspaceId?: number;
  teamId?: number;
  updatedAt?: number;
  createdAt?: number;
  commentCount?: number;
  reactionCount?: number;
  versionCount?: number;
  priorityLevel?: string;
  authorId?: number;
  participantIds?: number[];
};

export function sortIdeas<T extends IdeaLike>(ideas: T[], navigatorSort: string): T[] {
  const next = [...ideas];
  if (navigatorSort === "comments") {
    next.sort((a, b) => Number(b.commentCount || 0) - Number(a.commentCount || 0));
  } else if (navigatorSort === "reactions") {
    next.sort((a, b) => Number(b.reactionCount || 0) - Number(a.reactionCount || 0));
  } else if (navigatorSort === "versions") {
    next.sort((a, b) => Number(b.versionCount || 0) - Number(a.versionCount || 0));
  } else if (navigatorSort === "title") {
    next.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  } else {
    next.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  }
  return next;
}

export function applyPreset<T extends IdeaLike>(ideas: T[], preset: NavigatorPreset): T[] {
  if (preset === "updatedToday") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return ideas.filter((idea) => Number(idea.updatedAt || 0) >= start.getTime());
  }
  if (preset === "discussion") {
    return ideas.filter((idea) => Number(idea.commentCount || 0) > 0);
  }
  if (preset === "growth") {
    return ideas.filter((idea) => GROWTH_PRESET_STATUSES.includes(String(idea.status || "") as never));
  }
  return ideas;
}

export function getPresetCounts<T extends IdeaLike>(ideas: T[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return {
    all: ideas.length,
    updatedToday: ideas.filter((idea) => Number(idea.updatedAt || 0) >= start.getTime()).length,
    discussion: ideas.filter((idea) => Number(idea.commentCount || 0) > 0).length,
    growth: ideas.filter((idea) => GROWTH_PRESET_STATUSES.includes(String(idea.status || "") as never)).length,
  };
}

export function getCategoryOptions<T extends IdeaLike>(ideas: T[]) {
  const ranked = ["product", "tech", "growth", "ops", "qa"];
  const dynamic = [...new Set(ideas.map((idea) => String(idea.category || "").trim()).filter(Boolean))];
  return [...new Set([...ranked, ...dynamic])];
}

export function getExplorerAuthorOptions<T extends IdeaLike>(ideas: T[]) {
  const byId = new Map<number, { id: number; name: string }>();
  ideas.forEach((idea) => {
    const authorId = Number(idea.authorId);
    if (!Number.isInteger(authorId) || authorId <= 0) {
      return;
    }
    if (!byId.has(authorId)) {
      byId.set(authorId, { id: authorId, name: String(idea.authorName || `사용자 ${authorId}`) });
    }
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function applyFilters<T extends IdeaLike>(ideas: T[], filters: WorkbenchFilters): T[] {
  return ideas.filter((idea) => {
    if (filters.workspaceId && Number(idea.teamId || idea.workspaceId || 0) !== Number(filters.workspaceId)) {
      return false;
    }
    if (filters.status && idea.status !== filters.status) {
      return false;
    }
    if (filters.category && idea.category !== filters.category) {
      return false;
    }
    if (filters.priority && String(idea.priorityLevel || "") !== String(filters.priority)) {
      return false;
    }
    if (filters.authorId && Number(idea.authorId || 0) !== Number(filters.authorId)) {
      return false;
    }
    if (filters.participantId) {
      const participantId = Number(filters.participantId);
      const participants = Array.isArray(idea.participantIds) ? idea.participantIds : [];
      if (!participants.includes(participantId) && Number(idea.authorId || 0) !== participantId) {
        return false;
      }
    }
    if (filters.query) {
      const query = String(filters.query).toLowerCase();
      return (
        String(idea.title || "").toLowerCase().includes(query) ||
        String(idea.category || "").toLowerCase().includes(query) ||
        String(idea.authorName || "").toLowerCase().includes(query) ||
        String(idea.workspaceName || "").toLowerCase().includes(query)
      );
    }
    return true;
  });
}
