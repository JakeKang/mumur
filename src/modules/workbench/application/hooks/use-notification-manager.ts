import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workbenchQueryKeys } from "@/modules/workbench/application/workbench-query-keys";
import { fetchFreshQuery } from "@/modules/workbench/application/query-client-utils";
import { getWorkbenchRealtimeClient } from "@/modules/workbench/application/workbench-realtime-client";
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

function matchesRealtimeNotificationFilters(notification: Notification, filters: NotificationFilters) {
  if (filters.eventType && notification.type !== filters.eventType) {
    return false;
  }
  if (filters.unreadOnly && notification.read) {
    return false;
  }
  if (filters.mentionsOnly && notification.type !== "mention.created") {
    return false;
  }
  return true;
}

export function useNotificationManager({ api, authed, activeWorkspaceId }: UseNotificationManagerParams) {
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationFilters, setNotificationFilters] = useState<NotificationFilters>(DEFAULT_NOTIFICATION_FILTERS);
  const [mutedTypes, setMutedTypes] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const realtimeClientRef = useRef(getWorkbenchRealtimeClient());
  const utilityTriggerRef = useRef<HTMLButtonElement | null>(null);

  const notificationsQueryKey = useMemo(
    () => workbenchQueryKeys.notifications(notificationFilters),
    [notificationFilters]
  );

  const fetchNotifications = useCallback(async () => {
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
    return workbenchApi.getNotifications(api, params.toString());
  }, [api, notificationFilters]);

  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    enabled: authed && Boolean(activeWorkspaceId),
  });

  const preferencesQuery = useQuery({
    queryKey: workbenchQueryKeys.notificationPreferences,
    queryFn: () => workbenchApi.getNotificationPreferences(api),
    enabled: authed && Boolean(activeWorkspaceId),
  });

  const notifications = notificationsQuery.data?.notifications || [];
  const unreadCount = notificationsQuery.data?.unreadCount || 0;

  const incomingMutedTypes = preferencesQuery.data?.mutedTypes;
  useEffect(() => {
    if (incomingMutedTypes) {
      queueMicrotask(() => setMutedTypes(incomingMutedTypes));
    }
  }, [incomingMutedTypes]);

  const disconnectStream = useCallback(() => {
    realtimeClientRef.current.release();
  }, []);

  const pushNotification = useCallback((notification: Notification) => {
    if (mutedTypes.includes(notification.type)) {
      return;
    }
    if (!matchesRealtimeNotificationFilters(notification, notificationFilters)) {
      return;
    }
    queryClient.setQueryData(notificationsQueryKey, (current: { notifications?: Notification[]; unreadCount?: number } | undefined) => {
      const existing = current || { notifications: [], unreadCount: 0 };
      if ((existing.notifications || []).some((item) => item.id === notification.id)) {
        return existing;
      }
      return {
        ...existing,
        notifications: [notification, ...(existing.notifications || [])].slice(0, 50),
        unreadCount: notification.read ? (existing.unreadCount || 0) : (existing.unreadCount || 0) + 1,
      };
    });
  }, [mutedTypes, notificationFilters, notificationsQueryKey, queryClient]);

  const connectStream = useCallback(() => {
    if (!authed || !activeWorkspaceId) {
      return;
    }
    realtimeClientRef.current.retain();
  }, [activeWorkspaceId, authed]);

  useEffect(() => {
    if (!authed || !activeWorkspaceId) {
      return;
    }
    const unsubscribeNotification = realtimeClientRef.current.subscribe("notification", (payload) => {
      if (payload) {
        pushNotification(payload as Notification);
      }
    });
    return () => {
      unsubscribeNotification();
    };
  }, [activeWorkspaceId, authed, pushNotification]);

  const loadNotifications = useCallback(async () => {
    await fetchFreshQuery(queryClient, { queryKey: notificationsQueryKey, queryFn: fetchNotifications });
  }, [fetchNotifications, notificationsQueryKey, queryClient]);

  const loadNotificationPreferences = useCallback(async () => {
    await fetchFreshQuery(queryClient, {
      queryKey: workbenchQueryKeys.notificationPreferences,
      queryFn: () => workbenchApi.getNotificationPreferences(api),
    });
  }, [api, queryClient]);

  const markNotificationRead = useCallback(async (notificationId: number) => {
    await workbenchApi.markNotificationRead(api, Number(notificationId));
    queryClient.setQueryData(notificationsQueryKey, (current: { notifications?: Notification[]; unreadCount?: number } | undefined) => {
      if (!current) {
        return current;
      }
      const wasUnread = (current.notifications || []).some((item) => item.id === notificationId && !item.read);
      return {
        ...current,
        notifications: (current.notifications || []).map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
        unreadCount: wasUnread ? Math.max(0, (current.unreadCount || 0) - 1) : (current.unreadCount || 0),
      };
    });
  }, [api, notificationsQueryKey, queryClient]);

  const markAllNotificationsRead = useCallback(async () => {
    await workbenchApi.markAllNotificationsRead(api);
    queryClient.setQueryData(notificationsQueryKey, (current: { notifications?: Notification[]; unreadCount?: number } | undefined) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        notifications: (current.notifications || []).map((item) => ({ ...item, read: true })),
        unreadCount: 0,
      };
    });
  }, [api, notificationsQueryKey, queryClient]);

  const saveMutedTypes = useCallback(async () => {
    const res = await workbenchApi.saveNotificationPreferences(api, mutedTypes);
    queryClient.setQueryData(workbenchQueryKeys.notificationPreferences, res);
    setMutedTypes(res.mutedTypes || []);
    await queryClient.invalidateQueries({ queryKey: ["workbench", "notifications"] });
    await loadNotifications();
  }, [api, loadNotifications, mutedTypes, queryClient]);

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
    queryClient.setQueryData(notificationsQueryKey, (current: { notifications?: Notification[]; unreadCount?: number } | undefined) => {
      if (!current) {
        return current;
      }
      const wasUnread = (current.notifications || []).some((item) => item.id === id && !item.read);
      return {
        ...current,
        notifications: (current.notifications || []).filter((item) => item.id !== id),
        unreadCount: wasUnread ? Math.max(0, (current.unreadCount || 0) - 1) : (current.unreadCount || 0),
      };
    });
  }, [notificationsQueryKey, queryClient]);

  const resetNotificationState = useCallback(() => {
    disconnectStream();
    queryClient.removeQueries({ queryKey: ["workbench", "notifications"] });
    queryClient.removeQueries({ queryKey: workbenchQueryKeys.notificationPreferences });
    setNotificationPanelOpen(false);
    setNotificationFilters(DEFAULT_NOTIFICATION_FILTERS);
    setMutedTypes([]);
  }, [disconnectStream, queryClient]);

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
