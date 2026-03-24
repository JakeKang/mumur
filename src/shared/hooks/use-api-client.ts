import { ApiError, apiRequest } from "@/shared/lib/api-client";

export { ApiError, apiRequest };

export function useApiClient() {
  return apiRequest;
}
