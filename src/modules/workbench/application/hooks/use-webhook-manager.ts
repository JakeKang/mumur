import { useCallback, useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import type { WebhookForm, WorkspaceMe } from "@/shared/types";

type UseWebhookManagerParams = {
  api: workbenchApi.WorkbenchApiClient;
  enabled?: boolean;
  teamMe: WorkspaceMe;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  loadNotifications: () => Promise<void>;
};

type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

export function useWebhookManager({ api, enabled = true, teamMe, setBusy, setError, loadNotifications }: UseWebhookManagerParams) {
  const [webhookForm, setWebhookForm] = useState<WebhookForm>({ platform: "slack", webhookUrl: "", enabled: false });
  const queryClient = useQueryClient();

  const fetchWebhooks = useCallback(() => workbenchApi.getWebhooks(api), [api]);
  const webhooksQuery = useQuery({
    queryKey: workbenchQueryKeys.webhooks,
    queryFn: fetchWebhooks,
    enabled,
  });
  const webhooks = webhooksQuery.data?.webhooks || [];

  const loadWebhooks = useCallback(async () => {
    await fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.webhooks,
      queryFn: fetchWebhooks,
    });
  }, [fetchWebhooks, queryClient]);

  const handleSaveWebhook = useCallback(async (event: FormSubmitEvent) => {
    event.preventDefault();
    const canManageWebhooks = Boolean(teamMe?.isOwner || teamMe?.role === "admin" || teamMe?.role === "owner");
    if (!canManageWebhooks) {
      setError("admin 권한에서만 웹훅을 수정할 수 있습니다");
      return;
    }
    if (!webhookForm.webhookUrl.trim()) {
      return;
    }
    setBusy(true);
    try {
      await workbenchApi.saveWebhook(api, webhookForm.platform, webhookForm);
      await queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.webhooks });
      await loadWebhooks();
      await loadNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "웹훅 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadNotifications, loadWebhooks, queryClient, setBusy, setError, teamMe, webhookForm]);

  return {
    webhooks,
    webhookForm,
    setWebhookForm,
    loadWebhooks,
    handleSaveWebhook,
  };
}
