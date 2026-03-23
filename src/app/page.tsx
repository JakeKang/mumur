"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContextPanel } from "@/components/shell/context-panel";
import { IdeaCreateDialog } from "@/components/shell/idea-create-dialog";
import { IdeaStudioPanel } from "@/components/shell/idea-studio-panel";
import { MumurNavigationSidebar } from "@/components/shell/mumur-navigation-sidebar";
import { DashboardSurface, IdeasSurface, TeamSurface } from "@/components/shell/workspace-pages";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GROWTH_PRESET_STATUSES, IDEA_STATUS, STATUS_META } from "@/lib/idea-status";
import { dequeueIdeaSync, enqueueIdeaSync, listIdeaSyncQueue, loadIdeaDraft, removeIdeaDraft, saveIdeaDraft } from "@/lib/local-first";
import type { WorkspaceMe, WorkspaceRole } from "@/types";
import { AlertCircle, Bell, Check, Loader2, LogOut, Plus, RefreshCw } from "lucide-react";

const NOTIFICATION_TYPES = [
  "mention.created",
  "comment.created",
  "version.created",
  "version.restored",
  "integration.webhook.updated"
];

type LocalSyncState = "synced" | "pending" | "syncing" | "failed";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    },
    ...options
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(json.error || "요청 처리에 실패했습니다", response.status);
  }
  return json;
}

