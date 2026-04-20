import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

export function fetchFreshQuery<TQueryFnData, TError = Error, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>
) {
  return queryClient.fetchQuery({
    ...options,
    staleTime: 0,
  });
}
