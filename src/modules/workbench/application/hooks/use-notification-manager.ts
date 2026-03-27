import { useCallback, useEffect, useRef, useState } from "react";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import type { Notification } from "@/shared/types";

type NotificationFilters = {
  eventType: string;
  unreadOnly: boolean;
  excludeMuted: boolean;
  mentionsOnly: boolean;
};

const DEFAULT_NOTIFICATION_FILTERS: NotificationFilters = {
  eventType: "",
  unreadOnly: false,
  excludeMuted: true,
  mentionsOnly: false,
};

type UseNotificationManagerParams = {
  api: workbenchApi.WorkbenchApiClient;
  authed: boolean;
  activeWorkspaceId: number | null;
};

export function useNotificationManager({ api, authed, activeWorkspaceId }: UseNotificationManagerParams) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationFilters, setNotificationFilters] = useState<NotificationFilters>(DEFAULT_NOTIFICATION_FILTERS);
  const [mutedTypes, setMutedTypes] = useState<string[]>([]);

  const streamRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTryRef = useRef(0);
  const utilityTriggerRef = useRef<HTMLButtonElement | null>(null);

  const disconnectStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectTryRef.current = 0;
  }, []);

  const pushNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => {
      if (prev.some((item) => item.id === notification.id)) {
        return prev;
      }
      return [notification, ...prev].slice(0, 50);
    });
    if (!notification.read) {
      setUnreadCount((prev) => prev + 1);
    }
  }, []);

  const connectStream = useCallback(() => {
    disconnectStream();
    if (!authed || !activeWorkspaceId) {
      return;
    }

    const open = () => {
      if (!authed) {
        return;
      }

      const source = new EventSource("/api/notifications/stream");
      streamRef.current = source;

      source.addEventListener("connected", () => {
        reconnectTryRef.current = 0;
      });

      source.addEventListener("notification", (event) => {
        const payload = JSON.parse(event.data);
        pushNotification(payload);
      });

      source.onerror = () => {
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
        if (!authed) {
          return;
        }
        const delay = Math.min(30000, 1000 * 2 ** reconnectTryRef.current);
        reconnectTryRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          open();
        }, delay);
      };
    };

    open();
  }, [activeWorkspaceId, authed, disconnectStream, pushNotification]);

  const loadNotifications = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (notificationFilters.eventType) {
      params.set("eventType", notificationFilters.eventType);
    }
    if (notificationFilters.unreadOnly) {
      params.set("unreadOnly", "true");
    }
    if (notificationFilters.excludeMuted) {
      params.set("excludeMuted", "true");
    }
    if (notificationFilters.mentionsOnly) {
      params.set("mentionsOnly", "true");
    }
    const data = await workbenchApi.getNotifications(api, params.toString());
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  }, [api, notificationFilters]);

  const loadNotificationPreferences = useCallback(async () => {
    const data = await workbenchApi.getNotificationPreferences(api);
    setMutedTypes(data.mutedTypes || []);
  }, [api]);

  const markNotificationRead = useCallback(async (notificationId: number) => {
    await workbenchApi.markNotificationRead(api, Number(notificationId));
    setNotifications((prev) => prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [api]);

  const markAllNotificationsRead = useCallback(async () => {
    await workbenchApi.markAllNotificationsRead(api);
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
  }, [api]);

  const saveMutedTypes = useCallback(async () => {
    const res = await workbenchApi.saveNotificationPreferences(api, mutedTypes);
    setMutedTypes(res.mutedTypes || []);
    await loadNotifications();
  }, [api, loadNotifications, mutedTypes]);

  const toggleMutedType = useCallback((value: string) => {
    setMutedTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }, []);

  const openUtilityPanel = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    utilityTriggerRef.current = event.currentTarget;
    setNotificationPanelOpen(true);
  }, []);

  const closeUtilityPanel = useCallback(() => {
    setNotificationPanelOpen(false);
    if (utilityTriggerRef.current && typeof utilityTriggerRef.current.focus === "function") {
      utilityTriggerRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!notificationPanelOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeUtilityPanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notificationPanelOpen, closeUtilityPanel]);

  const deleteNotification = useCallback((id: number) => {
    const wasUnread = notifications.find((n) => n.id === id && !n.read);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, [notifications]);

  const resetNotificationState = useCallback(() => {
    disconnectStream();
    setNotifications([]);
    setUnreadCount(0);
    setNotificationPanelOpen(false);
    setNotificationFilters(DEFAULT_NOTIFICATION_FILTERS);
    setMutedTypes([]);
  }, [disconnectStream]);

  return {
    notifications,
    unreadCount,
    notificationPanelOpen,
    notificationFilters,
    setNotificationFilters,
    mutedTypes,
    loadNotifications,
    loadNotificationPreferences,
    markNotificationRead,
    markAllNotificationsRead,
    saveMutedTypes,
    toggleMutedType,
    openUtilityPanel,
    closeUtilityPanel,
    connectStream,
    disconnectStream,
    deleteNotification,
    pushNotification,
    resetNotificationState,
  };
}