function blockSeed(type = "paragraph") {
  return {
    id: `block-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    type,
    content: "",
    checked: false
  };
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function toMillisFromDateInput(value: string, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const date = endOfDay ? new Date(`${raw}T23:59:59.999`) : new Date(`${raw}T00:00:00.000`);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function syncStateLabel(state: LocalSyncState) {
  if (state === "pending") {
    return "저장 대기";
  }
  if (state === "syncing") {
    return "저장 중...";
  }
  if (state === "failed") {
    return "저장 실패";
  }
  return "저장됨";
}

export default function HomePage() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [createIdeaDialogOpen, setCreateIdeaDialogOpen] = useState(false);

  const [session, setSession] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", teamName: "" });

  const [filters, setFilters] = useState({
    scope: "all",
    workspaceId: "",
    status: "",
    query: "",
    category: "",
    priority: "",
    authorId: "",
    participantId: "",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: ""
  });
  const [ideaView, setIdeaView] = useState("card");
  const [navigatorSort, setNavigatorSort] = useState("recent");
  const [navigatorPreset, setNavigatorPreset] = useState("all");
  const [studioTab, setStudioTab] = useState("editor");
  const [newIdeaForm, setNewIdeaForm] = useState<{ title: string; category: string; status: import("@/types").IdeaStatus }>({ title: "", category: "", status: "seed" });
  const [ideas, setIdeas] = useState([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [detailNotFound, setDetailNotFound] = useState<{ ideaId: string; message: string } | null>(null);

  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBlockId, setCommentBlockId] = useState("");
  const [commentFilterBlockId, setCommentFilterBlockId] = useState("");

  const [reactions, setReactions] = useState({ reactions: [], mine: [] });
  const [reactionsByTarget, setReactionsByTarget] = useState<Record<string, { reactions: Array<{ emoji: string; count: number }>; mine: string[] }>>({});

  const [versions, setVersions] = useState([]);
  const [versionForm, setVersionForm] = useState({ versionLabel: "", notes: "" });
  const [versionFile, setVersionFile] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationFilters, setNotificationFilters] = useState({
    eventType: "",
    unreadOnly: false,
    excludeMuted: true,
    mentionsOnly: false
  });
  const [mutedTypes, setMutedTypes] = useState([]);

  const [webhooks, setWebhooks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [teamMemberForm, setTeamMemberForm] = useState({ email: "", role: "editor" });
  const [teamMe, setTeamMe] = useState<WorkspaceMe>({ userId: null, isOwner: false, role: null });
  const [teamInvitations, setTeamInvitations] = useState([]);
  const [teamInvitationMessage, setTeamInvitationMessage] = useState("");
  const [webhookForm, setWebhookForm] = useState({ platform: "slack", webhookUrl: "", enabled: false });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    confirmText: "확인",
    danger: false,
    action: null
  });
  const [localSyncState, setLocalSyncState] = useState<LocalSyncState>("synced");
  const [syncBadgeVisible, setSyncBadgeVisible] = useState(false);
  const [syncBadgeFading, setSyncBadgeFading] = useState(false);

  const streamRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectTryRef = useRef(0);
  const bootstrapRef = useRef(null);
  const utilityTriggerRef = useRef(null);

  const authed = useMemo(() => Boolean(session?.user), [session]);
  const activeWorkspaceId = Number(session?.workspace?.id) || null;

  const sortedIdeas = useMemo(() => {
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
  }, [ideas, navigatorSort]);

  const presetIdeas = useMemo(() => {
    if (navigatorPreset === "updatedToday") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return sortedIdeas.filter((idea) => Number(idea.updatedAt || 0) >= start.getTime());
    }
    if (navigatorPreset === "discussion") {
      return sortedIdeas.filter((idea) => Number(idea.commentCount || 0) > 0);
    }
    if (navigatorPreset === "growth") {
      return sortedIdeas.filter((idea) => GROWTH_PRESET_STATUSES.includes(idea.status));
    }
    return sortedIdeas;
  }, [navigatorPreset, sortedIdeas]);

  const presetCounts = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return {
      all: sortedIdeas.length,
      updatedToday: sortedIdeas.filter((idea) => Number(idea.updatedAt || 0) >= start.getTime()).length,
      discussion: sortedIdeas.filter((idea) => Number(idea.commentCount || 0) > 0).length,
      growth: sortedIdeas.filter((idea) => GROWTH_PRESET_STATUSES.includes(idea.status)).length
    };
  }, [sortedIdeas]);

  const categoryOptions = useMemo(() => {
    const ranked = ["product", "tech", "growth", "ops", "qa"];
    const dynamic = [...new Set(ideas.map((idea) => String(idea.category || "").trim()).filter(Boolean))];
    return [...new Set([...ranked, ...dynamic])];
  }, [ideas]);

  const explorerAuthorOptions = useMemo(() => {
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
  }, [ideas]);

  const sideIdeas = useMemo(() => {
    return presetIdeas.filter((idea) => {
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
  }, [presetIdeas, filters]);

  const disconnectStream = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    reconnectTryRef.current = 0;
  }, []);

  const pushNotification = useCallback((notification) => {
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

  const loadDashboard = useCallback(async () => {
    const data = await api("/api/dashboard/summary");
    setDashboard(data);
  }, []);

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
    const data = await api(`/api/notifications?${params.toString()}`);
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  }, [notificationFilters]);

  const loadNotificationPreferences = useCallback(async () => {
    const data = await api("/api/notifications/preferences");
    setMutedTypes(data.mutedTypes || []);
  }, []);

  const loadWebhooks = useCallback(async () => {
    const webhookRes = await api("/api/integrations/webhooks");
    setWebhooks(webhookRes.webhooks || []);
  }, []);

  const loadTeamMembers = useCallback(async () => {
    const data = await api("/api/workspace/members");
    setTeamMembers(data.members || []);
    setTeamMe(data.me || { userId: null, isOwner: false, role: null });
  }, []);

  const loadUserTeams = useCallback(async () => {
    const data = await api("/api/workspaces");
    setUserTeams(data.workspaces || []);
  }, []);

  const loadTeamInvitations = useCallback(async () => {
    const data = await api("/api/workspace/invitations");
    setTeamInvitations(data.invitations || []);
  }, []);

  const addTeamMember = useCallback(async (event) => {
    event.preventDefault();
    const payload = {
      email: teamMemberForm.email,
      role: teamMemberForm.role
    };
    const data = await api("/api/workspace/invitations", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setTeamInvitationMessage(data.invitation?.message || "초대 처리 완료");
    setTeamMemberForm({ email: "", role: "editor" });
    await Promise.all([loadTeamMembers(), loadTeamInvitations()]);
  }, [loadTeamInvitations, loadTeamMembers, teamMemberForm]);

  const updateTeamMemberRole = useCallback(async (userId, role) => {
    await api(`/api/workspace/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role })
    });
    await loadTeamMembers();
  }, [loadTeamMembers]);

  const removeTeamMember = useCallback(async (userId) => {
    await api(`/api/workspace/members/${userId}`, { method: "DELETE" });
    await loadTeamMembers();
  }, [loadTeamMembers]);

  const retryTeamInvitation = useCallback(async (invitationId) => {
    const data = await api(`/api/workspace/invitations/${invitationId}/retry`, { method: "POST" });
    setTeamInvitationMessage(data.invitation?.message || "재시도 완료");
    await Promise.all([loadTeamMembers(), loadTeamInvitations()]);
  }, [loadTeamInvitations, loadTeamMembers]);

  const cancelTeamInvitation = useCallback(async (invitationId) => {
    await api(`/api/workspace/invitations/${invitationId}`, { method: "DELETE" });
    await loadTeamInvitations();
  }, [loadTeamInvitations]);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false, action: null }));
  }, []);

  const confirmDialogAction = useCallback(async () => {
    const action = confirmDialog.action;
    closeConfirmDialog();
    if (!action) {
      return;
    }
    try {
      await action();
    } catch (err) {
      setError(err.message || "요청 처리에 실패했습니다");
    }
  }, [closeConfirmDialog, confirmDialog.action]);

  const requestRemoveTeamMember = useCallback(
    (member) => {
      setConfirmDialog({
        open: true,
        title: "멤버를 제거할까요?",
        description: `${member.name || "멤버"} (${member.email || "-"})를 팀에서 제거합니다.`,
        confirmText: "제거",
        danger: true,
        action: async () => removeTeamMember(member.userId)
      });
    },
    [removeTeamMember]
  );

  const requestCancelInvitation = useCallback(
    (invite) => {
      setConfirmDialog({
        open: true,
        title: "초대를 취소할까요?",
        description: `${invite.email || "해당 사용자"}에게 보낸 초대를 취소합니다.`,
        confirmText: "취소하기",
        danger: true,
        action: async () => cancelTeamInvitation(invite.id)
      });
    },
    [cancelTeamInvitation]
  );

  const loadIdeas = useCallback(async (nextFilters = filters) => {
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

    const data = await api(`/api/ideas?${params.toString()}`);
    setIdeas(data.ideas || []);
    return data.ideas || [];
  }, [filters]);

  const loadReactionTargets = useCallback(async (ideaId, targets: Array<{ targetType: string; targetId: string }>) => {
    const uniq = Array.from(
      new Map(
        targets
          .filter((item) => item.targetType && item.targetId)
          .map((item) => [`${item.targetType}:${item.targetId}`, item])
      ).values()
    );
    if (!uniq.length) {
      return;
    }
    const rows = await Promise.all(
      uniq.map(async ({ targetType, targetId }) => {
        const data = await api(`/api/ideas/${ideaId}/reactions?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`);
        return { key: `${targetType}:${targetId}`, data };
      })
    );
    setReactionsByTarget((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[row.key] = {
          reactions: row.data.reactions || [],
          mine: row.data.mine || []
        };
      });
      return next;
    });
  }, []);

  const applyQuickStatusFilter = useCallback(
    async (status) => {
      const nextStatus = filters.status === status ? "" : status;
      const nextFilters = { ...filters, status: nextStatus };
      setFilters(nextFilters);
      await loadIdeas(nextFilters);
    },
    [filters, loadIdeas]
  );

  const loadIdeaChildren = useCallback(
    async (ideaId, blockList: Array<{ id?: string }> | null = null) => {
      const commentsQuery = commentFilterBlockId ? `?blockId=${encodeURIComponent(commentFilterBlockId)}` : "";

      const [commentRes, reactionRes, versionRes, timelineRes] = await Promise.all([
        api(`/api/ideas/${ideaId}/comments${commentsQuery}`),
        api(`/api/ideas/${ideaId}/reactions`),
        api(`/api/ideas/${ideaId}/versions`),
        api(`/api/ideas/${ideaId}/timeline`)
      ]);

      setComments(commentRes.comments || []);
      setReactions(reactionRes || { reactions: [], mine: [] });
      setVersions(versionRes.versions || []);
      setTimeline(timelineRes.timeline || []);

      const blockTargets = (blockList || selectedIdea?.blocks || [])
        .map((block) => String(block?.id || ""))
        .filter(Boolean)
        .map((targetId) => ({ targetType: "block", targetId }));
      await loadReactionTargets(
        ideaId,
        [
          ...blockTargets,
          ...(commentRes.comments || []).map((comment) => ({ targetType: "comment", targetId: `idea:${comment.id}` }))
        ]
      );
    },
    [commentFilterBlockId, loadReactionTargets, selectedIdea?.blocks]
  );

  const selectIdea = useCallback(
    async (
      ideaId,
      options: { syncUrl?: boolean; openPage?: boolean; workspaceId?: number | null } = { syncUrl: true, openPage: true }
    ) => {
      if (options.workspaceId && Number(options.workspaceId) !== Number(session?.workspace?.id)) {
        const switched = await api("/api/workspaces/switch", {
          method: "POST",
          body: JSON.stringify({ teamId: Number(options.workspaceId) })
        });
        setSession((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            workspace: {
              id: switched?.workspace?.id,
              name: switched?.workspace?.name
            }
          };
        });
        await Promise.all([
          loadTeamMembers(),
          loadTeamInvitations(),
          loadNotifications(),
          loadDashboard(),
          loadIdeas(filters)
        ]);
      }
      let data: any;
      try {
        data = await api(`/api/ideas/${ideaId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          const targetId = String(ideaId);
          setSelectedIdeaId(targetId);
          setSelectedIdea(null);
          setComments([]);
          setVersions([]);
          setTimeline([]);
          setDetailNotFound({ ideaId: targetId, message: err.message || "아이디어를 찾을 수 없습니다" });
          if (options.openPage !== false) {
            setActivePage("detail");
          }
          if (options.syncUrl !== false && typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            params.set("idea", targetId);
            window.history.replaceState(null, "", `?${params.toString()}`);
          }
          return;
        }
        throw err;
      }
      setDetailNotFound(null);
      try {
        const draft = await loadIdeaDraft(Number(ideaId));
        if (draft && Number(draft.updatedAt || 0) > Number(data.idea.updatedAt || 0)) {
          data.idea = { ...data.idea, ...draft.payload, updatedAt: draft.updatedAt };
          setLocalSyncState("pending");
        }
      } catch {}
      setSelectedIdeaId(ideaId);
      setSelectedIdea(data.idea);
      setStudioTab("editor");
      setCreateIdeaDialogOpen(false);
      if (options.openPage !== false) {
        setActivePage("detail");
      }
      await loadIdeaChildren(ideaId, data.idea?.blocks || []);
      if (options.syncUrl !== false && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.set("idea", String(ideaId));
        window.history.replaceState(null, "", `?${params.toString()}`);
      }
    },
    [
      filters,
      loadDashboard,
      loadIdeaChildren,
      loadIdeas,
      loadNotifications,
      loadTeamInvitations,
      loadTeamMembers,
      session?.workspace?.id
    ]
  );

  const bootstrap = useCallback(async () => {
    try {
      const me = await api("/api/auth/me");
      setSession(me);

      await Promise.all([
        loadDashboard(),
        loadNotifications(),
        loadNotificationPreferences(),
        loadWebhooks(),
        loadUserTeams(),
        loadTeamMembers(),
        loadTeamInvitations()
      ]);
      const loadedIdeas = await loadIdeas();
      if (loadedIdeas.length) {
        const requestedIdea = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("idea") : null;
        if (requestedIdea) {
          const requestedExists = loadedIdeas.some((item) => String(item.id) === String(requestedIdea));
          if (requestedExists) {
            await selectIdea(requestedIdea, { syncUrl: false, openPage: true });
          } else {
            setSelectedIdeaId(String(requestedIdea));
            setSelectedIdea(null);
            setComments([]);
            setVersions([]);
            setTimeline([]);
            setDetailNotFound({ ideaId: String(requestedIdea), message: "아이디어를 찾을 수 없습니다" });
            setActivePage("detail");
          }
        } else {
          await selectIdea(loadedIdeas[0].id, { syncUrl: false, openPage: false });
          setDetailNotFound(null);
        }
      } else {
        const requestedIdea = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("idea") : null;
        setSelectedIdeaId(null);
        setSelectedIdea(null);
        setComments([]);
        setVersions([]);
        setTimeline([]);
        if (requestedIdea) {
          setSelectedIdeaId(String(requestedIdea));
          setDetailNotFound({ ideaId: String(requestedIdea), message: "아이디어를 찾을 수 없습니다" });
          setActivePage("detail");
        } else {
          setDetailNotFound(null);
        }
      }
      setError("");
      setAuthChecked(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null);
        setIdeas([]);
        setSelectedIdea(null);
        setSelectedIdeaId(null);
        setDetailNotFound(null);
        setError(err.message || "로그인이 필요합니다");
        disconnectStream();
      } else {
        setError(err instanceof Error ? err.message : "요청 처리에 실패했습니다");
      }
      setAuthChecked(true);
    }
  }, [
    disconnectStream,
    loadDashboard,
    loadIdeas,
    loadNotificationPreferences,
    loadNotifications,
    loadUserTeams,
    loadTeamMembers,
    loadTeamInvitations,
    loadWebhooks,
    selectIdea
  ]);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    if (bootstrapRef.current) {
      bootstrapRef.current();
    }
    return () => {
      disconnectStream();
    };
  }, [disconnectStream]);

  useEffect(() => {
    if (authed) {
      connectStream();
    } else {
      disconnectStream();
    }
  }, [authed, connectStream, disconnectStream]);

  useEffect(() => {
    const syncFromUrl = () => {
      if (!authed || !ideas.length || typeof window === "undefined") {
        return;
      }
      const requestedIdea = new URLSearchParams(window.location.search).get("idea");
      if (!requestedIdea) {
        if (selectedIdeaId !== null) {
          setSelectedIdeaId(null);
          setSelectedIdea(null);
        }
        return;
      }
      if (String(selectedIdeaId) === String(requestedIdea)) {
        return;
      }
      const exists = ideas.some((item) => String(item.id) === String(requestedIdea));
      if (!exists) {
        setSelectedIdeaId(String(requestedIdea));
        setSelectedIdea(null);
        setDetailNotFound({ ideaId: String(requestedIdea), message: "아이디어를 찾을 수 없습니다" });
        setActivePage("detail");
        return;
      }
      setDetailNotFound(null);
      selectIdea(requestedIdea, { syncUrl: false });
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [authed, ideas, selectIdea, selectedIdeaId]);

  useEffect(() => {
    if (!authed) {
      return;
    }
    void loadIdeas(filters);
  }, [authed, filters, loadIdeas]);

  useEffect(() => {
    if (!authChecked || authed || typeof window === "undefined") {
      return;
    }
    window.location.replace("/login");
  }, [authChecked, authed]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm)
      });
      await bootstrap();
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(registerForm)
      });
      await bootstrap();
    } catch (err) {
      setError(err.message || "회원가입에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      setSession(null);
      setIdeas([]);
      setSelectedIdea(null);
      setSelectedIdeaId(null);
      setDetailNotFound(null);
      setCreateIdeaDialogOpen(false);
      setTeamMembers([]);
      setUserTeams([]);
      setTeamMe({ userId: null, isOwner: false, role: null });
      setTeamInvitations([]);
      setTeamInvitationMessage("");
      setNotifications([]);
      setUnreadCount(0);
      setActivePage("dashboard");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/");
      }
      disconnectStream();
    } catch (err) {
      setError(err.message || "로그아웃에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateIdea = async (event) => {
    event.preventDefault();
    if (!newIdeaForm.title.trim()) {
      return;
    }
    setBusy(true);
    try {
      const created = await api("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          ...newIdeaForm,
          blocks: [blockSeed()]
        })
      });
      setNewIdeaForm({ title: "", category: "", status: "seed" });
      await loadIdeas();
      await selectIdea(created.idea.id);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "아이디어 생성에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const updateSelectedIdeaField = (field, value) => {
    setSelectedIdea((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const drainIdeaSyncQueue = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.onLine) {
      return;
    }

    let queue = [];
    try {
      queue = await listIdeaSyncQueue();
    } catch {
      setLocalSyncState("failed");
      return;
    }
    if (!queue.length) {
      setLocalSyncState("synced");
      return;
    }

    setLocalSyncState("syncing");
    for (const row of queue) {
      try {
        const updated = await api(`/api/ideas/${row.ideaId}`, {
          method: "PUT",
          body: JSON.stringify(row.payload)
        });
        try {
          await dequeueIdeaSync(row.ideaId);
          await removeIdeaDraft(row.ideaId);
        } catch {}
        setIdeas((prev) => prev.map((idea) => (idea.id === updated.idea.id ? { ...idea, ...updated.idea } : idea)));
        if (Number(selectedIdeaId) === Number(row.ideaId)) {
          setSelectedIdea(updated.idea);
        }
      } catch {
        setLocalSyncState("failed");
        return;
      }
    }

    setLocalSyncState("synced");
    await Promise.all([loadDashboard(), loadIdeas()]);
    if (selectedIdeaId) {
      await loadIdeaChildren(selectedIdeaId);
    }
  }, [loadDashboard, loadIdeaChildren, loadIdeas, selectedIdeaId]);

  const handleSaveIdea = async (
    event: { preventDefault?: () => void } | null = null,
    patch: Partial<{ title: string; category: string; status: import("@/types").IdeaStatus; blocks: Array<{ id: string; type: string; content: string; checked: boolean }> }> = {}
  ) => {
    event?.preventDefault?.();
    if (!selectedIdea) {
      return;
    }
    const payload = {
      title: patch.title ?? selectedIdea.title,
      category: patch.category ?? selectedIdea.category,
      status: patch.status ?? selectedIdea.status,
      blocks: patch.blocks ?? selectedIdea.blocks ?? []
    };
    const now = Date.now();
    setSelectedIdea((prev) => (prev ? { ...prev, ...payload, updatedAt: now } : prev));
    try {
      await saveIdeaDraft(Number(selectedIdea.id), payload, now);
      setLocalSyncState("pending");
    } catch {
      setLocalSyncState("failed");
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueIdeaSync(Number(selectedIdea.id), payload, now);
      } catch {
        setError("오프라인 저장 큐를 만들지 못했습니다. 연결 후 다시 시도해주세요.");
      }
      return;
    }

    setBusy(true);
    try {
      setLocalSyncState("syncing");
      const updated = await api(`/api/ideas/${selectedIdea.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      try {
        await dequeueIdeaSync(Number(selectedIdea.id));
        await removeIdeaDraft(Number(selectedIdea.id));
      } catch {}
      setSelectedIdea(updated.idea);
      setIdeas((prev) => prev.map((idea) => (idea.id === updated.idea.id ? { ...idea, ...updated.idea } : idea)));
      await loadIdeaChildren(updated.idea.id, updated.idea?.blocks || []);
      await loadDashboard();
      setLocalSyncState("synced");
    } catch (err) {
      try {
        await enqueueIdeaSync(Number(selectedIdea.id), payload, now);
      } catch {}
      setLocalSyncState("failed");
      setError(err.message || "아이디어 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!authed) {
      return;
    }
    const onOnline = () => {
      void drainIdeaSyncQueue();
    };
    window.addEventListener("online", onOnline);
    void drainIdeaSyncQueue();
    return () => window.removeEventListener("online", onOnline);
  }, [authed, drainIdeaSyncQueue]);

  const handleCreateComment = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId || !commentDraft.trim()) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentDraft, blockId: commentBlockId || "" })
      });
      setCommentDraft("");
      await loadIdeaChildren(selectedIdeaId);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "댓글 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateComment = async (commentId, content) => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/comments/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ content })
      });
      await loadIdeaChildren(selectedIdeaId);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "댓글 수정에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/comments/${commentId}`, { method: "DELETE" });
      await loadIdeaChildren(selectedIdeaId);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "댓글 삭제에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const applyCommentFilter = async () => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      const query = commentFilterBlockId ? `?blockId=${encodeURIComponent(commentFilterBlockId)}` : "";
      const res = await api(`/api/ideas/${selectedIdeaId}/comments${query}`);
      setComments(res.comments || []);
    } catch (err) {
      setError(err.message || "댓글 불러오기에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleReaction = async (emoji, targetType = "idea", targetId = "") => {
    if (!selectedIdeaId) return;
    try {
      await api(`/api/ideas/${selectedIdeaId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji, targetType, targetId })
      });
      const data = await api(`/api/ideas/${selectedIdeaId}/reactions?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`);
      if (targetType === "idea" && !targetId) {
        setReactions(data);
      } else {
        setReactionsByTarget((prev) => ({
          ...prev,
          [`${targetType}:${targetId}`]: {
            reactions: data.reactions || [],
            mine: data.mine || []
          }
        }));
        const ideaData = await api(`/api/ideas/${selectedIdeaId}/reactions`);
        setReactions(ideaData);
      }
      await loadIdeas();
    } catch (err) {
      setError(err.message || "리액션 처리에 실패했습니다");
    }
  };

  const handleUploadBlockFile = async (blockId, file) => {
    if (!selectedIdeaId) {
      throw new Error("아이디어를 찾을 수 없습니다");
    }
    const form = new FormData();
    form.append("file", file);
    const data = await api(`/api/ideas/${selectedIdeaId}/blocks/${blockId}/file`, {
      method: "POST",
      body: form
    });
    if (data.idea) {
      setSelectedIdea(data.idea);
      setIdeas((prev) => prev.map((idea) => (idea.id === data.idea.id ? { ...idea, ...data.idea } : idea)));
      await loadIdeaChildren(data.idea.id);
    }
    return data.fileBlock;
  };

  const handleCreateVersion = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("versionLabel", versionForm.versionLabel);
      form.append("notes", JSON.stringify(selectedIdea?.blocks || []));
      if (versionFile) {
        form.append("file", versionFile);
      }
      await api(`/api/ideas/${selectedIdeaId}/versions`, { method: "POST", body: form });
      setVersionForm({ versionLabel: "", notes: "" });
      setVersionFile(null);
      await loadIdeaChildren(selectedIdeaId);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "버전 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!selectedIdeaId) {
      return false;
    }
    setBusy(true);
    try {
      const data = await api(`/api/ideas/${selectedIdeaId}/versions/${versionId}/restore`, { method: "POST" });
      if (data?.idea) {
        setSelectedIdea(data.idea);
        setIdeas((prev) => prev.map((idea) => (idea.id === data.idea.id ? { ...idea, ...data.idea } : idea)));
        await loadIdeaChildren(data.idea.id, data.idea.blocks || []);
      } else {
        await loadIdeaChildren(selectedIdeaId);
      }
      try {
        await loadDashboard();
      } catch {}
      return true;
    } catch (err) {
      setError(err.message || "타임라인 복원에 실패했습니다");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const markNotificationRead = async (notificationId) => {
    await api(`/api/notifications/${notificationId}/read`, { method: "POST" });
    setNotifications((prev) => prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllNotificationsRead = async () => {
    await api("/api/notifications/read-all", { method: "POST" });
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
  };

  const saveMutedTypes = async () => {
    const res = await api("/api/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify({ mutedTypes })
    });
    setMutedTypes(res.mutedTypes || []);
    await loadNotifications();
  };

  const toggleMutedType = (value) => {
    setMutedTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const handleSaveWebhook = async (event) => {
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
      await api(`/api/integrations/webhooks/${webhookForm.platform}`, {
        method: "PUT",
        body: JSON.stringify(webhookForm)
      });
      await loadWebhooks();
      await loadNotifications();
    } catch (err) {
      setError(err.message || "웹훅 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    await bootstrap();
  };

  const handleCreateWorkspace = async (data: { name: string; icon: string; color: string }) => {
    await api("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ teamName: data.name, icon: data.icon, color: data.color })
    });
    const loaded = await api("/api/workspaces");
    setUserTeams(loaded.workspaces || []);
  };

  const handleUpdateWorkspace = async (id: number, data: { name: string; icon: string; color: string }) => {
    await api(`/api/workspaces/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
    const loaded = await api("/api/workspaces");
    setUserTeams(loaded.workspaces || []);
  };

  const handleDeleteWorkspace = async (id: number) => {
    await api(`/api/workspaces/${id}`, { method: "DELETE" });
    const loaded = await api("/api/workspaces");
    setUserTeams(loaded.workspaces || []);
    if (Number(session?.workspace?.id) === id) {
      await bootstrap();
    }
  };

  const handleSwitchTeam = async (teamId) => {
    if (!teamId || Number(teamId) === Number(session?.workspace?.id)) {
      return;
    }
    setWorkspaceSwitching(true);
    setBusy(true);
    try {
      setActivePage("ideas");
      setSelectedIdeaId(null);
      setSelectedIdea(null);
      setDetailNotFound(null);
      setComments([]);
      setVersions([]);
      setTimeline([]);
      await api("/api/workspaces/switch", {
        method: "POST",
        body: JSON.stringify({ teamId })
      });
      await bootstrap();
    } catch (err) {
      setError(err.message || "팀 전환에 실패했습니다");
    } finally {
      setBusy(false);
      setWorkspaceSwitching(false);
    }
  };

  const leaveWorkspace = useCallback(
    async (workspaceId: number) => {
      const result = await api(`/api/workspaces/${workspaceId}/leave`, { method: "POST" });
      await Promise.all([loadUserTeams(), loadTeamMembers(), loadTeamInvitations()]);
      if (Number(session?.workspace?.id) === Number(workspaceId) || Number(result?.nextWorkspaceId || 0) > 0) {
        await bootstrap();
      } else {
        await Promise.all([loadDashboard(), loadIdeas()]);
      }
    },
    [bootstrap, loadDashboard, loadIdeas, loadTeamInvitations, loadTeamMembers, loadUserTeams, session?.workspace?.id]
  );

  const requestLeaveWorkspace = useCallback(
    (workspace) => {
      setConfirmDialog({
        open: true,
        title: "워크스페이스를 탈퇴할까요?",
        description: `"${workspace.name}"에서 나가면 해당 워크스페이스의 아이디어 접근 권한이 사라집니다.`,
        confirmText: "탈퇴",
        danger: true,
        action: async () => leaveWorkspace(workspace.id)
      });
    },
    [leaveWorkspace]
  );

  const backToIdeas = () => {
    setSelectedIdeaId(null);
    setSelectedIdea(null);
    setDetailNotFound(null);
    setStudioTab("editor");
    setActivePage("ideas");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("idea");
      const query = params.toString();
      window.history.pushState(null, "", query ? `?${query}` : "/");
    }
  };

  const handleNavigatePage = useCallback(
    async (page) => {
      if (page === "detail") {
        if (selectedIdeaId) {
          setActivePage("detail");
          return;
        }
        if (sideIdeas.length) {
          await selectIdea(sideIdeas[0].id, { syncUrl: true, openPage: true, workspaceId: sideIdeas[0].teamId });
          return;
        }
        setActivePage("ideas");
        return;
      }

      setSelectedIdeaId(null);
      setSelectedIdea(null);
      setDetailNotFound(null);
      setStudioTab("editor");
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.delete("idea");
        const query = params.toString();
        window.history.pushState(null, "", query ? `?${query}` : "/");
      }
      setActivePage(page);
    },
    [selectedIdeaId, selectIdea, sideIdeas]
  );

  useEffect(() => {
    if (activePage === "detail" && !selectedIdeaId) {
      setActivePage("ideas");
    }
  }, [activePage, selectedIdeaId]);

  const openUtilityPanel = useCallback((event) => {
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
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeUtilityPanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notificationPanelOpen, closeUtilityPanel]);

  useEffect(() => {
    if (activePage !== "detail" || studioTab !== "editor" || !selectedIdeaId) {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      const titleInput = document.querySelector("main textarea") as HTMLTextAreaElement | null;
      titleInput?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activePage, selectedIdeaId, studioTab]);

  useEffect(() => {
    if (localSyncState !== "synced") {
      setSyncBadgeVisible(true);
      setSyncBadgeFading(false);
      return;
    }
    setSyncBadgeVisible(true);
    setSyncBadgeFading(false);
    const fadeTimer = window.setTimeout(() => setSyncBadgeFading(true), 3000);
    const hideTimer = window.setTimeout(() => {
      setSyncBadgeVisible(false);
      setSyncBadgeFading(false);
    }, 3600);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [localSyncState]);

  const blocks = selectedIdea?.blocks || [];
  const canEditIdea = Boolean(teamMe.role) && teamMe.role !== "viewer";
  const shouldShowSyncBadge = syncBadgeVisible;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {!authed ? (
        <div className="mx-auto max-w-3xl p-8 text-sm text-[var(--muted)]">로그인 상태를 확인하는 중입니다...</div>
      ) : (
        <>
          <div className="relative flex h-screen overflow-hidden bg-[var(--surface)]">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)] shadow md:hidden"
              aria-label="메뉴 열기"
            >
              ☰
            </button>

            <button
              type="button"
              onClick={() => setNavCollapsed((prev) => !prev)}
              className="fixed z-40 hidden h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] shadow md:flex"
              style={{ top: 12, left: navCollapsed ? 42 : 226 }}
              aria-label={navCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              title={navCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
              {navCollapsed ? "→" : "←"}
            </button>

            {mobileNavOpen && (
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/40 md:hidden"
                aria-label="메뉴 닫기"
                onClick={() => setMobileNavOpen(false)}
              />
            )}

            <div
              className={`
                md:relative md:block md:shrink-0
                fixed inset-y-0 left-0 z-50 transition-transform duration-200
                ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
                md:translate-x-0
              `}
            >
              <MumurNavigationSidebar
                activePage={activePage}
                onNavigate={(page) => { handleNavigatePage(page); setMobileNavOpen(false); }}
                collapsed={navCollapsed}
                userName={session?.user?.name || "Mumur 사용자"}
                workspaceName={session?.workspace?.name || "워크스페이스"}
                userWorkspaces={userTeams}
                activeWorkspaceId={session?.workspace?.id ?? null}
                onSwitchWorkspace={(id) => { handleSwitchTeam(id); setMobileNavOpen(false); }}
                onCreateWorkspace={handleCreateWorkspace}
                onUpdateWorkspace={handleUpdateWorkspace}
                onDeleteWorkspace={handleDeleteWorkspace}
                switchingWorkspace={workspaceSwitching}
              />
            </div>

            <section className="flex-1 overflow-auto">
              <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-7 md:px-10 md:pt-7">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  {shouldShowSyncBadge ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs transition-opacity duration-500 ${localSyncState === "failed" ? "text-rose-600" : localSyncState === "syncing" ? "text-sky-600" : "text-[var(--muted)]"} ${syncBadgeFading ? "opacity-0" : "opacity-100"}`}
                    >
                      {localSyncState === "failed" ? <AlertCircle className="h-3.5 w-3.5" /> : localSyncState === "syncing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {syncStateLabel(localSyncState)}
                    </span>
                  ) : null}
                  {workspaceSwitching ? (
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">워크스페이스 전환 중...</span>
                  ) : null}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateIdeaDialogOpen(true)}
                      disabled={!canEditIdea}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                      title={canEditIdea ? "새 아이디어" : "viewer 권한에서는 아이디어를 생성할 수 없습니다"}
                      aria-label="새 아이디어"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      새 아이디어
                    </button>
                    <button
                      type="button"
                      onClick={refreshAll}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                      aria-label="새로고침"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      새로고침
                    </button>
                    <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden="true" />
                    <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-1">
                      <button
                        type="button"
                        onClick={(event) => openUtilityPanel(event)}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${notificationPanelOpen ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                        aria-label="알림 패널 열기"
                      >
                        <Bell className="h-3.5 w-3.5" />
                        {`알림${unreadCount > 0 ? ` ${unreadCount}` : ""}`}
                      </button>
                    </div>
                    <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                      aria-label="로그아웃"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      로그아웃
                    </button>
                  </div>
                </div>

                {activePage === "dashboard" ? (
                  <DashboardSurface
                    dashboard={dashboard}
                    ideas={sideIdeas}
                    STATUS_META={STATUS_META}
                    onSelectIdea={(ideaId, workspaceId) => selectIdea(ideaId, { workspaceId })}
                    formatTime={formatTime}
                    workspaceName={session?.workspace?.name || "워크스페이스"}
                    onOpenCreateIdea={() => setCreateIdeaDialogOpen(true)}
                    canCreateIdea={canEditIdea}
                  />
                ) : null}

                {activePage === "ideas" ? (
                  <IdeasSurface
                    ideas={sideIdeas}
                    filters={filters}
                    setFilters={setFilters}
                    ideaView={ideaView}
                    setIdeaView={setIdeaView}
                    navigatorSort={navigatorSort}
                    setNavigatorSort={setNavigatorSort}
                    navigatorPreset={navigatorPreset}
                    setNavigatorPreset={setNavigatorPreset}
                    presetCounts={presetCounts}
                    STATUS_META={STATUS_META}
                    onQuickStatusFilter={applyQuickStatusFilter}
                    onSelectIdea={(ideaId, workspaceId) => selectIdea(ideaId, { workspaceId })}
                    onOpenCreateIdea={() => setCreateIdeaDialogOpen(true)}
                    canCreateIdea={canEditIdea}
                    categoryOptions={categoryOptions}
                    workspaceOptions={userTeams}
                    authorOptions={explorerAuthorOptions}
                    formatTime={formatTime}
                  />
                ) : null}

                {activePage === "detail" ? (
                  detailNotFound ? (
                    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">404</p>
                      <h2 className="mt-1 text-xl font-semibold">아이디어를 찾을 수 없습니다</h2>
                      <p className="mt-2 text-sm text-[var(--muted)]">요청한 아이디어 ID: {detailNotFound.ideaId}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{detailNotFound.message}</p>
                      <button
                        type="button"
                        className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1.5 text-sm"
                        onClick={backToIdeas}
                      >
                        목록으로 이동
                      </button>
                    </section>
                  ) : (
                    <IdeaStudioPanel
                      selectedIdea={selectedIdea}
                      onBackToList={backToIdeas}
                      studioTab={studioTab}
                      setStudioTab={setStudioTab}
                      STATUS_META={STATUS_META}
                      handleSaveIdea={handleSaveIdea}
                      blocks={blocks}
                      setCommentBlockId={setCommentBlockId}
                      commentDraft={commentDraft}
                      setCommentDraft={setCommentDraft}
                      handleCreateComment={handleCreateComment}
                      handleUpdateComment={handleUpdateComment}
                      handleDeleteComment={handleDeleteComment}
                      commentBlockId={commentBlockId}
                      comments={comments}
                      commentFilterBlockId={commentFilterBlockId}
                      setCommentFilterBlockId={setCommentFilterBlockId}
                      applyCommentFilter={applyCommentFilter}
                      reactionsByTarget={reactionsByTarget}
                      handleReaction={handleReaction}
                      formatTime={formatTime}
                      handleCreateVersion={handleCreateVersion}
                      handleRestoreVersion={handleRestoreVersion}
                      versionForm={versionForm}
                      setVersionForm={setVersionForm}
                      versions={versions}
                      timeline={timeline}
                      teamMembers={teamMembers}
                      myRole={teamMe.role as WorkspaceRole | null}
                      canEditIdea={canEditIdea}
                      currentUserId={teamMe.userId}
                      handleUploadBlockFile={handleUploadBlockFile}
                    />
                  )
                ) : null}

                {activePage === "team" ? (
                  <TeamSurface
                    teamMembers={teamMembers}
                    teamMe={teamMe}
                    teamMemberForm={teamMemberForm}
                    setTeamMemberForm={setTeamMemberForm}
                    addTeamMember={addTeamMember}
                    updateTeamMemberRole={updateTeamMemberRole}
                    requestRemoveTeamMember={requestRemoveTeamMember}
                    teamInvitations={teamInvitations}
                    retryTeamInvitation={retryTeamInvitation}
                    requestCancelInvitation={requestCancelInvitation}
                    teamInvitationMessage={teamInvitationMessage}
                    formatTime={formatTime}
                    webhooks={webhooks}
                    webhookForm={webhookForm}
                    setWebhookForm={setWebhookForm}
                    handleSaveWebhook={handleSaveWebhook}
                    webhookSaving={busy}
                  />
                ) : null}
              </div>
            </section>
          </div>

          {notificationPanelOpen ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                className="absolute inset-0 h-full w-full bg-slate-950/40"
                aria-label="알림 패널 닫기"
                onClick={closeUtilityPanel}
              />
              <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
                <ContextPanel
                  activePage={activePage}
                  selectedIdea={selectedIdea}
                  studioTab={studioTab}
                  setStudioTab={setStudioTab}
                  dashboard={dashboard}
                  onRequestClose={closeUtilityPanel}
                  notificationFilters={notificationFilters}
                  setNotificationFilters={setNotificationFilters}
                  NOTIFICATION_TYPES={NOTIFICATION_TYPES}
                  loadNotifications={loadNotifications}
                  markAllNotificationsRead={markAllNotificationsRead}
                  mutedTypes={mutedTypes}
                  toggleMutedType={toggleMutedType}
                  saveMutedTypes={saveMutedTypes}
                  notifications={notifications}
                  markNotificationRead={markNotificationRead}
                  formatTime={formatTime}
                />
              </div>
            </div>
          ) : null}

          <IdeaCreateDialog
            open={createIdeaDialogOpen}
            onClose={() => setCreateIdeaDialogOpen(false)}
            busy={busy}
            IDEA_STATUS={IDEA_STATUS}
            STATUS_META={STATUS_META}
            newIdeaForm={newIdeaForm}
            setNewIdeaForm={setNewIdeaForm}
            handleCreateIdea={handleCreateIdea}
          />
          <ConfirmDialog
            open={confirmDialog.open}
            title={confirmDialog.title}
            description={confirmDialog.description}
            confirmText={confirmDialog.confirmText}
            danger={confirmDialog.danger}
            onCancel={closeConfirmDialog}
            onConfirm={confirmDialogAction}
          />
        </>
      )}
    </main>
  );
}
