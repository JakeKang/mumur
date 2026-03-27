import { useCallback, useMemo, useState } from "react";
import type { Dashboard, Idea } from "@/shared/types";
import { DEFAULT_FILTERS } from "@/modules/workbench/domain/workbench-constants";
import { toMillisFromDateInput } from "@/modules/workbench/domain/workbench-utils";
import type { IdeaView, NavigatorPreset, WorkbenchFilters } from "@/modules/workbench/domain/workbench-types";
import {
  applyFilters,
  applyPreset,
  getCategoryOptions,
  getExplorerAuthorOptions,
  getPresetCounts,
  sortIdeas,
} from "@/modules/workbench/application/selectors/idea-selectors";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

type UseIdeaListParams = {
  api: workbenchApi.WorkbenchApiClient;
};

export function useIdeaList({ api }: UseIdeaListParams) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [filters, setFilters] = useState<WorkbenchFilters>(DEFAULT_FILTERS);
  const [ideaView, setIdeaView] = useState<IdeaView>("card");
  const [navigatorSort, setNavigatorSort] = useState("recent");
  const [navigatorPreset, setNavigatorPreset] = useState<NavigatorPreset>("all");
  const [ideas, setIdeas] = useState<Idea[]>([]);

  const sortedIdeas = useMemo(() => sortIdeas(ideas, navigatorSort), [ideas, navigatorSort]);
  const presetIdeas = useMemo(() => applyPreset(sortedIdeas, navigatorPreset), [sortedIdeas, navigatorPreset]);
  const presetCounts = useMemo(() => getPresetCounts(sortedIdeas), [sortedIdeas]);
  const categoryOptions = useMemo(() => getCategoryOptions(ideas), [ideas]);
  const explorerAuthorOptions = useMemo(() => getExplorerAuthorOptions(ideas), [ideas]);
  const sideIdeas = useMemo(() => applyFilters(presetIdeas, filters), [presetIdeas, filters]);

  const loadDashboard = useCallback(async () => {
    const data = await workbenchApi.getDashboardSummary(api);
    setDashboard(data);
  }, [api]);

  const loadIdeas = useCallback(
    async (nextFilters = filters) => {
      const params = new URLSearchParams();
      params.set("scope", nextFilters.scope || "all");
      if (nextFilters.workspaceId) {
        params.set("workspaceId", nextFilters.workspaceId);
      }
      if (nextFilters.status) {
        params.set("status", nextFilters.status);
      }
      if (nextFilters.category) {
        params.set("category", nextFilters.category);
      }
      if (nextFilters.query) {
        params.set("query", nextFilters.query);
      }
      if (nextFilters.priority) {
        params.set("priority", nextFilters.priority);
      }
      if (nextFilters.authorId) {
        params.set("authorId", nextFilters.authorId);
      }
      if (nextFilters.participantId) {
        params.set("participantId", nextFilters.participantId);
      }
      const createdFrom = toMillisFromDateInput(nextFilters.createdFrom, false);
      const createdTo = toMillisFromDateInput(nextFilters.createdTo, true);
      const updatedFrom = toMillisFromDateInput(nextFilters.updatedFrom, false);
      const updatedTo = toMillisFromDateInput(nextFilters.updatedTo, true);
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

      const data = await workbenchApi.getIdeas(api, params.toString());
      setIdeas(data.ideas || []);
      return data.ideas || [];
    },
    [api, filters]
  );

  const applyQuickStatusFilter = useCallback(
    async (status: string) => {
      const nextStatus = filters.status === status ? "" : status;
      const nextFilters = { ...filters, status: nextStatus };
      setFilters(nextFilters);
      await loadIdeas(nextFilters);
    },
    [filters, loadIdeas]
  );

  return {
    dashboard,
    setDashboard,
    filters,
    setFilters,
    ideaView,
    setIdeaView,
    navigatorSort,
    setNavigatorSort,
    navigatorPreset,
    setNavigatorPreset,
    ideas,
    setIdeas,
    sortedIdeas,
    presetIdeas,
    presetCounts,
    categoryOptions,
    explorerAuthorOptions,
    sideIdeas,
    loadIdeas,
    loadDashboard,
    applyQuickStatusFilter,
  };
}
