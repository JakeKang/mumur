import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import type { Dashboard, Idea } from "@/shared/types";
import { DEFAULT_FILTERS } from "@/modules/workbench/domain/workbench-constants";
import type { IdeaView, NavigatorPreset, WorkbenchFilters } from "@/modules/workbench/domain/workbench-types";
import {
  applyQuickStatusToggle,
  buildIdeaListSearchParams,
  deriveIdeaListState,
  type IdeaListQueryFilters,
  normalizeIdeaListFilters,
} from "@/modules/workbench/application/hooks/use-idea-list-helpers";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";

type UseIdeaListParams = {
  api: workbenchApi.WorkbenchApiClient;
  enabled?: boolean;
};

type IdeasQueryResponse = {
  ideas: Idea[];
};

function ideasQueryKey(filters: IdeaListQueryFilters) {
  return [
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
  ] as const;
}

export function useIdeaList({ api, enabled = true }: UseIdeaListParams) {
  const [filters, setFilters] = useState<WorkbenchFilters>(DEFAULT_FILTERS);
  const [ideaView, setIdeaView] = useState<IdeaView>("card");
  const [navigatorSort, setNavigatorSort] = useState("recent");
  const [navigatorPreset, setNavigatorPreset] = useState<NavigatorPreset>("all");
  const queryClient = useQueryClient();
  const normalizedIdeaFilters = useMemo(() => normalizeIdeaListFilters(filters), [filters]);

  const fetchDashboard = useCallback(() => workbenchApi.getDashboardSummary(api), [api]);
  const dashboardQuery = useQuery<Dashboard>({
    queryKey: workbenchQueryKeys.dashboard,
    queryFn: fetchDashboard,
    enabled,
  });
  const dashboard = dashboardQuery.data ?? null;

  const fetchIdeas = useCallback(async (nextFilters = filters): Promise<IdeasQueryResponse> => {
    return workbenchApi.getIdeas(api, buildIdeaListSearchParams(nextFilters).toString());
  }, [api, filters]);

  const ideasQuery = useQuery<IdeasQueryResponse>({
    queryKey: ideasQueryKey(normalizedIdeaFilters),
    queryFn: () => fetchIdeas(filters),
    enabled,
  });

  const ideas = useMemo(() => ideasQuery.data?.ideas ?? [], [ideasQuery.data?.ideas]);
  const { sortedIdeas, presetIdeas, presetCounts, categoryOptions, explorerAuthorOptions, sideIdeas } = useMemo(
    () => deriveIdeaListState(ideas, filters, navigatorSort, navigatorPreset),
    [filters, ideas, navigatorPreset, navigatorSort]
  );

  const loadDashboard = useCallback(async () => {
    return fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.dashboard,
      queryFn: fetchDashboard,
    });
  }, [fetchDashboard, queryClient]);

  const loadIdeas = useCallback(
    async (nextFilters = filters) => {
      const normalizedNextFilters = normalizeIdeaListFilters(nextFilters);
      const data = await fetchFreshQuery<IdeasQueryResponse>(queryClient, {
        queryKey: ideasQueryKey(normalizedNextFilters),
        queryFn: () => fetchIdeas(nextFilters),
      });
      return data.ideas || [];
    },
    [fetchIdeas, filters, queryClient]
  );

  const setIdeas = useCallback((value: React.SetStateAction<Idea[]>) => {
    queryClient.setQueryData<IdeasQueryResponse>(ideasQueryKey(normalizedIdeaFilters), (current) => {
      const previousIdeas = current?.ideas || [];
      const nextIdeas = typeof value === "function"
        ? (value as (prev: Idea[]) => Idea[])(previousIdeas)
        : value;
      return {
        ...(current || {}),
        ideas: nextIdeas,
      };
    });
  }, [normalizedIdeaFilters, queryClient]);

  const applyQuickStatusFilter = useCallback(
    async (status: string) => {
      const nextFilters = applyQuickStatusToggle(filters, status);
      setFilters(nextFilters);
      await loadIdeas(nextFilters);
    },
    [filters, loadIdeas]
  );

  return {
    dashboard,
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
