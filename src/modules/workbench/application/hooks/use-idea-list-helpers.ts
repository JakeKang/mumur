import { toMillisFromDateInput } from "@/modules/workbench/domain/workbench-utils";
import type { NavigatorPreset, WorkbenchFilters } from "@/modules/workbench/domain/workbench-types";
import {
  applyFilters,
  applyPreset,
  getCategoryOptions,
  getExplorerAuthorOptions,
  getPresetCounts,
  sortIdeas,
} from "@/modules/workbench/application/selectors/idea-selectors";
import type { Idea } from "@/shared/types";

export type IdeaListQueryFilters = {
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

export function normalizeIdeaListFilters(filters: WorkbenchFilters): IdeaListQueryFilters {
  return {
    scope: filters.scope || "all",
    workspaceId: filters.workspaceId || "",
    status: filters.status || "",
    category: filters.category || "",
    query: filters.query || "",
    priority: filters.priority || "",
    authorId: filters.authorId || "",
    participantId: filters.participantId || "",
    createdFrom: filters.createdFrom || "",
    createdTo: filters.createdTo || "",
    updatedFrom: filters.updatedFrom || "",
    updatedTo: filters.updatedTo || "",
  };
}

export function buildIdeaListSearchParams(filters: WorkbenchFilters) {
  const normalizedFilters = normalizeIdeaListFilters(filters);
  const params = new URLSearchParams();
  params.set("scope", normalizedFilters.scope);

  if (normalizedFilters.workspaceId) {
    params.set("workspaceId", normalizedFilters.workspaceId);
  }
  if (normalizedFilters.status) {
    params.set("status", normalizedFilters.status);
  }
  if (normalizedFilters.category) {
    params.set("category", normalizedFilters.category);
  }
  if (normalizedFilters.query) {
    params.set("query", normalizedFilters.query);
  }
  if (normalizedFilters.priority) {
    params.set("priority", normalizedFilters.priority);
  }
  if (normalizedFilters.authorId) {
    params.set("authorId", normalizedFilters.authorId);
  }
  if (normalizedFilters.participantId) {
    params.set("participantId", normalizedFilters.participantId);
  }

  const createdFrom = toMillisFromDateInput(normalizedFilters.createdFrom, false);
  const createdTo = toMillisFromDateInput(normalizedFilters.createdTo, true);
  const updatedFrom = toMillisFromDateInput(normalizedFilters.updatedFrom, false);
  const updatedTo = toMillisFromDateInput(normalizedFilters.updatedTo, true);

  if (createdFrom) {
    params.set("createdFrom", String(createdFrom));
  }
  if (createdTo) {
    params.set("createdTo", String(createdTo));
  }
  if (updatedFrom) {
    params.set("updatedFrom", String(updatedFrom));
  }
  if (updatedTo) {
    params.set("updatedTo", String(updatedTo));
  }

  return params;
}

export function deriveIdeaListState(
  ideas: Idea[],
  filters: WorkbenchFilters,
  navigatorSort: string,
  navigatorPreset: NavigatorPreset
) {
  const sortedIdeas = sortIdeas(ideas, navigatorSort);
  const presetIdeas = applyPreset(sortedIdeas, navigatorPreset);

  return {
    sortedIdeas,
    presetIdeas,
    presetCounts: getPresetCounts(sortedIdeas),
    categoryOptions: getCategoryOptions(ideas),
    explorerAuthorOptions: getExplorerAuthorOptions(ideas),
    sideIdeas: applyFilters(presetIdeas, filters),
  };
}

export function applyQuickStatusToggle(filters: WorkbenchFilters, status: string): WorkbenchFilters {
  return {
    ...filters,
    status: filters.status === status ? "" : status,
  };
}
