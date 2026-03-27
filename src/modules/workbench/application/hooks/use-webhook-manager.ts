import { useCallback, useState } from "react";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import type { Webhook, WebhookForm, WorkspaceMe } from "@/shared/types";

type UseWebhookManagerParams = {
  api: workbenchApi.WorkbenchApiClient;
  teamMe: WorkspaceMe;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  loadNotifications: () => Promise<void>;
};

export function useWebhookManager({ api, teamMe, setBusy, setError, loadNotifications }: UseWebhookManagerParams) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhookForm, setWebhookForm] = useState<WebhookForm>({ platform: "slack", webhookUrl: "", enabled: false });

  const loadWebhooks = useCallback(async () => {
    const webhookRes = await workbenchApi.getWebhooks(api);
    setWebhooks(webhookRes.webhooks || []);
  }, [api]);

  const handleSaveWebhook = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
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
      await loadWebhooks();
      await loadNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "웹훅 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }, [api, loadNotifications, loadWebhooks, setBusy, setError, teamMe, webhookForm]);

  return {
    webhooks,
    webhookForm,
    setWebhookForm,
    loadWebhooks,
    handleSaveWebhook,
  };
}
